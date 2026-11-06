import { randomInt } from 'node:crypto';
import type { Roll as RollDto, RollRequest } from '@mythweaver/contracts';
import { rollAction, type Rng } from '@mythweaver/rules-ironsworn';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { characters, rolls } from '../../db/schema';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { getCampaignForUser } from '../campaigns/service';

type RollRow = typeof rolls.$inferSelect;

/**
 * Server-side randomness for online play. `randomInt` is cryptographically secure, and no seed
 * is exposed or stored: a "deterministic" seed would let a player pre-compute favourable rolls,
 * which is exactly the trust problem the brief warns about.
 */
export function cryptoRng(): Rng {
  return {
    d6: () => randomInt(1, 7),
    d10: () => randomInt(1, 11),
  };
}

export function toRollDto(row: RollRow): RollDto {
  return {
    id: row.id,
    campaignId: row.campaignId,
    characterId: row.characterId,
    moveId: row.moveId,
    stat: row.stat as RollDto['stat'],
    adds: row.adds,
    actionDie: row.actionDie,
    challenge: [row.challenge1, row.challenge2],
    actionScore: row.actionScore,
    outcome: row.outcome as RollDto['outcome'],
    match: row.isMatch,
    burned: row.burned,
    momentumBefore: row.momentumBefore,
    momentumAfter: row.momentumAfter,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function recordRoll(
  db: Database,
  userId: string,
  campaignId: string,
  input: RollRequest,
): Promise<RollDto> {
  const { role } = await getCampaignForUser(db, userId, campaignId);
  if (role === 'viewer') throw forbidden('You can read this campaign but not roll in it');

  const [character] = await db
    .select()
    .from(characters)
    .where(and(eq(characters.id, input.characterId), eq(characters.campaignId, campaignId)))
    .limit(1);

  if (!character) throw notFound('Character not found in this campaign');
  if (input.burnMomentum && character.momentum <= 0) {
    throw badRequest('Momentum must be positive to burn', {
      burnMomentum: ['momentum is 0 or lower'],
    });
  }

  const statValue = character[input.stat];
  const result = rollAction({
    base: statValue + input.adds,
    momentum: character.momentum,
    debilities: character.debilities,
    burn: input.burnMomentum,
    rng: cryptoRng(),
  });

  const row = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(rolls)
      .values({
        campaignId,
        characterId: character.id,
        moveId: input.moveId ?? null,
        stat: input.stat,
        adds: input.adds,
        actionDie: result.actionDie,
        challenge1: result.challenge[0],
        challenge2: result.challenge[1],
        actionScore: result.actionScore,
        outcome: result.outcome,
        isMatch: result.match,
        burned: result.burned,
        momentumBefore: result.momentumBefore,
        momentumAfter: result.momentumAfter,
      })
      .returning();

    if (!inserted) throw new Error('roll insert returned no row');

    // Only burning mutates the sheet here. Positive/negative momentum from a move is applied
    // by the player (or a later move-resolution step), not invented by the server.
    if (result.burned) {
      await tx
        .update(characters)
        .set({
          momentum: result.momentumAfter,
          updatedAt: new Date(),
          revision: sql`${characters.revision} + 1`,
        })
        .where(eq(characters.id, character.id));
    }

    return inserted;
  });

  return toRollDto(row);
}

export async function listRolls(
  db: Database,
  userId: string,
  campaignId: string,
  limit: number,
): Promise<RollDto[]> {
  await getCampaignForUser(db, userId, campaignId);

  const rows = await db
    .select()
    .from(rolls)
    .where(eq(rolls.campaignId, campaignId))
    .orderBy(desc(rolls.createdAt))
    .limit(limit);

  return rows.map(toRollDto);
}
