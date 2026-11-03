import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Matches vite.config.ts's build-SHA define, so modules referencing __BUILD_SHA__ (e.g.
  // src/debug/report.ts) import cleanly under Vitest too.
  define: { __BUILD_SHA__: JSON.stringify('test') },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
