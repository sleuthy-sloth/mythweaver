# Mythweaver

Self-hosted, multi-user, offline-first platform for solo tabletop role-playing. First ruleset:
Ironsworn. No third-party accounts, no mandatory AI, and your campaign data stays on your server.

**Status: Phase 3b — playable in the browser (online).** Sign in, create a campaign, create a
character sheet, roll any stat with momentum burning and see the dice and outcome, with permanent
roll history. The engine is deterministic and tested; the UI talks to the API over the network.
Offline storage and sync are next (3c), so the app still needs a connection.
See [PLAN.md](./PLAN.md) and [docs/rules-coverage.md](./docs/rules-coverage.md).

## Requirements

- Node.js 22 LTS (`.nvmrc` pins it; the host may run newer)
- pnpm 9 (`corepack enable` or `npm i -g pnpm@9`)
- Docker + Compose v2 (for the database locally, or the whole stack)
- PostgreSQL 17 if you run the database yourself

## Quick start (whole stack in containers)

```bash
git clone <this repo> mythweaver && cd mythweaver
cp .env.example .env          # then set POSTGRES_PASSWORD to something real
docker compose up --build
```

- Web: <http://localhost:8088>
- API: <http://localhost:8080/api/v1/health/live>
- OpenAPI 3.1 document: <http://localhost:8080/api/v1/openapi.json>
- Postgres is published on host **55432** to avoid clashing with an existing server.

The `migrate` service runs once, applies migrations, and exits; `api` waits for it to succeed.
Re-running `up` re-runs it harmlessly (Drizzle tracks applied migrations).

Stop with `docker compose down`; add `-v` to also delete the database
volume (destroys all data).

## Local development

```bash
cp .env.example .env
docker compose up -d db   # database only
pnpm install
pnpm db:migrate
pnpm dev                                              # API :8080 + Vite :5173
```

Vite proxies `/api` to the API, so the browser always talks same-origin and no CORS setup is
needed. To point the web app at a different API, set `VITE_API_BASE_URL`.

## Scripts

| Command                     | What it does                                          |
| --------------------------- | ----------------------------------------------------- |
| `pnpm dev`                  | API (tsx watch) and web (Vite) together               |
| `pnpm build`                | Production bundle for API (esbuild) and web (Vite)    |
| `pnpm test`                 | Unit tests for every package                          |
| `pnpm typecheck`            | `tsc --noEmit` per package                            |
| `pnpm lint` / `pnpm format` | ESLint / Prettier                                     |
| `pnpm db:generate`          | Generate a migration from `apps/api/src/db/schema.ts` |
| `pnpm db:migrate`           | Apply pending migrations to `DATABASE_URL`            |
| `pnpm test:integration`     | API tests against a real PostgreSQL (needs the db up) |
| `pnpm admin:bootstrap`      | Create the first operator account — see below         |

## Layout

```text
apps/api/          Fastify + Drizzle. Routes, auth, campaigns, characters, rolls.
apps/web/          React + Vite + Tailwind. Sign-in, campaigns, sheet, rolls; PWA manifest.
packages/contracts Zod schemas shared by server and browser.
packages/rules-core      System-agnostic rules types (Rng, Outcome, tracks, moves).
packages/rules-ironsworn Ironsworn mechanics: dice, momentum, progress, action rolls.
infra/             Compose, Dockerfiles, nginx.
docs/              Architecture, operations, content provenance.
```

## API

`GET /api/v1/health/live` — process is up. Never touches the database.
`GET /api/v1/health/ready` — 200 when Postgres answers, 503 otherwise. Returns latency, never
connection details.
`GET /api/v1/openapi.json` — OpenAPI 3.1 document generated from the same Zod schemas the routes
validate with. Served as JSON rather than through Swagger UI: the UI plugin loads assets relative
to `__dirname`, which a single-file bundle cannot provide, and copying vendor assets into the image
was not worth it for Phase 1.

Identity and campaigns:

| Method                     | Path                    | Notes                                                      |
| -------------------------- | ----------------------- | ---------------------------------------------------------- |
| `POST`                     | `/api/v1/auth/register` | 403 when registration is closed                            |
| `POST`                     | `/api/v1/auth/login`    | sets `mw_session` (HttpOnly) and `mw_csrf`                 |
| `POST`                     | `/api/v1/auth/logout`   | revokes the session, always clears cookies                 |
| `GET`                      | `/api/v1/me`            | the signed-in account                                      |
| `GET`                      | `/api/v1/auth/csrf`     | reads the CSRF cookie for clients without JS cookie access |
| `GET` / `POST`             | `/api/v1/campaigns`     | list / create                                              |
| `GET` / `PATCH` / `DELETE` | `/api/v1/campaigns/:id` | read / rename, archive / soft delete                       |

Mutations need `x-csrf-token` matching the `mw_csrf` cookie. A campaign the caller cannot see
answers `404`, not `403`.

Errors use one envelope: `{ "error": { "code", "message", "requestId", "details?" } }` with stable
codes (`bad_request`, `unauthorized`, `not_found`, …). Clients parse codes, never messages.

## Using it

1. Sign in at `/signin` with an account created by the operator (see below).
2. Create a campaign, open it, create a character sheet.
3. Pick a stat, add any move adds, optionally burn momentum, and roll. Every roll is stored with
   its dice; the sheet remembers momentum, meters and debilities.

The UI is mobile-first and works at 390 px without horizontal scroll; desktop uses a two-column
play view. No AI is involved anywhere in this flow.

## Accounts

Registration is **closed by default**. Create the first (operator) account from a shell:

```bash
pnpm admin:bootstrap --email you@example.com --name "Your Name"
# prompted for a password, hidden, 12+ characters
```

There are no default credentials, and the operator role cannot be granted through the API. To
open public sign-ups, set `REGISTRATION_OPEN=true`; the API logs a warning at every boot while it
is on. Full details — sessions, CSRF, throttling, campaign authorization — are in
[docs/identity.md](./docs/identity.md).

### Trying it over plain HTTP on a LAN

In production the session cookie is `Secure`, so a browser on `http://192.168.x.x` will accept the
login response but drop the cookie. Either put TLS in front (the intended setup) or set
`COOKIE_SECURE=false` in `.env` for a throwaway local trial.

## Deployment notes

- **Tested architecture: `linux/arm64`** (this host). The images use `node:22-alpine`,
  `postgres:17-alpine` and `nginx:1.27-alpine`, all published for `amd64` and `arm64`, but a
  release only claims an architecture after CI or a real run proves it. CI builds `amd64`;
  release notes will record per-release evidence.
- Put a reverse proxy (Caddy, Traefik, nginx) in front for TLS. The web container serves the SPA
  and proxies `/api`, so one hostname is enough. The API and database ports are published on
  **loopback only**; anything that needs them off-host should go through the proxy, not by
  rebinding them to `0.0.0.0`.
- Secrets come from `.env` / the environment. There are no default credentials anywhere; the
  first account is created with `pnpm admin:bootstrap`.

## License

Application code: MIT ([LICENSE](./LICENSE)). Game content is licensed separately and tracked in
[docs/content-provenance.md](./docs/content-provenance.md). Mythweaver is independent software and
is not affiliated with or endorsed by Shawn Tomkin or Tomkin Press.
