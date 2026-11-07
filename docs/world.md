# The world: people, factions, places, links and journal

Phase 4 turns a campaign from a character sheet into a place with a memory.

## What exists

| Thing         | What it holds                                                         | Endpoint                       |
| ------------- | --------------------------------------------------------------------- | ------------------------------ |
| Person (NPC)  | name, role, notes, tags, optional faction                             | `/campaigns/:id/npcs`          |
| Faction       | name, notes, tags                                                     | `/campaigns/:id/factions`      |
| Place         | name, kind (settlement/site/wilds/other), notes, tags                 | `/campaigns/:id/locations`     |
| Link          | an edge between two entities, with a verb (`knows`, `owes`, `guards`) | `/campaigns/:id/relationships` |
| Journal entry | title, body, tags, links, optional roll                               | `/campaigns/:id/journal`       |

Every one of them is campaign-scoped. A record in another campaign is not "forbidden" — it does not
exist as far as your request is concerned, and the API answers 404. That is deliberate: a 403 would
confirm the id exists.

## Why links are a separate table

A faction is not a column on a person; it is one edge among many. The `relationships` table stores
`source_type/source_id → target_type/target_id` plus a verb, which covers "Kote keeps the Waystone
Inn", "Cinder belongs to the Chandrian", and "Sabine owes Kote" without a table per pair.

The endpoints are polymorphic, so they cannot be foreign keys. Two things stand in for them:

1. Every link is validated inside the campaign before insert — both ends must resolve to a record
   in _that_ campaign, so an edge can never point at someone else's data.
2. Deleting an entity deletes the edges that touched it, in the same request.

The cost is that the database cannot enforce referential integrity for these two columns. That is
the tradeoff; it is enforced in one place (`deleteWorldEntity`) and tested in
`test/integration/world.test.ts`.

`npcs.faction_id` is the exception — it is a real foreign key, because a person has at most one
faction and that is a column, not an edge. Deleting a faction clears it (`on delete set null`)
rather than deleting the people in it.

## Journal

Entries are portable prose: a title, a body, tags, and explicit links. Formatting is plain text
with preserved line breaks — no HTML, no Markdown engine, nothing that will not survive an export.

- Search is a case-insensitive substring over title and body (`?q=`), newest first.
- Links are validated against the campaign, so an entry cannot reference someone else's NPC.
- Editing bumps `revision`; a `PATCH` with a stale `baseRevision` gets a 409 instead of silently
  overwriting someone's writing.
- `rollId` records that an entry came from a roll. The roll itself is never modified.

## In the app

Campaign screen → **World & journal**. Four tabs: People, Factions, Places, Journal. Each card
carries its links and a delete that asks once before it acts. "Link someone or somewhere" on a card
creates an edge without leaving the page.

## Not done yet

- Map markers and map images (the next slice).
- Cross-entity search across all three types at once.
- Editing a linked entity from the journal entry.
- Merging duplicate people.
