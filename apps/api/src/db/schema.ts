import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

/**
 * Accounts. Phase 1 creates the table and the migration path; authentication arrives in
 * Phase 2, which is why password_hash is already here (adding it later would mean a
 * migration over live data).
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

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
