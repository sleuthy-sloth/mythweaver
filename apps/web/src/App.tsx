import { useCallback, useEffect, useState } from 'react';
import { probeApi, type ConnectionState } from './lib/api';

const NEXT_UP = [
  { title: 'Campaigns', detail: 'Private by default, owned by an account, exported at any time.' },
  {
    title: 'Characters',
    detail: 'Ironsworn stats, momentum, vows and assets — deterministic rolls.',
  },
  { title: 'World', detail: 'NPCs, factions, places and a journal that links back to every roll.' },
];

function StatusPill({ state }: { state: ConnectionState }) {
  if (state.kind === 'checking') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm text-muted">
        <span className="size-2 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
        Checking the table…
      </span>
    );
  }

  if (state.kind === 'offline') {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-danger/40 bg-danger/10 px-3 py-1 text-sm text-danger">
        <span aria-hidden="true" className="size-2 rounded-full bg-danger" />
        API unreachable
      </span>
    );
  }

  const databaseOk = state.database.status === 'ok';
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
        databaseOk
          ? 'border-success/40 bg-success/10 text-success'
          : 'border-danger/40 bg-danger/10 text-danger'
      }`}
    >
      <span
        aria-hidden="true"
        className={`size-2 rounded-full ${databaseOk ? 'bg-success' : 'bg-danger'}`}
      />
      {databaseOk ? 'API online' : 'API up, database down'}
    </span>
  );
}

function StatusCard({ state, onRetry }: { state: ConnectionState; onRetry: () => void }) {
  return (
    <section className="card" aria-labelledby="status-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="status-heading" className="font-display text-xl">
          Foundation check
        </h2>
        <StatusPill state={state} />
      </div>

      <div aria-live="polite" className="mt-3 space-y-1 text-sm text-muted">
        {state.kind === 'checking' && <p>Asking the server whether it can reach PostgreSQL.</p>}
        {state.kind === 'online' && (
          <>
            <p>
              API v{state.version} answered
              {state.database.latencyMs !== undefined
                ? `, database round trip ${state.database.latencyMs} ms.`
                : '.'}
            </p>
            <p>This is the Phase 1 slice: health endpoints, one migration, one test per layer.</p>
          </>
        )}
        {state.kind === 'offline' && (
          <>
            <p>
              No API answered. Start it with <code className="code">pnpm dev:api</code>.
            </p>
            <p className="text-xs">Details: {state.message}</p>
          </>
        )}
      </div>

      <button type="button" onClick={onRetry} className="btn mt-4">
        Check again
      </button>
    </section>
  );
}

export default function App() {
  const [state, setState] = useState<ConnectionState>({ kind: 'checking' });

  const check = useCallback(() => {
    const controller = new AbortController();
    setState({ kind: 'checking' });
    probeApi(controller.signal)
      .then(setState)
      .catch(() => {
        /* aborted: a newer probe owns the state */
      });
    return () => controller.abort();
  }, []);

  useEffect(() => check(), [check]);

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-accent focus:px-4 focus:py-2 focus:text-canvas"
      >
        Skip to content
      </a>

      <header className="mx-auto w-full max-w-3xl px-5 pb-2 pt-8">
        <p className="text-xs uppercase tracking-[0.2em] text-muted">Self-hosted solo RPG</p>
        <h1 className="mt-1 font-display text-4xl leading-tight">Mythweaver</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">
          One player, one ruleset, your own server. No account with anyone else, no AI required.
        </p>
      </header>

      <main id="main" className="mx-auto w-full max-w-3xl space-y-4 px-5 py-4 pb-16">
        <StatusCard state={state} onRetry={() => check()} />

        <section className="card" aria-labelledby="next-heading">
          <h2 id="next-heading" className="font-display text-xl">
            What arrives next
          </h2>
          <ul className="mt-3 divide-y divide-border">
            {NEXT_UP.map((item) => (
              <li key={item.title} className="py-3 first:pt-0 last:pb-0">
                <p className="font-medium">{item.title}</p>
                <p className="text-sm text-muted">{item.detail}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">
            Nothing here is a placeholder for working game rules. Moves, dice and oracles land in
            Phase 3 with deterministic tests.
          </p>
        </section>
      </main>

      <footer className="mx-auto w-full max-w-3xl px-5 pb-8 text-xs text-muted">
        <p>
          Mythweaver is independent software. Ironsworn is by Shawn Tomkin; its SRD content is used
          under CC BY 4.0 and attributed in the app when it ships.
        </p>
      </footer>
    </div>
  );
}
