import type {
  Character as CharacterDto,
  CreateCharacterRequest,
  Debility,
  UpdateCharacterRequest,
} from '@mythweaver/contracts';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { characters } from '../../db/schema';
import { conflictWith, forbidden, notFound } from '../../lib/errors';
import { getCampaignForUser } from '../campaigns/service';

type CharacterRow = typeof characters.$inferSelect;

export function toCharacterDto(row: CharacterRow): CharacterDto {
  return {
    id: row.id,
    campaignId: row.campaignId,
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
    debilities: row.debilities as Debility[],
    xp: row.xp,
    notes: row.notes,
    revision: row.revision,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Players write; the viewer role is read-only. Sharing UI comes later, the rule is enforced now. */
function assertCanWrite(role: string): void {
  if (role === 'viewer') throw forbidden('You can read this campaign but not change it');
}

export async function listCharacters(
  db: Database,
  userId: string,
  campaignId: string,
): Promise<CharacterDto[]> {
  await getCampaignForUser(db, userId, campaignId);

  const rows = await db
    .select()
    .from(characters)
    .where(eq(characters.campaignId, campaignId))
    .orderBy(asc(characters.createdAt));

  return rows.map(toCharacterDto);
}

export async function createCharacter(
  db: Database,
  userId: string,
  campaignId: string,
  input: CreateCharacterRequest,
): Promise<CharacterDto> {
  const { role } = await getCampaignForUser(db, userId, campaignId);
  assertCanWrite(role);

  const [row] = await db
    .insert(characters)
    .values({
      campaignId,
      name: input.name,
      ...input.stats,
      health: input.health,
      spirit: input.spirit,
      supply: input.supply,
      momentum: input.momentum,
      notes: input.notes ?? null,
    })
    .returning();

  if (!row) throw new Error('character insert returned no row');
  return toCharacterDto(row);
}

export async function getCharacter(
  db: Database,
  userId: string,
  campaignId: string,
  characterId: string,
): Promise<CharacterRow> {
  await getCampaignForUser(db, userId, campaignId);

  const [row] = await db
    .select()
    .from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.campaignId, campaignId)))
    .limit(1);

  // Same reasoning as campaigns: a character in someone else's campaign must not be
  // distinguishable from one that does not exist.
  if (!row) throw notFound('Character not found');
  return row;
}

export async function updateCharacter(
  db: Database,
  userId: string,
  campaignId: string,
  characterId: string,
  input: UpdateCharacterRequest,
): Promise<CharacterDto> {
  const { role } = await getCampaignForUser(db, userId, campaignId);
  assertCanWrite(role);

  const [existing] = await db
    .select({ id: characters.id, revision: characters.revision })
    .from(characters)
    .where(and(eq(characters.id, characterId), eq(characters.campaignId, campaignId)))
    .limit(1);
  if (!existing) throw notFound('Character not found');

  /**
   * Optimistic concurrency. An offline client edits from a revision it saw; if the sheet moved on,
   * the update is refused rather than silently overwriting the other change. The client keeps both
   * values and asks the player, per the sync rules.
   */
  if (input.baseRevision !== undefined && input.baseRevision !== existing.revision) {
    throw conflictWith('This character changed since you loaded it', {
      currentRevision: [String(existing.revision)],
    });
  }

  const [row] = await db
    .update(characters)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.stats !== undefined ? { ...input.stats } : {}),
      ...(input.health !== undefined ? { health: input.health } : {}),
      ...(input.spirit !== undefined ? { spirit: input.spirit } : {}),
      ...(input.supply !== undefined ? { supply: input.supply } : {}),
      ...(input.momentum !== undefined ? { momentum: input.momentum } : {}),
      ...(input.debilities !== undefined ? { debilities: input.debilities } : {}),
      ...(input.xp !== undefined ? { xp: input.xp } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      updatedAt: new Date(),
      revision: sql`${characters.revision} + 1`,
    })
    .where(and(eq(characters.id, characterId), eq(characters.campaignId, campaignId)))
    .returning();

  if (!row) throw new Error('character update returned no row');
  return toCharacterDto(row);
}
