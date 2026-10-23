import { oklabDistance, rgbToOklab } from './convert';
import { toRgb } from './parse';
import type { ColorInput } from './types';

/**
 * ΔE_OK between two colors given as CSS strings or {@link Rgb} objects: their distance in
 * OKLab (see {@link oklabDistance}). Alpha is ignored.
 *
 * @example deltaEOK('#ff0000', '#ee0000') // ≈ 0.035
 */
export function deltaEOK(a: ColorInput, b: ColorInput): number {
  return oklabDistance(rgbToOklab(toRgb(a)), rgbToOklab(toRgb(b)));
}
