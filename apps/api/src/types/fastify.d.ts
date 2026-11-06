import type { AuthUser } from '../modules/auth/session';

/**
 * Request decorations added by the auth hook. Declared once so handlers get real types
 * instead of reading `request as any`.
 */
declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    sessionId: string | null;
    /** Set by the idempotency hook when a POST carries a usable key. */
    idempotencyKey?: string;
    idempotencyHash?: string;
    /** True when the response is a replay, so onSend must not store it again. */
    idempotencyHit?: boolean;
  }
}
