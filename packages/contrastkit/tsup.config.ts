import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // The library: dual ESM/CommonJS output with bundled type declarations.
    entry: { index: 'src/index.ts' },
    format: ['esm', 'cjs'],
    dts: {
      // tsup 8 passes `baseUrl` to the declaration build, which TypeScript 6 reports as
      // deprecated. Our own tsconfig does not use it, so silencing it here is safe.
      compilerOptions: { ignoreDeprecations: '6.0' },
    },
    sourcemap: true,
    target: 'es2022',
  },
  {
    // The CLI: one self-contained ESM file for Node. tsup keeps the hashbang from
    // src/cli/main.ts and marks the output as executable.
    entry: { cli: 'src/cli/main.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node20',
  },
]);
