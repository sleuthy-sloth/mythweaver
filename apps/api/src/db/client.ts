import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = ReturnType<typeof createDatabase>['db'];
export type Sql = ReturnType<typeof postgres>;

/**
 * One connection pool per process. `max` stays small: the Pi target has limited memory and
 * Postgres defaults to 100 connections, which several containers can exhaust.
 */
export function createDatabase(databaseUrl: string) {
  const sql = postgres(databaseUrl, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });

  return { sql, db: drizzle(sql, { schema }) };
}

/** Throws if the database is unreachable; the caller decides how to report it. */
export async function pingDatabase(sql: Sql): Promise<number> {
  const startedAt = performance.now();
  await sql`select 1`;
  return Math.round((performance.now() - startedAt) * 100) / 100;
}
