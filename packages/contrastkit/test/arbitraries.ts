import fc from 'fast-check';
import type { Oklch, Rgb } from '../src/types';

/** A channel value in [0, 1]. */
export const unitInterval = fc.double({ min: 0, max: 1, noNaN: true });

/** An 8-bit channel value. */
export const byte = fc.integer({ min: 0, max: 255 });

/** An opaque sRGB color with arbitrary floating-point channels. */
export const opaqueRgb: fc.Arbitrary<Rgb> = fc.record({
  r: unitInterval,
  g: unitInterval,
  b: unitInterval,
  alpha: fc.constant(1),
});

/** An opaque sRGB color with 8-bit channels, i.e. anything a 6-digit hex code can express. */
export const opaqueRgb8: fc.Arbitrary<Rgb> = fc
  .tuple(byte, byte, byte)
  .map(([r, g, b]) => ({ r: r / 255, g: g / 255, b: b / 255, alpha: 1 }));

/** Any OKLCH color with lightness in [0, 1] and chroma up to 0.5, mostly outside sRGB. */
export const anyOklch: fc.Arbitrary<Oklch> = fc.record({
  l: unitInterval,
  c: fc.double({ min: 0, max: 0.5, noNaN: true }),
  h: fc.double({ min: 0, max: 360, maxExcluded: true, noNaN: true }),
  alpha: fc.constant(1),
});
