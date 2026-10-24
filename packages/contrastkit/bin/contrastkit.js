#!/usr/bin/env node
// npm links package binaries during `npm ci`, before `npm run build` has created dist/,
// and skips any link whose target does not exist yet. This launcher is committed, so the
// `contrastkit` command is always linked; it loads the built CLI when it runs.
try {
  await import('../dist/cli.js');
} catch (error) {
  if (error instanceof Error && 'code' in error && error.code === 'ERR_MODULE_NOT_FOUND') {
    process.stderr.write('contrastkit: dist/cli.js is missing. Run `npm run build` first.\n');
    process.exitCode = 2;
  } else {
    throw error;
  }
}
