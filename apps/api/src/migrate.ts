import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { loadConfig } from './config';
import { createDatabase } from './db/client';

/**
 * Forward-only migrations. Runs as its own Compose service so the API never serves
 * traffic against a half-migrated schema, and so the step is visible in deploy logs.
 * `MIGRATIONS_DIR` exists because the bundle and the sources live at different depths.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const { sql, db } = createDatabase(config.databaseUrl);
  const migrationsFolder = resolve(process.env.MIGRATIONS_DIR ?? 'drizzle');

  try {
    await migrate(db, { migrationsFolder });
    console.error(`migrations applied from ${migrationsFolder}`);
  } catch (error) {
    console.error('migration failed', error);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error: unknown) => {
  console.error('fatal migration error', error);
  process.exitCode = 1;
});
