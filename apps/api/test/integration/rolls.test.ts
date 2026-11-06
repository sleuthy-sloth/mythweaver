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

type Fixture = {
  headers: Record<string, string>;
  campaignId: string;
  characterId: string;
};

async function fixture(email: string, overrides: Record<string, unknown> = {}): Promise<Fixture> {
  const { cookies } = await signUp(app, { email, password: TEST_PASSWORD });
  const headers = authedHeaders(cookies);

  const campaign = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    headers,
    payload: { name: `${email} campaign` },
  });
  const campaignId = campaign.json().id as string;

  const character = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/characters`,
    headers,
    payload: { name: 'Sabine', ...overrides },
  });

  return { headers, campaignId, characterId: character.json().id as string };
}

function expectedOutcome(score: number, challenge: [number, number]): string {
  const hits = Number(score > challenge[0]) + Number(score > challenge[1]);
  return hits === 2 ? 'strong_hit' : hits === 1 ? 'weak_hit' : 'miss';
}

describe('action rolls', () => {
  it('records every die and an outcome consistent with them', async () => {
    const { headers, campaignId, characterId } = await fixture('ada@example.com');

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/rolls`,
      headers,
      payload: { characterId, stat: 'iron', adds: 1, moveId: 'face-danger' },
    });

    expect(response.statusCode).toBe(201);
    const roll = response.json() as Roll;

    expect(roll.actionDie).toBeGreaterThanOrEqual(1);
    expect(roll.actionDie).toBeLessThanOrEqual(6);
    expect(roll.challenge.every((die) => die >= 1 && die <= 10)).toBe(true);
    // Character iron is 3 by default and one add was requested.
    expect(roll.actionScore).toBe(3 + 1 + roll.actionDie);
    expect(roll.outcome).toBe(expectedOutcome(roll.actionScore, roll.challenge));
    expect(roll.burned).toBe(false);
    expect(roll.momentumAfter).toBe(2);
    expect(roll.moveId).toBe('face-danger');
  });

  it('persists the roll and returns it from the list, newest first', async () => {
    const { headers, campaignId, characterId } = await fixture('ada@example.com');

    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/rolls`,
      headers,
      payload: { characterId, stat: 'edge' },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/rolls`,
      headers,
      payload: { characterId, stat: 'wits' },
    });

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/rolls`,
      headers,
    });

    expect(list.statusCode).toBe(200);
    const rolls = list.json().rolls as Roll[];
    expect(rolls).toHaveLength(2);
    expect(rolls.map((roll) => roll.id)).toEqual([second.json().id, first.json().id]);
  });

  it('burns momentum, resets the sheet and bumps its revision', async () => {
    const { headers, campaignId, characterId } = await fixture('ada@example.com');

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaignId}/characters/${characterId}`,
      headers,
      payload: { momentum: 6 },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/rolls`,
      headers,
      payload: { characterId, stat: 'iron', burnMomentum: true },
    });

    const roll = response.json() as Roll;
    expect(roll.burned).toBe(true);
    expect(roll.momentumBefore).toBe(6);
    expect(roll.momentumAfter).toBe(2);
    // Any challenge die below 6 is cancelled and stored as 0.
    for (const die of roll.challenge) expect(die === 0 || die >= 6).toBe(true);

    const character = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/characters/${characterId}`,
      headers,
    });
    expect(character.json().momentum).toBe(2);
    // revision 1 on create, 2 on the momentum patch, 3 on the burn.
    expect(character.json().revision).toBe(3);
  });

  it('refuses to burn at zero momentum without recording a roll', async () => {
    const { headers, campaignId, characterId } = await fixture('ada@example.com', { momentum: 0 });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/rolls`,
      headers,
      payload: { characterId, stat: 'iron', burnMomentum: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.details.burnMomentum).toBeTruthy();

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/rolls`,
      headers,
    });
    expect(list.json().rolls).toHaveLength(0);
  });

  it('rejects a character from another campaign', async () => {
    const ada = await fixture('ada@example.com');
    const grace = await fixture('grace@example.com');

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${grace.campaignId}/rolls`,
      headers: grace.headers,
      payload: { characterId: ada.characterId, stat: 'iron' },
    });

    expect(response.statusCode).toBe(404);
  });

  it('hides another account’s campaign entirely', async () => {
    const ada = await fixture('ada@example.com');
    const grace = await fixture('grace@example.com');

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${ada.campaignId}/rolls`,
      headers: grace.headers,
      payload: { characterId: ada.characterId, stat: 'iron' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });

  it('rejects an unknown stat', async () => {
    const { headers, campaignId, characterId } = await fixture('ada@example.com');

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/rolls`,
      headers,
      payload: { characterId, stat: 'charisma' },
    });

    expect(response.statusCode).toBe(400);
  });
});
