import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { AuthProvider } from './lib/auth';

const CAMPAIGN_ID = '11111111-1111-4111-8111-111111111111';
const CHARACTER_ID = '22222222-2222-4222-8222-222222222222';

function json(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const user = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'player',
  createdAt: new Date().toISOString(),
};

const campaign = {
  id: CAMPAIGN_ID,
  name: 'The Iron Vow',
  description: null,
  rulesetId: 'ironsworn',
  rulesetVersion: null,
  role: 'owner',
  archivedAt: null,
  lastPlayedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  revision: 1,
};

const character = {
  id: CHARACTER_ID,
  campaignId: CAMPAIGN_ID,
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

type Route = () => Response | Promise<Response>;

/** Minimal fetch stub: the test names the requests it expects, by method and path. */
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

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // The API sets this cookie; the client mirrors it into the CSRF header.
  document.cookie = 'mw_csrf=test-token';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('session handling', () => {
  it('sends an anonymous visitor to the sign-in screen', async () => {
    stubApi({ 'GET /me': () => json({ error: { code: 'unauthorized', message: 'nope' } }, 401) });

    renderApp();

    expect(await screen.findByRole('tab', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('signs in and lands on the campaign list', async () => {
    const fetchMock = stubApi({
      'GET /me': () => json({ error: { code: 'unauthorized', message: 'nope' } }, 401),
      'POST /auth/login': () => json({ user }),
      'GET /campaigns': () => json({ campaigns: [] }),
    });

    renderApp();

    await userEvent.type(await screen.findByLabelText(/email/i), 'ada@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'correct horse battery staple');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Campaigns', level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/welcome back, ada/i)).toBeInTheDocument();

    const loginCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(String(loginCall?.[0])).toContain('/auth/login');
  });

  it('shows a readable message when the password is wrong', async () => {
    stubApi({
      'GET /me': () => json({ error: { code: 'unauthorized', message: 'nope' } }, 401),
      'POST /auth/login': () => json({ error: { code: 'unauthorized', message: 'bad' } }, 401),
    });

    renderApp();

    await userEvent.type(await screen.findByLabelText(/email/i), 'ada@example.com');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong password entirely');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);
  });
});

describe('campaign list', () => {
  it('renders campaigns from the API', async () => {
    stubApi({
      'GET /me': () => json({ user }),
      'GET /campaigns': () => json({ campaigns: [campaign] }),
    });

    renderApp();

    expect(await screen.findByText('The Iron Vow')).toBeInTheDocument();
    expect(screen.getByText(/ironsworn · active · owner/i)).toBeInTheDocument();
  });

  it('explains the empty state instead of showing nothing', async () => {
    stubApi({
      'GET /me': () => json({ user }),
      'GET /campaigns': () => json({ campaigns: [] }),
    });

    renderApp();

    expect(await screen.findByText(/no campaigns yet/i)).toBeInTheDocument();
  });
});

describe('play loop', () => {
  beforeEach(() => {
    document.cookie = 'mw_csrf=test-token';
  });

  it('rolls a stat server-side and shows the dice and outcome', async () => {
    const roll = {
      id: '44444444-4444-4444-8444-444444444444',
      campaignId: CAMPAIGN_ID,
      characterId: CHARACTER_ID,
      moveId: null,
      stat: 'iron',
      adds: 0,
      actionDie: 3,
      challenge: [4, 8],
      actionScore: 6,
      outcome: 'weak_hit',
      match: false,
      burned: false,
      momentumBefore: 2,
      momentumAfter: 2,
      createdAt: new Date().toISOString(),
    };

    stubApi({
      'GET /me': () => json({ user }),
      [`GET /campaigns/${CAMPAIGN_ID}`]: () => json(campaign),
      [`GET /campaigns/${CAMPAIGN_ID}/characters`]: () => json({ characters: [character] }),
      [`GET /campaigns/${CAMPAIGN_ID}/rolls?limit=20`]: () => json({ rolls: [] }),
      [`POST /campaigns/${CAMPAIGN_ID}/rolls`]: () => json(roll, 201),
    });

    render(
      <MemoryRouter initialEntries={[`/campaigns/${CAMPAIGN_ID}`]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );

    // Sheet loaded from the API.
    expect(await screen.findByRole('heading', { name: 'Sabine' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /roll iron/i }));

    // The result panel is a live region; the history list repeats the same outcome word.
    const result = screen.getByRole('status', { name: /latest roll/i });
    await waitFor(() => expect(within(result).getByText('Weak hit')).toBeInTheDocument());
    expect(within(result).getByText('6')).toBeInTheDocument(); // action score
    expect(within(result).getByText(/momentum unchanged/i)).toBeInTheDocument();
  });

  it('shows the momentum reset when momentum is burned', async () => {
    const burnedRun = {
      id: '55555555-5555-4555-8555-555555555555',
      campaignId: CAMPAIGN_ID,
      characterId: CHARACTER_ID,
      moveId: null,
      stat: 'iron',
      adds: 0,
      actionDie: 6,
      challenge: [0, 8],
      actionScore: 9,
      outcome: 'weak_hit',
      match: false,
      burned: true,
      momentumBefore: 6,
      momentumAfter: 2,
      createdAt: new Date().toISOString(),
    };

    stubApi({
      'GET /me': () => json({ user }),
      [`GET /campaigns/${CAMPAIGN_ID}`]: () => json(campaign),
      [`GET /campaigns/${CAMPAIGN_ID}/characters`]: () =>
        json({ characters: [{ ...character, momentum: 6 }] }),
      [`GET /campaigns/${CAMPAIGN_ID}/rolls?limit=20`]: () => json({ rolls: [] }),
      [`POST /campaigns/${CAMPAIGN_ID}/rolls`]: () => json(burnedRun, 201),
    });

    render(
      <MemoryRouter initialEntries={[`/campaigns/${CAMPAIGN_ID}`]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>,
    );

    await screen.findByRole('heading', { name: 'Sabine' });
    await userEvent.click(screen.getByRole('checkbox', { name: /burn momentum/i }));
    await userEvent.click(screen.getByRole('button', { name: /roll iron/i }));

    const result = screen.getByRole('status', { name: /latest roll/i });
    await waitFor(() =>
      expect(within(result).getByText(/momentum burned: 6 → 2/i)).toBeInTheDocument(),
    );
  });
});
