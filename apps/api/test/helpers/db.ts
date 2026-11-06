import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import * as schema from '../../src/db/schema';
import type { Database } from '../../src/db/client';

const HERE = dirname(fileURLToPath(import.meta.url));
const API_ROOT = resolve(HERE, '../..');
const REPO_ROOT = resolve(API_ROOT, '../..');

/**
 * Integration tests need a real PostgreSQL. Rather than pull in a config library, the helper
 * reads the repository `.env` (the same file the app uses) and never overrides an existing
 * process value, so CI can inject DATABASE_URL directly.
 */
function loadEnvFile(): void {
  const envPath = resolve(REPO_ROOT, '.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!key || rawValue === undefined) continue;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

export type TestContext = {
  db: Database;
  sql: ReturnType<typeof postgres>;
  databaseUrl: string;
  close: () => Promise<void>;
};

/**
 * Creates (if absent) and migrates a database separate from the development one. Tests truncate
 * tables between cases, so pointing this at the dev database would delete real data — hence the
 * hard requirement that the name ends in `_test`.
 */
export async function createTestContext(): Promise<TestContext> {
  loadEnvFile();

  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env or run `docker compose up -d db`.',
    );
  }

  const parsed = new URL(base);
  const databaseName = `${parsed.pathname.replace(/^\//, '')}_test`;
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Refusing to run destructive tests against ${databaseName}`);
  }

  const adminUrl = new URL(base);
  adminUrl.pathname = '/postgres';

  const admin = postgres(adminUrl.toString(), { max: 1, onnotice: () => {} });
  try {
    const existing = await admin`select 1 from pg_database where datname = ${databaseName}`;
    if (existing.length === 0) {
      await admin.unsafe(`CREATE DATABASE "${databaseName}"`);
    }
  } finally {
    await admin.end({ timeout: 5 });
  }

  const databaseUrl = new URL(base);
  databaseUrl.pathname = `/${databaseName}`;

  const sql = postgres(databaseUrl.toString(), { max: 5, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  await migrate(db, { migrationsFolder: resolve(API_ROOT, 'drizzle') });

  return {
    db,
    sql,
    databaseUrl: databaseUrl.toString(),
    close: async () => {
      await sql.end({ timeout: 5 });
    },
  };
}

/** Child tables first: a plain TRUNCATE on users would be blocked by the foreign keys. */
export async function resetDatabase(sql: TestContext['sql']): Promise<void> {
  await sql`truncate table campaign_members, campaigns, sessions, users restart identity cascade`;
}
