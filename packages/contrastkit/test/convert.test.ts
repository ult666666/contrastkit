import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  hslToRgb,
  linearChannelToSrgb,
  linearRgbToOklab,
  oklabToLinearRgb,
  oklabToOklch,
  oklchToOklab,
  oklchToRgb,
  rgbToHsl,
  rgbToLinear,
  rgbToOklab,
  rgbToOklch,
  srgbChannelToLinear,
} from '../src/convert';
import { formatHex } from '../src/format';
import { parseColor } from '../src/parse';
import { byte, opaqueRgb, unitInterval } from './arbitraries';

describe('sRGB transfer function', () => {
  it('keeps the endpoints fixed', () => {
    expect(srgbChannelToLinear(0)).toBe(0);
    expect(srgbChannelToLinear(1)).toBe(1);
    expect(linearChannelToSrgb(0)).toBe(0);
    expect(linearChannelToSrgb(1)).toBeCloseTo(1, 15);
  });

  it('matches the IEC 61966-2-1 formula on both segments', () => {
    // Linear segment: below the 0.04045 threshold the curve is a straight line.
    expect(srgbChannelToLinear(0.04)).toBeCloseTo(0.04 / 12.92, 15);
    // Power segment: ((0.5 + 0.055) / 1.055) ^ 2.4.
    expect(srgbChannelToLinear(0.5)).toBeCloseTo(0.214041140482232, 14);
  });

  it('is continuous at the 0.04045 threshold', () => {
    const below = srgbChannelToLinear(0.04045);
    const above = srgbChannelToLinear(0.04045 + 1e-12);
    expect(Math.abs(above - below)).toBeLessThan(1e-7);
  });

  it('mirrors negative values so out-of-gamut math stays defined', () => {
    expect(srgbChannelToLinear(-0.5)).toBe(-srgbChannelToLinear(0.5));
    expect(linearChannelToSrgb(-0.2)).toBe(-linearChannelToSrgb(0.2));
  });

  it('round-trips every value in [0, 1]', () => {
    fc.assert(
      fc.property(unitInterval, (v) => {
        expect(linearChannelToSrgb(srgbChannelToLinear(v))).toBeCloseTo(v, 12);
      }),
    );
  });
});

