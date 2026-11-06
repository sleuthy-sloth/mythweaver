import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { authedHeaders, logIn, signUp, TEST_PASSWORD } from '../helpers/api';
import { createTestContext, resetDatabase, type TestContext } from '../helpers/db';

let context: TestContext;
let app: FastifyInstance;

async function makeApp(env: Record<string, string> = {}): Promise<FastifyInstance> {
  return buildApp({
    config: loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: context.databaseUrl,
      REGISTRATION_OPEN: 'true',
      RATE_LIMIT_ENABLED: 'false',
      COOKIE_SECURE: 'false',
      ...env,
    }),
    db: context.db,
  });
}

beforeAll(async () => {
  context = await createTestContext();
  app = await makeApp();
});

afterAll(async () => {
  await app.close();
  await context.close();
});

beforeEach(async () => {
  await resetDatabase(context.sql);
});

describe('registration policy', () => {
  it('refuses sign-ups when the operator closed registration', async () => {
    const closed = await makeApp({ REGISTRATION_OPEN: 'false' });

    const response = await closed.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'ada@example.com', displayName: 'Ada', password: TEST_PASSWORD },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('forbidden');

    await closed.close();
  });

  it('creates the account, normalises the email and starts a session', async () => {
    const { response, cookies } = await signUp(app, { email: 'Ada@Example.COM' });

    expect(response.statusCode).toBe(201);
    expect(response.json().user.email).toBe('ada@example.com');
    expect(response.json().user.role).toBe('player');
    expect(cookies.get('mw_session')).toBeTruthy();
    expect(cookies.get('mw_csrf')).toBeTruthy();

    const setCookie = response.headers['set-cookie'];
    const raw = Array.isArray(setCookie) ? setCookie.join('\n') : String(setCookie);
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
  });

  it('rejects a second account for the same address in different case', async () => {
    await signUp(app, { email: 'ada@example.com' });

    const { response } = await signUp(app, { email: 'ADA@example.com' });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('conflict');
  });

  it('rejects a password shorter than 12 characters with a field error', async () => {
    const { response } = await signUp(app, { email: 'weak@example.com', password: 'short' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.details.password).toBeTruthy();
  });
});

describe('login', () => {
  it('gives the same answer for a wrong password and an unknown account', async () => {
    await signUp(app, { email: 'ada@example.com' });

    const wrongPassword = await logIn(app, 'ada@example.com', 'not the right password');
    const unknownAccount = await logIn(app, 'nobody@example.com', 'not the right password');

    expect(wrongPassword.response.statusCode).toBe(401);
    expect(unknownAccount.response.statusCode).toBe(401);
    expect(wrongPassword.response.json().error.message).toBe(
      unknownAccount.response.json().error.message,
    );
  });

  it('starts a session and reports the account from /me', async () => {
    await signUp(app, { email: 'ada@example.com', displayName: 'Ada Lovelace' });

    const { response, cookies } = await logIn(app, 'ada@example.com');
    expect(response.statusCode).toBe(200);

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: `mw_session=${cookies.get('mw_session')}` },
    });

    expect(me.statusCode).toBe(200);
    expect(me.json().user.displayName).toBe('Ada Lovelace');
  });

  it('revokes the session on logout', async () => {
    const { cookies } = await signUp(app, { email: 'ada@example.com' });

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: authedHeaders(cookies),
    });
    expect(logout.statusCode).toBe(204);

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: `mw_session=${cookies.get('mw_session')}` },
    });
    expect(me.statusCode).toBe(401);
  });

  it('rejects an expired session', async () => {
    const { cookies } = await signUp(app, { email: 'ada@example.com' });
    await context.sql`update sessions set expires_at = now() - interval '1 minute'`;

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: `mw_session=${cookies.get('mw_session')}` },
    });

    expect(me.statusCode).toBe(401);
  });

  it('never stores the raw session token', async () => {
    const { cookies } = await signUp(app, { email: 'ada@example.com' });
    const rawToken = cookies.get('mw_session');
    const rows = await context.sql<{ token_hash: string }[]>`select token_hash from sessions`;

    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).not.toBe(rawToken);
    expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('CSRF', () => {
  it('refuses a state-changing request without the double-submit header', async () => {
    const { cookies } = await signUp(app, { email: 'ada@example.com' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: { cookie: `mw_session=${cookies.get('mw_session')}` },
      payload: { name: 'No Header' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.message).toMatch(/CSRF/i);
  });

  it('accepts the request when the header matches the cookie', async () => {
    const { cookies } = await signUp(app, { email: 'ada@example.com' });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/campaigns',
      headers: authedHeaders(cookies),
      payload: { name: 'With Header' },
    });

    expect(response.statusCode).toBe(201);
  });
});

describe('rate limiting', () => {
  it('returns 429 once the login budget is spent', async () => {
    const limited = await makeApp({
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_LOGIN_MAX: '2',
    });
    await signUp(app, { email: 'ada@example.com' });

    const attempts = [];
    for (let index = 0; index < 3; index += 1) {
      attempts.push(
        await limited.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: { email: 'ada@example.com', password: 'wrong password here' },
        }),
      );
    }

    expect(attempts[0]?.statusCode).toBe(401);
    expect(attempts[1]?.statusCode).toBe(401);
    expect(attempts[2]?.statusCode).toBe(429);
    expect(attempts[2]?.json().error.code).toBe('rate_limited');

    await limited.close();
  });
});
