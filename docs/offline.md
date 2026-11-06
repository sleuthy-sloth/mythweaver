# Offline behaviour

What happens when the network is gone, and what the app promises while it is.

## What is stored on the device

| Store                  | Contents                                      | Lifetime                          |
| ---------------------- | --------------------------------------------- | --------------------------------- |
| Service worker cache   | the app shell: JS, CSS, fonts, icon, manifest | until the next deploy replaces it |
| IndexedDB `campaigns`  | campaigns you have opened                     | until you clear site data         |
| IndexedDB `characters` | character sheets for those campaigns          | same                              |
| IndexedDB `rolls`      | roll history, including rolls not yet sent    | same                              |
| IndexedDB `outbox`     | queued writes with their idempotency keys     | until sent or discarded           |

The API is deliberately **not** cached by the service worker. A stale campaign response would be
worse than an honest failure, and campaign data already has a cache with revision tracking.

## What works offline

- Opening a campaign you have visited before, and viewing its sheet and roll history.
- Changing meters, debilities, XP and momentum.
- Rolling any stat, including burning momentum.

## What does not

- Creating a campaign (needs a server-assigned id).
- Signing in for the first time on a device.
- Anything that has never been opened on that device; the page says so instead of pretending.

## The outbox

Each queued write is one record with:

- `id` — a client UUID that is also the `Idempotency-Key` sent to the server
- `kind` — `update-character` or `roll`
- `payload` — the exact request body, including the `baseRevision` the edit was based on
- `attempts`, `nextAttemptAt` — exponential backoff, capped at 30s
- `status` — `pending`, `conflict`, or `failed`

Replay is FIFO and stops at the first network error, because the rest of the queue would fail the
same way. Sending the same operation twice is safe: the server replays its stored response.

## Conflicts

A queued edit carries the revision it was based on. If the sheet moved on, the server answers 409
with the revision it holds, and the operation is parked rather than retried.

The player chooses:

- **Keep mine** — the queued edit is re-sent without the stale revision, overwriting on purpose.
- **Discard** — the queued edit is dropped; the next load shows the server's value.

Nothing is overwritten silently, and no last-write-wins rule is applied to game state.

## Rolls made offline

The browser generates the dice with `crypto.getRandomValues`, resolves the outcome locally with the
same rules package the server uses, and queues the dice. On reconnect the server **re-derives** the
outcome from those dice; it never accepts a claimed result. The stored roll records
`source: "client"`.

The honest limitation: a modified client could send favourable dice, because there is no shared
secret to prove when a die was rolled. Online rolls avoid this by generating dice server-side.
