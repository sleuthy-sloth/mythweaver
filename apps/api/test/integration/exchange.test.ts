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

async function account(email = 'ada@example.com') {
  const { cookies } = await signUp(app, { email, password: TEST_PASSWORD });
  return authedHeaders(cookies);
}

async function populatedCampaign(headers: Record<string, string>) {
  const campaign = await app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    headers,
    payload: { name: 'The Iron Vow', description: 'A vow kept badly.' },
  });
  const campaignId = campaign.json().id as string;

  const character = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/characters`,
    headers,
    payload: { name: 'Sabine' },
  });
  const characterId = character.json().id as string;

  const faction = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/factions`,
    headers,
    payload: { name: 'The Chandrian', tags: ['enemy'] },
  });

  const npc = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/npcs`,
    headers,
    payload: { name: 'Cinder', role: 'swordsman', factionId: faction.json().id },
  });

  const place = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/locations`,
    headers,
    payload: { name: 'Waystone Inn', kind: 'site' },
  });

  await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/relationships`,
    headers,
    payload: {
      sourceType: 'npc',
      sourceId: npc.json().id,
      targetType: 'location',
      targetId: place.json().id,
      kind: 'hunts',
    },
  });

  const roll = await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/rolls`,
    headers,
    payload: { characterId, stat: 'iron' },
  });

  await app.inject({
    method: 'POST',
    url: `/api/v1/campaigns/${campaignId}/journal`,
    headers,
    payload: {
      title: 'Cinder at the inn',
      body: 'He asked about the chest.',
      tags: ['session-1'],
      links: [{ type: 'npc', id: npc.json().id, label: 'Cinder' }],
      ...(roll.statusCode === 201 ? { rollId: roll.json().id } : {}),
    },
  });

  return {
    campaignId,
    characterId,
    npcId: npc.json().id as string,
    placeId: place.json().id as string,
  };
}

async function exportBundle(headers: Record<string, string>, campaignId: string) {
  const response = await app.inject({
    method: 'GET',
    url: `/api/v1/campaigns/${campaignId}/export`,
    headers,
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers['content-disposition']).toMatch(/attachment; filename=".+\.json"/);
  return response.json() as Record<string, unknown>;
}

describe('export', () => {
  it('produces a versioned, checksummed document', async () => {
    const headers = await account();
    const { campaignId } = await populatedCampaign(headers);

    const bundle = await exportBundle(headers, campaignId);

    expect(bundle.format).toBe('mythweaver.campaign');
    expect(bundle.version).toBe(2);
    expect(bundle.map).toBeNull();
    expect(bundle.checksum).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect((bundle.characters as unknown[]).length).toBe(1);
    expect((bundle.npcs as unknown[]).length).toBe(1);
    expect((bundle.relationships as unknown[]).length).toBe(1);
    expect((bundle.journal as unknown[]).length).toBe(1);
    expect((bundle.rolls as unknown[]).length).toBe(1);
  });

  it("refuses another account's campaign", async () => {
    const ada = await account('ada@example.com');
    const grace = await account('grace@example.com');
    const { campaignId } = await populatedCampaign(ada);

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/export`,
      headers: grace,
    });

    expect(response.statusCode).toBe(404);
  });

  it('requires authentication', async () => {
    const headers = await account();
    const { campaignId } = await populatedCampaign(headers);
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${campaignId}/export`,
    });
    expect(response.statusCode).toBe(401);
  });
});

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('export with a map', () => {
  it('carries the image and markers, and they survive the round trip', async () => {
    const headers = await account();
    const { campaignId, placeId } = await populatedCampaign(headers);

    await app.inject({
      method: 'PUT',
      url: `/api/v1/campaigns/${campaignId}/map?name=The Reach`,
      headers: { ...headers, 'content-type': 'image/png' },
      payload: PNG_1PX,
    });
    await app.inject({
      method: 'POST',
      url: `/api/v1/campaigns/${campaignId}/map/markers`,
      headers,
      payload: { x: 0.25, y: 0.75, label: 'The inn', locationId: placeId },
    });

    const bundle = await exportBundle(headers, campaignId);
    const map = bundle.map as { dataBase64: string; markers: unknown[]; mimeType: string };
    expect(map.mimeType).toBe('image/png');
    expect(Buffer.from(map.dataBase64, 'base64')).toEqual(PNG_1PX);
    expect(map.markers).toHaveLength(1);

    const imported = await app.inject({
      method: 'POST',
      url: '/api/v1/imports',
      headers,
      payload: bundle,
    });
    expect(imported.statusCode).toBe(201);

    const newId = imported.json().campaignId as string;
    const view = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${newId}/map`,
      headers,
    });
    expect(view.json().map.name).toBe('The Reach');
    expect(view.json().markers).toHaveLength(1);
    expect(view.json().markers[0].label).toBe('The inn');

    // The marker still points at a place, and that place is the imported copy.
    const places = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${newId}/locations`,
      headers,
    });
    expect(view.json().markers[0].locationId).toBe(places.json().locations[0].id);
    expect(view.json().markers[0].locationId).not.toBe(placeId);
  });
});

