# Mythweaver — Plan

Solo tabletop role-playing, self-hosted and multi-user. First ruleset: Ironsworn.
This file is the working plan; phase acceptance criteria are copied from the implementation
brief so the contract stays visible.

## Phase 0 — repository and environment audit (2026-11-05)

Repository: `~/repos/mythweaver`, created for this project. `git init` run, branch `main`,
**no commits and no files** before this change. Nothing was overwritten because nothing existed.
No `AGENTS.md` in this repository (the house `AGENTS.md` files in `~/repos/*` belong to other
projects and were not applied here).

Host inventory (commands run, output observed):

| Item              | Value                                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| OS / arch         | Debian 13, Linux 6.18.50+rpt-rpi-2712, `aarch64` (Raspberry Pi 5 class)                                              |
| Node              | v26.8.2 (host), npm 11.19.1                                                                                          |
| pnpm              | 9.15.9, installed this session via `npm install -g pnpm@9` (`corepack enable` failed: no write access to `/usr/bin`) |
| Docker            | 26.1.5, Compose 2.26.1; buildx reports `linux/arm64` only (no QEMU/binfmt for `amd64`)                               |
| PostgreSQL client | 17.11; a server already listens on `127.0.0.1:5432` (not this project's)                                             |
| git / gh          | git 2.47.3; `gh` authenticated as `sleuthy-sloth` over SSH                                                           |
| Resources         | 7.9 GiB RAM (≈2.9 GiB available), 30 GB free on `/`                                                                  |

Consequences:

- Compose will publish Postgres on host port **55432**, not 5432, to avoid the existing server.
- **Multi-arch images cannot be verified on this host.** buildx has no `amd64` emulation. Images
  will be `linux/arm64` locally; CI on GitHub-hosted `ubuntu-latest` builds `amd64`. The plan
  claims `amd64` + `arm64` support only after a CI run proves it, and the README will state which
  architecture was actually tested at each release.
- Container Node is pinned to the 22 LTS line even though the host runs 26, so the deployment
  target is a supported LTS.
- Low free RAM: avoid concurrent heavy builds; no full `next`-sized toolchain.

Existing conventions in the user's other repositories (`92-AMXS-Tracker`, `NeuralPulse`,
`VerbaLibera`): React + TypeScript + Vite + Tailwind, ESLint flat config, Prettier, Husky,
`AGENTS.md` per repo, MIT `LICENSE`, GitHub Actions. This project adopts the stack it needs from
that list and nothing more.

## Assumptions (each is reversible, flagged for confirmation)

1. **Code license: MIT**, matching the user's other repositories. The brief says to choose only
   after checking direction, so this is written into `LICENSE` but is not pushed anywhere; changing
   it before a public release costs one file.
2. **Repository stays local** for now: no GitHub remote is created and nothing is pushed, because
   publishing is a public, hard-to-reverse action. The user can ask for `gh repo create`.
3. **Rules content is not vendored in Phase 1.** Only mechanics/placeholder content ships until
   a document-by-document license check is recorded in `docs/content-provenance.md`.
4. **Postgres 17** in Compose (17-alpine has arm64 images and matches the host client).
5. Single Compose file for local and small self-hosted installs; a reverse proxy (Caddy/Traefik)
   is documented rather than bundled, so operators keep their existing edge.
6. Text-first, semantic UI; theme tokens from day one so light/dark/system do not require a
   rewrite later.

## Licensing and content provenance (verified so far)

