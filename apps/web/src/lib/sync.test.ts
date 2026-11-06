import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Character, Roll } from '@mythweaver/contracts';
import { db } from './db';
import { ApiError } from './http';
import { enqueue, flushOutbox, pendingOps, resolveConflict } from './sync';

const character: Character = {
  id: '22222222-2222-4222-8222-222222222222',
  campaignId: '11111111-1111-4111-8111-111111111111',
  name: 'Sabine',
  stats: { edge: 2, heart: 1, iron: 3, shadow: 2, wits: 1 },
  health: 5,
  spirit: 5,
  supply: 5,
  momentum: 2,
  debilities: [],
  xp: 0,
  notes: null,
  revision: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function handlers(overrides: Partial<Parameters<typeof flushOutbox>[0]> = {}) {
  return {
    updateCharacter: vi.fn(async () => ({ ...character, health: 4, revision: 2 })),
    roll: vi.fn(
      async () =>
        ({
          id: 'server-roll-1',
          campaignId: character.campaignId,
          characterId: character.id,
          moveId: null,
          stat: 'iron',
          adds: 0,
          actionDie: 3,
          challenge: [4, 8] as [number, number],
          actionScore: 6,
          outcome: 'weak_hit',
          match: false,
          burned: false,
          source: 'client',
          momentumBefore: 2,
          momentumAfter: 2,
          createdAt: new Date().toISOString(),
        }) satisfies Roll,
    ),
    ...overrides,
  };
}

beforeEach(async () => {
  await Promise.all([
    db.outbox.clear(),
    db.characters.clear(),
    db.rolls.clear(),
    db.campaigns.clear(),
  ]);
});

describe('outbox replay', () => {
  it('sends a queued edit with its operation id as the idempotency key', async () => {
    const op = await enqueue({
      kind: 'update-character',
      campaignId: character.campaignId,
      label: 'Sabine: health',
      payload: { characterId: character.id, patch: { health: 4, baseRevision: 1 } },
    });

    const api = handlers();
    const summary = await flushOutbox(api);

    expect(summary.sent).toBe(1);
    expect(summary.remaining).toBe(0);
    expect(api.updateCharacter).toHaveBeenCalledWith(
      character.campaignId,
      character.id,
      { health: 4, baseRevision: 1 },
      op.id,
    );

    // The confirmed row replaces the optimistic copy in the local cache.
    const cached = await db.characters.get(character.id);
    expect(cached?.data.health).toBe(4);
    expect(cached?.data.revision).toBe(2);
    expect(await pendingOps()).toHaveLength(0);
  });

  it('keeps the operation and backs off when the network fails', async () => {
    await enqueue({
      kind: 'update-character',
      campaignId: character.campaignId,
      label: 'Sabine: spirit',
      payload: { characterId: character.id, patch: { spirit: 4, baseRevision: 1 } },
    });

    const api = handlers({
      updateCharacter: vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    });
    const summary = await flushOutbox(api);

    expect(summary.sent).toBe(0);
    expect(summary.remaining).toBe(1);

    const [op] = await pendingOps();
    expect(op?.status).toBe('pending');
    expect(op?.attempts).toBe(1);
    expect(op?.nextAttemptAt).toBeGreaterThan(Date.now());
  });

  it('does not resend before the backoff has elapsed', async () => {
    await enqueue({
      kind: 'update-character',
      campaignId: character.campaignId,
      label: 'Sabine: supply',
      payload: { characterId: character.id, patch: { supply: 3, baseRevision: 1 } },
    });

    const failing = handlers({
      updateCharacter: vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    });
    await flushOutbox(failing);

    const succeeding = handlers();
    const summary = await flushOutbox(succeeding);

    expect(summary.sent).toBe(0);
    expect(succeeding.updateCharacter).not.toHaveBeenCalled();
  });

  it('parks a revision conflict and keeps the edit for a decision', async () => {
    await enqueue({
      kind: 'update-character',
      campaignId: character.campaignId,
      label: 'Sabine: health',
      payload: { characterId: character.id, patch: { health: 2, baseRevision: 1 } },
    });

    const api = handlers({
      updateCharacter: vi.fn(async () => {
        throw new ApiError(409, 'conflict', 'This character changed since you loaded it', {
          currentRevision: ['3'],
        });
      }),
    });
    const summary = await flushOutbox(api);

    expect(summary.conflicts).toBe(1);
    const [op] = await pendingOps();
    expect(op?.status).toBe('conflict');
  });

  it('re-sends without the stale revision when the player keeps their value', async () => {
    const op = await enqueue({
      kind: 'update-character',
      campaignId: character.campaignId,
      label: 'Sabine: health',
      payload: { characterId: character.id, patch: { health: 2, baseRevision: 1 } },
    });
    await db.outbox.update(op.id, { status: 'conflict' });

    await resolveConflict(op.id, 'keep-mine');

    const [parked] = await pendingOps();
    expect(parked?.status).toBe('pending');
    expect(parked?.payload).toEqual({
      characterId: character.id,
      patch: { health: 2 },
    });
  });

  it('discards an operation instead of sending it', async () => {
    const op = await enqueue({
      kind: 'update-character',
      campaignId: character.campaignId,
      label: 'Sabine: health',
      payload: { characterId: character.id, patch: { health: 2, baseRevision: 1 } },
    });
    await resolveConflict(op.id, 'discard');

    expect(await pendingOps()).toHaveLength(0);
  });
});

describe('offline rolls', () => {
  it('replaces the local pending roll with the server row', async () => {
    const localId = crypto.randomUUID();
    await db.rolls.put({
      id: localId,
      campaignId: character.campaignId,
      queued: true,
      data: {
        id: localId,
        campaignId: character.campaignId,
        characterId: character.id,
        moveId: null,
        stat: 'iron',
        adds: 0,
        actionDie: 3,
        challenge: [4, 8],
        actionScore: 6,
        outcome: 'weak_hit',
        match: false,
        burned: false,
        source: 'client',
        momentumBefore: 2,
        momentumAfter: 2,
        createdAt: new Date().toISOString(),
      },
    });

    await enqueue({
      kind: 'roll',
      campaignId: character.campaignId,
      label: 'Roll iron',
      payload: {
        characterId: character.id,
        stat: 'iron',
        adds: 0,
        burnMomentum: false,
        dice: { actionDie: 3, challenge: [4, 8] },
        localRollId: localId,
      },
    });

    const summary = await flushOutbox(handlers());

    expect(summary.sent).toBe(1);
    expect(await db.rolls.get(localId)).toBeUndefined();
    const server = await db.rolls.get('server-roll-1');
    expect(server?.queued).toBe(false);
  });
});
