import type { AuthUser } from '../modules/auth/session';

/**
 * Request decorations added by the auth hook. Declared once so handlers get real types
 * instead of reading `request as any`.
 */
declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    sessionId: string | null;
  }
}
