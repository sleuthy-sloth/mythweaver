import type { FastifyInstance, LightMyRequestResponse } from 'fastify';

export const TEST_PASSWORD = 'correct horse battery staple';

/** Parses `set-cookie` into name -> value, ignoring attributes. */
export function cookiesFrom(response: LightMyRequestResponse): Map<string, string> {
  const jar = new Map<string, string>();
  const raw = response.headers['set-cookie'];
  const headers = Array.isArray(raw) ? raw : raw ? [raw] : [];

  for (const header of headers) {
    const [pair] = header.split(';');
    if (!pair) continue;
    const index = pair.indexOf('=');
    if (index < 0) continue;
    jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }

  return jar;
}

export function cookieHeader(jar: Map<string, string>): string {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

/**
 * Headers for an authenticated mutation. The CSRF value comes from the cookie because that is
 * exactly what a browser does (double submit); the session cookie travels alongside.
 */
export function authedHeaders(jar: Map<string, string>): Record<string, string> {
  const csrf = jar.get('mw_csrf');
  if (!csrf) throw new Error('No CSRF cookie in the jar');
  return { cookie: cookieHeader(jar), 'x-csrf-token': csrf };
}

export async function signUp(
  app: FastifyInstance,
  input: { email: string; displayName?: string; password?: string },
): Promise<{ response: LightMyRequestResponse; cookies: Map<string, string> }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: input.email,
      displayName: input.displayName ?? input.email.split('@')[0] ?? 'Player',
      password: input.password ?? TEST_PASSWORD,
    },
  });

  return { response, cookies: cookiesFrom(response) };
}

export async function logIn(
  app: FastifyInstance,
  email: string,
  password = TEST_PASSWORD,
): Promise<{ response: LightMyRequestResponse; cookies: Map<string, string> }> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password },
  });

  return { response, cookies: cookiesFrom(response) };
}
