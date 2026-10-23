import { describe, expect, it } from 'vitest';
import { ColorParseError, InvalidArgumentError } from '../src/errors';
import { formatHex } from '../src/format';
import { NAMED_COLORS } from '../src/named-colors';
import { parseColor, toRgb, tryParseColor } from '../src/parse';
import { rgbToOklch } from '../src/convert';

const hexOf = (input: string): string => formatHex(parseColor(input));

describe('parseColor: hex', () => {
  it.each([
    ['#f80', '#ff8800'],
    ['#F80', '#ff8800'],
    ['#f808', '#ff880088'],
    ['#ff8800', '#ff8800'],
    ['#FF880080', '#ff880080'],
    ['  #ff8800  ', '#ff8800'],
  ])('parses %s', (input, expected) => {
    expect(hexOf(input)).toBe(expected);
  });

  it('reads channels as n / 255', () => {
    expect(parseColor('#7f0080')).toEqual({ r: 127 / 255, g: 0, b: 128 / 255, alpha: 1 });
  });

  it.each([
    ['#12', /need 3, 4, 6 or 8 digits, got 2/],
    ['#12345', /got 5/],
    ['#ggg', /only contain the digits/],
    ['#', /got 0/],
  ])('rejects %s', (input, message) => {
    expect(() => parseColor(input)).toThrow(message);
  });
});

describe('parseColor: rgb() and rgba()', () => {
  it.each([
    ['rgb(255, 136, 0)', '#ff8800'],
    ['rgba(255, 136, 0, 0.5)', '#ff880080'],
    ['rgb(100%, 50%, 0%)', '#ff8000'],
    ['rgb(255 136 0)', '#ff8800'],
    ['rgb(255 136 0 / 50%)', '#ff880080'],
    ['rgba(255 136 0 / .5)', '#ff880080'],
    ['RGB(255 136 0)', '#ff8800'],
    ['rgb(100% 136 0)', '#ff8800'],
    ['rgb(2.55e2 0 0)', '#ff0000'],
  ])('parses %s', (input, expected) => {
    expect(hexOf(input)).toBe(expected);
  });

  it('clamps out-of-range values like CSS does', () => {
    expect(parseColor('rgb(300 -20 0 / 1.5)')).toEqual({ r: 1, g: 0, b: 0, alpha: 1 });
  });

  it('keeps fractional channel values', () => {
    expect(parseColor('rgb(127.5 0 0)').r).toBe(0.5);
  });

  it.each([
    ['rgb(255, 0)', /expected 3 or 4 comma-separated values, got 2/],
    ['rgb(1, 2, 3, 4, 5)', /got 5/],
    ['rgb(255, 0, 0 / 1)', /either commas or/],
    ['rgb(255 0)', /expected 3 space-separated values, got 2/],
    ['rgb()', /got 0/],
    ['rgb(255, 50%, 0)', /cannot mix numbers and percentages/],
    ['rgb(255 0 0 / 1 / 1)', /at most one "\/"/],
    ['rgb(255 0 0 / )', /exactly one alpha value/],
    ['rgb(255,, 0)', /single token/],
    ['rgb(red 0 0)', /red must be a number from 0 to 255 or a percentage, got "red"/],
    ['rgb(255 0 0 / half)', /alpha must be a number or percentage, got "half"/],
    ['rgb(1e999 0 0)', /red must be a number/],
  ])('rejects %s', (input, message) => {
    expect(() => parseColor(input)).toThrow(message);
  });
});

describe('parseColor: hsl() and hsla()', () => {
  it.each([
    ['hsl(120, 100%, 25%)', '#008000'],
    ['hsla(120, 100%, 25%, 0.5)', '#00800080'],
    ['hsl(120 100% 25%)', '#008000'],
    ['hsl(120deg 100% 25%)', '#008000'],
    ['hsl(133.333grad 100% 25%)', '#008000'],
    ['hsl(0.33333turn 100% 25%)', '#008000'],
    ['hsl(2.0944rad 100% 25%)', '#008000'],
    ['hsl(-240 100% 25%)', '#008000'],
    ['hsl(480 100% 25%)', '#008000'],
    ['hsl(120 100 25)', '#008000'],
    ['hsl(120 100% 25% / 25%)', '#00800040'],
  ])('parses %s', (input, expected) => {
    expect(hexOf(input)).toBe(expected);
  });

  it.each([
    ['hsl(120, 100, 25)', /saturation must be a percentage, got "100"/],
    ['hsl(120 lots 25%)', /saturation must be a percentage or number/],
    ['hsl(120 100% dim)', /lightness must be a percentage or number, got "dim"/],
    ['hsl(green 100% 25%)', /hue must be a number or an angle/],
    ['hsl(10px 100% 25%)', /hue must be a number or an angle/],
  ])('rejects %s', (input, message) => {
    expect(() => parseColor(input)).toThrow(message);
  });
});

