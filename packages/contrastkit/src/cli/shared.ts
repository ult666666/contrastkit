import { requiredRatio, type ContrastUse, type WcagLevel } from '../contrast';
import { formatHex, formatRgb } from '../format';
import type { Rgb } from '../types';
import { CliError } from './errors';
import type { Style } from './style';

/** What a command needs from the outside world; tests pass fakes. */
export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly readFile: (path: string) => string;
  /** Whether to style output with ANSI colors (stdout is a TTY and NO_COLOR is unset). */
  readonly color: boolean;
}

export interface CommandContext {
  readonly io: CliIo;
  readonly style: Style;
}

/** The contrast ratio a command checks or fixes for, and how to describe it. */
export interface Target {
  readonly ratio: number;
  readonly description: string;
  readonly level?: WcagLevel;
  readonly use?: ContrastUse;
}

/**
 * Runs a `node:util` parseArgs call, turning its argument errors (unknown option, missing
 * value) into usage errors.
 */
export function parseCommandLine<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS')) {
      throw new CliError((error as Error).message, true);
    }
    throw error;
  }
}

/** Checks the number of positional arguments and returns them. */
export function expectPositionals(
  command: string,
  positionals: readonly string[],
  names: readonly string[],
): string[] {
  if (positionals.length !== names.length) {
    const expected = names.map((name) => `<${name}>`).join(' ');
    throw new CliError(
      `"${command}" expects ${expected}, but got ${positionals.length} argument(s)`,
      true,
    );
  }
  return [...positionals];
}

export function parseLevel(value: string | undefined, flag: string): WcagLevel | undefined {
  if (value === undefined) return undefined;
  const level = value.toUpperCase();
  if (level === 'AA' || level === 'AAA') return level;
  throw new CliError(`${flag} must be AA or AAA, got "${value}"`, true);
}

/** Works out the target from --target, or from --level and --large. */
export function resolveTarget(values: {
  readonly target?: string | undefined;
  readonly level?: string | undefined;
  readonly large?: boolean | undefined;
}): Target {
  if (values.target !== undefined) {
    if (values.level !== undefined || values.large === true) {
      throw new CliError('use either --target or --level/--large, not both', true);
    }
    const ratio = Number(values.target);
    if (values.target.trim() === '' || !(ratio >= 1 && ratio <= 21)) {
      throw new CliError(`--target must be a number from 1 to 21, got "${values.target}"`, true);
    }
    return { ratio, description: `a ${ratio}:1 target` };
  }
  const level = parseLevel(values.level, '--level') ?? 'AA';
  const use: ContrastUse = values.large === true ? 'large-text' : 'text';
  return {
    ratio: requiredRatio(level, use),
    level,
    use,
    description: `${level} for ${use === 'text' ? 'normal' : 'large'} text`,
  };
}

/**
 * Lets people leave out the "#" of hex colors, since in most shells an unquoted "#"
 * starts a comment. No CSS color name consists only of hex digits, so this is unambiguous.
 */
export function colorArgument(value: string): string {
  return /^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? `#${value}` : value;
}

/** Hex for opaque colors; rgb() for translucent ones, which keeps alpha exact. */
export function displayColor(color: Rgb): string {
  return color.alpha < 1 ? formatRgb(color) : formatHex(color);
}

/** "PASS" or "FAIL", styled; the word carries the meaning, color only reinforces it. */
export function verdict(style: Style, pass: boolean): string {
  return pass ? style.pass('PASS') : style.fail('FAIL');
}

export function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
