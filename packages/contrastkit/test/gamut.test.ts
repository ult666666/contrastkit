import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { oklchToOklab, rgbToOklab, rgbToOklch } from '../src/convert';
import { InvalidArgumentError } from '../src/errors';
import { formatHex } from '../src/format';
import {
  clampRgb,
  GAMUT_TOLERANCE,
  gamutMapOklch,
  isInGamut,
  JUST_NOTICEABLE_DIFFERENCE,
  quantizeRgb,
} from '../src/gamut';
import type { Oklab, Oklch } from '../src/types';
import { anyOklch, opaqueRgb } from './arbitraries';

const isStrictlyInGamut = ({ r, g, b }: { r: number; g: number; b: number }): boolean =>
  [r, g, b].every((v) => v >= 0 && v <= 1);

/**
 * Distance in OKLab from `point` to the segment of colors with the same lightness and hue
 * as `origin` and chroma between 0 and origin's chroma. The segment is a straight line in
 * OKLab, from the gray at origin's lightness out to origin itself.
 */
function distanceToChromaSegment(point: Oklab, origin: Oklch): number {
  const end = oklchToOklab(origin);
  const [dx, dy] = [end.a, end.b];
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(1, Math.max(0, (point.a * dx + point.b * dy) / lengthSquared));
  return Math.hypot(point.l - origin.l, point.a - t * dx, point.b - t * dy);
}

describe('isInGamut', () => {
  it('accepts channels in [0, 1] plus a tiny tolerance for rounding noise', () => {
    expect(isInGamut({ r: 0, g: 0.5, b: 1, alpha: 1 })).toBe(true);
    expect(isInGamut({ r: 1 + GAMUT_TOLERANCE / 2, g: -GAMUT_TOLERANCE / 2, b: 0, alpha: 1 })).toBe(
      true,
    );
    expect(isInGamut({ r: 1.001, g: 0, b: 0, alpha: 1 })).toBe(false);
    expect(isInGamut({ r: 0, g: -0.001, b: 0, alpha: 1 })).toBe(false);
  });
});

describe('clampRgb and quantizeRgb', () => {
  it('clamps channels and alpha into [0, 1]', () => {
    expect(clampRgb({ r: -0.2, g: 0.5, b: 1.3, alpha: 2 })).toEqual({
      r: 0,
      g: 0.5,
      b: 1,
      alpha: 1,
    });
  });

  it('snaps channels to 8-bit steps and leaves alpha alone', () => {
    const snapped = quantizeRgb({ r: 0.5, g: 0.1, b: 1.2, alpha: 0.3 });
    expect(snapped).toEqual({ r: 128 / 255, g: 26 / 255, b: 1, alpha: 0.3 });
  });
});

describe('gamutMapOklch (CSS Color 4 algorithm)', () => {
  it('returns in-gamut colors unchanged', () => {
    fc.assert(
      fc.property(opaqueRgb, (color) => {
        const mapped = gamutMapOklch(rgbToOklch(color));
        expect(mapped.r).toBeCloseTo(color.r, 5);
        expect(mapped.g).toBeCloseTo(color.g, 5);
        expect(mapped.b).toBeCloseTo(color.b, 5);
      }),
    );
  });

  it('maps lightness at or beyond the ends of the range to white and black', () => {
    expect(gamutMapOklch({ l: 1.2, c: 0.3, h: 40, alpha: 0.5 })).toEqual({
      r: 1,
      g: 1,
      b: 1,
      alpha: 0.5,
    });
    expect(gamutMapOklch({ l: 0, c: 0.3, h: 40, alpha: 1 })).toEqual({
      r: 0,
      g: 0,
      b: 0,
      alpha: 1,
    });
  });

  it('always returns a color inside sRGB', () => {
    fc.assert(
      fc.property(anyOklch, (color) => {
        expect(isStrictlyInGamut(gamutMapOklch(color))).toBe(true);
      }),
    );
  });

  it('stays within one JND of the original lightness/hue line with no more chroma', () => {
    fc.assert(
      fc.property(anyOklch, (color) => {
        fc.pre(color.l > 0 && color.l < 1);
        const mapped = rgbToOklab(gamutMapOklch(color));
        expect(distanceToChromaSegment(mapped, color)).toBeLessThan(
          JUST_NOTICEABLE_DIFFERENCE + 1e-6,
        );
      }),
    );
  });

  it('clips colors that are only a hair outside sRGB instead of desaturating them', () => {
    // #0006bb, written with display precision, lands just outside sRGB. Pure chroma
    // reduction at constant hue turned it into #001fac (25 steps off in green);
    // the JND clipping step brings it back exactly.
    expect(formatHex(gamutMapOklch({ l: 0.3611, c: 0.246, h: 264.11, alpha: 1 }))).toBe('#0006bb');
  });

  it('reduces chroma for colors far outside sRGB', () => {
    const mapped = rgbToOklch(gamutMapOklch({ l: 0.7, c: 0.4, h: 150, alpha: 1 }));
    expect(mapped.c).toBeLessThan(0.25);
    expect(mapped.l).toBeCloseTo(0.7, 1);
    expect(Math.abs(mapped.h - 150)).toBeLessThan(5);
  });

  it('rejects non-finite components and negative chroma', () => {
    expect(() => gamutMapOklch({ l: Number.NaN, c: 0.1, h: 0, alpha: 1 })).toThrow(
      InvalidArgumentError,
    );
    expect(() => gamutMapOklch({ l: 0.5, c: -0.1, h: 0, alpha: 1 })).toThrow(/chroma >= 0/);
  });
});
