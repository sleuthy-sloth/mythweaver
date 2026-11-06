import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Accounts. Registration policy is an operator setting, not a schema concern; `role` is the
 * only privileged distinction and is never writable through the API.
 *
 * Email uniqueness is case-insensitive by index: `Ada@example.com` and `ada@example.com`
 * must not become two accounts.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    displayName: text('display_name').notNull(),
    role: text('role').notNull().default('player'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUnique: uniqueIndex('users_email_lower_unique').on(sql`lower(${table.email})`),
    roleCheck: check('users_role_check', sql`${table.role} in ('player', 'operator')`),
    createdAtIdx: index('users_created_at_idx').on(table.createdAt),
  }),
);

/**
 * Server-side sessions. The cookie carries a random token; only its SHA-256 is stored, so a
 * database leak does not hand over live sessions. Revocation is a timestamp, which keeps an
 * audit trail instead of silently deleting the row.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('sessions_token_hash_unique').on(table.tokenHash),
    userIdx: index('sessions_user_id_idx').on(table.userId),
    expiresIdx: index('sessions_expires_at_idx').on(table.expiresAt),
  }),
);

/**
 * Campaigns are private by default: a row is visible only to its owner and to explicit
 * `campaign_members`. `revision` increments on every accepted mutation and is the anchor for
 * Phase 3 sync conflict detection. Deletion is soft (`deleted_at`) because sync needs tombstones.
 */
export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    rulesetId: text('ruleset_id').notNull().default('ironsworn'),
    rulesetVersion: text('ruleset_version'),
    revision: integer('revision').notNull().default(1),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    lastPlayedAt: timestamp('last_played_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameCheck: check('campaigns_name_check', sql`char_length(${table.name}) between 1 and 120`),
    rulesetCheck: check(
      'campaigns_ruleset_check',
      sql`char_length(${table.rulesetId}) between 1 and 64`,
    ),
    ownerIdx: index('campaigns_owner_id_idx').on(table.ownerId),
    // Every list query filters on owner + soft delete; the index matches that access path.
    ownerVisibleIdx: index('campaigns_owner_visible_idx').on(table.ownerId, table.deletedAt),
  }),
);

/**
 * Explicit, revocable sharing. The owner also gets a row here (`role = 'owner'`) so every
 * authorization decision reads from one table and a shared campaign cannot be orphaned.
 */
export const campaignMembers = pgTable(
  'campaign_members',
  {
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('viewer'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.campaignId, table.userId] }),
    roleCheck: check(
      'campaign_members_role_check',
      sql`${table.role} in ('owner', 'editor', 'viewer')`,
    ),
    userIdx: index('campaign_members_user_id_idx').on(table.userId),
  }),
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type CampaignMember = typeof campaignMembers.$inferSelect;

/**
 * Ironsworn character sheet. Stats and meters are explicit columns rather than JSON: they are
 * queried, validated and merged field-by-field during sync, and a JSON blob would defeat that.
 *
 * `revision` increments on every accepted change, which is what the Phase 3 sync protocol uses
 * to detect a stale base revision instead of silently overwriting.
 */
export const characters = pgTable(
  'characters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    edge: smallint('edge').notNull().default(2),
    heart: smallint('heart').notNull().default(1),
    iron: smallint('iron').notNull().default(3),
    shadow: smallint('shadow').notNull().default(2),
    wits: smallint('wits').notNull().default(1),
    health: smallint('health').notNull().default(5),
    spirit: smallint('spirit').notNull().default(5),
    supply: smallint('supply').notNull().default(5),
    momentum: smallint('momentum').notNull().default(2),
    /** Marked debilities; the momentum reset and maximum are derived from the count. */
    debilities: text('debilities')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    xp: integer('xp').notNull().default(0),
    notes: text('notes'),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameCheck: check('characters_name_check', sql`char_length(${table.name}) between 1 and 120`),
    statsCheck: check(
      'characters_stats_check',
      sql`${table.edge} between 0 and 5 and ${table.heart} between 0 and 5
        and ${table.iron} between 0 and 5 and ${table.shadow} between 0 and 5
        and ${table.wits} between 0 and 5`,
    ),
    metersCheck: check(
      'characters_meters_check',
      sql`${table.health} between 0 and 5 and ${table.spirit} between 0 and 5
        and ${table.supply} between 0 and 5`,
    ),
    momentumCheck: check('characters_momentum_check', sql`${table.momentum} between -6 and 10`),
    campaignIdx: index('characters_campaign_id_idx').on(table.campaignId),
  }),
);

/**
 * Rolls are append-only events. The inputs and every die are stored, so a result can be
 * re-derived and argued about; corrections happen by appending, never by editing history.
 */
export const rolls = pgTable(
  'rolls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    characterId: uuid('character_id').references(() => characters.id, { onDelete: 'set null' }),
    moveId: text('move_id'),
    stat: text('stat').notNull(),
    adds: integer('adds').notNull().default(0),
    actionDie: smallint('action_die').notNull(),
    challenge1: smallint('challenge_1').notNull(),
    challenge2: smallint('challenge_2').notNull(),
    actionScore: integer('action_score').notNull(),
    outcome: text('outcome').notNull(),
    isMatch: boolean('is_match').notNull().default(false),
    burned: boolean('burned').notNull().default(false),
    momentumBefore: smallint('momentum_before'),
    momentumAfter: smallint('momentum_after'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    outcomeCheck: check(
      'rolls_outcome_check',
      sql`${table.outcome} in ('strong_hit', 'weak_hit', 'miss')`,
    ),
    statCheck: check(
      'rolls_stat_check',
      sql`${table.stat} in ('edge', 'heart', 'iron', 'shadow', 'wits')`,
    ),
    campaignCreatedIdx: index('rolls_campaign_created_idx').on(table.campaignId, table.createdAt),
  }),
);

export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
export type Roll = typeof rolls.$inferSelect;
export type NewRoll = typeof rolls.$inferInsert;
