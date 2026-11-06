# Identity and access

Phase 2 turns a health-check skeleton into something with accounts. This page is the operator's
guide to the parts that have security consequences.

## Registration is closed by default

`REGISTRATION_OPEN=false` unless you set it. A self-hosted server reachable from the internet that
accepts anonymous sign-ups is an abuse vector; opening it should be a decision, not a default.

When it is open, the API logs a warning on every boot so it is hard to leave on by accident:

```
registration is OPEN: anyone who can reach this server can create an account
```

## Creating the first account (operator bootstrap)

There are **no default credentials**, and none are shipped in the image. The first account is
created from a shell on the server:

```bash
pnpm admin:bootstrap --email you@example.com --name "Your Name"
```

You are prompted for a password (hidden, 12+ characters). Non-interactive alternatives:

```bash
# In a container or a script, without a TTY:
pnpm admin:bootstrap --email you@example.com --name "Your Name" --password-stdin < /run/secrets/pw

# Let it generate one and print it once:
pnpm admin:bootstrap --email you@example.com --name "Your Name" --generate-password
```

The bootstrap path ignores `REGISTRATION_OPEN` on purpose: closing registration must not lock the
operator out of their own installation. It creates exactly one row with `role = 'operator'`; the
role is never assignable through the API.

Promote an existing player later:

```bash
pnpm admin:bootstrap --email you@example.com --promote
```

Inside Compose:

```bash
docker compose run --rm --entrypoint node api dist/cli/bootstrap-operator.cjs \
  --email you@example.com --name "Your Name" --password-stdin < /dev/stdin
```

## Sessions

- The cookie (`mw_session`) holds a 256-bit random token. The database stores only its SHA-256,
  so a dump of `sessions` cannot be replayed as a login.
- Cookies are `HttpOnly`, `SameSite=Lax`, and `Secure` whenever `NODE_ENV=production`.
- Each login creates a new session; logout revokes that one and clears both cookies. Sessions
  expire after `SESSION_TTL_DAYS` (default 30). Expiry is fixed at login — a stolen cookie ages
  out even if the account stays active.
- `last_used_at` is recorded for audit, at most once an hour to avoid a write per request.

## CSRF

Cookie auth plus a double-submit token:

1. Every response sets `mw_csrf` (readable by the SPA, not `HttpOnly`).
2. State-changing requests must send it back as `x-csrf-token`.
3. The server compares the two in constant time.

Login and registration are exempt because there is no session to ride yet, and `SameSite=Lax`
already prevents a cross-site POST from carrying an existing cookie. Unauthenticated mutations
get `401`, not `403` — the missing session is the real problem.

## Passwords

Argon2id, 19 MiB, t=2, p=1 (OWASP baseline). Failed logins run the hash comparison even when the
email is unknown, so response timing is not an account-enumeration oracle. The API returns one
message for "no such account" and "wrong password".

## Campaign authorization

Authorization lives in `modules/campaigns/service.ts`, not in route middleware: every read joins
`campaign_members`, so a forgotten `preHandler` cannot expose another account's data.

- A campaign the caller cannot see answers **404**, not 403 — a 403 confirms the id exists.
- A member without the `owner` role gets **403** on rename/delete.
- Deletion is soft (`deleted_at`) and requires typing the campaign name exactly. The name check is
  a mis-tap guard; ownership is the control.

## What is not here yet

- No password change, password reset, email verification or 2FA.
- No UI for any of this; the API and tests exist, the SPA still shows the Phase 1 shell.
- No account deletion/export endpoint yet (Phase 4 owns export, and deletion needs a retention
  policy).
- Sharing endpoints are not exposed yet, although `campaign_members` already supports
  owner/editor/viewer so the authorization path is in place.
