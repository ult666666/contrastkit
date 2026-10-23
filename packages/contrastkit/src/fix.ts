import { contrastRatio, MAX_CONTRAST_RATIO, requiredRatio } from './contrast';
import type { ContrastUse, WcagLevel } from './contrast';
import { oklabDistance, rgbToOklab, rgbToOklch } from './convert';
import { InvalidArgumentError } from './errors';
import { formatHex } from './format';
import { gamutMapOklch, quantizeRgb } from './gamut';
import { toRgb } from './parse';
import type { ColorInput, Rgb } from './types';

/** Options for {@link suggestFix}. */
export interface FixOptions {
  /** Contrast ratio to reach, from 1 to 21. Takes precedence over `level` and `use`. */
  readonly target?: number;
  /** WCAG level whose minimum to reach when no `target` is given. Default "AA". */
  readonly level?: WcagLevel;
  /** What the foreground is used for when no `target` is given. Default "text". */
  readonly use?: ContrastUse;
}

/** One suggested replacement for the foreground. */
export interface FixCandidate {
  /** The new foreground: 8-bit channels (exactly what `hex` says) and the original alpha. */
  readonly color: Rgb;
  readonly hex: string;
  /** Contrast of the new foreground against the background; always at least the target. */
  readonly ratio: number;
  /** ΔE_OK between the original and the new foreground: how visible the change is. */
  readonly deltaE: number;
  /** Whether the search made the foreground darker or lighter. */
  readonly direction: 'darker' | 'lighter';
}

/** The outcome of {@link suggestFix}, discriminated by `status`. */
export type FixResult =
  | {
      /** The pair already meets the target; nothing to fix. */
      readonly status: 'passes';
      readonly target: number;
      readonly ratio: number;
    }
  | {
      readonly status: 'fixed';
      readonly target: number;
      readonly ratio: number;
      /** One or two candidates (darker and/or lighter), closest to the original first. */
      readonly candidates: readonly [FixCandidate, ...FixCandidate[]];
    }
  | {
      /** No color with this hue, chroma and alpha reaches the target on this background. */
      readonly status: 'unachievable';
      readonly target: number;
      readonly ratio: number;
      /** The best ratio any lightness can reach (black or white at the original alpha). */
      readonly maxRatio: number;
    };

/** Binary search stops once the lightness interval is this narrow (well below one 8-bit step). */
const LIGHTNESS_PRECISION = 1e-5;
/** Upper bound on search steps; log2(1 / 1e-5) ≈ 17 are needed. */
const MAX_SEARCH_STEPS = 40;

/**
 * Suggests the closest foreground color that reaches a contrast target on `background`.
 *
 * Only the foreground's OKLCH lightness changes; hue and chroma are kept where the sRGB
 * gamut allows (chroma is reduced by gamut mapping near black and white) and alpha is kept
 * exactly. Because OKLCH lightness is perceptual, the smallest lightness change that passes
 * is usually the least noticeable fix.
 *
 * The search runs in both directions — darker (towards L = 0) and lighter (towards L = 1):
 * 1. If the end of a direction (black or white) does not reach the target, nothing in that
 *    direction can, since those two have the lowest and highest possible luminance.
 * 2. Otherwise binary-search the lightness between the original (fails) and the end
 *    (passes). Every probe is gamut-mapped and rounded to 8-bit, so the color returned is
 *    exactly what its hex code produces, and the invariant "upper bound passes" means
 *    the returned color has been measured to pass.
 * 3. Rank the passing candidates by ΔE_OK from the original foreground.
 *
 * The bisection assumes contrast changes monotonically along each direction, which holds
 * approximately; when it does not, the result still passes but may not be the very
 * closest passing color.
 *
 * @throws {@link InvalidArgumentError} for a target outside [1, 21], an unknown level or
 * use, or a translucent background.
 * @throws {@link ColorParseError} for unparseable color strings.
 */
export function suggestFix(
  foreground: ColorInput,
  background: ColorInput,
  options: FixOptions = {},
): FixResult {
  const target = resolveTarget(options);
  const front = toRgb(foreground);
  const back = toRgb(background);
  const ratio = contrastRatio(front, back);
  if (ratio >= target) return { status: 'passes', target, ratio };

  const origin = rgbToOklch(front);
  const originLab = rgbToOklab(front);
  const colorAt = (lightness: number): Rgb =>
    quantizeRgb(gamutMapOklch({ ...origin, l: lightness }));
  const passes = (lightness: number): boolean => contrastRatio(colorAt(lightness), back) >= target;

  const search = (end: 0 | 1): FixCandidate | undefined => {
    if (!passes(end)) return undefined;
    let failing = origin.l;
    let passing: number = end;
    for (let step = 0; step < MAX_SEARCH_STEPS; step++) {
      if (Math.abs(passing - failing) <= LIGHTNESS_PRECISION) break;
      const middle = (failing + passing) / 2;
      if (passes(middle)) passing = middle;
      else failing = middle;
    }
    const color = colorAt(passing);
    return {
      color,
      hex: formatHex(color),
      ratio: contrastRatio(color, back),
      deltaE: oklabDistance(originLab, rgbToOklab(color)),
      direction: end === 0 ? 'darker' : 'lighter',
    };
  };

  const found = [search(0), search(1)].filter((candidate) => candidate !== undefined);
  const [best, ...others] = found.sort((a, b) => a.deltaE - b.deltaE);
  if (best === undefined) {
    const maxRatio = Math.max(contrastRatio(colorAt(0), back), contrastRatio(colorAt(1), back));
    return { status: 'unachievable', target, ratio, maxRatio };
  }
  return { status: 'fixed', target, ratio, candidates: [best, ...others] };
}

function resolveTarget({ target, level = 'AA', use = 'text' }: FixOptions): number {
  if (target === undefined) return requiredRatio(level, use);
  if (!(target >= 1 && target <= MAX_CONTRAST_RATIO)) {
    throw new InvalidArgumentError(`The target ratio must be from 1 to 21, got ${target}`);
  }
  return target;
}
