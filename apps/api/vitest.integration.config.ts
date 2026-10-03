import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * API integration tests against real Postgres, isolated in the `fl_test` schema of the database
 * in DIRECT_URL (recreated on every run). Run with `pnpm --filter @fernleaf/api test:integration`.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['test/integration/**/*.int.test.ts'],
    environment: 'node',
    globalSetup: ['test/integration/global-setup.ts'],
    setupFiles: ['test/integration/setup-env.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 300_000,
  },
});
