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

async function fixture(email = 'ada@example.com') {
  const { cookies } = await signUp(app, { email, password: TEST_PASSWORD });
  const headers = authedHeaders(cookies);
  const campaign = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    headers,
    payload: { name: 'The Iron Vow' },
  });
  return { headers, campaignId: campaign.json().id as string };
}

describe('world entities', () => {
  it('creates, reads, renames and deletes an NPC', async () => {
    const { headers, campaignId } = await fixture();

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/npcs`,
      headers,
      payload: { name: 'Kote', role: 'innkeeper', tags: ['ally'], description: 'Keeps the inn.' },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().name).toBe('Kote');
    expect(created.json().role).toBe('innkeeper');
    expect(created.json().revision).toBe(1);
    expect(created.json().factionId).toBeNull();

    const id = created.json().id as string;

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaignId}/npcs/${id}`,
      headers,
      payload: { name: 'Kote the Innkeeper' },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().revision).toBe(2);

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/npcs`,
      headers,
    });
    expect(list.json().npcs).toHaveLength(1);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/campaigns/${campaignId}/npcs/${id}`,
      headers,
    });
    expect(removed.statusCode).toBe(204);

    const after = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/npcs`,
      headers,
    });
    expect(after.json().npcs).toHaveLength(0);
  });

  it('links an NPC to a faction and clears the link when the faction is deleted', async () => {
    const { headers, campaignId } = await fixture();

    const faction = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/factions`,
      headers,
      payload: { name: 'The Chandrian' },
    });
    const factionId = faction.json().id as string;

    const npc = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/npcs`,
      headers,
      payload: { name: 'Cinder', factionId },
    });
    expect(npc.json().factionId).toBe(factionId);

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/campaigns/${campaignId}/factions/${factionId}`,
      headers,
    });

    const after = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/npcs/${npc.json().id}`,
      headers,
    });
    expect(after.json().factionId).toBeNull();
  });

  it('refuses a faction id from another campaign', async () => {
    const ada = await fixture('ada@example.com');
    const grace = await fixture('grace@example.com');

    const alienFaction = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${grace.campaignId}/factions`,
      headers: grace.headers,
      payload: { name: 'Not Yours' },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${ada.campaignId}/npcs`,
      headers: ada.headers,
      payload: { name: 'Smuggler', factionId: alienFaction.json().id },
    });

    expect(response.statusCode).toBe(400);
  });

  it('searches by name and description', async () => {
    const { headers, campaignId } = await fixture();

    await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/locations`,
      headers,
      payload: { name: 'Tarbean', kind: 'settlement', description: 'A port city.' },
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/locations`,
      headers,
      payload: { name: 'Waystone Inn', kind: 'site', description: 'Quiet, at the crossroads.' },
    });

    const search = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/locations?q=port`,
      headers,
    });

    expect(search.json().locations).toHaveLength(1);
    expect(search.json().locations[0].name).toBe('Tarbean');
  });

  it("hides another account's entities behind a 404 and an empty list", async () => {
    const ada = await fixture('ada@example.com');
    const grace = await fixture('grace@example.com');

    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${ada.campaignId}/factions`,
      headers: ada.headers,
      payload: { name: 'Private' },
    });
    const id = created.json().id as string;

    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${ada.campaignId}/factions/${id}`,
      headers: grace.headers,
    });
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${ada.campaignId}/factions/${id}`,
      headers: grace.headers,
      payload: { name: 'Stolen' },
    });
    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${ada.campaignId}/factions`,
      headers: grace.headers,
    });

    expect(read.statusCode).toBe(404);
    expect(patch.statusCode).toBe(404);
    expect(list.statusCode).toBe(404);
  });

  it('rejects an unauthenticated read', async () => {
    const { campaignId } = await fixture();
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/npcs`,
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('relationships', () => {
  it('links an NPC to a location and removes the edge', async () => {
    const { headers, campaignId } = await fixture();

    const npc = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/npcs`,
      headers,
      payload: { name: 'Kote' },
    });
    const place = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/locations`,
      headers,
      payload: { name: 'Waystone Inn' },
    });

    const link = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/relationships`,
      headers,
      payload: {
        sourceType: 'npc',
        sourceId: npc.json().id,
        targetType: 'location',
        targetId: place.json().id,
        kind: 'keeps',
      },
    });

    expect(link.statusCode).toBe(201);
    expect(link.json().kind).toBe('keeps');

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/relationships`,
      headers,
    });
    expect(list.json().relationships).toHaveLength(1);

    const removed = await app.inject({
      method: 'DELETE',
      url: `/api/v1/campaigns/${campaignId}/relationships/${link.json().id}`,
      headers,
    });
    expect(removed.statusCode).toBe(204);
  });

  it('drops edges when an endpoint is deleted', async () => {
    const { headers, campaignId } = await fixture();

    const faction = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/factions`,
      headers,
      payload: { name: 'The Chandrian' },
    });
    const npc = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/npcs`,
      headers,
      payload: { name: 'Cinder' },
    });

    await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/relationships`,
      headers,
      payload: {
        sourceType: 'npc',
        sourceId: npc.json().id,
        targetType: 'faction',
        targetId: faction.json().id,
        kind: 'member',
      },
    });

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/campaigns/${campaignId}/npcs/${npc.json().id}`,
      headers,
    });

    const list = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/relationships`,
      headers,
    });
    expect(list.json().relationships).toHaveLength(0);
  });

  it('refuses an endpoint in another campaign', async () => {
    const ada = await fixture('ada@example.com');
    const grace = await fixture('grace@example.com');

    const graceNpc = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${grace.campaignId}/npcs`,
      headers: grace.headers,
      payload: { name: 'Theirs' },
    });
    const adaNpc = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${ada.campaignId}/npcs`,
      headers: ada.headers,
      payload: { name: 'Mine' },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${ada.campaignId}/relationships`,
      headers: ada.headers,
      payload: {
        sourceType: 'npc',
        sourceId: adaNpc.json().id,
        targetType: 'npc',
        targetId: graceNpc.json().id,
        kind: 'knows',
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('journal', () => {
  it('writes an entry with links and finds it by search', async () => {
    const { headers, campaignId } = await fixture();

    const npc = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/npcs`,
      headers,
      payload: { name: 'Kote' },
    });

    const entry = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/journal`,
      headers,
      payload: {
        title: 'The inn at the crossroads',
        body: 'Kote poured tea and said nothing about the chest.',
        tags: ['session-1'],
        links: [{ type: 'npc', id: npc.json().id, label: 'Kote' }],
      },
    });

    expect(entry.statusCode).toBe(201);
    expect(entry.json().links).toHaveLength(1);
    expect(entry.json().revision).toBe(1);

    const found = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/journal?q=tea`,
      headers,
    });
    expect(found.json().entries).toHaveLength(1);

    const miss = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/journal?q=dragon`,
      headers,
    });
    expect(miss.json().entries).toHaveLength(0);
  });

  it('refuses a link to an entity outside the campaign', async () => {
    const ada = await fixture('ada@example.com');
    const grace = await fixture('grace@example.com');

    const theirNpc = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${grace.campaignId}/npcs`,
      headers: grace.headers,
      payload: { name: 'Theirs' },
    });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${ada.campaignId}/journal`,
      headers: ada.headers,
      payload: {
        title: 'Leak attempt',
        links: [{ type: 'npc', id: theirNpc.json().id, label: 'x' }],
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it('detects a stale edit by revision', async () => {
    const { headers, campaignId } = await fixture();

    const entry = await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/journal`,
      headers,
      payload: { title: 'First' },
    });

    await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaignId}/journal/${entry.json().id}`,
      headers,
      payload: { body: 'Edited once.' },
    });

    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${campaignId}/journal/${entry.json().id}`,
      headers,
      payload: { baseRevision: 1, body: 'Conflicting edit.' },
    });

    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.details.currentRevision).toEqual(['2']);
  });
});
