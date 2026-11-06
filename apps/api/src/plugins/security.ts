import type { FastifyInstance } from 'fastify';
import type { AppConfig } from '../config';
import type { Database } from '../db/client';
import { AppError, forbidden } from '../lib/errors';
import { newOpaqueToken, safeEqual } from '../lib/tokens';
import {
  CSRF_COOKIE,
  CSRF_HEADER,
  SESSION_COOKIE,
  csrfCookieOptions,
  findSession,
  touchSession,
} from '../modules/auth/session';

/** Methods that cannot change state, so CSRF does not apply. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Login and registration are exempt: there is no session to ride yet, and the cookie is
 * SameSite=Lax, which already blocks cross-site POSTs from carrying it. Every authenticated
 * mutation still needs the double-submit header.
 */
const CSRF_EXEMPT_PATHS = new Set(['/api/v1/auth/login', '/api/v1/auth/register']);

const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export function registerSecurityHooks(app: FastifyInstance, db: Database, config: AppConfig): void {
  app.decorateRequest('user', null);
  app.decorateRequest('sessionId', null);

  app.addHook('onRequest', async (request, reply) => {
    // 1. Every response carries a CSRF cookie, so the SPA can act on its first page load.
    if (!request.cookies[CSRF_COOKIE]) {
      reply.setCookie(CSRF_COOKIE, newOpaqueToken(), csrfCookieOptions(config));
    }

    // 2. Resolve the session once per request; handlers never parse cookies themselves.
    const rawToken = request.cookies[SESSION_COOKIE];
    if (rawToken) {
      const found = await findSession(db, rawToken);
      if (found) {
        request.user = found.user;
        request.sessionId = found.sessionId;
        if (Date.now() - found.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
          // Fire and forget: a failed audit update must not fail the request.
          void touchSession(db, found.sessionId).catch(() => {});
        }
      }
    }

    // 3. Double-submit CSRF check for state-changing requests.
    //    Only authenticated requests need it: with no session there is no authority to ride,
    //    and the answer should be 401 (from the route) rather than a confusing 403.
    if (SAFE_METHODS.has(request.method)) return;
    if (!request.user) return;

    const path = request.url.split('?')[0] ?? '';
    if (CSRF_EXEMPT_PATHS.has(path)) return;

    const cookieToken = request.cookies[CSRF_COOKIE];
    const headerToken = request.headers[CSRF_HEADER];

    if (typeof headerToken !== 'string' || !cookieToken || !safeEqual(headerToken, cookieToken)) {
      throw forbidden('Missing or invalid CSRF token');
    }
  });
}

/** Narrowing helper so route code can rely on AppError without instanceof gymnastics. */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
