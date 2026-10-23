import { oklabDistance, oklchToOklab, oklchToRgb, rgbToOklab } from './convert';
import { InvalidArgumentError } from './errors';
import { clamp } from './math';
import type { Oklch, Rgb } from './types';

/**
 * How far a channel may stray outside [0, 1] and still count as in gamut.
 *
 * Ottosson's published OKLab matrices are only mutually consistent to about 6e-8 (the
 * product of M2 and its published inverse differs from the identity by up to 6.2e-8), so
 * a round trip sRGB → OKLab → sRGB can be off by ~2e-6. 1e-5 absorbs that while staying
 * far below one 8-bit step (1/255 ≈ 0.004).
 */
export const GAMUT_TOLERANCE = 1e-5;

/** CSS Color 4 treats a ΔE_OK below 0.02 as a just-noticeable difference (JND). */
export const JUST_NOTICEABLE_DIFFERENCE = 0.02;

/** The chroma search stops once its interval is this narrow (CSS Color 4's epsilon). */
const CHROMA_EPSILON = 0.0001;

/** True when every channel of `color` is within [0, 1], allowing {@link GAMUT_TOLERANCE}. */
export function isInGamut({ r, g, b }: Rgb): boolean {
  return [r, g, b].every((v) => v >= -GAMUT_TOLERANCE && v <= 1 + GAMUT_TOLERANCE);
}

/** Clamps every channel (and alpha) to [0, 1]. */
export function clampRgb({ r, g, b, alpha }: Rgb): Rgb {
  return { r: clamp(r, 0, 1), g: clamp(g, 0, 1), b: clamp(b, 0, 1), alpha: clamp(alpha, 0, 1) };
}

/**
 * Rounds every channel to the nearest 8-bit step (n / 255), the precision a hex code can
 * express. Alpha is left as is.
 */
export function quantizeRgb({ r, g, b, alpha }: Rgb): Rgb {
  const snap = (v: number): number => Math.round(clamp(v, 0, 1) * 255) / 255;
  return { r: snap(r), g: snap(g), b: snap(b), alpha };
}

/**
 * Converts an OKLCH color to sRGB, bringing out-of-gamut colors inside by reducing
 * chroma while keeping lightness and hue — the gamut-mapping algorithm of CSS Color 4
 * ("binary search gamut mapping with local MINDE").
 *
 * Plain chroma reduction has one weakness: near some faces of the sRGB cube the
 * constant-hue path runs almost parallel to the boundary, so a color that is only a hair
 * outside can lose far more chroma than necessary. CSS Color 4 therefore also accepts the
 * simply clipped color whenever clipping changes it by less than a just-noticeable
 * difference (ΔE_OK < 0.02). The steps:
 *
 * 1. Lightness ≥ 1 is white and ≤ 0 is black; colors already in gamut are returned as is.
 * 2. If clipping the channels to [0, 1] moves the color by less than a JND, use the clip.
 * 3. Otherwise binary-search chroma between 0 (a gray, always in gamut) and the original.
 *    A midpoint that is in gamut raises the lower bound. An out-of-gamut midpoint whose
 *    clip is within a JND also raises it (and the search returns as soon as the clip is
 *    within epsilon of exactly one JND); one whose clip is further away lowers the upper bound.
 *
 * The result is always inside sRGB and within one JND of a color with the original
 * lightness and hue and no more than the original chroma.
 *
 * @throws {@link InvalidArgumentError} if a component is not finite or chroma is negative.
 */
export function gamutMapOklch(color: Oklch): Rgb {
  const { l, c, h } = color;
  if (![l, c, h, color.alpha].every(Number.isFinite) || c < 0) {
    throw new InvalidArgumentError(
      `OKLCH components must be finite numbers with chroma >= 0, got l=${l}, c=${c}, h=${h}, alpha=${color.alpha}`,
    );
  }
  const alpha = clamp(color.alpha, 0, 1);
  if (l >= 1) return { r: 1, g: 1, b: 1, alpha };
  if (l <= 0) return { r: 0, g: 0, b: 0, alpha };

  const origin: Oklch = { l, c, h, alpha };
  const direct = oklchToRgb(origin);
  if (isInGamut(direct)) return clampRgb(direct);

  // How far clipping moves `target`, plus the clipped color itself.
  const clip = (target: Oklch, rgb: Rgb): [Rgb, number] => {
    const clipped = clampRgb(rgb);
    return [clipped, oklabDistance(rgbToOklab(clipped), oklchToOklab(target))];
  };

  let [clipped, error] = clip(origin, direct);
  if (error < JUST_NOTICEABLE_DIFFERENCE) return clipped;

  let min = 0;
  let max = c;
  let minInGamut = true;
  while (max - min > CHROMA_EPSILON) {
    const current: Oklch = { l, c: (min + max) / 2, h, alpha };
    const rgb = oklchToRgb(current);
    if (minInGamut && isInGamut(rgb)) {
      min = current.c;
      continue;
    }
    [clipped, error] = clip(current, rgb);
    if (error < JUST_NOTICEABLE_DIFFERENCE) {
      if (JUST_NOTICEABLE_DIFFERENCE - error < CHROMA_EPSILON) return clipped;
      minInGamut = false;
      min = current.c;
    } else {
      max = current.c;
    }
  }
  return clipped;
}
