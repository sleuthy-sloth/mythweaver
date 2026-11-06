import { buildApp } from './app';
import { loadConfig } from './config';
import { createDatabase, pingDatabase } from './db/client';

async function main(): Promise<void> {
  const config = loadConfig();
  const { sql } = createDatabase(config.databaseUrl);

  const app = await buildApp({
    config,
    checkDatabase: () => pingDatabase(sql),
  });

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'shutting down');
    try {
      await app.close();
      await sql.end({ timeout: 5 });
    } finally {
      process.exit(0);
    }
  };

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void shutdown(signal);
    });
  }

  try {
    await app.listen({ port: config.port, host: config.host });
  } catch (error) {
    app.log.error({ err: error }, 'failed to start');
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error('fatal startup error', error);
  process.exit(1);
});
