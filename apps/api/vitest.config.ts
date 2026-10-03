import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC keeps decorator metadata, which Nest dependency injection needs (esbuild drops it).
// @swc/core is pinned to 1.15.x: 1.16 refuses to load when its native cache folder is writable by
// "Authenticated Users", which is the default ACL on non-system Windows drives.
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Integration tests need a database; they run via `test:integration`.
    exclude: ['test/integration/**'],
    environment: 'node',
  },
});
