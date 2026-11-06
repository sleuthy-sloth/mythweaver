import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { Database } from '../db/client';
import { idempotencyKeys } from '../db/schema';
import { conflict } from '../lib/errors';
import { sha256Hex } from '../lib/tokens';

/**
 * Idempotent POSTs.
 *
 * The offline client replays an outbox after reconnecting, and a flaky connection can deliver the
 * same POST twice. A client-chosen `Idempotency-Key` makes the second delivery return the first
 * response instead of creating a second campaign or a duplicate roll.
 *
 * Scope: POST only. PATCH and DELETE describe a target state, so repeating them is already safe;
 * POST is the one that manufactures rows.
 *
 * Runs at `preHandler` (not `onRequest`) because that is the first point where the parsed body is
 * available to hash. Unauthenticated POSTs are skipped: login and registration are throttled, not
 * replayed from an outbox, and storing their failures would be a liability.
 */
export function registerIdempotency(app: FastifyInstance, db: Database): void {
  app.addHook('preHandler', async (request, reply) => {
    if (request.method !== 'POST') return;
    if (!request.user) return;

    const header = request.headers['idempotency-key'];
    if (typeof header !== 'string' || header.length < 8 || header.length > 200) return;

    const requestHash = sha256Hex(JSON.stringify(request.body ?? null));

    const [existing] = await db
      .select()
      .from(idempotencyKeys)
      .where(and(eq(idempotencyKeys.userId, request.user.id), eq(idempotencyKeys.key, header)))
      .limit(1);

    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw conflict('This Idempotency-Key was already used with a different request body');
      }
      request.idempotencyHit = true;
      return reply.status(existing.status).send(existing.body ?? undefined);
    }

    request.idempotencyKey = header;
    request.idempotencyHash = requestHash;
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const key = request.idempotencyKey;
    const requestHash = request.idempotencyHash;
    if (!key || !requestHash || request.idempotencyHit) return payload;
    if (!request.user) return payload;
    // A 5xx is not an outcome worth replaying: the client should retry for a real answer.
    if (reply.statusCode >= 500) return payload;

    let body: unknown = null;
    if (typeof payload === 'string' && payload.length > 0) {
      try {
        body = JSON.parse(payload);
      } catch {
        body = null;
      }
    }

    await db
      .insert(idempotencyKeys)
      .values({
        userId: request.user.id,
        key,
        requestHash,
        status: reply.statusCode,
        body,
      })
      .onConflictDoNothing();

    return payload;
  });
}
