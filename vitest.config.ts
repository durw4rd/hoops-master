import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/globalSetup.ts'],
    setupFiles: ['test/setup.ts'],
    // Spot mutations run in serializable transactions; a single worker keeps
    // scenarios deterministic (no cross-file predicate-lock conflicts).
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