describe('OKLab and OKLCH (Ottosson 2020)', () => {
  it('maps white to L = 1, a = b = 0 and black to the origin', () => {
    const white = rgbToOklab({ r: 1, g: 1, b: 1, alpha: 1 });
    expect(white.l).toBeCloseTo(1, 7);
    expect(white.a).toBeCloseTo(0, 7);
    expect(white.b).toBeCloseTo(0, 7);
    expect(rgbToOklab({ r: 0, g: 0, b: 0, alpha: 1 })).toEqual({ l: 0, a: 0, b: 0, alpha: 1 });
  });

  it('gives neutral grays a = b = 0 and L = cube root of their linear value', () => {
    // M1's rows and M2's first row each sum to 1, so a gray with linear value y has
    // l = m = s = y and L = cbrt(y). This follows from the matrices, not from the code.
    fc.assert(
      fc.property(byte, (n) => {
        const v = n / 255;
        const lab = rgbToOklab({ r: v, g: v, b: v, alpha: 1 });
        expect(lab.l).toBeCloseTo(Math.cbrt(srgbChannelToLinear(v)), 7);
        expect(Math.abs(lab.a)).toBeLessThan(1e-7);
        expect(Math.abs(lab.b)).toBeLessThan(1e-7);
      }),
    );
  });

  // Captured from Chromium 152 during development: `oklch(from <hex> l c h)` resolved by the
  // browser's CSS engine. Chromium converts via CIE XYZ with CSS Color 4's matrices rather
  // than Ottosson's direct sRGB matrices, so the two agree to ~1e-4, not exactly.
  const chromiumOklch: [hex: string, l: number, c: number, h: number][] = [
    ['#ff0000', 0.627966, 0.257704, 29.2346],
    ['#00ff00', 0.866435, 0.294791, 142.489],
    ['#0000ff', 0.451981, 0.31321, 264.051],
    ['#ff00ff', 0.701669, 0.322502, 328.37],
    ['#123456', 0.319161, 0.0724438, 251.176],
    ['#fedcba', 0.914388, 0.0586045, 66.9518],
    ['#2ce2b5', 0.816095, 0.15251, 170.679],
    ['#d12c28', 0.561414, 0.201253, 27.6125],
    ['#516081', 0.490042, 0.0563923, 265.478],
    ['#f16e05', 0.685742, 0.184723, 48.2654],
  ];

  it.each(chromiumOklch)('converts %s like an independent CSS engine', (hex, l, c, h) => {
    const mine = rgbToOklab(parseColor(hex));
    const reference = oklchToOklab({ l, c, h, alpha: 1 });
    const distance = Math.hypot(mine.l - reference.l, mine.a - reference.a, mine.b - reference.b);
    expect(distance).toBeLessThan(1e-4);
  });

  it('pins the OKLCH coordinates of pure red (regression check for the matrices)', () => {
    // The commonly cited value is oklch(62.8% 0.2577 29.23); these are the full digits that
    // Ottosson's matrices produce, so any accidental edit to a coefficient fails here.
    const red = rgbToOklch({ r: 1, g: 0, b: 0, alpha: 1 });
    expect(red.l).toBeCloseTo(0.6279554, 7);
    expect(red.c).toBeCloseTo(0.2576833, 7);
    expect(red.h).toBeCloseTo(29.2338851, 4);
  });

  it('round-trips linear RGB through OKLab to within the published matrices’ precision', () => {
    // Ottosson's M2 times its published inverse differs from the identity by up to 6.2e-8,
    // so round trips are accurate to ~3e-7 in linear light (and ~2e-6 after sRGB encoding).
    fc.assert(
      fc.property(unitInterval, unitInterval, unitInterval, (r, g, b) => {
        const back = oklabToLinearRgb(linearRgbToOklab({ r, g, b }));
        expect(
          Math.max(Math.abs(back.r - r), Math.abs(back.g - g), Math.abs(back.b - b)),
        ).toBeLessThan(1e-6);
      }),
    );
  });

  it('round-trips sRGB → OKLCH → sRGB to within the matrices’ precision', () => {
    fc.assert(
      fc.property(opaqueRgb, (color) => {
        const back = oklchToRgb(rgbToOklch(color));
        expect(back.r).toBeCloseTo(color.r, 5);
        expect(back.g).toBeCloseTo(color.g, 5);
        expect(back.b).toBeCloseTo(color.b, 5);
      }),
    );
  });

  it('round-trips OKLCH → OKLab → OKLCH for chromatic colors', () => {
    const lch = fc.record({
      l: unitInterval,
      c: fc.double({ min: 0.01, max: 0.4, noNaN: true }),
      h: fc.double({ min: 0, max: 360, maxExcluded: true, noNaN: true }),
      alpha: fc.constant(1),
    });
    fc.assert(
      fc.property(lch, (color) => {
        const back = oklabToOklch(oklchToOklab(color));
        expect(back.l).toBeCloseTo(color.l, 12);
        expect(back.c).toBeCloseTo(color.c, 12);
        // Compare hues on the circle, so 359.9999 and 0 count as close.
        const hueDifference = Math.abs(((back.h - color.h + 540) % 360) - 180);
        expect(hueDifference).toBeLessThan(1e-9);
      }),
    );
  });

  it('reports hue 0 for neutral colors and keeps hue within [0, 360)', () => {
    expect(rgbToOklch({ r: 0.5, g: 0.5, b: 0.5, alpha: 1 }).h).toBe(0);
    expect(oklabToOklch({ l: 0.5, a: 0.1, b: -0.0001, alpha: 1 }).h).toBeGreaterThan(359);
    expect(oklabToOklch({ l: 0.5, a: 0.1, b: -0.0001, alpha: 1 }).h).toBeLessThan(360);
  });

  it('carries alpha through every conversion', () => {
    const color = { r: 0.2, g: 0.4, b: 0.6, alpha: 0.25 };
    expect(rgbToOklch(color).alpha).toBe(0.25);
    expect(oklchToRgb(rgbToOklch(color)).alpha).toBe(0.25);
    expect(rgbToHsl(color).alpha).toBe(0.25);
  });

  it('rgbToLinear drops alpha and linearizes each channel', () => {
    expect(rgbToLinear({ r: 1, g: 0.5, b: 0, alpha: 0.3 })).toEqual({
      r: 1,
      g: srgbChannelToLinear(0.5),
      b: 0,
    });
  });
});

describe('HSL', () => {
  it.each([
    ['hsl(0 100% 50%)', '#ff0000'],
    ['hsl(120 100% 25%)', '#008000'],
    ['hsl(210 50% 40%)', '#336699'],
    ['hsl(300 100% 50%)', '#ff00ff'],
  ])('converts %s to %s', (hsl, hex) => {
    expect(formatHex(parseColor(hsl))).toBe(hex);
  });

  it('gives grays hue 0 and saturation 0', () => {
    expect(rgbToHsl({ r: 0.4, g: 0.4, b: 0.4, alpha: 1 })).toEqual({
      h: 0,
      s: 0,
      l: 0.4,
      alpha: 1,
    });
  });

  it('round-trips sRGB → HSL → sRGB', () => {
    fc.assert(
      fc.property(opaqueRgb, (color) => {
        const back = hslToRgb(rgbToHsl(color));
        expect(back.r).toBeCloseTo(color.r, 9);
        expect(back.g).toBeCloseTo(color.g, 9);
        expect(back.b).toBeCloseTo(color.b, 9);
      }),
    );
  });
});
