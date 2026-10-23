/**
 * WCAG 2.x contrast: relative luminance, contrast ratio and conformance checks.
 *
 * Reference: Web Content Accessibility Guidelines (WCAG) 2.2, W3C Recommendation —
 * definitions of "relative luminance" and "contrast ratio", and Success Criteria
 * 1.4.3 Contrast (Minimum), 1.4.6 Contrast (Enhanced) and 1.4.11 Non-text Contrast.
 */
import { rgbToLinear } from './convert';
import { InvalidArgumentError } from './errors';
import { toRgb } from './parse';
import type { ColorInput, Rgb } from './types';

/** A WCAG conformance level that sets contrast minimums. */
export type WcagLevel = 'AA' | 'AAA';

/**
 * What a color pair is used for, which decides the minimum ratio:
 * - `text`: normal-size text (SC 1.4.3 at AA, SC 1.4.6 at AAA)
 * - `large-text`: text at least 18pt (24px) regular or 14pt (about 18.66px) bold
 * - `non-text`: boundaries of UI components, focus indicators, icons and chart graphics
 *   (SC 1.4.11)
 */
export type ContrastUse = 'text' | 'large-text' | 'non-text';

/**
 * Minimum contrast ratios from WCAG 2.2. Non-text contrast (SC 1.4.11) is only defined at
 * level AA; there is no enhanced version, so AAA asks for the same 3:1.
 */
export const WCAG_MINIMUMS: Readonly<Record<WcagLevel, Readonly<Record<ContrastUse, number>>>> = {
  AA: { text: 4.5, 'large-text': 3, 'non-text': 3 },
  AAA: { text: 7, 'large-text': 4.5, 'non-text': 3 },
};

/** The highest contrast ratio possible, black against white. */
export const MAX_CONTRAST_RATIO = 21;

/** Pass/fail for every WCAG 2.2 contrast requirement. */
export interface ContrastChecks {
  /** SC 1.4.3, level AA, normal text: at least 4.5:1. */
  readonly aaText: boolean;
  /** SC 1.4.3, level AA, large text: at least 3:1. */
  readonly aaLargeText: boolean;
  /** SC 1.4.6, level AAA, normal text: at least 7:1. */
  readonly aaaText: boolean;
  /** SC 1.4.6, level AAA, large text: at least 4.5:1. */
  readonly aaaLargeText: boolean;
  /** SC 1.4.11, level AA, UI components and graphical objects: at least 3:1. */
  readonly nonText: boolean;
}

/** A contrast ratio together with its WCAG checks. */
export interface ContrastResult extends ContrastChecks {
  readonly ratio: number;
}

/**
 * The minimum ratio WCAG 2.2 requires for a level and use, e.g. 4.5 for AA text.
 *
 * @throws {@link InvalidArgumentError} for an unknown level or use.
 */
export function requiredRatio(level: WcagLevel = 'AA', use: ContrastUse = 'text'): number {
  if (!Object.hasOwn(WCAG_MINIMUMS, level)) {
    throw new InvalidArgumentError(`Unknown WCAG level "${level}"; expected "AA" or "AAA"`);
  }
  const minimums = WCAG_MINIMUMS[level];
  if (!Object.hasOwn(minimums, use)) {
    throw new InvalidArgumentError(
      `Unknown use "${use}"; expected "text", "large-text" or "non-text"`,
    );
  }
  return minimums[use];
}

/**
 * WCAG relative luminance: the brightness of a color as a share of white, from 0 to 1.
 *
 * Each sRGB channel is linearized, then weighted by how strongly it drives perceived
 * brightness (0.2126 R + 0.7152 G + 0.0722 B, the Rec. 709 / sRGB luminance coefficients).
 *
 * Linearization threshold: WCAG 2.0 printed 0.03928, a value copied from a draft of the
 * sRGB standard; the standard (IEC 61966-2-1) uses 0.04045, and WCAG's definition was
 * corrected to 0.04045 in 2021, as WCAG 2.2 has it. We use 0.04045. No 8-bit channel
 * value lies between the two (10/255 ≈ 0.0392 and 11/255 ≈ 0.0431), so for hex colors both
 * give identical results; the test suite checks all 256 values.
 *
 * Alpha is ignored; composite translucent colors first (see {@link composite}).
 */
