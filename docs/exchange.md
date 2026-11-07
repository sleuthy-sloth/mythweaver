# Export and import

A campaign is yours. This is the format it leaves in, and what happens when it comes back.

## The file

One JSON document, no zip, no binary blobs (yet):

```json
{
  "format": "mythweaver.campaign",
  "version": 1,
  "exportedAt": "2026-11-06T22:10:04.512Z",
  "checksum": "sha256:…",
  "campaign":   { "name", "description", "rulesetId", "rulesetVersion" },
  "characters": [ { "id", "name", "stats", "health", "spirit", "supply", "momentum",
                    "debilities", "xp", "notes", "revision" } ],
  "npcs":         [ { "id", "name", "role", "description", "factionId", "tags", "revision" } ],
  "factions":     [ { "id", "name", "description", "tags", "revision" } ],
  "locations":    [ { "id", "name", "kind", "description", "tags", "revision" } ],
  "relationships":[ { "id", "sourceType", "sourceId", "targetType", "targetId", "kind", "note" } ],
  "journal":      [ { "id", "title", "body", "tags", "links", "rollId", "revision" } ],
  "rolls":        [ { "id", "characterId", "moveId", "stat", "adds", "actionDie", "challenge",
                      "actionScore", "outcome", "match", "burned", "source",
                      "momentumBefore", "momentumAfter" } ]
}
```

**Not included, on purpose:** accounts, memberships and shares, passwords, sessions, AI settings,
and anything belonging to another campaign. An export is one campaign, not an installation.

## The checksum

`sha256` over the canonical JSON of every other field: keys sorted, no whitespace, `undefined`
omitted. The same campaign hashes the same way twice, and a file edited by hand stops matching.

This is a _consistency_ check, not a signature. It catches truncation, a bad merge, or a stray
editor saving the file — it does not prove who produced it. A signature needs key management, which
is not a Phase 4 problem.

## Import

Posting a bundle creates a **new campaign owned by the importer**. It never merges into an existing
one, so a file can be imported twice and you get two clean copies instead of a tangle.

- **Every identifier is remapped** — the campaign, each character, person, faction, place, edge,
  journal entry and roll. References are remapped with them: an NPC keeps its faction, an edge keeps
  both ends, a journal entry keeps its links and its roll.
- **Preview first.** `POST /imports/preview` returns the campaign name, the counts and any warnings
  without writing anything. The screen shows that before it offers the Import button.
- **Structural checks before any write:**
  - the document must carry the format marker and a supported version,
  - the checksum must match,
  - every relationship must point at something inside the file,
  - links, faction references and roll references that point outside the file are dropped with a
    warning rather than refusing the whole import,
  - the file must be under **5 MB**.
- **Nothing is executed.** The body is data: no file paths, no scripts, no URLs that get fetched.

## Limits, stated plainly

- No media. Maps and uploaded images are not in the format yet, because they do not exist yet.
- No incremental or partial import — it is whole campaigns in and out.
- The version is `1`. When a `2` appears, `1` files will still import; that is the point of carrying
  the number.
- Import does not restore shares. A shared campaign comes back private to the importer.

## Restoring after losing a server

`GET /campaigns/:id/export` is the user-facing path: each player keeps their own copy. Database
backups are the operator's path and are covered in the deployment notes — they are not a substitute
for users exporting, and exports are not a substitute for backups.
