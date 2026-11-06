import type { User } from '@mythweaver/contracts';
import { eq } from 'drizzle-orm';
import type { AppConfig } from '../../config';
import type { Database } from '../../db/client';
import { users } from '../../db/schema';
import { conflict, forbidden, unauthorized } from '../../lib/errors';
import { dummyPasswordHash, hashPassword, verifyPassword } from '../../lib/password';

export type UserRow = typeof users.$inferSelect;

export function toPublicUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role === 'operator' ? 'operator' : 'player',
    createdAt: row.createdAt.toISOString(),
  };
}

export async function findUserByEmail(db: Database, email: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row ?? null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

/**
 * Registration is gated by operator policy, not by a hidden route. The unique index on
 * `lower(email)` is the real guard against two accounts for one address; the pre-check only
 * produces a nicer message for the common case.
 */
export async function registerUser(
  db: Database,
  config: AppConfig,
  input: { email: string; displayName: string; password: string },
): Promise<UserRow> {
  if (!config.registrationOpen) {
    throw forbidden('Registration is closed on this server');
  }

  const passwordHash = await hashPassword(input.password);

  try {
    const [row] = await db
      .insert(users)
      .values({
        email: input.email,
        passwordHash,
        displayName: input.displayName,
        role: 'player',
      })
      .returning();
    if (!row) throw new Error('insert returned no row');
    return row;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict('An account with that email already exists');
    }
    throw error;
  }
}

/**
 * One error for both "no such account" and "wrong password", and the hash comparison runs even
 * when the account is missing. The two together close the enumeration oracle.
 */
export async function verifyCredentials(
  db: Database,
  email: string,
  password: string,
): Promise<UserRow> {
  const row = await findUserByEmail(db, email);
  const passwordHash = row?.passwordHash ?? (await dummyPasswordHash());
  const valid = await verifyPassword(passwordHash, password);

  if (!row || !valid) {
    throw unauthorized('Email or password is incorrect');
  }
  return row;
}
