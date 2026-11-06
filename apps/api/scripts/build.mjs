import { build } from 'esbuild';
import { rm } from 'node:fs/promises';

/**
 * The API is bundled to CommonJS on purpose.
 *
 * Several dependencies (`@fastify/swagger-ui`, pino's worker transport, `thread-stream`) use
 * `__dirname` to locate their static files. Bundled into ESM alongside top-level await, Node 22+
 * rejects the file outright (`ERR_AMBIGUOUS_MODULE_SYNTAX`). CJS keeps those `require`-era
 * assumptions intact, and the runtime image needs no `node_modules`.
 */
const shared = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  // Native optional dependency; never bundle it.
  external: ['pg-native'],
  logLevel: 'info',
};

await rm('dist', { recursive: true, force: true });

await build({ ...shared, entryPoints: ['src/server.ts'], outfile: 'dist/server.cjs' });
await build({ ...shared, entryPoints: ['src/migrate.ts'], outfile: 'dist/migrate.cjs' });
