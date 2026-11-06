import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
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

async function playerWithCampaign(email: string) {
  const { cookies } = await signUp(app, { email, password: TEST_PASSWORD });
  const headers = authedHeaders(cookies);

  const campaign = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    headers,
    payload: { name: `${email} campaign` },
  });

  return { headers, campaignId: campaign.json().id as string };
}

describe('characters', () => {
  it('creates a sheet with the documented defaults', async () => {
    const { headers, campaignId } = await playerWithCampaign('ada@example.com');

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/characters`,
      headers,
      payload: { name: 'Sabine' },
    });

    expect(response.statusCode).toBe(201);
    const character = response.json();
    expect(character.stats).toEqual({ edge: 2, heart: 1, iron: 3, shadow: 2, wits: 1 });
    expect(character.health).toBe(5);
    expect(character.spirit).toBe(5);
    expect(character.supply).toBe(5);
    expect(character.momentum).toBe(2);
    expect(character.debilities).toEqual([]);
    expect(character.revision).toBe(1);
  });

  it('accepts an explicit stat spread and meters', async () => {
    const { headers, campaignId } = await playerWithCampaign('ada@example.com');

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/characters`,
      headers,
      payload: {
        name: 'Eleri',
        stats: { edge: 1, heart: 3, iron: 2, shadow: 1, wits: 2 },
        health: 4,
        momentum: 5,
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().stats.heart).toBe(3);
    expect(response.json().health).toBe(4);
    expect(response.json().momentum).toBe(5);
  });

  it('rejects a stat outside 0..5', async () => {
    const { headers, campaignId } = await playerWithCampaign('ada@example.com');

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/characters`,
      headers,
      payload: { name: 'Cheater', stats: { edge: 9, heart: 1, iron: 1, shadow: 1, wits: 1 } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.details['stats.edge']).toBeTruthy();
  });

  it('updates fields and bumps the revision', async () => {
    const { headers, campaignId } = await playerWithCampaign('ada@example.com');
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/characters`,
      headers,
      payload: { name: 'Sabine' },
    });
    const id = created.json().id as string;

    const updated = await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaignId}/characters/${id}`,
      headers,
      payload: { health: 3, debilities: ['wounded'], xp: 2, notes: 'Scarred but standing.' },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json().health).toBe(3);
    expect(updated.json().debilities).toEqual(['wounded']);
    expect(updated.json().xp).toBe(2);
    expect(updated.json().revision).toBe(2);
    // Omitted fields stay untouched.
    expect(updated.json().spirit).toBe(5);
  });

  it('lists characters for the campaign only', async () => {
    const ada = await playerWithCampaign('ada@example.com');
    await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${ada.campaignId}/characters`,
      headers: ada.headers,
      payload: { name: 'Sabine' },
    });

    const grace = await playerWithCampaign('grace@example.com');
    const adaList = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${ada.campaignId}/characters`,
      headers: ada.headers,
    });
    const graceList = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${grace.campaignId}/characters`,
      headers: grace.headers,
    });

    expect(adaList.json().characters).toHaveLength(1);
    expect(graceList.json().characters).toHaveLength(0);
  });

  it("hides another account's character behind a 404", async () => {
    const ada = await playerWithCampaign('ada@example.com');
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${ada.campaignId}/characters`,
      headers: ada.headers,
      payload: { name: 'Sabine' },
    });
    const characterId = created.json().id as string;

    const grace = await playerWithCampaign('grace@example.com');
    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${ada.campaignId}/characters/${characterId}`,
      headers: grace.headers,
    });
    const write = await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${ada.campaignId}/characters/${characterId}`,
      headers: grace.headers,
      payload: { health: 1 },
    });

    expect(read.statusCode).toBe(404);
    expect(write.statusCode).toBe(404);
  });

  it('rejects an unauthenticated read', async () => {
    const { campaignId } = await playerWithCampaign('ada@example.com');
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/characters`,
    });
    expect(response.statusCode).toBe(401);
  });
});
