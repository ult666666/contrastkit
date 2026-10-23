import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Served from https://ult666666.github.io/contrastkit/ by GitHub Pages.
  base: '/contrastkit/',
  plugins: [react()],
  resolve: {
    alias: {
      // Compile the library from its TypeScript source, so the app always uses the current
      // code and needs no separate library build first.
      contrastkit: fileURLToPath(new URL('../packages/contrastkit/src/index.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      // main.tsx only mounts <App /> into index.html.
      exclude: ['src/main.tsx'],
      reporter: ['text', 'html', 'lcov'],
      thresholds: {
        lines: 90,
        statements: 90,
        functions: 90,
        branches: 85,
      },
    },
  },
});
