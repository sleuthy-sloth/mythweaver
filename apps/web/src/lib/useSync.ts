import { useCallback, useEffect, useState } from 'react';
import {
  discardOp,
  flushOutbox,
  pendingOps,
  resolveConflict,
  subscribeToOutbox,
  type OutboxHandlers,
} from './sync';
import { db, type OutboxOp } from './db';
import { api } from './http';

/** The API calls the outbox replays. Kept here so tests can inject fakes instead. */
export const syncHandlers: OutboxHandlers = {
  updateCharacter: (campaignId, characterId, body, key) =>
    api.updateCharacter(campaignId, characterId, body, key),
  roll: (campaignId, body, key) => api.roll(campaignId, body, key),
};

export function useSync() {
  const [ops, setOps] = useState<OutboxOp[]>([]);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [flushing, setFlushing] = useState(false);

  const refresh = useCallback(async () => {
    setOps(await pendingOps());
  }, []);

  const flush = useCallback(async () => {
    if (!navigator.onLine) return;
    setFlushing(true);
    try {
      await flushOutbox(syncHandlers);
      await refresh();
    } finally {
      setFlushing(false);
    }
  }, [refresh]);

  useEffect(() => {
    void refresh();
    const unsubscribe = subscribeToOutbox(() => void refresh());

    const goOnline = () => {
      setOnline(true);
      void flush();
    };
    const goOffline = () => setOnline(false);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // A reload can happen while changes are still queued.
    void flush();

    return () => {
      unsubscribe();
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, [flush, refresh]);

  const pending = ops.filter((op) => op.status === 'pending');
  const conflicts = ops.filter((op) => op.status === 'conflict');
  const failed = ops.filter((op) => op.status === 'failed');

  return {
    ops,
    pending,
    conflicts,
    failed,
    online,
    flushing,
    flush,
    keepMine: async (id: string) => {
      await resolveConflict(id, 'keep-mine');
      await flush();
    },
    discard: async (id: string) => {
      await discardOp(id);
      await refresh();
    },
    /** Reads straight from the local database; used when the network is unavailable. */
    cached: async (campaignId: string) => ({
      characters: await db.characters.where('campaignId').equals(campaignId).toArray(),
      rolls: await db.rolls.where('campaignId').equals(campaignId).toArray(),
    }),
  };
}