describe('parseColor: oklch()', () => {
  it.each([
    ['oklch(0.627955 0.257683 29.2339)', '#ff0000'],
    ['oklch(62.7955% 0.257683 29.2339)', '#ff0000'],
    ['oklch(62.7955% 64.42% 29.2339deg)', '#ff0000'],
    ['oklch(1 0 0)', '#ffffff'],
    ['oklch(0 0 0)', '#000000'],
    ['oklch(0.5 0 0 / 0.5)', '#63636380'],
  ])('parses %s', (input, expected) => {
    expect(hexOf(input)).toBe(expected);
  });

  it('maps colors outside sRGB into gamut, keeping lightness and hue within a JND', () => {
    const lch = rgbToOklch(parseColor('oklch(0.7 0.4 150)'));
    expect(Math.abs(lch.l - 0.7)).toBeLessThan(0.02);
    expect(Math.abs(lch.h - 150)).toBeLessThan(5);
    expect(lch.c).toBeLessThan(0.25);
  });

  it('clamps lightness to [0, 1] and negative chroma to 0', () => {
    expect(hexOf('oklch(150% 0.1 30)')).toBe('#ffffff');
    expect(hexOf('oklch(0.5 -0.1 30)')).toBe('#636363');
  });

  it.each([
    ['oklch(0.5, 0.1, 30)', /spaces, not commas/],
    ['oklch(bright 0.1 30)', /lightness must be a number from 0 to 1 or a percentage/],
    ['oklch(0.5 vivid 30)', /chroma must be a number or a percentage/],
  ])('rejects %s', (input, message) => {
    expect(() => parseColor(input)).toThrow(message);
  });
});

describe('parseColor: keywords', () => {
  it('knows all 148 CSS named colors', () => {
    expect(NAMED_COLORS.size).toBe(148);
    expect(hexOf('rebeccapurple')).toBe('#663399');
    expect(hexOf('DarkSlateGrey')).toBe('#2f4f4f');
    expect(hexOf('  white ')).toBe('#ffffff');
  });

  it('parses transparent as fully transparent black', () => {
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, alpha: 0 });
  });

  it.each([
    ['', /the input is empty/],
    ['   ', /the input is empty/],
    ['currentColor', /depends on where it is used/],
    ['ff8800', /hex colors start with "#" \(did you mean "#ff8800"\?\)/],
    ['light gray', /did you mean "lightgray"/],
    ['Dark-Blue', /did you mean "darkblue"/],
    ['constructor', /expected a hex color, rgb\(\), hsl\(\), oklch\(\) or a CSS color name/],
    ['lab(50% 40 30)', /lab\(\) is not supported/],
  ])('rejects %j with a helpful reason', (input, message) => {
    expect(() => parseColor(input)).toThrow(message);
  });

  it('throws ColorParseError carrying the original input', () => {
    try {
      parseColor('nope');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ColorParseError);
      expect((error as ColorParseError).input).toBe('nope');
    }
  });
});

describe('tryParseColor', () => {
  it('returns the color on success', () => {
    expect(tryParseColor('#000')).toEqual({ ok: true, color: { r: 0, g: 0, b: 0, alpha: 1 } });
  });

  it('returns the error instead of throwing', () => {
    const result = tryParseColor('#00');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(ColorParseError);
  });
});

describe('toRgb', () => {
  it('parses strings and passes valid Rgb objects through', () => {
    expect(toRgb('#fff')).toEqual({ r: 1, g: 1, b: 1, alpha: 1 });
    expect(toRgb({ r: 0.1, g: 0.2, b: 0.3, alpha: 0.4 })).toEqual({
      r: 0.1,
      g: 0.2,
      b: 0.3,
      alpha: 0.4,
    });
  });

  it.each([
    [null, /Expected a CSS color string or an \{ r, g, b, alpha \} object, got null/],
    [42, /got 42/],
    [{ r: 0, g: 0, b: 0 }, /Rgb.alpha must be a number from 0 to 1, got undefined/],
    [{ r: 255, g: 0, b: 0, alpha: 1 }, /Rgb.r must be a number from 0 to 1, got 255/],
    [{ r: 0, g: Number.NaN, b: 0, alpha: 1 }, /Rgb.g must be a number from 0 to 1, got NaN/],
  ])('rejects %j', (value, message) => {
    expect(() => toRgb(value as never)).toThrow(InvalidArgumentError);
    expect(() => toRgb(value as never)).toThrow(message);
  });
});
