import type {
  Faction,
  JournalEntry,
  JournalLink,
  Npc,
  Relationship,
  WorldKind,
  WorldLocation,
} from '@mythweaver/contracts';
import { and, asc, desc, eq, ilike, or, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { factions, journalEntries, locations, npcs, relationships } from '../../db/schema';
import { badRequest, conflictWith, forbidden, notFound } from '../../lib/errors';
import { getCampaignForUser } from '../campaigns/service';

/**
 * The three world entity types share their editable columns, so they share one code path. Only the
 * table, the extra columns and the DTO shape differ; keeping three near-identical services would
 * mean three places to forget an authorization check.
 */
const TABLES = { npc: npcs, faction: factions, location: locations } as const;

type WorldRow = {
  id: string;
  campaignId: string;
  name: string;
  description: string | null;
  tags: string[];
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  role?: string | null;
  factionId?: string | null;
  kind?: string;
};

function tableFor(kind: WorldKind): typeof npcs {
  // All three tables carry the shared columns this module reads and writes; the cast keeps Drizzle
  // from collapsing the union. The SQL is generated from the real table object at runtime.
  return TABLES[kind] as unknown as typeof npcs;
}

export function toWorldDto(row: WorldRow, kind: WorldKind): Npc | Faction | WorldLocation {
  const base = {
    id: row.id,
    campaignId: row.campaignId,
    name: row.name,
    description: row.description,
    tags: row.tags,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (kind === 'npc') {
    return { ...base, role: row.role ?? null, factionId: row.factionId ?? null } satisfies Npc;
  }
  if (kind === 'faction') return base satisfies Faction;
  return {
    ...base,
    kind: (row.kind ?? 'other') as WorldLocation['kind'],
  } satisfies WorldLocation;
}

async function requireEditor(db: Database, userId: string, campaignId: string): Promise<void> {
  const { role } = await getCampaignForUser(db, userId, campaignId);
  if (role === 'viewer') throw forbidden('You can read this campaign but not change it');
}

export async function listWorld<K extends WorldKind>(
  db: Database,
  userId: string,
  campaignId: string,
  kind: K,
  query?: string,
): Promise<(Npc | Faction | WorldLocation)[]> {
  await getCampaignForUser(db, userId, campaignId);
  const table = tableFor(kind);

  const filters = [eq(table.campaignId, campaignId)];
  if (query && query.trim().length > 1) {
    const term = `%${query.trim()}%`;
    const match = or(ilike(table.name, term), ilike(table.description, term));
    if (match) filters.push(match);
  }

  const rows = await db
    .select()
    .from(table)
    .where(and(...filters))
    .orderBy(asc(table.name));

  return (rows as unknown as WorldRow[]).map((row) => toWorldDto(row, kind));
}

export async function getWorldEntity(
  db: Database,
  userId: string,
  campaignId: string,
  kind: WorldKind,
  entityId: string,
): Promise<Npc | Faction | WorldLocation> {
  await getCampaignForUser(db, userId, campaignId);
  const table = tableFor(kind);
  const [row] = await db
    .select()
    .from(table)
    .where(and(eq(table.id, entityId), eq(table.campaignId, campaignId)))
    .limit(1);

  if (!row) throw notFound('Not found in this campaign');
  return toWorldDto(row as unknown as WorldRow, kind);
}

export async function createWorldEntity(
  db: Database,
  userId: string,
  campaignId: string,
  kind: WorldKind,
  input: Record<string, unknown>,
): Promise<Npc | Faction | WorldLocation> {
  await requireEditor(db, userId, campaignId);

  if (kind === 'npc' && input.factionId) {
    // A faction id from another campaign would leak the fact that it exists.
    const [faction] = await db
      .select({ id: factions.id })
      .from(factions)
      .where(and(eq(factions.id, String(input.factionId)), eq(factions.campaignId, campaignId)))
      .limit(1);
    if (!faction) throw badRequest('That faction is not in this campaign');
  }

  const shared = {
    campaignId,
    name: String(input.name),
    description: (input.description as string | undefined) ?? null,
    tags: (input.tags as string[] | undefined) ?? [],
  };

  const values =
    kind === 'npc'
      ? {
          ...shared,
          role: (input.role as string | undefined) ?? null,
          factionId: (input.factionId as string | null | undefined) ?? null,
        }
      : kind === 'location'
        ? { ...shared, kind: (input.kind as string | undefined) ?? 'other' }
        : shared;

  const table = tableFor(kind);
  const [row] = await db
    .insert(table)
    .values(values as typeof npcs.$inferInsert)
    .returning();

  if (!row) throw new Error('insert returned no row');
  return toWorldDto(row as unknown as WorldRow, kind);
}

export async function updateWorldEntity(
  db: Database,
  userId: string,
  campaignId: string,
  kind: WorldKind,
  entityId: string,
  input: Record<string, unknown>,
): Promise<Npc | Faction | WorldLocation> {
  await requireEditor(db, userId, campaignId);
  const table = tableFor(kind);

  const [existing] = await db
    .select({ id: table.id, revision: table.revision })
    .from(table)
    .where(and(eq(table.id, entityId), eq(table.campaignId, campaignId)))
    .limit(1);
  if (!existing) throw notFound('Not found in this campaign');

  const baseRevision = input.baseRevision as number | undefined;
  if (baseRevision !== undefined && baseRevision !== existing.revision) {
    throw conflictWith('This entry changed since you loaded it', {
      currentRevision: [String(existing.revision)],
    });
  }

  const patch: Record<string, unknown> = {
    updatedAt: new Date(),
    revision: sql`${table.revision} + 1`,
  };
  for (const key of ['name', 'description', 'tags', 'role', 'factionId', 'kind']) {
    if (input[key] !== undefined) patch[key] = input[key];
  }

  const [row] = await db
    .update(table)
    .set(patch as Partial<typeof npcs.$inferInsert>)
    .where(and(eq(table.id, entityId), eq(table.campaignId, campaignId)))
    .returning();

  if (!row) throw notFound('Not found in this campaign');
  return toWorldDto(row as unknown as WorldRow, kind);
}

export async function deleteWorldEntity(
  db: Database,
  userId: string,
  campaignId: string,
  kind: WorldKind,
  entityId: string,
): Promise<void> {
  await requireEditor(db, userId, campaignId);
  const table = tableFor(kind);

  const deleted = await db
    .delete(table)
    .where(and(eq(table.id, entityId), eq(table.campaignId, campaignId)))
    .returning({ id: table.id });

  if (deleted.length === 0) throw notFound('Not found in this campaign');

  // Edges pointing at the thing that no longer exists would be invisible dead weight.
  await db
    .delete(relationships)
    .where(
      and(
        eq(relationships.campaignId, campaignId),
        or(
          and(eq(relationships.sourceType, kind), eq(relationships.sourceId, entityId)),
          and(eq(relationships.targetType, kind), eq(relationships.targetId, entityId)),
        ),
      ),
    );
}

async function assertEndpoint(
  db: Database,
  campaignId: string,
  type: Relationship['sourceType'],
  id: string,
): Promise<void> {
  if (type === 'character') {
    const { characters } = await import('../../db/schema');
    const [row] = await db
      .select({ id: characters.id })
      .from(characters)
      .where(and(eq(characters.id, id), eq(characters.campaignId, campaignId)))
      .limit(1);
    if (!row) throw badRequest('That character is not in this campaign');
    return;
  }

  const table = tableFor(type as WorldKind);
  const [row] = await db
    .select({ id: table.id })
    .from(table)
    .where(and(eq(table.id, id), eq(table.campaignId, campaignId)))
    .limit(1);
  if (!row) throw badRequest(`That ${type} is not in this campaign`);
}

export async function listRelationships(
  db: Database,
  userId: string,
  campaignId: string,
): Promise<Relationship[]> {
  await getCampaignForUser(db, userId, campaignId);
  const rows = await db
    .select()
    .from(relationships)
    .where(eq(relationships.campaignId, campaignId))
    .orderBy(asc(relationships.createdAt));

  return rows.map((row) => ({
    ...row,
    sourceType: row.sourceType as Relationship['sourceType'],
    targetType: row.targetType as Relationship['targetType'],
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function createRelationship(
  db: Database,
  userId: string,
  campaignId: string,
  input: {
    sourceType: Relationship['sourceType'];
    sourceId: string;
    targetType: Relationship['targetType'];
    targetId: string;
    kind: string;
    note?: string;
  },
): Promise<Relationship> {
  await requireEditor(db, userId, campaignId);
  await assertEndpoint(db, campaignId, input.sourceType, input.sourceId);
  await assertEndpoint(db, campaignId, input.targetType, input.targetId);

  const [row] = await db
    .insert(relationships)
    .values({
      campaignId,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      targetType: input.targetType,
      targetId: input.targetId,
      kind: input.kind,
      note: input.note ?? null,
    })
    .returning();

  if (!row) throw new Error('insert returned no row');
  return {
    ...row,
    sourceType: row.sourceType as Relationship['sourceType'],
    targetType: row.targetType as Relationship['targetType'],
    createdAt: row.createdAt.toISOString(),
  };
}

export async function deleteRelationship(
  db: Database,
  userId: string,
  campaignId: string,
  relationshipId: string,
): Promise<void> {
  await requireEditor(db, userId, campaignId);
  const deleted = await db
    .delete(relationships)
    .where(and(eq(relationships.id, relationshipId), eq(relationships.campaignId, campaignId)))
    .returning({ id: relationships.id });
  if (deleted.length === 0) throw notFound('Relationship not found');
}

export function toJournalDto(row: typeof journalEntries.$inferSelect): JournalEntry {
  return {
    id: row.id,
    campaignId: row.campaignId,
    title: row.title,
    body: row.body,
    tags: row.tags,
    links: (row.links ?? []) as JournalLink[],
    rollId: row.rollId,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listJournal(
  db: Database,
  userId: string,
  campaignId: string,
  options: { query?: string; limit: number },
): Promise<JournalEntry[]> {
  await getCampaignForUser(db, userId, campaignId);

  const filters = [eq(journalEntries.campaignId, campaignId)];
  if (options.query && options.query.trim().length > 1) {
    const term = `%${options.query.trim()}%`;
    const match = or(ilike(journalEntries.title, term), ilike(journalEntries.body, term));
    if (match) filters.push(match);
  }

  const rows = await db
    .select()
    .from(journalEntries)
    .where(and(...filters))
    .orderBy(desc(journalEntries.createdAt))
    .limit(options.limit);

  return rows.map(toJournalDto);
}

/** Links are checked against the campaign so a journal entry cannot point outside it. */
async function validateLinks(
  db: Database,
  campaignId: string,
  links: JournalLink[],
): Promise<void> {
  for (const link of links) {
    await assertEndpoint(db, campaignId, link.type, link.id);
  }
}

export async function createJournalEntry(
  db: Database,
  userId: string,
  campaignId: string,
  input: { title: string; body?: string; tags?: string[]; links?: JournalLink[]; rollId?: string },
): Promise<JournalEntry> {
  await requireEditor(db, userId, campaignId);
  await validateLinks(db, campaignId, input.links ?? []);

  const [row] = await db
    .insert(journalEntries)
    .values({
      campaignId,
      title: input.title,
      body: input.body ?? '',
      tags: input.tags ?? [],
      links: input.links ?? [],
      rollId: input.rollId ?? null,
    })
    .returning();

  if (!row) throw new Error('insert returned no row');
  return toJournalDto(row);
}

export async function updateJournalEntry(
  db: Database,
  userId: string,
  campaignId: string,
  entryId: string,
  input: {
    baseRevision?: number;
    title?: string;
    body?: string;
    tags?: string[];
    links?: JournalLink[];
  },
): Promise<JournalEntry> {
  await requireEditor(db, userId, campaignId);

  const [existing] = await db
    .select({ id: journalEntries.id, revision: journalEntries.revision })
    .from(journalEntries)
    .where(and(eq(journalEntries.id, entryId), eq(journalEntries.campaignId, campaignId)))
    .limit(1);
  if (!existing) throw notFound('Entry not found');

  if (input.baseRevision !== undefined && input.baseRevision !== existing.revision) {
    throw conflictWith('This entry changed since you loaded it', {
      currentRevision: [String(existing.revision)],
    });
  }
  if (input.links) await validateLinks(db, campaignId, input.links);

  const [row] = await db
    .update(journalEntries)
    .set({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.body !== undefined ? { body: input.body } : {}),
      ...(input.tags !== undefined ? { tags: input.tags } : {}),
      ...(input.links !== undefined ? { links: input.links } : {}),
      updatedAt: new Date(),
      revision: sql`${journalEntries.revision} + 1`,
    })
    .where(and(eq(journalEntries.id, entryId), eq(journalEntries.campaignId, campaignId)))
    .returning();

  if (!row) throw notFound('Entry not found');
  return toJournalDto(row);
}

export async function deleteJournalEntry(
  db: Database,
  userId: string,
  campaignId: string,
  entryId: string,
): Promise<void> {
  await requireEditor(db, userId, campaignId);
  const deleted = await db
    .delete(journalEntries)
    .where(and(eq(journalEntries.id, entryId), eq(journalEntries.campaignId, campaignId)))
    .returning({ id: journalEntries.id });
  if (deleted.length === 0) throw notFound('Entry not found');
}
