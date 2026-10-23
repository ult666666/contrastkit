#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { run } from './run';

// NO_COLOR (https://no-color.org): any non-empty value turns styling off.
const noColor = (process.env.NO_COLOR ?? '') !== '';

process.exitCode = run(process.argv.slice(2), {
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  readFile: (path) => readFileSync(path, 'utf8'),
  color: process.stdout.isTTY && !noColor,
});
