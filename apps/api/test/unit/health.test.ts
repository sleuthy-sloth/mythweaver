import { describe, expect, it, vi } from 'vitest';
import { HealthLiveSchema, HealthReadySchema } from '@mythweaver/contracts';
import { buildApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { createDatabase } from '../../src/db/client';

/**
 * The URL is never dialled in these tests: postgres.js connects lazily, so constructing a
 * handle is enough to satisfy routes that would use it.
 */
function testConfig() {
  return loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL: 'postgres://mythweaver:unused@127.0.0.1:1/mythweaver',
  });
}

function testDb() {
  return createDatabase('postgres://mythweaver:unused@127.0.0.1:1/mythweaver').db;
}

describe('GET /api/v1/health/live', () => {
  it('reports the process alive and matches the contract', async () => {
    const app = await buildApp({ config: testConfig(), db: testDb() });
    const response = await app.inject({ method: 'GET', url: '/api/v1/health/live' });

    expect(response.statusCode).toBe(200);
    const body = HealthLiveSchema.parse(response.json());
    expect(body.service).toBe('mythweaver-api');
    expect(body.version).toBe('0.1.0');
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);

    await app.close();
  });

  it('does not touch the database', async () => {
    const checkDatabase = vi.fn(async () => 1);
    const app = await buildApp({ config: testConfig(), db: testDb(), checkDatabase });

    await app.inject({ method: 'GET', url: '/api/v1/health/live' });

    expect(checkDatabase).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('GET /api/v1/health/ready', () => {
  it('returns 200 with latency when the database answers', async () => {
    const app = await buildApp({
      config: testConfig(),
      db: testDb(),
      checkDatabase: async () => 3.5,
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });

    expect(response.statusCode).toBe(200);
    const body = HealthReadySchema.parse(response.json());
    expect(body.status).toBe('ok');
    expect(body.checks.database).toEqual({ status: 'ok', latencyMs: 3.5 });

    await app.close();
  });

  it('returns 503 when the database is unreachable', async () => {
    const app = await buildApp({
      config: testConfig(),
      db: testDb(),
      checkDatabase: async () => {
        throw new Error('connect ECONNREFUSED 127.0.0.1:55432');
      },
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });

    expect(response.statusCode).toBe(503);
    const body = HealthReadySchema.parse(response.json());
    expect(body.status).toBe('degraded');
    expect(body.checks.database.status).toBe('fail');
    // The connection string must never appear in a response body.
    expect(response.body).not.toContain('ECONNREFUSED');
    expect(response.body).not.toContain('unused');

    await app.close();
  });

  it('returns 503 when no database check was wired up', async () => {
    const app = await buildApp({ config: testConfig(), db: testDb() });
    const response = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });

    expect(response.statusCode).toBe(503);
    await app.close();
  });
});

describe('error handling', () => {
  it('returns a stable error envelope for unknown routes', async () => {
    const app = await buildApp({ config: testConfig(), db: testDb() });
    const response = await app.inject({ method: 'GET', url: '/api/v1/nope' });

    expect(response.statusCode).toBe(404);
    const body = response.json() as { error: { code: string; requestId: string } };
    expect(body.error.code).toBe('not_found');
    expect(body.error.requestId).toBeTruthy();

    await app.close();
  });

  it('refuses an unauthenticated campaign request', async () => {
    const app = await buildApp({ config: testConfig(), db: testDb() });
    const response = await app.inject({ method: 'GET', url: '/api/v1/campaigns' });

    expect(response.statusCode).toBe(401);
    const body = response.json() as { error: { code: string } };
    expect(body.error.code).toBe('unauthorized');

    await app.close();
  });
});

describe('OpenAPI document', () => {
  it('generates without error and lists the documented paths', async () => {
    const app = await buildApp({ config: testConfig(), db: testDb() });
    const response = await app.inject({ method: 'GET', url: '/api/v1/openapi.json' });

    // A plain object in a response schema makes @fastify/swagger throw at request time, which
    // turns this endpoint into a 500 long after the route that caused it was written.
    expect(response.statusCode).toBe(200);
    const document = response.json() as { openapi: string; paths: Record<string, unknown> };
    expect(document.openapi).toBe('3.1.0');
    expect(Object.keys(document.paths)).toContain('/api/v1/campaigns/{campaignId}/rolls');
    expect(Object.keys(document.paths)).toContain('/api/v1/auth/login');

    await app.close();
  });
});

describe('config', () => {
  it('refuses to boot without DATABASE_URL', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
  });

  it('parses a comma-separated CORS allow-list', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgres://localhost/db',
      CORS_ORIGINS: 'https://a.example, https://b.example',
    });
    expect(config.corsOrigins).toEqual(['https://a.example', 'https://b.example']);
  });

  it('closes registration by default and only opens it on request', () => {
    expect(loadConfig({ DATABASE_URL: 'postgres://localhost/db' }).registrationOpen).toBe(false);
    expect(
      loadConfig({ DATABASE_URL: 'postgres://localhost/db', REGISTRATION_OPEN: 'true' })
        .registrationOpen,
    ).toBe(true);
  });

  it('marks cookies Secure in production and not in development', () => {
    expect(
      loadConfig({ DATABASE_URL: 'postgres://localhost/db', NODE_ENV: 'production' }).cookieSecure,
    ).toBe(true);
    expect(
      loadConfig({ DATABASE_URL: 'postgres://localhost/db', NODE_ENV: 'development' }).cookieSecure,
    ).toBe(false);
  });
});
