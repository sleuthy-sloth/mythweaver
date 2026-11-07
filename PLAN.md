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

## Phase 3a delivery record (2026-11-06)

Delivered: `packages/rules-core` (system-agnostic vocabulary) and `packages/rules-ironsworn`
(pure mechanics), character sheets with stats/meters/momentum/debilities/xp, the roll endpoint that
resolves and records a roll atomically, and momentum burning that resets the sheet in the same
transaction. Migration `0002` adds `characters` and `rolls`.

Evidence (commands run, results observed):

| Command                                              | Result                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @mythweaver/rules-ironsworn test`     | 30/30 — comparison, ties, matches, negative momentum, burning, resets, limits, progress marks, progress rolls |
| `pnpm test:integration`                              | 34/34 — includes characters CRUD, isolation, roll consistency, burn transaction, unauthenticated access       |
| `pnpm typecheck` / `lint` / `format:check` / `build` | clean                                                                                                         |
| `pnpm db:migrate`                                    | `0002` applied; `characters` and `rolls` present with check constraints                                       |

Findings:

1. **Negative momentum matches the action die by magnitude, not by sign.** The first implementation
   compared `-3 === 3`, which is never true; the scripted-dice test caught it and the engine now
   uses `Math.abs(momentum) === actionDie`.
2. **The engine never applies move consequences.** Only burning touches the sheet. Positive or
   negative momentum from a move is the player's edit, because the server does not know which move
   was narrated and inventing "+1 momentum" would be wrong for most of them.
3. **Moves and oracles are not shipped as content.** `MoveDefinition` exists, but no text, table or
   asset is bundled — that needs per-file provenance, and the coverage doc says so.
4. **OpenAPI generation was silently broken by two response schemas.** `204: {}` on logout and
   campaign delete, and a raw JSON Schema object on `/auth/csrf`, are not Zod types; `app.swagger()`
   threw at request time, so `/api/v1/openapi.json` returned 500 while every other route worked.
   Both are fixed, and a unit test now requests the document and asserts the paths — the endpoint
   that documents the API had no test of its own until this phase.

Not in 3a (planned 3b/3c): Dexie storage and outbox, sync push/pull, conflict handling, the
sign-in and play UI, vows/progress-track persistence, oracles, assets, experience rules.

## Phase 3b delivery record (2026-11-06)

Delivered: a working browser client — sign-in/registration, campaign list and creation, campaign
page with character sheet (stats, meters, momentum with derived reset/max, debilities), a roll
panel with stat picker, adds, momentum burning, live result with dice, and permanent roll history.
The client shares the API contract (Zod) and the Ironsworn rules package for derived values, so
"momentum reset" in the UI is the same function the server uses.

Evidence:

| Command / check                      | Result                                                                                                                                    |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @mythweaver/web test` | 7/7 — anonymous redirect, sign-in success and failure, campaign list and empty state, roll result, burned momentum                        |
| Full suite                           | rules 30, api unit 12, api integration 34, web 7                                                                                          |
| Browser walkthrough (390×844)        | sign in → campaigns → create "Browser Walkthrough" → create "Sabine" → roll Iron → result `6 vs 3/1 = 9`, strong hit, history row appears |
| Touch targets                        | stat chips 44 px, steppers 44 px (were 40 and 32)                                                                                         |
| Layout                               | no horizontal overflow at 390 px; two-column play view at 1280 px                                                                         |
| `docker compose build web && up -d`  | image rebuilt, web healthy, served through nginx                                                                                          |

Findings:

1. **Tailwind cannot apply opacity modifiers to `var()` colours.** `bg-danger/10`, `border-danger/50`
   and `placeholder:text-muted/70` either fail the build (inside `@apply`) or silently do nothing
   (in class strings). Tinted surfaces are now `color-mix()` component classes; this is the kind of
   styling bug that ships invisibly because nothing errors.
2. **The web Docker build broke twice for the same reason as the API:** workspace packages must be
   copied into the build stage. `rules-core` and `rules-ironsworn` are now in both Dockerfiles.
