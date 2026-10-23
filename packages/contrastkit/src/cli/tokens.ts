import type { PairRequirement, PaletteEntry } from '../audit';
import type { ContrastUse, WcagLevel } from '../contrast';
import { CliError } from './errors';

/** The parsed contents of a design-tokens file. */
export interface TokensFile {
  readonly colors: PaletteEntry[];
  readonly pairs: PairRequirement[];
}

const LEVELS: readonly WcagLevel[] = ['AA', 'AAA'];
const USES: readonly ContrastUse[] = ['text', 'large-text', 'non-text'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads the tokens format:
 *
 * ```json
 * {
 *   "colors": {
 *     "text": { "primary": "#1f2937", "muted": { "$value": "#6b7280" } },
 *     "surface": "#ffffff"
 *   },
 *   "pairs": [{ "foreground": "text.primary", "background": "surface", "level": "AA" }]
 * }
 * ```
 *
 * Groups nest and their keys join with dots ("text.primary"). A token is a CSS color
 * string or, as in the W3C Design Tokens format, an object with a string `$value`. Other
 * keys starting with `$` (such as `$type`) are ignored. `pairs` is optional; each pair may
 * set `level` ("AA" or "AAA") and `use` ("text", "large-text" or "non-text").
 *
 * @throws {@link CliError} describing the first problem found.
 */
export function parseTokens(data: unknown): TokensFile {
  if (!isObject(data) || !isObject(data.colors)) {
    throw new CliError(
      'the tokens file must be a JSON object with a "colors" object, e.g. { "colors": { "text": "#1f2937" } }',
    );
  }
  const colors: PaletteEntry[] = [];
  collectColors(data.colors, [], colors);
  if (colors.length === 0) throw new CliError('"colors" does not contain any colors');
  return { colors, pairs: data.pairs === undefined ? [] : parsePairs(data.pairs) };
}

function collectColors(group: Record<string, unknown>, path: string[], out: PaletteEntry[]): void {
  for (const [key, value] of Object.entries(group)) {
    if (key.startsWith('$')) continue;
    const name = [...path, key].join('.');
    if (typeof value === 'string') {
      out.push({ name, color: value });
    } else if (isObject(value) && '$value' in value) {
      if (typeof value.$value !== 'string') {
        throw new CliError(`colors.${name}.$value must be a CSS color string`);
      }
      out.push({ name, color: value.$value });
    } else if (isObject(value)) {
      collectColors(value, [...path, key], out);
    } else {
      throw new CliError(
        `colors.${name} must be a CSS color string, a { "$value": "..." } token or a group of colors`,
      );
    }
  }
}

function parsePairs(value: unknown): PairRequirement[] {
  if (!Array.isArray(value)) {
    throw new CliError(
      '"pairs" must be an array of { "foreground": ..., "background": ... } objects',
    );
  }
  return value.map((entry: unknown, index): PairRequirement => {
    const where = `pairs[${index}]`;
    if (
      !isObject(entry) ||
      typeof entry.foreground !== 'string' ||
      typeof entry.background !== 'string'
    ) {
      throw new CliError(`${where} needs "foreground" and "background" color names`);
    }
    const { foreground, background, level, use } = entry;
    if (level !== undefined && !LEVELS.includes(level as WcagLevel)) {
      throw new CliError(`${where}.level must be "AA" or "AAA"`);
    }
    if (use !== undefined && !USES.includes(use as ContrastUse)) {
      throw new CliError(`${where}.use must be "text", "large-text" or "non-text"`);
    }
    return {
      foreground,
      background,
      ...(level === undefined ? {} : { level: level as WcagLevel }),
      ...(use === undefined ? {} : { use: use as ContrastUse }),
    };
  });
}
