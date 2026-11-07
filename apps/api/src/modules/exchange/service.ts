import { createHash } from 'node:crypto';
import {
  CampaignExportSchema,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  ImportPreviewSchema,
  type CampaignBundle,
  type JournalLink,
} from '@mythweaver/contracts';
import { asc, eq } from 'drizzle-orm';
import type { Database } from '../../db/client';
import {
  campaignMembers,
  campaigns,
  characters,
  factions,
  journalEntries,
  locations,
  npcs,
  relationships,
  rolls,
} from '../../db/schema';
import { badRequest } from '../../lib/errors';
import { getCampaignForUser } from '../campaigns/service';

/**
 * Canonical JSON: keys sorted, so the same campaign always hashes the same way regardless of the
 * order the database handed the columns back in.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

function checksumOf(bundle: CampaignBundle): string {
  return `sha256:${createHash('sha256').update(canonical(bundle)).digest('hex')}`;
}

export async function exportCampaign(
  db: Database,
  userId: string,
  campaignId: string,
): Promise<{ document: unknown; filename: string }> {
  await getCampaignForUser(db, userId, campaignId);

  const [campaign] = await db.select().from(campaigns).where(eq(campaigns.id, campaignId)).limit(1);
  if (!campaign) throw badRequest('Campaign not found');

  const [characterRows, npcRows, factionRows, locationRows, rollRows, journalRows] =
    await Promise.all([
      db.select().from(characters).where(eq(characters.campaignId, campaignId)),
      db.select().from(npcs).where(eq(npcs.campaignId, campaignId)),
      db.select().from(factions).where(eq(factions.campaignId, campaignId)),
      db.select().from(locations).where(eq(locations.campaignId, campaignId)),
      db.select().from(rolls).where(eq(rolls.campaignId, campaignId)).orderBy(asc(rolls.createdAt)),
      db
        .select()
        .from(journalEntries)
        .where(eq(journalEntries.campaignId, campaignId))
        .orderBy(asc(journalEntries.createdAt)),
    ]);

  const relationshipRows = await db
    .select()
    .from(relationships)
    .where(eq(relationships.campaignId, campaignId));

  const bundle: CampaignBundle = {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    campaign: {
      name: campaign.name,
      description: campaign.description,
      rulesetId: campaign.rulesetId,
      rulesetVersion: campaign.rulesetVersion,
    },
    characters: characterRows.map((row) => ({
      id: row.id,
      name: row.name,
      stats: {
        edge: row.edge,
        heart: row.heart,
        iron: row.iron,
        shadow: row.shadow,
        wits: row.wits,
      },
      health: row.health,
      spirit: row.spirit,
      supply: row.supply,
      momentum: row.momentum,
      debilities: row.debilities as CampaignBundle['characters'][number]['debilities'],
      xp: row.xp,
      notes: row.notes,
      revision: row.revision,
    })),
    npcs: npcRows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      description: row.description,
      factionId: row.factionId,
      tags: row.tags,
      revision: row.revision,
    })),
    factions: factionRows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      tags: row.tags,
      revision: row.revision,
    })),
    locations: locationRows.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.kind as CampaignBundle['locations'][number]['kind'],
      description: row.description,
      tags: row.tags,
      revision: row.revision,
    })),
    relationships: relationshipRows.map((row) => ({
      id: row.id,
      sourceType: row.sourceType as CampaignBundle['relationships'][number]['sourceType'],
      sourceId: row.sourceId,
      targetType: row.targetType as CampaignBundle['relationships'][number]['targetType'],
      targetId: row.targetId,
      kind: row.kind,
      note: row.note,
    })),
    journal: journalRows.map((row) => ({
      id: row.id,
      title: row.title,
      body: row.body,
      tags: row.tags,
      links: (row.links ?? []) as JournalLink[],
      rollId: row.rollId,
      revision: row.revision,
    })),
    rolls: rollRows.map((row) => ({
      id: row.id,
      characterId: row.characterId,
      moveId: row.moveId,
      stat: row.stat as CampaignBundle['rolls'][number]['stat'],
      adds: row.adds,
      actionDie: row.actionDie,
      challenge: [row.challenge1, row.challenge2] as [number, number],
      actionScore: row.actionScore,
      outcome: row.outcome as CampaignBundle['rolls'][number]['outcome'],
      match: row.isMatch,
      burned: row.burned,
      source: row.source as CampaignBundle['rolls'][number]['source'],
      momentumBefore: row.momentumBefore,
      momentumAfter: row.momentumAfter,
    })),
  };

  const document = { ...bundle, checksum: checksumOf(bundle) };

  // Anything the contract rejects would be a bug in this function, not a bad file. Fail loudly.
  CampaignExportSchema.parse(document);

  const slug = campaign.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);

  return { document, filename: `${slug || 'campaign'}-${EXPORT_VERSION}.json` };
}

const MAX_BYTES = 5 * 1024 * 1024;

export type ImportPreview = ReturnType<typeof ImportPreviewSchema.parse>;

/**
 * Structural validation that Zod cannot express: the bundle must be internally consistent before
 * anything is written. Everything is checked here, so apply() can assume a sane document.
 */
