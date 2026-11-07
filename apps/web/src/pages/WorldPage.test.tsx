import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../lib/auth';
import WorldPage from './WorldPage';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const NPC_ID = '44444444-4444-4444-8444-444444444444';
const PLACE_ID = '55555555-5555-4555-8555-555555555555';

function json(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

const now = new Date().toISOString();
const user = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'player',
  createdAt: now,
};

const kote = {
  id: NPC_ID,
  campaignId: CAMPAIGN_ID,
  name: 'Kote',
  role: 'innkeeper',
  description: null,
  factionId: null,
  tags: [],
  revision: 1,
  createdAt: now,
  updatedAt: now,
};

const inn = {
  id: PLACE_ID,
  campaignId: CAMPAIGN_ID,
  name: 'Waystone Inn',
  kind: 'site',
  description: null,
  tags: [],
  revision: 1,
  createdAt: now,
  updatedAt: now,
};

type Route = () => Response | Promise<Response>;

function stubApi(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('/api/v1', '');
    const key = `${init?.method ?? 'GET'} ${path}`;
    const route = routes[key];
    if (!route) return json({ error: { code: 'not_found', message: `unstubbed ${key}` } }, 404);
    return route();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderWorld() {
  return render(
    <MemoryRouter initialEntries={[`/campaigns/${CAMPAIGN_ID}/world`]}>
      <AuthProvider>
        <Routes>
          <Route path="/campaigns/:id/world" element={<WorldPage />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function baseRoutes(): Record<string, Route> {
  return {
    'GET /me': () => json({ user }),
    [`GET /campaigns/${CAMPAIGN_ID}/npcs`]: () => json({ npcs: [kote] }),
    [`GET /campaigns/${CAMPAIGN_ID}/factions`]: () => json({ factions: [] }),
    [`GET /campaigns/${CAMPAIGN_ID}/locations`]: () => json({ locations: [inn] }),
    [`GET /campaigns/${CAMPAIGN_ID}/relationships`]: () => json({ relationships: [] }),
    [`GET /campaigns/${CAMPAIGN_ID}/journal`]: () => json({ entries: [] }),
  };
}

beforeEach(() => {
  document.cookie = 'mw_csrf=test-token';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('World page', () => {
  it('lists people and switches to places', async () => {
    stubApi(baseRoutes());
    renderWorld();

    expect(await screen.findByRole('heading', { name: 'Kote' })).toBeInTheDocument();
    expect(screen.getByText('innkeeper')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Places' }));

    expect(await screen.findByRole('heading', { name: 'Waystone Inn' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Kote' })).not.toBeInTheDocument();
  });

  it('adds a person and posts to the campaign', async () => {
    const fetchMock = stubApi({
      ...baseRoutes(),
      [`POST /campaigns/${CAMPAIGN_ID}/npcs`]: () =>
        json({ ...kote, id: '99999999-9999-4999-8999-999999999999', name: 'Cinder' }, 201),
    });
    renderWorld();

    await screen.findByRole('heading', { name: 'Kote' });
    await userEvent.click(screen.getByRole('button', { name: 'Add' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Cinder');
    await userEvent.type(screen.getByLabelText('Role'), 'swordsman');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
      expect(String(call?.[0])).toContain(`/campaigns/${CAMPAIGN_ID}/npcs`);
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
        name: 'Cinder',
        role: 'swordsman',
      });
    });
  });

  it('narrows the list as you type', async () => {
    stubApi(baseRoutes());
    renderWorld();

    await screen.findByRole('heading', { name: 'Kote' });
    await userEvent.type(screen.getByLabelText('Search'), 'waystone');
    expect(await screen.findByText('Nothing matches that.')).toBeInTheDocument();
  });
});
