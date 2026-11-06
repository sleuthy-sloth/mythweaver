# Architecture

## Shape

```text
browser ── HTTP ──> nginx (static SPA + /api proxy) ──> Fastify API ──> PostgreSQL
                                       │
                                       └── WebSocket/SSE: not in the first release
```

One deployable web origin. The browser never calls the API cross-origin, which removes CORS and
CSRF ambiguity from the default deployment; `CORS_ORIGINS` exists only for split deployments.

### Decisions

| #   | Decision                                | Why                                                                                    | Reversible? |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------- | ----------- |
| 1   | pnpm workspace monorepo                 | One lockfile, shared contracts package, no publish step for internal types             | Cheap       |
| 2   | Zod contracts in `packages/contracts`   | Server validates, browser parses the same schema; drift becomes a test failure         | Yes         |
| 3   | Fastify + `fastify-type-provider-zod`   | Typed handlers, JSON Schema for OpenAPI generated from the same schemas                | Yes         |
| 4   | Drizzle + checked-in SQL migrations     | Migrations are reviewable text; no schema push in production                           | Yes         |
| 5   | esbuild bundle for the API              | Small runtime image, no `node_modules` in production, no TS path resolution at runtime | Yes         |
| 6   | Separate `migrate` service in Compose   | The API never serves against a half-migrated schema; migration output is visible       | Yes         |
| 7   | nginx serves the SPA and proxies `/api` | Same-origin cookies later, one TLS certificate, no Node process for static files       | Yes         |
| 8   | `node:22-alpine` runtime                | LTS, multi-arch, ~50 MB base                                                           | Yes         |
| 9   | UUID primary keys, `timestamptz`, UTC   | Offline clients generate IDs; no integer coordination; timezone bugs avoided           | Hard (data) |
| 10  | Health split: live vs ready             | A database blip must not restart a healthy process                                     | n/a         |

Judgement calls worth naming:

- **No `packages/ui` yet.** Shared primitives move there when a second app needs them; until then
  they live next to their only consumer.
- **No auth in Phase 1.** The `users` table exists with `password_hash` so Phase 2 does not need a
  migration over live rows. Nothing authenticates yet, and no route exposes user data.
- **Readiness failure is a 503, not a 500**, and the response says `unreachable` without host,
  port or credentials. The reason goes to the log.
- **Logs redact** authorization headers, cookies and password fields at the logger level, so a
  future handler cannot leak them by logging a request object.

## Scope guardrails

In the first release: multi-user accounts, private campaigns, Ironsworn play loop, offline
read/write with explicit sync, world entities, export/import, optional AI behind approval.

Out of scope until separately approved: real-time multiplayer, public social features, a paid
hosted service, a marketplace, autonomous AI control of campaign state, multiple rulesets in v1,
image generation, and any dependency on Solesworn code or services.

## Security baseline (Phase 2)

- Environment parsed at boot; a missing `DATABASE_URL` stops the process.
- Body limit 1 MiB; helmet headers; no CORS unless explicitly configured.
- Error envelope never includes stack traces; 5xx bodies are generic and carry a request id.
- Containers run as a non-root user; the database is not exposed by the web image.
- Secrets only via environment; nothing is baked into an image.

Phase 2 adds: Argon2id hashing, server-side sessions in HttpOnly/SameSite cookies, CSRF tokens,
login throttling, and per-campaign authorization enforced in the service layer. Registration is
closed by default; the first operator is created from a shell with no default password.

Authorization is enforced by the query, not by middleware: `getCampaignForUser` joins
`campaign_members`, so every read is scoped whether or not a route remembered a `preHandler`.

## Sync model (Phase 3, designed now so schema choices hold)

- Every mutation carries: operation UUID, entity id, base revision, client id, client timestamp,
  and an idempotency key. The outbox is durable (Dexie) and replay-safe.
- Append-only records (rolls, journal additions) merge by operation id.
- Independent fields merge field-wise; conflicting edits to the same canonical field keep both
  values and ask the player. No last-write-wins on game state.
- Deletions propagate as tombstones; the server is the arbiter of canonical revisions.

## Known gaps after Phase 2

- The SPA has no sign-in or campaign UI; the shell still reports API state only.
- No password change, reset, email verification, 2FA or account deletion.
- Sharing endpoints are not exposed, though `campaign_members` already models owner/editor/viewer.
- No service worker yet; offline boot arrives with the Dexie work in Phase 3.
- Integration tests need a running PostgreSQL; `pnpm test` (unit) does not.
- Rate limiting is per-process memory. A multi-replica deployment needs a shared store.