export function validateBundle(input: unknown): { bundle: CampaignBundle; warnings: string[] } {
  const raw = typeof input === 'string' ? input : JSON.stringify(input);
  if (Buffer.byteLength(raw, 'utf8') > MAX_BYTES) {
    throw badRequest('That file is larger than the 5 MB limit');
  }

  const parsed = CampaignExportSchema.safeParse(
    typeof input === 'string' ? JSON.parse(input) : input,
  );
  if (!parsed.success) {
    throw badRequest('This is not a Mythweaver campaign export', {
      issues: parsed.error.issues
        .slice(0, 8)
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    });
  }

  const { checksum, ...bundle } = parsed.data;
  const expected = checksumOf(bundle as CampaignBundle);
  if (checksum !== expected) {
    throw badRequest('This file has been altered since it was exported (checksum mismatch)');
  }

  const characterIds = new Set(bundle.characters.map((row) => row.id));
  const npcIds = new Set(bundle.npcs.map((row) => row.id));
  const factionIds = new Set(bundle.factions.map((row) => row.id));
  const locationIds = new Set(bundle.locations.map((row) => row.id));
  const rollIds = new Set(bundle.rolls.map((row) => row.id));
  const warnings: string[] = [];

  const known = (type: JournalLink['type'], id: string): boolean =>
    type === 'character'
      ? characterIds.has(id)
      : type === 'npc'
        ? npcIds.has(id)
        : type === 'faction'
          ? factionIds.has(id)
          : locationIds.has(id);

  for (const npc of bundle.npcs) {
    if (npc.factionId && !factionIds.has(npc.factionId)) {
      warnings.push(
        `"${npc.name}" points at a faction that is not in the file; the link is dropped`,
      );
    }
  }

  for (const link of bundle.relationships) {
    if (!known(link.sourceType, link.sourceId) || !known(link.targetType, link.targetId)) {
      throw badRequest('A relationship points at something that is not in the file');
    }
  }

  for (const entry of bundle.journal) {
    for (const link of entry.links) {
      if (!known(link.type, link.id)) {
        warnings.push(
          `"${entry.title}" links to something that is not in the file; the link is dropped`,
        );
      }
    }
    if (entry.rollId && !rollIds.has(entry.rollId)) {
      warnings.push(`"${entry.title}" refers to a roll that is not in the file`);
    }
  }

  for (const roll of bundle.rolls) {
    if (roll.characterId && !characterIds.has(roll.characterId)) {
      warnings.push(
        'A roll refers to a character that is not in the file; the reference is dropped',
      );
    }
  }

  return { bundle: bundle as CampaignBundle, warnings: [...new Set(warnings)] };
}

/** Summarizes an already-validated bundle: validation that needs the checksum only runs once. */
function summarize(bundle: CampaignBundle, warnings: string[]): ImportPreview {
  return ImportPreviewSchema.parse({
    campaignName: bundle.campaign.name,
    counts: {
      characters: bundle.characters.length,
      npcs: bundle.npcs.length,
      factions: bundle.factions.length,
      locations: bundle.locations.length,
      relationships: bundle.relationships.length,
      journal: bundle.journal.length,
      rolls: bundle.rolls.length,
    },
    warnings,
  });
}

export function previewImport(input: unknown): ImportPreview {
  const { bundle, warnings } = validateBundle(input);
  return summarize(bundle, warnings);
}

/**
 * Importing never merges into an existing campaign: it creates a new one owned by the caller and
 * remaps every identifier, so a file can be imported twice without collisions.
 */