3. **A hidden ternary bug in the roll card:** `roll.beatenLabel(die)` never existed; dice highlighting
   is computed from the score now, with burned dice (stored as 0) treated as beaten.

Known UI gaps: the roll panel sits below the character sheet on a phone, so the primary action
needs a scroll; no PWA install prompt or offline mode yet (3c); no world, vows, oracles or journal
screens; character creation has no stat-assignment step (defaults, then editable).

## UI redesign pass (2026-11-06)

The Phase 3b client worked but looked generic: boxy cards, system serif, no visual identity. This
pass applied the "field journal" direction that had been written up for a design tool
(`docs/design-brief.md`), directly in code.

What changed: self-hosted Spectral for display and numerals (OFL, Latin + Latin-ext), a paper grain
layer, hairline rules and a double rule under panel headings, five-column stat figures with tabular
figures, pip meters for Health/Spirit/Supply, a dedicated momentum gauge with a zero mark and the
reset value written under the track, dice rendered as physical objects with beaten dice struck
through (not just tinted), outcome shown as a word, and a ledger-style roll history.

Two defects found by measurement rather than by eye, both worth remembering:

1. **Tailwind purged the component classes.** Anything inside `@layer components` is tree-shaken
   unless the exact class name appears as a literal string in the scanned source. `btn-${variant}`
   and `badge-${outcome}` are composed at runtime, so `.btn-primary`, `.badge-*` and `.outcome-*`
   were deleted from the bundle while still on the elements — the primary button rendered as plain
   text and the numeric audit caught it at 1.2:1 contrast. Component CSS now lives outside the layer.
2. **Stat columns were sized by content**, so "Shadow" was wider than "Wits". `flex: 1 1 0` fixed it.

Measured after the fix: primary button 6.12:1, body/eyebrow text 5.57:1, headings 16.09:1, no
horizontal overflow at 390 px, 44 px steppers/chips, 17-segment gauge, three dice, equal stat
columns. The visual judgement (does it feel crafted?) still needs a human eye; screenshots were
reviewed by the user, not by the agent.

## Phase 3c delivery record (2026-11-06)

Delivered: an offline-first client. A Workbox service worker precaches the shell; Dexie caches
campaigns, characters and rolls; a durable outbox replays queued writes with the operation id as
the Idempotency-Key. The server gained idempotent POSTs, `baseRevision` conflict detection, and
acceptance of client dice that it re-derives.

Evidence (run on this host):