- Tomkin Press states that the **Ironsworn System Reference Document**, plus the **text of the
  Ironsworn asset cards and oracle tables**, are available under **CC BY 4.0**
  (<https://tomkinpress.com/pages/licensing>, checked 2026-11-05). `Delve`, `Starforged` and
  `Sundered Isles` have different terms (Starforged is split CC BY-NC-SA 4.0 / CC BY 4.0).
- Therefore: Ironsworn (classic) mechanics, asset text and oracle text _may_ be included **with
  attribution**, but each imported file must record its source document, license and attribution
  string at ingestion time. Do not assume the whole Ironsworn product line shares one license.
- This is an engineering note, not a legal opinion. Before any public release a human must review
  `docs/content-provenance.md`.
- Application code and content are licensed separately: `LICENSE` (MIT) for code,
  `LICENSE-CONTENT` for bundled rules text, with attribution rendered in-app.
- Solesworn is used only as a pointer to broad feature categories. No source, UI, text, art or
  branding is copied, and no affiliation is implied.

## Repository layout (as built)

```text
apps/api/                 Fastify + Drizzle API (health endpoints today)
apps/web/                 React + Vite + Tailwind PWA shell
packages/contracts/       Zod schemas + shared API types
packages/rules-core/      (Phase 3) deterministic, system-agnostic engine interfaces
packages/rules-ironsworn/ (Phase 3) Ironsworn data + resolution
infra/                    compose, Dockerfiles, nginx config
docs/                     setup, architecture, operations, content provenance
```

`packages/ui` is deliberately omitted until two features need the same primitive.

## Milestones

### Phase 1 — runnable foundation (delivered 2026-11-06)

Deliverables: pnpm workspace; Fastify app with `/api/v1/health/live` and `/api/v1/health/ready`
(readiness performs a real `SELECT 1`); Drizzle schema + checked-in migration for `users`;
Compose with `db` + `migrate` + `api` + `web`; Vite/React/Tailwind shell that reports API status;
contract package; Prettier/ESLint/tsc gates; one API test and one web test; CI workflow; README
dev setup.

Acceptance: clean checkout starts by documented commands; health/readiness work against real
Postgres; migration applies to an empty database; both tests pass; architecture support stated
honestly. Evidence is recorded at the end of this file.

### Phase 2 — identity and campaign foundation

Registration policy (open/closed via env), Argon2id password hashing, server-side sessions in
HttpOnly cookies with CSRF protection, operator bootstrap CLI (no default credentials), login
throttling, campaign CRUD with ownership enforced in the service layer, archive/delete,
integration tests proving cross-user isolation.

### Phase 3 — offline-first core and Ironsworn play

Dexie schema + outbox + revision-based sync; character sheet; `rules-core` interfaces; Ironsworn
moves, dice (2d10 + stat vs. 1d10 challenge dice, momentum/condition rules), oracles, vows and
progress tracks, assets; roll-and-journal event flow with atomic persistence; coverage checklist.

### Phase 4 — world, maps, campaign tools

NPCs, factions, relationships, locations, map markers, journal linking/search, versioned
export/import with preview and validation, media handling.

### Phase 5 — optional AI and approved memory

Adapter interface, one operator-configured provider, narrative suggestions, structured memory
candidates with approval/edit/reject, per-campaign opt-in, egress disclosure, timeouts and limits.

### Phase 6 — hardening and release candidate

Threat-model review, accessibility audit against WCAG 2.2 AA, backup/restore drill, ARM64
performance check, multi-arch CI images, upgrade/rollback docs, provenance audit, release notes.

## Risks and mitigations

| Risk                                       | Mitigation                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Rules text licenses differ per product     | Per-file provenance record; mechanics-only fallback                                         |
| Sync conflicts silently losing game state  | Field-level merge, append-only events, explicit user choice; conflict test suite in Phase 3 |
| ARM64 build/verification gap               | State tested arch per release; CI builds amd64; no unverified claims                        |
| Pi has ~2.9 GiB free RAM                   | Sequential builds, no heavy dev servers during builds, small images                         |
| Auth/session mistakes                      | Security review gate in Phase 2 before campaign data exists                                 |
| Scope creep toward multiplayer/marketplace | Out-of-scope list in the brief is copied into `docs/architecture.md`                        |

## Decisions requested from the user (non-blocking for Phase 1)

1. MIT for code — confirm or change before the first public push.
2. GitHub remote: create `sleuthy-sloth/mythweaver` now, later, or never?
3. Public registration default for the reference deployment: closed (bootstrap + invite) or open?
   Phase 1 ships the flag only; the default is chosen in Phase 2.
4. Whether `packages/ui` should exist at all, or primitives live in `apps/web` until reused.

## Phase 1 delivery record (2026-11-06)

Commands actually run on this host, with observed results:

| Command                                            | Result                                                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install`                                     | 624 packages resolved, lockfile written                                                                                      |
| `pnpm typecheck`                                   | contracts, api, web all `Done`                                                                                               |
| `pnpm lint`                                        | no findings                                                                                                                  |
| `pnpm format:check`                                | "All matched files use Prettier code style!"                                                                                 |
| `pnpm test`                                        | api 8/8 passed, web 3/3 passed                                                                                               |
| `pnpm build`                                       | esbuild bundle + Vite build succeeded                                                                                        |
| `pnpm db:generate`                                 | `drizzle/0000_sour_sentinel.sql` created                                                                                     |
| `pnpm db:migrate` (twice)                          | applied once, second run a no-op; `users` table, unique `lower(email)` index, role check constraint verified with `\d users` |
| `docker compose up -d --build`                     | migrate exited 0, api/web/db all `healthy` on `linux/arm64`                                                                  |
| `curl :8080/api/v1/health/ready` with db stopped   | `503 {"status":"degraded", ...}`; live stayed `200`; ready returned `200` again after restart                                |
| `curl :8088/` and `/api/v1/health/ready` via nginx | SPA served, proxy reached the API, deep link fell back to `index.html`                                                       |
| headless browser at 390×844                        | rendered "API online, database round trip 1.55 ms", no horizontal overflow, button 120×44 px, no CSP violations              |

Deviations from the original sketch, and why:

1. **Compose file lives at the repository root** (`compose.yaml`) instead of `infra/`. With
   `-f infra/docker-compose.yml`, Compose resolved `.env` and the build context relative to
   `infra/`, producing `/home/spkoehl/repos/infra` and a one-level-too-high build context. A root
   `compose.yaml` makes `docker compose up --build` work with no flags. Dockerfiles stay in
   `infra/`.
2. **The API is bundled to CommonJS**, not ESM. `@fastify/swagger-ui`, `pino`'s transport and
   `thread-stream` locate assets via `__dirname`; bundled into ESM with top-level await, Node 26
   refuses the file (`ERR_AMBIGUOUS_MODULE_SYNTAX`). CJS output keeps those assumptions intact.
3. **No Swagger UI**, only `/api/v1/openapi.json`. The UI plugin resolves `static/logo.svg` from
   `__dirname`, which a single-file bundle cannot provide. Copying vendor assets was not worth it
   for Phase 1; any OpenAPI viewer can consume the JSON.
4. **`pino-pretty` dropped.** Its worker transport has the same bundling problem; structured JSON
   logs are the production format anyway.
5. **nginx security headers were initially missing on `/`.** `add_header` at server level is
   discarded by any location that declares its own `add_header`; the `index.html` location did.
   Locations now use `expires`, so headers are inherited. Verified against live responses.

Known gaps after this phase (intentional, not oversights):

- No authentication; `/api/v1` exposes health and the OpenAPI document only.
- No API integration test against a live database in-repo; CI applies migrations to a Postgres
  service container, which proves the migration but not API/database behaviour. Phase 2 adds the
  first real integration tests.
- No service worker yet; the manifest makes the app installable but offline boot arrives in
  Phase 3 with the Dexie outbox.
- The error envelope is unit tested through `inject`; no rate limiting or load testing yet.
- Images are `linux/arm64` only on this host; `amd64` is claimed for CI only after it runs.

## Phase 2 delivery record (2026-11-06)

Delivered: registration policy (`REGISTRATION_OPEN`, closed by default), Argon2id passwords,
server-side sessions with hashed tokens, login/logout/`/me`, CSRF double-submit protection,
per-IP throttling on login and registration, operator bootstrap CLI, campaign CRUD with
ownership enforced in the service layer, soft delete with name confirmation, migration `0001`.

Evidence (commands run on this host, results observed):

| Command                                    | Result                                                                                                                                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` / `lint` / `format:check` | clean                                                                                                                                                                                                                              |
| `pnpm test` (unit)                         | 11/11                                                                                                                                                                                                                              |
| `pnpm test:integration` (real PostgreSQL)  | 20/20 — auth, isolation, CSRF, sessions, rate limits, campaign lifecycle                                                                                                                                                           |
| `pnpm db:migrate` on the dev database      | `0001` applied; 4 tables present (`users`, `sessions`, `campaigns`, `campaign_members`)                                                                                                                                            |
| `pnpm admin:bootstrap --generate-password` | operator created, password printed once, count reported                                                                                                                                                                            |
| `docker compose build api && up -d`        | image rebuilt, migrate re-ran as a no-op, all services healthy                                                                                                                                                                     |
| HTTP smoke test through nginx              | register → 403 (closed); login → 200 + `HttpOnly; Secure; SameSite=Lax` cookies; `/me` → 200; campaign create without CSRF → 403, with CSRF → 201; delete with wrong name → 400, exact name → 204; logout → 204; `/me` after → 401 |

Deviations and findings worth recording:

1. **Argon2 runs on `hash-wasm`, not `@node-rs/argon2`.** The native package ships per-platform
   `.node` files; esbuild cannot bundle them, and the container build failed with "No loader is
   configured for .node files". WASM keeps the single-file bundle and the multi-arch story. The
   PHC output is standard: a hash created by the native binding verifies under hash-wasm
   (checked against the operator row before switching).
2. **Rate limits are per-route `config.rateLimit`, not top-level route options.** The first
   attempt silently did nothing; the integration test caught it (third login returned 401, not 429).
3. **CSRF is skipped for unauthenticated requests.** With no session there is nothing to ride, and
   the honest answer is 401 from the route rather than 403 from the CSRF check. Unauthenticated
   campaign creation now returns 401.
4. **Validation errors needed a second mapping.** Fastify converts Zod compiler failures into its
   own `error.validation` shape, so the `ZodError` branch never fired and field-level `details`
   were empty. Both shapes now map to the same envelope; the "short password" test pins it.
5. **`Secure` cookies in production will reject a plain-HTTP browser on a LAN IP**, even though
   `curl` on loopback accepts them. Documented in README: use TLS, or `COOKIE_SECURE=false` for a
   throwaway trial.

Known gaps after Phase 2: no auth UI, no password change/reset/verification/2FA, no account
deletion or export, no sharing endpoints exposed (schema supports them), rate limits are
in-process only, and the SPA still has no campaign views.
