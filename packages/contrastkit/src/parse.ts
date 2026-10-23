import { hslToRgb } from './convert';
import { ColorParseError, InvalidArgumentError } from './errors';
import { clampRgb, gamutMapOklch } from './gamut';
import { clamp, normalizeHue } from './math';
import { NAMED_COLORS } from './named-colors';
import type { ColorInput, Rgb } from './types';

/** A CSS `<number>`: optional sign, digits with an optional fraction, optional exponent. */
const NUMBER_PATTERN = /^[+-]?(?:\d+|\d*\.\d+)(?:e[+-]?\d+)?$/;

/** In oklch(), a chroma of 100% means 0.4 (CSS Color 4). */
const OKLCH_CHROMA_AT_100_PERCENT = 0.4;

/** The result of {@link tryParseColor}: the color, or the error explaining why parsing failed. */
export type ParseResult =
  | { readonly ok: true; readonly color: Rgb }
  | { readonly ok: false; readonly error: ColorParseError };

/**
 * Parses a CSS color string into sRGB.
 *
 * Supported syntax (CSS Color Module Level 4), case-insensitive, surrounding whitespace ignored:
 * - hex: `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`
 * - `rgb()` / `rgba()` in the legacy comma syntax (`rgb(255, 0, 0)`) and the modern space
 *   syntax (`rgb(255 0 0 / 50%)`), with numbers (0–255) or percentages
 * - `hsl()` / `hsla()`, with hue in degrees or with a `deg`, `grad`, `rad` or `turn` unit
 * - `oklch()`, with lightness as a number (0–1) or percentage and chroma as a number or a
 *   percentage (100% = 0.4); colors outside sRGB are mapped in with {@link gamutMapOklch}
 * - the 148 CSS named colors and `transparent`
 *
 * Out-of-range values are clamped, as CSS does: `rgb(300 0 0)` is red.
 *
 * @throws {@link ColorParseError} with a specific reason when the input is not a supported color.
 */
export function parseColor(input: string): Rgb {
  const text = input.trim().toLowerCase();
  if (text === '') throw new ColorParseError(input, 'the input is empty');
  if (text.startsWith('#')) return parseHex(input, text.slice(1));

  const call = /^([a-z-]+)\((.*)\)$/s.exec(text);
  if (call) {
    const [, name = '', body = ''] = call;
    return parseFunction(input, name, body);
  }
  return parseKeyword(input, text);
}

/** Like {@link parseColor}, but returns a result object instead of throwing on bad input. */
export function tryParseColor(input: string): ParseResult {
  try {
    return { ok: true, color: parseColor(input) };
  } catch (error) {
    if (error instanceof ColorParseError) return { ok: false, error };
    throw error;
  }
}

/**
 * Normalizes any accepted color input to {@link Rgb}: strings are parsed, objects are
 * checked. This is the validation step every public function runs on its color arguments.
 *
 * @throws {@link ColorParseError} for unparseable strings.
 * @throws {@link InvalidArgumentError} for objects that are not valid {@link Rgb} values.
 */
export function toRgb(input: ColorInput): Rgb {
  if (typeof input === 'string') return parseColor(input);
  // The static type says Rgb, but JavaScript callers can pass anything; check at runtime.
  return validateRgb(input);
}

function validateRgb(value: unknown): Rgb {
  if (typeof value !== 'object' || value === null) {
    throw new InvalidArgumentError(
      `Expected a CSS color string or an { r, g, b, alpha } object, got ${String(value)}`,
    );
  }
  const record = value as Record<string, unknown>;
  const channel = (key: 'r' | 'g' | 'b' | 'alpha'): number => {
    const v = record[key];
    if (typeof v !== 'number' || !(v >= 0 && v <= 1)) {
      throw new InvalidArgumentError(`Rgb.${key} must be a number from 0 to 1, got ${String(v)}`);
    }
    return v;
  };
  return { r: channel('r'), g: channel('g'), b: channel('b'), alpha: channel('alpha') };
}

