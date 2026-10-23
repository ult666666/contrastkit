import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { auditPalette, checkRequirements, type PairRequirement } from 'contrastkit';
import { describe, expect, it } from 'vitest';

/**
 * Dogfooding: the app's own theme colors are audited with contrastkit. axe-core cannot
 * measure color contrast in jsdom (there is no layout or rendering), so this test is what
 * guarantees the interface meets WCAG AA in both themes.
 */
const css = readFileSync(join(import.meta.dirname, '../src/styles.css'), 'utf8');

function themeTokens(): { light: Record<string, string>; dark: Record<string, string> } {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  for (const [, name = '', lightValue = '', darkValue = ''] of css.matchAll(
    /--([\w-]+):\s*light-dark\(\s*(#[0-9a-f]{6})\s*,\s*(#[0-9a-f]{6})\s*\)/gi,
  )) {
    light[name] = lightValue;
    dark[name] = darkValue;
  }
  return { light, dark };
}

/** Every pairing of tokens the stylesheet actually uses. */
const PAIRS: readonly PairRequirement[] = [
  { foreground: 'text', background: 'bg' },
  { foreground: 'text', background: 'surface' },
  { foreground: 'text-muted', background: 'bg' },
  { foreground: 'text-muted', background: 'surface' },
  { foreground: 'accent', background: 'bg' },
  { foreground: 'accent', background: 'surface' },
  { foreground: 'on-accent', background: 'accent' },
  { foreground: 'pass', background: 'surface' },
  { foreground: 'fail', background: 'surface' },
  { foreground: 'warn', background: 'surface' },
  { foreground: 'control-border', background: 'surface', use: 'non-text' },
  { foreground: 'control-border', background: 'bg', use: 'non-text' },
  { foreground: 'focus', background: 'surface', use: 'non-text' },
  { foreground: 'focus', background: 'bg', use: 'non-text' },
  { foreground: 'warn', background: 'bg', use: 'non-text' },
];

describe('the app’s own colors', () => {
  const themes = themeTokens();

  it('defines every token in both themes', () => {
    const names = Object.keys(themes.light);
    expect(names).toEqual(expect.arrayContaining(['bg', 'surface', 'text', 'focus']));
    expect(Object.keys(themes.dark)).toEqual(names);
  });

  it.each(['light', 'dark'] as const)('meet WCAG AA in the %s theme', (theme) => {
    const audit = auditPalette(themes[theme]);
    const failures = checkRequirements(audit, PAIRS).filter((result) => !result.pass);
    expect(failures).toEqual([]);
  });
});
