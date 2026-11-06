import type { FastifyReply, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { sessions, users } from '../../db/schema';
import type { AppConfig } from '../../config';
import { hashToken, newOpaqueToken } from '../../lib/tokens';
import { unauthorized } from '../../lib/errors';

export const SESSION_COOKIE = 'mw_session';
export const CSRF_COOKIE = 'mw_csrf';
export const CSRF_HEADER = 'x-csrf-token';

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  role: 'player' | 'operator';
  createdAt: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export const csrfCookieOptions = (config: AppConfig) =>
  ({
    path: '/',
    sameSite: 'lax' as const,
    httpOnly: false, // The SPA must read it to echo it back in the header.
    secure: config.cookieSecure,
    maxAge: config.sessionTtlDays * 24 * 60 * 60,
  }) as const;

export const sessionCookieOptions = (config: AppConfig, expiresAt: Date) =>
  ({
    path: '/',
    sameSite: 'lax' as const,
    httpOnly: true,
    secure: config.cookieSecure,
    expires: expiresAt,
  }) as const;

export type SessionLookup = { user: AuthUser; sessionId: string; lastUsedAt: Date };

/** Issues a session row and returns the raw token, which is never persisted in clear. */
export async function createSession(
  db: Database,
  userId: string,
  config: AppConfig,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newOpaqueToken();
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * DAY_MS);

  await db.insert(sessions).values({ userId, tokenHash: hashToken(token), expiresAt });

  return { token, expiresAt };
}

/**
 * Resolves a raw cookie token to its account. Expired and revoked sessions are rejected here,
 * not filtered later, so every caller gets the same answer.
 */
export async function findSession(db: Database, rawToken: string): Promise<SessionLookup | null> {
  const [row] = await db
    .select({
      sessionId: sessions.id,
      expiresAt: sessions.expiresAt,
      lastUsedAt: sessions.lastUsedAt,
      revokedAt: sessions.revokedAt,
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      createdAt: users.createdAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashToken(rawToken)))
    .limit(1);

  if (!row) return null;
  if (row.revokedAt) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;

  return {
    sessionId: row.sessionId,
    lastUsedAt: row.lastUsedAt,
    user: {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      role: row.role === 'operator' ? 'operator' : 'player',
      createdAt: row.createdAt.toISOString(),
    },
  };
}

/**
 * Sliding expiry would be friendlier, but it also lets an unattended device stay logged in
 * forever. `last_used_at` is recorded for audit; the deadline itself is fixed at login.
 */
export async function touchSession(db: Database, sessionId: string): Promise<void> {
  await db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export async function revokeSession(db: Database, sessionId: string): Promise<void> {
  await db.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.id, sessionId));
}

export function clearSessionCookies(reply: FastifyReply, config: AppConfig): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
  reply.clearCookie(CSRF_COOKIE, { path: '/', sameSite: 'lax', secure: config.cookieSecure });
}

/** Throws a 401 unless a session was attached by the request hook. */
export function requireUser(request: FastifyRequest): AuthUser {
  if (!request.user) throw unauthorized();
  return request.user;
}