function parseHex(input: string, digits: string): Rgb {
  if (!/^[0-9a-f]*$/.test(digits)) {
    throw new ColorParseError(input, 'hex colors may only contain the digits 0-9 and a-f');
  }
  const byte = (text: string): number => parseInt(text, 16) / 255;
  switch (digits.length) {
    case 3:
    case 4: {
      // Short form: each digit is doubled, so #f80 means #ff8800.
      const doubled = (index: number): number => byte(digits.charAt(index).repeat(2));
      return {
        r: doubled(0),
        g: doubled(1),
        b: doubled(2),
        alpha: digits.length === 4 ? doubled(3) : 1,
      };
    }
    case 6:
    case 8:
      return {
        r: byte(digits.slice(0, 2)),
        g: byte(digits.slice(2, 4)),
        b: byte(digits.slice(4, 6)),
        alpha: digits.length === 8 ? byte(digits.slice(6, 8)) : 1,
      };
    default:
      throw new ColorParseError(input, `hex colors need 3, 4, 6 or 8 digits, got ${digits.length}`);
  }
}

function parseFunction(input: string, name: string, body: string): Rgb {
  switch (name) {
    case 'rgb':
    case 'rgba':
      return parseRgbFunction(input, body);
    case 'hsl':
    case 'hsla':
      return parseHslFunction(input, body);
    case 'oklch':
      return parseOklchFunction(input, body);
    default:
      throw new ColorParseError(
        input,
        `${name}() is not supported; use hex, rgb(), hsl(), oklch() or a color name`,
      );
  }
}

interface FunctionArguments {
  readonly channels: readonly [string, string, string];
  readonly alpha: string | undefined;
  /** True for the comma-separated syntax, which has stricter rules. */
  readonly legacy: boolean;
}

function isTriple<T>(values: readonly T[]): values is readonly [T, T, T] {
  return values.length === 3;
}

/** Splits the inside of `fn(...)` into three channel tokens and an optional alpha token. */
function splitArguments(input: string, body: string): FunctionArguments {
  if (body.includes(',')) {
    if (body.includes('/')) {
      throw new ColorParseError(input, 'use either commas or " / " before alpha, not both');
    }
    const parts = body.split(',').map((part) => part.trim());
    if (parts.some((part) => part === '' || /\s/.test(part))) {
      throw new ColorParseError(input, 'each comma-separated value must be a single token');
    }
    const channels = parts.slice(0, 3);
    if (!isTriple(channels) || parts.length > 4) {
      throw new ColorParseError(
        input,
        `expected 3 or 4 comma-separated values, got ${parts.length}`,
      );
    }
    return { channels, alpha: parts[3], legacy: true };
  }

  const sections = body.split('/');
  if (sections.length > 2) throw new ColorParseError(input, 'expected at most one "/"');
  const [main = '', alphaText] = sections;
  const channels = main.split(/\s+/).filter((token) => token !== '');
  if (!isTriple(channels)) {
    throw new ColorParseError(input, `expected 3 space-separated values, got ${channels.length}`);
  }
  const alpha = alphaText?.trim();
  if (alpha !== undefined && (alpha === '' || /\s/.test(alpha))) {
    throw new ColorParseError(input, 'expected exactly one alpha value after "/"');
  }
  return { channels, alpha, legacy: false };
}

function parseNumber(token: string): number | undefined {
  if (!NUMBER_PATTERN.test(token)) return undefined;
  const value = Number(token);
  return Number.isFinite(value) ? value : undefined;
}

/** Parses "50%" as 0.5. Returns undefined for anything that is not a percentage. */
function parsePercentage(token: string): number | undefined {
  if (!token.endsWith('%')) return undefined;
  const value = parseNumber(token.slice(0, -1));
  return value === undefined ? undefined : value / 100;
}

function parseAlpha(input: string, token: string | undefined): number {
  if (token === undefined) return 1;
  const value = parseNumber(token) ?? parsePercentage(token);
  if (value === undefined) {
    throw new ColorParseError(input, `alpha must be a number or percentage, got "${token}"`);
  }
  return clamp(value, 0, 1);
}

const ANGLE_UNIT_TO_DEGREES = new Map([
  ['deg', 1],
  ['grad', 0.9],
  ['rad', 180 / Math.PI],
  ['turn', 360],
]);

function parseHue(input: string, token: string): number {
  const plain = parseNumber(token);
  if (plain !== undefined) return normalizeHue(plain);

  const [, amount = '', unit = ''] = /^(.*?)(deg|grad|rad|turn)$/.exec(token) ?? [];
  const value = parseNumber(amount);
  const degreesPerUnit = ANGLE_UNIT_TO_DEGREES.get(unit);
  if (value === undefined || degreesPerUnit === undefined) {
    throw new ColorParseError(
      input,
      `hue must be a number or an angle in deg, grad, rad or turn, got "${token}"`,
    );
  }
  return normalizeHue(value * degreesPerUnit);
}