export function relativeLuminance(color: ColorInput): number {
  const { r, g, b } = rgbToLinear(toRgb(color));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Composites `foreground` over `background` with the default "source-over" operator, in
 * gamma-encoded sRGB, which is how browsers blend translucent colors (CSS Compositing and
 * Blending Level 1). An opaque foreground is returned unchanged.
 */
export function composite(foreground: ColorInput, background: ColorInput): Rgb {
  const top = toRgb(foreground);
  const bottom = toRgb(background);
  const alpha = top.alpha + bottom.alpha * (1 - top.alpha);
  if (alpha === 0) return { r: 0, g: 0, b: 0, alpha: 0 };
  const blend = (front: number, back: number): number =>
    (front * top.alpha + back * bottom.alpha * (1 - top.alpha)) / alpha;
  return {
    r: blend(top.r, bottom.r),
    g: blend(top.g, bottom.g),
    b: blend(top.b, bottom.b),
    alpha,
  };
}

/**
 * The WCAG contrast ratio between a foreground and a background:
 * (L1 + 0.05) / (L2 + 0.05), where L1 is the larger relative luminance. It runs from 1
 * (identical luminance) to 21 (black on white); the 0.05 terms model ambient light
 * reflecting off the screen.
 *
 * A translucent foreground is composited over the background first, because what the
 * reader sees is the blend.
 *
 * @throws {@link InvalidArgumentError} if the background is translucent: its contrast
 * depends on whatever is behind it, so composite it over that color first.
 */
export function contrastRatio(foreground: ColorInput, background: ColorInput): number {
  const back = toRgb(background);
  if (back.alpha < 1) {
    throw new InvalidArgumentError(
      `The background must be opaque to measure contrast, but its alpha is ${back.alpha}. ` +
        'Composite it over the color behind it first.',
    );
  }
  const front = composite(foreground, back);
  const a = relativeLuminance(front);
  const b = relativeLuminance(back);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/**
 * Checks a ratio against every WCAG 2.2 contrast criterion. Ratios are compared exactly,
 * never rounded: WCAG's Understanding documents note that 4.499:1 does not meet 4.5:1.
 *
 * @throws {@link InvalidArgumentError} if `ratio` is not a finite number of at least 1.
 */
export function checkRatio(ratio: number): ContrastChecks {
  if (!Number.isFinite(ratio) || ratio < 1) {
    throw new InvalidArgumentError(`A contrast ratio is a number from 1 to 21, got ${ratio}`);
  }
  return {
    aaText: ratio >= WCAG_MINIMUMS.AA.text,
    aaLargeText: ratio >= WCAG_MINIMUMS.AA['large-text'],
    aaaText: ratio >= WCAG_MINIMUMS.AAA.text,
    aaaLargeText: ratio >= WCAG_MINIMUMS.AAA['large-text'],
    nonText: ratio >= WCAG_MINIMUMS.AA['non-text'],
  };
}

/** True when `ratio` meets the WCAG 2.2 minimum for `level` and `use` (default AA text). */
export function meetsWcag(
  ratio: number,
  level: WcagLevel = 'AA',
  use: ContrastUse = 'text',
): boolean {
  checkRatio(ratio);
  return ratio >= requiredRatio(level, use);
}

/** The contrast ratio of a color pair together with every WCAG 2.2 check. */
export function checkContrast(foreground: ColorInput, background: ColorInput): ContrastResult {
  const ratio = contrastRatio(foreground, background);
  return { ratio, ...checkRatio(ratio) };
}
