import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // The library: dual ESM/CommonJS output with bundled type declarations.
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    target: 'es2022',
  },
  {
    // The CLI: one self-contained ESM file for Node. tsup keeps the hashbang from
    // src/cli/main.ts and marks the output as executable.
    entry: { cli: 'src/cli/main.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node22',
  },
]);