function parseRgbFunction(input: string, body: string): Rgb {
  const { channels, alpha, legacy } = splitArguments(input, body);
  if (legacy) {
    const percentages = channels.filter((token) => token.endsWith('%')).length;
    if (percentages !== 0 && percentages !== 3) {
      throw new ColorParseError(input, 'the comma syntax cannot mix numbers and percentages');
    }
  }
  const [red, green, blue] = channels;
  return {
    r: rgbChannel(input, red, 'red'),
    g: rgbChannel(input, green, 'green'),
    b: rgbChannel(input, blue, 'blue'),
    alpha: parseAlpha(input, alpha),
  };
}

function rgbChannel(input: string, token: string, name: string): number {
  const fraction = parsePercentage(token) ?? mapParsed(parseNumber(token), (n) => n / 255);
  if (fraction === undefined) {
    throw new ColorParseError(
      input,
      `${name} must be a number from 0 to 255 or a percentage, got "${token}"`,
    );
  }
  return clamp(fraction, 0, 1);
}

/** Applies `transform` to a parsed number, passing `undefined` (a failed parse) through. */
function mapParsed(
  value: number | undefined,
  transform: (n: number) => number,
): number | undefined {
  return value === undefined ? undefined : transform(value);
}

function parseHslFunction(input: string, body: string): Rgb {
  const { channels, alpha, legacy } = splitArguments(input, body);
  const [hueToken, saturationToken, lightnessToken] = channels;
  const color = hslToRgb({
    h: parseHue(input, hueToken),
    s: hslPercentage(input, saturationToken, 'saturation', legacy),
    l: hslPercentage(input, lightnessToken, 'lightness', legacy),
    alpha: parseAlpha(input, alpha),
  });
  return clampRgb(color);
}

function hslPercentage(input: string, token: string, name: string, legacy: boolean): number {
  // The legacy comma syntax requires percentages; the modern syntax also accepts plain
  // numbers, read as percentages (CSS Color 4).
  const fraction =
    parsePercentage(token) ?? (legacy ? undefined : mapParsed(parseNumber(token), (n) => n / 100));
  if (fraction === undefined) {
    const expected = legacy ? 'a percentage' : 'a percentage or number';
    throw new ColorParseError(input, `${name} must be ${expected}, got "${token}"`);
  }
  return clamp(fraction, 0, 1);
}

function parseOklchFunction(input: string, body: string): Rgb {
  const { channels, alpha, legacy } = splitArguments(input, body);
  if (legacy) throw new ColorParseError(input, 'oklch() separates values with spaces, not commas');
  const [lightnessToken, chromaToken, hueToken] = channels;

  const lightness = parseNumber(lightnessToken) ?? parsePercentage(lightnessToken);
  if (lightness === undefined) {
    throw new ColorParseError(
      input,
      `lightness must be a number from 0 to 1 or a percentage, got "${lightnessToken}"`,
    );
  }
  const chroma =
    parseNumber(chromaToken) ??
    mapParsed(parsePercentage(chromaToken), (p) => p * OKLCH_CHROMA_AT_100_PERCENT);
  if (chroma === undefined) {
    throw new ColorParseError(
      input,
      `chroma must be a number or a percentage, got "${chromaToken}"`,
    );
  }
  return gamutMapOklch({
    l: clamp(lightness, 0, 1),
    c: Math.max(0, chroma),
    h: parseHue(input, hueToken),
    alpha: parseAlpha(input, alpha),
  });
}

function parseKeyword(input: string, name: string): Rgb {
  if (name === 'transparent') return { r: 0, g: 0, b: 0, alpha: 0 };
  const hex = NAMED_COLORS.get(name);
  if (hex !== undefined) return parseHex(input, hex.slice(1));

  if (name === 'currentcolor') {
    throw new ColorParseError(input, 'currentcolor depends on where it is used');
  }
  if (/^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(name)) {
    throw new ColorParseError(input, `hex colors start with "#" (did you mean "#${name}"?)`);
  }
  // Catch the most common slip, writing "light gray" or "dark-blue" for "lightgray".
  const compact = name.replace(/[\s_-]+/g, '');
  if (NAMED_COLORS.has(compact)) {
    throw new ColorParseError(input, `unknown color name (did you mean "${compact}"?)`);
  }
  throw new ColorParseError(
    input,
    'expected a hex color, rgb(), hsl(), oklch() or a CSS color name',
  );
}
