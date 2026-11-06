import { useEffect } from 'react';
import { useSync } from '../lib/useSync';

/**
 * The honesty strip: says when the app is offline, how many changes are waiting, and what needs a
 * decision. Everything else on the page keeps working while it is visible.
 */
export default function SyncBar({ onFlushed }: { onFlushed?: () => void }) {
  const { online, pending, conflicts, failed, flushing, flush, keepMine, discard } = useSync();

  // Hooks must run unconditionally, so the early return comes after this effect.
  useEffect(() => {
    if (online && pending.length === 0 && conflicts.length === 0) onFlushed?.();
  }, [online, pending.length, conflicts.length, onFlushed]);

  const nothingWaiting = pending.length === 0 && conflicts.length === 0 && failed.length === 0;
  if (online && nothingWaiting) return null;

  return (
    <div className="panel" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          {online ? (
            <>
              <span className="font-medium text-accent">
                {pending.length} change{pending.length === 1 ? '' : 's'} not yet sent
              </span>
              <span className="text-muted"> · retrying automatically</span>
            </>
          ) : (
            <>
              <span className="font-medium text-warning">Offline</span>
              <span className="text-muted">
                {' '}
                · playing from this device. {pending.length} change
                {pending.length === 1 ? '' : 's'} will send when you reconnect.
              </span>
            </>
          )}
        </p>
        {online && pending.length > 0 ? (
          <button type="button" className="btn btn-secondary" onClick={() => void flush()}>
            {flushing ? 'Sending…' : 'Send now'}
          </button>
        ) : null}
      </div>

      {conflicts.length > 0 ? (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {conflicts.map((op) => (
            <li key={op.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <span className="badge badge-miss">conflict</span>{' '}
                <span className="text-ink-soft">{op.label}</span>
                <span className="block text-xs text-muted">
                  Changed elsewhere since you loaded it. Keep yours, or discard it and take the
                  server's.
                </span>
              </span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void keepMine(op.id)}
                >
                  Keep mine
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => void discard(op.id)}>
                  Discard
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {failed.length > 0 ? (
        <ul className="mt-3 space-y-2 border-t border-border pt-3">
          {failed.map((op) => (
            <li key={op.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                <span className="badge badge-miss">not sent</span>{' '}
                <span className="text-ink-soft">{op.label}</span>
                <span className="block text-xs text-muted">{op.error}</span>
              </span>
              <button type="button" className="btn btn-ghost" onClick={() => void discard(op.id)}>
                Discard
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
