import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // examples/library.mjs imports the package by name; tests run it against the source.
    alias: { contrastkit: fileURLToPath(new URL('src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // main.ts only wires process.argv/stdout to run(); CI smoke-tests it through the built CLI.
      exclude: ['src/cli/main.ts'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 90,
      },
    },
  },
});
