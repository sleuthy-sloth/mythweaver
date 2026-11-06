import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const live = {
  status: 'ok',
  service: 'mythweaver-api',
  version: '0.1.0',
  uptimeSeconds: 12,
  timestamp: new Date().toISOString(),
};

const ready = {
  status: 'ok',
  checks: { database: { status: 'ok', latencyMs: 2.25 } },
  timestamp: new Date().toISOString(),
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('shows a healthy table when the API and database answer', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/health/live')) return jsonResponse(live);
      if (url.endsWith('/health/ready')) return jsonResponse(ready);
      return jsonResponse({}, 404);
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('API online')).toBeInTheDocument();
    expect(screen.getByText(/database round trip 2.25 ms/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('explains how to start the API when nothing answers, and retries', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<App />);

    expect(await screen.findByText('API unreachable')).toBeInTheDocument();
    expect(screen.getByText(/pnpm dev:api/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /check again/i }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4));
  });

  it('warns when the API is up but the database is not', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/health/live')
          ? jsonResponse(live)
          : jsonResponse(
              {
                status: 'degraded',
                checks: { database: { status: 'fail' } },
                timestamp: new Date().toISOString(),
              },
              503,
            ),
      ),
    );

    render(<App />);

    expect(await screen.findByText('API up, database down')).toBeInTheDocument();
  });
});
