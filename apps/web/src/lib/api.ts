import {
  API_PREFIX,
  HealthLiveSchema,
  HealthReadySchema,
  type HealthReady,
} from '@mythweaver/contracts';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? API_PREFIX;

export type ConnectionState =
  | { kind: 'checking' }
  | { kind: 'online'; version: string; database: HealthReady['checks']['database'] }
  | { kind: 'offline'; message: string };

async function getJson(
  path: string,
  options: { signal?: AbortSignal; acceptStatuses?: number[] } = {},
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
    ...(options.signal ? { signal: options.signal } : {}),
  });

  const accepted = options.acceptStatuses ?? [200];
  if (!accepted.includes(response.status)) {
    throw new Error(`${path} responded ${response.status}`);
  }
  return response.json();
}

/**
 * Probes both endpoints on purpose: liveness alone would report "online" for a process
 * whose database is gone, which is exactly the state a player must be warned about.
 *
 * `ready` answers 503 with a valid body when a dependency is down, so that status is
 * accepted and parsed — treating it as a transport failure would erase the difference
 * between "API up, database down" and "nothing is listening".
 *
 * Responses are parsed with the shared contract, so drift between server and client shows
 * up here instead of as `undefined` in the UI.
 */
export async function probeApi(signal?: AbortSignal): Promise<ConnectionState> {
  try {
    const [liveRaw, readyRaw] = await Promise.all([
      getJson('/health/live', signal ? { signal } : {}),
      getJson('/health/ready', { ...(signal ? { signal } : {}), acceptStatuses: [200, 503] }),
    ]);

    const live = HealthLiveSchema.parse(liveRaw);
    const ready = HealthReadySchema.parse(readyRaw);

    return { kind: 'online', version: live.version, database: ready.checks.database };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    return {
      kind: 'offline',
      message: error instanceof Error ? error.message : 'The API did not respond',
    };
  }
}
