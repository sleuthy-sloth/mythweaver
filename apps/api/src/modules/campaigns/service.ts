import type { Campaign as CampaignDto, CampaignRole } from '@mythweaver/contracts';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { campaigns, campaignMembers } from '../../db/schema';
import { badRequest, campaignNotFound, forbidden } from '../../lib/errors';

type CampaignRow = typeof campaigns.$inferSelect;

/** The columns every read returns; `role` comes from the membership join. */
export type CampaignView = Pick<
  CampaignRow,
  | 'id'
  | 'name'
  | 'description'
  | 'rulesetId'
  | 'rulesetVersion'
  | 'revision'
  | 'archivedAt'
  | 'lastPlayedAt'
  | 'createdAt'
  | 'updatedAt'
> & { role: string };

export type CampaignWithRole = { campaign: CampaignView; role: CampaignRole };

const campaignColumns = {
  id: campaigns.id,
  ownerId: campaigns.ownerId,
  name: campaigns.name,
  description: campaigns.description,
  rulesetId: campaigns.rulesetId,
  rulesetVersion: campaigns.rulesetVersion,
  revision: campaigns.revision,
  archivedAt: campaigns.archivedAt,
  lastPlayedAt: campaigns.lastPlayedAt,
  createdAt: campaigns.createdAt,
  updatedAt: campaigns.updatedAt,
  role: campaignMembers.role,
};

function asRole(value: string): CampaignRole {
  return value === 'owner' || value === 'editor' ? value : 'viewer';
}

export function toCampaignDto(row: Omit<CampaignView, 'role'>, role: string): CampaignDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    rulesetId: row.rulesetId,
    rulesetVersion: row.rulesetVersion,
    role: asRole(role),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    lastPlayedAt: row.lastPlayedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    revision: row.revision,
  };
}

export async function listCampaigns(db: Database, userId: string): Promise<CampaignDto[]> {
  const rows = await db
    .select(campaignColumns)
    .from(campaignMembers)
    .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
    .where(and(eq(campaignMembers.userId, userId), isNull(campaigns.deletedAt)))
    .orderBy(desc(campaigns.updatedAt));

  return rows.map((row) => toCampaignDto(row, row.role));
}

/**
 * A campaign and its owner membership are written together. If either insert fails the whole
 * thing rolls back — a campaign nobody can administer is worse than no campaign.
 */
export async function createCampaign(
  db: Database,
  userId: string,
  input: { name: string; description?: string; rulesetId: string },
): Promise<CampaignDto> {
  const row = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(campaigns)
      .values({
        ownerId: userId,
        name: input.name,
        description: input.description ?? null,
        rulesetId: input.rulesetId,
      })
      .returning();

    if (!created) throw new Error('campaign insert returned no row');

    await tx.insert(campaignMembers).values({ campaignId: created.id, userId, role: 'owner' });

    return created;
  });

  return toCampaignDto(row, 'owner');
}

/**
 * Authorization lives here, not in the route: every read path goes through this join, so a
 * forgotten `preHandler` cannot expose another account's campaign.
 */
export async function getCampaignForUser(
  db: Database,
  userId: string,
  campaignId: string,
): Promise<CampaignWithRole> {
  const [row] = await db
    .select(campaignColumns)
    .from(campaignMembers)
    .innerJoin(campaigns, eq(campaigns.id, campaignMembers.campaignId))
    .where(
      and(
        eq(campaignMembers.userId, userId),
        eq(campaignMembers.campaignId, campaignId),
        isNull(campaigns.deletedAt),
      ),
    )
    .limit(1);

  if (!row) throw campaignNotFound();
  return { campaign: row, role: asRole(row.role) };
}

export async function updateCampaign(
  db: Database,
  userId: string,
  campaignId: string,
  input: { name?: string; description?: string | null; archived?: boolean },
): Promise<CampaignDto> {
  const { role } = await getCampaignForUser(db, userId, campaignId);
  if (role !== 'owner') throw forbidden('Only the campaign owner can change it');

  const [updated] = await db
    .update(campaigns)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.archived !== undefined ? { archivedAt: input.archived ? new Date() : null } : {}),
      updatedAt: new Date(),
      revision: sql`${campaigns.revision} + 1`,
    })
    .where(and(eq(campaigns.id, campaignId), isNull(campaigns.deletedAt)))
    .returning();

  if (!updated) throw campaignNotFound();
  return toCampaignDto(updated, role);
}

/**
 * Soft delete, because sync needs a tombstone and a mistaken delete should be recoverable by
 * an operator. Typing the name is a mis-tap guard; ownership is the actual control.
 */
export async function deleteCampaign(
  db: Database,
  userId: string,
  campaignId: string,
  confirmName: string,
): Promise<void> {
  const { campaign, role } = await getCampaignForUser(db, userId, campaignId);
  if (role !== 'owner') throw forbidden('Only the campaign owner can delete it');

  if (campaign.name !== confirmName) {
    throw badRequest('Type the campaign name exactly to confirm deletion', {
      confirmName: ['does not match the campaign name'],
    });
  }

  await db
    .update(campaigns)
    .set({ deletedAt: new Date(), updatedAt: new Date(), revision: sql`${campaigns.revision} + 1` })
    .where(and(eq(campaigns.id, campaignId), isNull(campaigns.deletedAt)));
}
