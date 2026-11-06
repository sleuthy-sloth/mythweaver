import { defineConfig } from 'vitest/config';

/**
 * Integration tests share one PostgreSQL database and truncate between cases, so files run
 * sequentially. Anything faster would make cross-user isolation tests flaky.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/integration/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    restoreMocks: true,
  },
});