| Check                   | Result                                                                                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`             | rules 30, api unit 12, web 14 (8 for the outbox)                                                                                                            |
| `pnpm test:integration` | 44/44 — adds idempotency, offline dice, stale-revision conflicts                                                                                            |
| Offline shell boot      | with the network cut, a reload renders the app (sign-in screen), not the browser error page; `workbox-precache` populated                                   |
| Offline edit            | health pips 15 → 14 with no connection; strip reads "Offline · playing from this device. 2 changes will send when you reconnect."                           |
| Offline roll            | "Miss · match", action die 4 vs 8/8, computed locally with `crypto.getRandomValues`                                                                         |
| Reconnect               | strip drains; history shows the roll; server row is `action_die 4, challenge 8/8, score 7, miss, match, source=client`; character is `health 4, revision 2` |

Findings:

1. **A stale container looked like a client bug.** Opening a campaign failed with a Zod error on the
   rolls list, and the page said "not stored on this device yet". The deployed API image predated the
   `source` column, so the client's contract check correctly refused the payload. Rebuilding the API
   fixed it. Lesson recorded here because the symptom pointed at the wrong component: rebuild _both_
   images when a contract changes, not just the one being edited.
2. **The first failure message was misleading.** With no cache and no network the page claimed
   "Campaign not found"; it now distinguishes "never stored on this device" from a real 404.
3. **Cache reads must be optional.** In a browser with IndexedDB unavailable the page failed to load
   at all until the cache block was wrapped; the network path is the fallback, not the cache.
4. **Hooks cannot sit after an early return.** The first version of SyncBar called `useEffect` after
   a conditional `return null`, which React rejects at runtime; the order was corrected.
5. **Late async work needs a mounted guard.** The campaign page loads cache then network, so a
   navigation could land state on an unmounted tree; tests caught it as a teardown error.

Known gaps: no offline campaign creation; no cross-device sync protocol (each device caches
independently and the server is the meeting point); the conflict UI has unit coverage but has not
been drilled by hand; journals, vows and world entities are still Phase 4.

## Phase 4a delivery record (2026-11-06)

Delivered: the world model and its screen. NPCs, factions, places, edges between them, and journal
entries with explicit links — all campaign-scoped, all behind the same ownership check as the rest
of the campaign.

Schema (migration `0004_rich_spectrum.sql`): `npcs`, `factions`, `locations`, `relationships`,
`journal_entries`. `npcs.faction_id` is a real foreign key (`on delete set null`); relationship
endpoints are polymorphic and therefore validated in the service, not by the database.

Evidence (this host, this session):

| Check                                    | Result                                                                                                         |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` / `lint`                | clean                                                                                                          |
| `pnpm test`                              | rules 30, api 12, web 17 (3 new for the World screen)                                                          |
| `pnpm test:integration`                  | 56/56 — 12 new: CRUD, cross-campaign isolation, faction scoping, search, edge cleanup, stale journal revisions |
| Browser: create faction + place + person | all three created from the UI at 390×844                                                                       |
| Browser: link                            | "hunts — Waystone Inn" shown on Cinder's card                                                                  |
| Browser: journal                         | entry created, linked chip "Cinder", found by searching "chest", excluded for "dragon"                         |
| Database                                 | `npcs 1, factions 1, locations 1, relationships 1, journal 1`; `Cinder                                         | swordsman | The Chandrian`; edge `npc | hunts | location`; entry `1 link, revision 1` |

Findings:

1. **A silent no-op edit.** The "World & journal" link was inserted by a string replace that matched
   the _error_ branch instead of the header, and the script printed success unconditionally. The
   link compiled, passed typecheck, and simply was not on the page. Found by clicking it in a
   browser, not by any test. Lesson: a build that compiles says nothing about where markup landed.
2. **Polymorphic edges cost referential integrity.** `relationships` cannot use foreign keys for its
   endpoints, so deletion has to clean up edges by hand, in one place, with a test that deletes an
   endpoint and asserts the edge disappears.
3. **The client contract caught the drift.** A stale API container serving rows without a new field
   made the client reject good data — the same failure mode as Phase 3c, now twice. Rebuild every
   image a contract change touches, not only the one being edited.

Known gaps: no map or markers yet; journal links are chips, not navigation; no cross-entity search;
editing an entity opens no detail view (rename in place is not wired from the card).

Next bounded task: Phase 4b — map image upload with markers linked to places, plus export/import
(versioned JSON, validated on the way in) so a campaign can leave the server.

## Phase 4b delivery record (2026-11-06)

Delivered: campaign export and import. One campaign in, one campaign out, with no zip and no
executable content.

- `GET /campaigns/:id/export` — versioned JSON (`format`, `version: 1`), sha256 checksum over
  canonical JSON, `Content-Disposition` filename.
- `POST /imports/preview` — validates and summarizes without writing.
- `POST /imports` — creates a **new** campaign in one transaction, remapping every identifier and
  every reference to it.
- UI: **Export** on the campaign header downloads the file; **Import a campaign file** on the
  campaigns list previews, warns, then imports.

Validation: format marker, supported version, checksum, every relationship endpoint resolving
inside the file, 5 MB cap, and the whole thing behind the campaign membership check.

Evidence:

