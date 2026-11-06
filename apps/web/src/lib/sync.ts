import type { Character, Roll, RollRequest, UpdateCharacterRequest } from '@mythweaver/contracts';
import { db, putCharacter, putRoll, type OutboxOp } from './db';
import { ApiError } from './http';

/**
 * Durable outbox.
 *
 * A write that cannot reach the server is stored in IndexedDB with a client-generated id that
 * doubles as the Idempotency-Key, then replayed in order. Replay is safe to repeat: the server
 * returns the original response for a key it has already seen.
 *
 * Failures are classified, not retried blindly:
 *  - network / 5xx  -> exponential backoff, stays pending
 *  - 409 conflict   -> parked as `conflict`; the player chooses which value wins
 *  - 401            -> parked as `failed`; the session needs signing in again
 */

export type OutboxHandlers = {
  updateCharacter: (
    campaignId: string,
    characterId: string,
    body: UpdateCharacterRequest,
    idempotencyKey: string,
  ) => Promise<Character>;
  roll: (campaignId: string, body: RollRequest, idempotencyKey: string) => Promise<Roll>;
};

type UpdateCharacterPayload = {
  characterId: string;
  patch: UpdateCharacterRequest;
};

type RollPayload = RollRequest & { localRollId?: string };

export type FlushSummary = {
  sent: number;
  remaining: number;
  conflicts: number;
  failed: number;
};

const listeners = new Set<() => void>();
const MAX_BACKOFF_MS = 30_000;

export function subscribeToOutbox(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}

export async function enqueue(op: {
  kind: OutboxOp['kind'];
  campaignId: string;
  label: string;
  payload: unknown;
  id?: string;
}): Promise<OutboxOp> {
  const record: OutboxOp = {
    id: op.id ?? crypto.randomUUID(),
    kind: op.kind,
    campaignId: op.campaignId,
    label: op.label,
    payload: op.payload,
    createdAt: Date.now(),
    attempts: 0,
    nextAttemptAt: 0,
    status: 'pending',
  };

  await db.outbox.put(record);
  notify();
  return record;
}

export async function pendingOps(): Promise<OutboxOp[]> {
  return db.outbox.orderBy('createdAt').toArray();
}

export async function pendingCount(): Promise<number> {
  return db.outbox.where('status').anyOf('pending', 'conflict', 'failed').count();
}

async function applySuccess(op: OutboxOp, result: Character | Roll): Promise<void> {
  if (op.kind === 'update-character') {
    await putCharacter(result as Character);
  } else {
    const payload = op.payload as RollPayload;
    // The optimistic row had a local id; the server's row replaces it.
    if (payload.localRollId) await db.rolls.delete(payload.localRollId);
    await putRoll(result as Roll);
  }
}

async function send(op: OutboxOp, handlers: OutboxHandlers): Promise<void> {
  if (op.kind === 'update-character') {
    const payload = op.payload as UpdateCharacterPayload;
    const character = await handlers.updateCharacter(
      op.campaignId,
      payload.characterId,
      payload.patch,
      op.id,
    );
    await applySuccess(op, character);
    return;
  }

  if (op.kind === 'roll') {
    const payload = op.payload as RollPayload;
    const { localRollId: _localRollId, ...request } = payload;
    const roll = await handlers.roll(op.campaignId, request, op.id);
    await applySuccess(op, roll);
    return;
  }

  throw new Error(`Unknown outbox operation: ${op.kind satisfies never}`);
}

/**
 * Sends everything that is due. Safe to call often: it returns quickly when the queue is empty,
 * and it stops at the first network error rather than burning through the whole backlog offline.
 */
export async function flushOutbox(handlers: OutboxHandlers): Promise<FlushSummary> {
  const ops = (await db.outbox.orderBy('createdAt').toArray()).filter(
    (op) => op.status === 'pending' && op.nextAttemptAt <= Date.now(),
  );

  let sent = 0;
  let stopped = false;

  for (const op of ops) {
    if (stopped) break;

    try {
      await send(op, handlers);
      await db.outbox.delete(op.id);
      sent += 1;
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        await db.outbox.update(op.id, {
          status: 'conflict',
          error: error.message,
          attempts: op.attempts + 1,
        });
        continue;
      }

      if (error instanceof ApiError && error.status === 401) {
        await db.outbox.update(op.id, {
          status: 'failed',
          error: 'Session expired. Sign in again to send this change.',
          attempts: op.attempts + 1,
        });
        stopped = true;
        continue;
      }

      const attempts = op.attempts + 1;
      const backoff = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** (attempts - 1));
      await db.outbox.update(op.id, {
        attempts,
        nextAttemptAt: Date.now() + backoff,
        error: error instanceof Error ? error.message : 'Network error',
      });
      // Offline: the rest of the queue will fail the same way.
      stopped = true;
    }
  }

  const all = await pendingOps();
  notify();

  return {
    sent,
    remaining: all.filter((op) => op.status === 'pending').length,
    conflicts: all.filter((op) => op.status === 'conflict').length,
    failed: all.filter((op) => op.status === 'failed').length,
  };
}

/**
 * Resolves a parked conflict, deliberately in the player's hands:
 *  - keep-mine: drop the stale baseRevision so the next attempt overwrites
 *  - discard:   forget the queued change; the next refresh shows the server's value
 */
export async function resolveConflict(id: string, choice: 'keep-mine' | 'discard'): Promise<void> {
  if (choice === 'discard') {
    await db.outbox.delete(id);
    notify();
    return;
  }

  const op = await db.outbox.get(id);
  if (!op) return;

  const payload = op.payload as UpdateCharacterPayload;
  const { baseRevision: _baseRevision, ...patch } = payload.patch;
  await db.outbox.update(id, {
    status: 'pending',
    attempts: 0,
    nextAttemptAt: 0,
    error: undefined,
    payload: { ...payload, patch },
  });
  notify();
}

/** Discards a failed operation (for example after the session was re-established). */
export async function discardOp(id: string): Promise<void> {
  await db.outbox.delete(id);
  notify();
}