describe('import', () => {
  it('round-trips a campaign into a new one with fresh identifiers', async () => {
    const headers = await account();
    const source = await populatedCampaign(headers);
    const bundle = await exportBundle(headers, source.campaignId);

    const preview = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      headers,
      payload: bundle,
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().campaignName).toBe('The Iron Vow');
    expect(preview.json().counts).toMatchObject({
      characters: 1,
      npcs: 1,
      factions: 1,
      locations: 1,
      relationships: 1,
      journal: 1,
      rolls: 1,
    });
    expect(preview.json().warnings).toEqual([]);

    const imported = await app.inject({
      method: 'POST',
      url: '/api/v1/imports',
      headers,
      payload: bundle,
    });
    expect(imported.statusCode).toBe(201);
    const newId = imported.json().campaignId as string;
    expect(newId).not.toBe(source.campaignId);

    // The copy is real data, not a pointer: every entity is present under new ids.
    const npcs = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${newId}/npcs`,
      headers,
    });
    expect(npcs.json().npcs).toHaveLength(1);
    expect(npcs.json().npcs[0].id).not.toBe(source.npcId);
    expect(npcs.json().npcs[0].name).toBe('Cinder');

    // The faction link and the edge were remapped, not copied verbatim.
    const factions = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${newId}/factions`,
      headers,
    });
    expect(npcs.json().npcs[0].factionId).toBe(factions.json().factions[0].id);

    const links = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${newId}/relationships`,
      headers,
    });
    expect(links.json().relationships).toHaveLength(1);
    expect(links.json().relationships[0]).toMatchObject({ kind: 'hunts', targetType: 'location' });

    const journal = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${newId}/journal`,
      headers,
    });
    expect(journal.json().entries[0].title).toBe('Cinder at the inn');
    expect(journal.json().entries[0].links[0].id).toBe(npcs.json().npcs[0].id);

    const rolls = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${newId}/rolls`,
      headers,
    });
    expect(rolls.json().rolls).toHaveLength(1);
    expect(journal.json().entries[0].rollId).toBe(rolls.json().rolls[0].id);
  });

  it('still imports a version 1 file, which has no map', async () => {
    const headers = await account();
    const source = await populatedCampaign(headers);
    const bundle = await exportBundle(headers, source.campaignId);

    const { checksumOf } = await import('../../src/modules/exchange/service');
    const { checksum: _old, map: _map, ...rest } = bundle as Record<string, unknown>;
    // A v1 file was written before maps existed: downgrade the version, then hash that shape.
    const v1fields = { ...rest, version: 1 };
    const v1 = { ...v1fields, checksum: checksumOf(v1fields as never) };

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports',
      headers,
      payload: v1,
    });

    expect(response.statusCode).toBe(201);
    const view = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${response.json().campaignId}/map`,
      headers,
    });
    expect(view.json().map).toBeNull();
  });

  it('imports the same file twice without collisions', async () => {
    const headers = await account();
    const source = await populatedCampaign(headers);
    const bundle = await exportBundle(headers, source.campaignId);

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/imports',
      headers,
      payload: bundle,
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/imports',
      headers,
      payload: bundle,
    });

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json().campaignId).not.toBe(second.json().campaignId);

    const list = await app.inject({ method: 'GET', url: '/api/v1/campaigns', headers });
    expect(list.json().campaigns.length).toBe(3);
  });

  it('rejects a document edited after export', async () => {
    const headers = await account();
    const source = await populatedCampaign(headers);
    const bundle = await exportBundle(headers, source.campaignId);

    (bundle.campaign as Record<string, unknown>).name = 'Something Else';

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports',
      headers,
      payload: bundle,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/altered/);
  });

  it('rejects a file that is not an export', async () => {
    const headers = await account();
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      headers,
      payload: { hello: 'world' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/not a Mythweaver campaign export/);
  });

  it('rejects a relationship pointing outside the file', async () => {
    const headers = await account();
    const source = await populatedCampaign(headers);
    const bundle = await exportBundle(headers, source.campaignId);

    // Remove the place but keep the edge that points at it, then re-checksum so only the
    // structural rule can catch it.
    const locations = bundle.locations as Record<string, unknown>[];
    bundle.locations = [];
    expect(locations).toHaveLength(1);

    const { checksumOf } = await import('../../src/modules/exchange/service');
    const { checksum: _dropped, ...rest } = bundle as Record<string, unknown>;
    bundle.checksum = checksumOf(rest as never);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      headers,
      payload: bundle,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/relationship points at something/);
  });

  it('refuses a body over the size cap', async () => {
    const headers = await account();
    const padding = 'x'.repeat(6 * 1024 * 1024);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/imports/preview',
      headers,
      payload: { format: 'mythweaver.campaign', padding },
    });

    expect([413, 400]).toContain(response.statusCode);
  });
});