| Check                                      | Result                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm test:integration`                    | 65/65 — 9 new (round-trip, double import, tampered file, wrong format, dangling edge, size cap, cross-account 404, unauthenticated 401)                                  |
| `pnpm test`                                | rules 30, api 12, web 17                                                                                                                                                 |
| `pnpm lint` / `format:check` / `typecheck` | clean                                                                                                                                                                    |
| Browser export                             | 3.8 KB `browser-walkthrough-1.json` downloaded from the header button                                                                                                    |
| Browser import                             | file chosen in the UI → preview "Browser Walkthrough — 1 characters, 1 people, 1 factions, 1 places, 1 journal entries, 4 rolls" → imported → landed on the new campaign |
| Database                                   | two campaigns with identical counts; `2 npcs, 2 distinct ids` — a copy, not a pointer                                                                                    |

Findings:

1. **Import created an invisible campaign.** The first implementation inserted `campaigns.owner_id`
   but not the `campaign_members` row. Every read path joins membership, so the imported campaign
   existed and was unreachable: the list showed one campaign, not three. Ownership is stored twice
   in this schema and both writes are required.
2. **Validating twice broke the second call.** `importCampaign` called `previewImport`, which
   re-parsed the bundle — but `validateBundle` returns the bundle without its checksum, so the
   second parse failed on a document the first had already accepted. Validation that needs the
   checksum now runs exactly once.
3. **The client upload path needs its own limit.** Fastify's global 1 MB body limit is right for
   normal API traffic; the import routes raise it locally to 6 MB and the service enforces 5 MB, so
   the two numbers are not accidentally the same.

Known gaps: media (maps, images) is not in the format because maps do not exist yet; no partial
import; shares are not restored by an import (a copy comes back private).

Next bounded task: Phase 4c — maps: an uploaded image per campaign, markers with normalized
coordinates linked to places, attribution fields for any future tile source, and the same treatment
in the export format (version bump to 2).

## Phase 4c delivery record (2026-11-06)

Delivered: maps, and export format version 2.

- One map per campaign: PNG or JPEG, 2 MB cap, format decided by reading the file's bytes, stored as
  `bytea` so it rides in the database backup, served behind the membership check.
- Markers with normalized 0..1 coordinates, a label, and an optional link to a place (`on delete set
null`), placed by tapping the image.
- Attribution stored per map for future tile sources; nothing is ever fetched from a tile provider.
- Export v2 carries the map as base64 plus its markers; **v1 files still import**, normalized forward.

Evidence:

| Check                                      | Result                                                                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:integration`                    | 76/76 — 11 new (upload/sniff/serve, non-image rejected, replace, cross-account, marker CRUD, off-image coordinates, foreign place, marker-without-map, cascade delete, map round-trip, v1 import) |
| `pnpm test`                                | rules 30, api 12, web 17                                                                                                                                                                          |
| `pnpm lint` / `format:check` / `typecheck` | clean                                                                                                                                                                                             |
| Browser                                    | uploaded a 900×600 PNG through the UI, tapped the map, placed "Waystone Inn", attribution field present                                                                                           |
| Database                                   | `test-map                                                                                                                                                                                         | image/png | 900 | 600 | 4276 bytes | revision 1`; marker at `0.348, 0.549` — the tap |
| Export                                     | `version: 2`, map present, 4278 decoded bytes, markers `["Waystone Inn"]`                                                                                                                         |

Findings:

1. **A string replace hit the wrong occurrence, again.** Adding map schemas to the client's import
   list matched a _usage_ inside `listJournal` instead of the import block, producing a file that
   typechecked as "expected 2-3 arguments, got 5" only after a second edit. Phase 4a's misplaced link
   was the same failure mode. Replace anchored on unique surrounding text, and assert the result.
2. **The sniffer, not the client, decides the type.** A file renamed `.png` is rejected because the
   magic bytes say otherwise; the declared `Content-Type` is ignored entirely.
3. **Normalized coordinates are the feature.** Storing pixels would have put every marker in the
   wrong place the first time the map was viewed on a phone.

Known gaps: no zoom/pan, markers cannot be dragged, one map per campaign, no map in the PWA offline
cache (the image is fetched on demand).

Next: Phase 5 — the optional AI layer, or Phase 6 hardening (backup/restore drill, accessibility
pass, multi-arch images). The release checklist still wants the backup drill and an accessibility
review more than it wants AI.
