import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  jsonb,
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
    /** `server` when the API rolled the dice, `client` when offline dice were submitted. */
    source: text('source').notNull().default('server'),
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
    sourceCheck: check('rolls_source_check', sql`${table.source} in ('server', 'client')`),
    campaignCreatedIdx: index('rolls_campaign_created_idx').on(table.campaignId, table.createdAt),
  }),
);

export type Character = typeof characters.$inferSelect;
export type NewCharacter = typeof characters.$inferInsert;
export type Roll = typeof rolls.$inferSelect;
export type NewRoll = typeof rolls.$inferInsert;

/**
 * Idempotency records for POST retries.
 *
 * An offline client replays its outbox after reconnecting, and a flaky network can deliver the same
 * request twice. The key is supplied by the client; the stored response is returned verbatim on a
 * repeat, so a retry cannot create a second campaign or a duplicate roll.
 *
 * Rows are per user and per key, and the request hash is stored so reusing a key with a different
 * body is an error rather than a silent wrong answer.
 */
export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    status: integer('status').notNull(),
    body: jsonb('body'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userKeyUnique: uniqueIndex('idempotency_user_key_unique').on(table.userId, table.key),
    createdIdx: index('idempotency_created_at_idx').on(table.createdAt),
  }),
);

/**
 * World entities. Each is campaign-scoped and shares the same shape (name, description, tags,
 * revision) so one set of routes can serve all three; the differences are the extra columns.
 */
export const factions = pgTable(
  'factions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameCheck: check('factions_name_check', sql`char_length(${table.name}) between 1 and 120`),
    campaignIdx: index('factions_campaign_id_idx').on(table.campaignId),
  }),
);

export const locations = pgTable(
  'locations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('other'),
    description: text('description'),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameCheck: check('locations_name_check', sql`char_length(${table.name}) between 1 and 120`),
    kindCheck: check(
      'locations_kind_check',
      sql`${table.kind} in ('settlement', 'site', 'wilds', 'other')`,
    ),
    campaignIdx: index('locations_campaign_id_idx').on(table.campaignId),
  }),
);

export const npcs = pgTable(
  'npcs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    role: text('role'),
    description: text('description'),
    factionId: uuid('faction_id').references(() => factions.id, { onDelete: 'set null' }),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameCheck: check('npcs_name_check', sql`char_length(${table.name}) between 1 and 120`),
    campaignIdx: index('npcs_campaign_id_idx').on(table.campaignId),
    factionIdx: index('npcs_faction_id_idx').on(table.factionId),
  }),
);

/**
 * Relationships are edges between two campaign entities. The endpoints are polymorphic, so they
 * cannot be foreign keys; the service resolves both ends inside the campaign before inserting,
 * which is what keeps a dangling or cross-campaign edge out of the table.
 */
export const relationships = pgTable(
  'relationships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    sourceType: text('source_type').notNull(),
    sourceId: uuid('source_id').notNull(),
    targetType: text('target_type').notNull(),
    targetId: uuid('target_id').notNull(),
    kind: text('kind').notNull(),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    typeCheck: check(
      'relationships_type_check',
      sql`${table.sourceType} in ('npc', 'faction', 'location', 'character')
        and ${table.targetType} in ('npc', 'faction', 'location', 'character')`,
    ),
    campaignIdx: index('relationships_campaign_id_idx').on(table.campaignId),
    sourceIdx: index('relationships_source_idx').on(table.sourceType, table.sourceId),
    targetIdx: index('relationships_target_idx').on(table.targetType, table.targetId),
  }),
);

/**
 * Journal entries are portable prose plus explicit links. `links` is JSON because it is genuinely
 * variable — a list of {type,id,label} — and it is validated by the contract on the way in.
 */
export const journalEntries = pgTable(
  'journal_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    links: jsonb('links')
      .notNull()
      .default(sql`'[]'::jsonb`),
    rollId: uuid('roll_id').references(() => rolls.id, { onDelete: 'set null' }),
    revision: integer('revision').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    titleCheck: check('journal_title_check', sql`char_length(${table.title}) between 1 and 160`),
    campaignIdx: index('journal_campaign_created_idx').on(table.campaignId, table.createdAt),
  }),
);

export type Faction = typeof factions.$inferSelect;
export type WorldLocation = typeof locations.$inferSelect;
export type Npc = typeof npcs.$inferSelect;
export type Relationship = typeof relationships.$inferSelect;
export type JournalEntry = typeof journalEntries.$inferSelect;
