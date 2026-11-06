import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Roll } from '@mythweaver/contracts';
import { buildApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { authedHeaders, signUp, TEST_PASSWORD } from '../helpers/api';
import { createTestContext, resetDatabase, type TestContext } from '../helpers/db';

let context: TestContext;
let app: FastifyInstance;

beforeAll(async () => {
  context = await createTestContext();
  app = await buildApp({
    config: loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: context.databaseUrl,
      REGISTRATION_OPEN: 'true',
      RATE_LIMIT_ENABLED: 'false',
      COOKIE_SECURE: 'false',
    }),
    db: context.db,
  });
});

afterAll(async () => {
  await app.close();
  await context.close();
});

beforeEach(async () => {
  await resetDatabase(context.sql);
});

async function fixture(email = 'ada@example.com') {
  const { cookies } = await signUp(app, { email, password: TEST_PASSWORD });
  const headers = authedHeaders(cookies);
  const campaign = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    headers,
    payload: { name: 'The Iron Vow' },
  });
  const campaignId = campaign.json().id as string;
  const character = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/characters`,
    headers,
    payload: { name: 'Sabine' },
  });
  return { headers, campaignId, characterId: character.json().id as string };
}

describe('idempotent writes', () => {
  it('returns the first response for a repeated key instead of creating a second campaign', async () => {
    const { headers } = await fixture();

    const send = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/campaigns',
        headers: { ...headers, 'idempotency-key': 'outbox-op-0001' },
        payload: { name: 'Only Once' },
      });

    const first = await send();
    const second = await send();

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().id).toBe(first.json().id);

    const list = await app.inject({ method: 'GET', url: '/api/v1/campaigns', headers });
    expect(
      list.json().campaigns.filter((c: { name: string }) => c.name === 'Only Once'),
    ).toHaveLength(1);
  });

  it('refuses to reuse a key with a different body', async () => {
    const { headers } = await fixture();

    await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { ...headers, 'idempotency-key': 'outbox-op-0002' },
      payload: { name: 'First Body' },
    });

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { ...headers, 'idempotency-key': 'outbox-op-0002' },
      payload: { name: 'Different Body' },
    });

    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('conflict');
  });

  it('does not replay across users', async () => {
    const ada = await fixture('ada@example.com');
    const grace = await fixture('grace@example.com');

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { ...ada.headers, 'idempotency-key': 'shared-key-1' },
      payload: { name: 'Ada Only' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { ...grace.headers, 'idempotency-key': 'shared-key-1' },
      payload: { name: 'Grace Only' },
    });

    expect(second.statusCode).toBe(201);
    expect(second.json().id).not.toBe(first.json().id);
  });

  it('replays a repeated roll without recording it twice', async () => {
    const { headers, campaignId, characterId } = await fixture();

    const send = () =>
      app.inject({
        method: 'POST',
        url: `/api/v1/campaigns/${campaignId}/rolls`,
        headers: { ...headers, 'idempotency-key': 'outbox-roll-1' },
        payload: { characterId, stat: 'iron', dice: { actionDie: 4, challenge: [3, 9] } },
      });

    const first = await send();
    const second = await send();

    expect(second.json().id).toBe(first.json().id);

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/rolls`,
      headers,
    });
    expect(list.json().rolls).toHaveLength(1);
  });
});

describe('offline dice', () => {
  it('derives the outcome from client dice and records the source', async () => {
    const { headers, campaignId, characterId } = await fixture();

    // Iron 3 + 0, action die 5 => score 8; challenge 4 and 9 => weak hit.
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/rolls`,
      headers,
      payload: { characterId, stat: 'iron', dice: { actionDie: 5, challenge: [4, 9] } },
    });

    expect(response.statusCode).toBe(201);
    const roll = response.json() as Roll;
    expect(roll.source).toBe('client');
    expect(roll.actionScore).toBe(8);
    expect(roll.outcome).toBe('weak_hit');
    expect(roll.match).toBe(false);
  });

  it('recomputes rather than trusting a client that lies about the outcome', async () => {
    const { headers, campaignId, characterId } = await fixture();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/rolls`,
      headers,
      payload: {
        characterId,
        stat: 'iron',
        dice: { actionDie: 1, challenge: [10, 10] },
        // A client cannot smuggle a result in: unknown fields are ignored by the schema.
        outcome: 'strong_hit',
      },
    });

    const roll = response.json() as Roll;
    expect(roll.outcome).toBe('miss');
    expect(roll.match).toBe(true);
  });

  it('rejects dice outside the real ranges', async () => {
    const { headers, campaignId, characterId } = await fixture();

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/rolls`,
      headers,
      payload: { characterId, stat: 'iron', dice: { actionDie: 9, challenge: [1, 1] } },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('revision conflicts', () => {
  it('accepts an update based on the current revision', async () => {
    const { headers, campaignId, characterId } = await fixture();

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaignId}/characters/${characterId}`,
      headers,
      payload: { baseRevision: 1, health: 4 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().revision).toBe(2);
  });

  it('refuses a stale edit and reports the revision the server holds', async () => {
    const { headers, campaignId, characterId } = await fixture();

    // Someone else moved the sheet to revision 2.
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaignId}/characters/${characterId}`,
      headers,
      payload: { health: 3 },
    });

    // An offline client still believes it is on revision 1.
    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaignId}/characters/${characterId}`,
      headers,
      payload: { baseRevision: 1, spirit: 2 },
    });

    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe('conflict');
    expect(stale.json().error.details.currentRevision).toEqual(['2']);
  });

  it('applies the same rule to campaigns', async () => {
    const { headers, campaignId } = await fixture();

    const rename = await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaignId}`,
      headers,
      payload: { baseRevision: 99, name: 'Renamed' },
    });

    expect(rename.statusCode).toBe(409);
    expect(rename.json().error.details.currentRevision).toBeTruthy();
  });
});