export async function importCampaign(
  db: Database,
  userId: string,
  input: unknown,
): Promise<{ campaignId: string; preview: ImportPreview }> {
  const { bundle, warnings } = validateBundle(input);
  const preview = summarize(bundle, warnings);

  return db.transaction(async (tx) => {
    const [campaign] = await tx
      .insert(campaigns)
      .values({
        ownerId: userId,
        name: bundle.campaign.name.slice(0, 160),
        description: bundle.campaign.description,
        rulesetId: bundle.campaign.rulesetId,
        rulesetVersion: bundle.campaign.rulesetVersion,
      })
      .returning({ id: campaigns.id });

    if (!campaign) throw new Error('campaign insert returned no row');
    const campaignId = campaign.id;

    // Ownership is expressed twice — the column and the membership row — and every read path
    // goes through the membership, so an import that skipped this would create a hidden campaign.
    await tx.insert(campaignMembers).values({ campaignId, userId, role: 'owner' });

    const idMap = new Map<string, string>();
    const remap = (old: string): string => {
      const existing = idMap.get(old);
      if (existing) return existing;
      const fresh = crypto.randomUUID();
      idMap.set(old, fresh);
      return fresh;
    };

    if (bundle.characters.length > 0) {
      await tx.insert(characters).values(
        bundle.characters.map((row) => ({
          id: remap(row.id),
          campaignId,
          name: row.name,
          ...row.stats,
          health: row.health,
          spirit: row.spirit,
          supply: row.supply,
          momentum: row.momentum,
          debilities: row.debilities,
          xp: row.xp,
          notes: row.notes,
          revision: row.revision,
        })),
      );
    }

    if (bundle.factions.length > 0) {
      await tx.insert(factions).values(
        bundle.factions.map((row) => ({
          id: remap(row.id),
          campaignId,
          name: row.name,
          description: row.description,
          tags: row.tags,
          revision: row.revision,
        })),
      );
    }

    if (bundle.locations.length > 0) {
      await tx.insert(locations).values(
        bundle.locations.map((row) => ({
          id: remap(row.id),
          campaignId,
          name: row.name,
          kind: row.kind,
          description: row.description,
          tags: row.tags,
          revision: row.revision,
        })),
      );
    }

    if (bundle.npcs.length > 0) {
      await tx.insert(npcs).values(
        bundle.npcs.map((row) => ({
          id: remap(row.id),
          campaignId,
          name: row.name,
          role: row.role,
          description: row.description,
          factionId: row.factionId && idMap.has(row.factionId) ? remap(row.factionId) : null,
          tags: row.tags,
          revision: row.revision,
        })),
      );
    }

    if (bundle.rolls.length > 0) {
      await tx.insert(rolls).values(
        bundle.rolls.map((row) => ({
          id: remap(row.id),
          campaignId,
          characterId: row.characterId ? remap(row.characterId) : null,
          moveId: row.moveId,
          stat: row.stat,
          adds: row.adds,
          actionDie: row.actionDie,
          challenge1: row.challenge[0],
          challenge2: row.challenge[1],
          actionScore: row.actionScore,
          outcome: row.outcome,
          isMatch: row.match,
          burned: row.burned,
          source: row.source,
          momentumBefore: row.momentumBefore,
          momentumAfter: row.momentumAfter,
        })),
      );
    }

    if (bundle.relationships.length > 0) {
      await tx.insert(relationships).values(
        bundle.relationships.map((row) => ({
          id: remap(row.id),
          campaignId,
          sourceType: row.sourceType,
          sourceId: remap(row.sourceId),
          targetType: row.targetType,
          targetId: remap(row.targetId),
          kind: row.kind,
          note: row.note,
        })),
      );
    }

    if (bundle.journal.length > 0) {
      await tx.insert(journalEntries).values(
        bundle.journal.map((row) => ({
          id: remap(row.id),
          campaignId,
          title: row.title,
          body: row.body,
          tags: row.tags,
          links: row.links
            .filter((link) => idMap.has(link.id))
            .map((link) => ({ ...link, id: remap(link.id) })),
          rollId: row.rollId && idMap.has(row.rollId) ? remap(row.rollId) : null,
          revision: row.revision,
        })),
      );
    }

    return { campaignId, preview };
  });
}

export { checksumOf, canonical };
