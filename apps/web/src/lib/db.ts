import Dexie, { type EntityTable } from 'dexie';
import type { Campaign, Character, Roll } from '@mythweaver/contracts';

/**
 * Local database.
 *
 * Reads come from here first so the sheet opens instantly and survives a dead connection;
 * the network refresh replaces the cached copy behind it. Writes that cannot reach the server
 * are parked in `outbox` and replayed later.
 */

export type CachedCampaign = {
  id: string;
  data: Campaign;
  fetchedAt: number;
};

export type CachedCharacter = {
  id: string;
  campaignId: string;
  data: Character;
  fetchedAt: number;
};

export type CachedRoll = {
  id: string;
  campaignId: string;
  data: Roll;
  /** True while the roll exists only on this device. */
  queued: boolean;
};

export type OutboxKind = 'update-character' | 'roll';

export type OutboxOp = {
  /** Also sent as Idempotency-Key: the server collapses a duplicate delivery onto one result. */
  id: string;
  kind: OutboxKind;
  campaignId: string;
  /** Human-readable label for the pending list ("Health 4", "Roll Iron"). */
  label: string;
  payload: unknown;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  status: 'pending' | 'conflict' | 'failed';
  error?: string;
};

export type Meta = { key: string; value: unknown };

class MythweaverDatabase extends Dexie {
  campaigns!: EntityTable<CachedCampaign, 'id'>;
  characters!: EntityTable<CachedCharacter, 'id'>;
  rolls!: EntityTable<CachedRoll, 'id'>;
  outbox!: EntityTable<OutboxOp, 'id'>;
  meta!: EntityTable<Meta, 'key'>;

  constructor() {
    super('mythweaver');
    this.version(1).stores({
      campaigns: 'id, fetchedAt',
      characters: 'id, campaignId, fetchedAt',
      rolls: 'id, campaignId',
      outbox: 'id, status, createdAt',
      meta: 'key',
    });
  }
}

export const db = new MythweaverDatabase();

export async function putCampaign(campaign: Campaign): Promise<void> {
  await db.campaigns.put({ id: campaign.id, data: campaign, fetchedAt: Date.now() });
}

export async function putCharacter(character: Character): Promise<void> {
  await db.characters.put({
    id: character.id,
    campaignId: character.campaignId,
    data: character,
    fetchedAt: Date.now(),
  });
}

export async function putRoll(roll: Roll, queued = false): Promise<void> {
  await db.rolls.put({ id: roll.id, campaignId: roll.campaignId, data: roll, queued });
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const row = await db.campaigns.get(id);
  return row?.data ?? null;
}

export async function getCharacters(campaignId: string): Promise<Character[]> {
  const rows = await db.characters.where('campaignId').equals(campaignId).toArray();
  return rows.map((row) => row.data).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Newest first, matching the API's ordering so a refresh does not reshuffle the page. */
export async function getRolls(campaignId: string, limit = 20): Promise<Roll[]> {
  const rows = await db.rolls.where('campaignId').equals(campaignId).toArray();
  return rows
    .map((row) => row.data)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
    .slice(0, limit);
}

export async function clearCampaignData(campaignId: string): Promise<void> {
  await db.characters.where('campaignId').equals(campaignId).delete();
  await db.rolls.where('campaignId').equals(campaignId).delete();
  await db.outbox.where('campaignId').equals(campaignId).delete();
}
