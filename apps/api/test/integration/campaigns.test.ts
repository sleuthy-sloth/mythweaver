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

async function player(email: string) {
  const { cookies } = await signUp(app, { email, password: TEST_PASSWORD });
  return authedHeaders(cookies);
}

async function createCampaign(headers: Record<string, string>, name: string, description?: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/campaigns',
    headers,
    payload: { name, ...(description ? { description } : {}) },
  });
}

describe('campaign creation', () => {
  it('creates a private campaign owned by the caller', async () => {
    const ada = await player('ada@example.com');

    const response = await createCampaign(ada, 'The Iron Vow', 'A first campaign');

    expect(response.statusCode).toBe(201);
    const campaign = response.json();
    expect(campaign.name).toBe('The Iron Vow');
    expect(campaign.role).toBe('owner');
    expect(campaign.revision).toBe(1);
    expect(campaign.rulesetId).toBe('ironsworn');
    expect(campaign.archivedAt).toBeNull();
    expect(campaign.deletedAt).toBeUndefined();
  });

  it('rejects an empty name', async () => {
    const ada = await player('ada@example.com');
    const response = await createCampaign(ada, '   ');
    expect(response.statusCode).toBe(400);
  });

  it('rejects an unauthenticated create', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      payload: { name: 'Nope' },
    });
    expect(response.statusCode).toBe(401);
  });
});

describe('cross-user isolation', () => {
  it('lists only the caller’s campaigns', async () => {
    const ada = await player('ada@example.com');
    const grace = await player('grace@example.com');
    await createCampaign(ada, 'Ada’s Campaign');

    const adaList = await app.inject({ method: 'GET', url: '/api/v1/campaigns', headers: ada });
    const graceList = await app.inject({ method: 'GET', url: '/api/v1/campaigns', headers: grace });

    expect(adaList.json().campaigns).toHaveLength(1);
    expect(graceList.json().campaigns).toHaveLength(0);
  });

  it('hides another account’s campaign behind a 404, not a 403', async () => {
    const ada = await player('ada@example.com');
    const grace = await player('grace@example.com');
    const created = await createCampaign(ada, 'Private');
    const id = created.json().id as string;

    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${id}`,
      headers: grace,
    });
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${id}`,
      headers: grace,
      payload: { name: 'Stolen' },
    });
    const remove = await app.inject({
      method: 'DELETE',
      url: `/api/v1/campaigns/${id}`,
      headers: grace,
      payload: { confirmName: 'Private' },
    });

    for (const response of [read, patch, remove]) {
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('not_found');
    }

    // And the owner's data is untouched.
    const still = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${id}`,
      headers: ada,
    });
    expect(still.json().name).toBe('Private');
    expect(still.json().revision).toBe(1);
  });
});

describe('campaign lifecycle', () => {
  it('renames, archives and bumps the revision', async () => {
    const ada = await player('ada@example.com');
    const created = await createCampaign(ada, 'Old Name');
    const id = created.json().id as string;

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${id}`,
      headers: ada,
      payload: { name: 'New Name', description: 'Now with a description' },
    });

    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().name).toBe('New Name');
    expect(renamed.json().description).toBe('Now with a description');
    expect(renamed.json().revision).toBe(2);

    const archived = await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${id}`,
      headers: ada,
      payload: { archived: true },
    });

    expect(archived.json().archivedAt).toBeTruthy();
    expect(archived.json().revision).toBe(3);
  });

  it('requires the exact name to delete, then hides the campaign from every read', async () => {
    const ada = await player('ada@example.com');
    const created = await createCampaign(ada, 'Doomed');
    const id = created.json().id as string;

    const wrongName = await app.inject({
      method: 'DELETE',
      url: `/api/v1/campaigns/${id}`,
      headers: ada,
      payload: { confirmName: 'doomed' },
    });
    expect(wrongName.statusCode).toBe(400);
    expect(wrongName.json().error.details.confirmName).toBeTruthy();

    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/v1/campaigns/${id}`,
      headers: ada,
      payload: { confirmName: 'Doomed' },
    });
    expect(deleted.statusCode).toBe(204);

    const read = await app.inject({
      method: 'GET',
      url: `/api/v1/campaigns/${id}`,
      headers: ada,
    });
    const list = await app.inject({ method: 'GET', url: '/api/v1/campaigns', headers: ada });

    expect(read.statusCode).toBe(404);
    expect(list.json().campaigns).toHaveLength(0);
  });

  it('rejects an update with no fields', async () => {
    const ada = await player('ada@example.com');
    const created = await createCampaign(ada, 'Unchanged');
    const id = created.json().id as string;

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/campaigns/${id}`,
      headers: ada,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });
});
