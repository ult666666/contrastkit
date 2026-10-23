import { rgbToHsl, rgbToOklch } from './convert';
import { clampRgb } from './gamut';
import { clamp } from './math';
import type { Rgb } from './types';

/** Formats a number with at most `decimals` decimal places and no trailing zeros. */
function trimmed(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)));
}

function byte(value: number): number {
  return Math.round(clamp(value, 0, 1) * 255);
}

function alphaSuffix(alpha: number): string {
  return alpha < 1 ? ` / ${trimmed(clamp(alpha, 0, 1), 3)}` : '';
}

/**
 * Formats a color as lowercase hex: `#rrggbb`, or `#rrggbbaa` when it is translucent.
 * Channels are rounded to the nearest 8-bit value.
 */
export function formatHex(color: Rgb): string {
  const hex = (value: number): string => byte(value).toString(16).padStart(2, '0');
  const alpha = hex(color.alpha);
  return `#${hex(color.r)}${hex(color.g)}${hex(color.b)}${alpha === 'ff' ? '' : alpha}`;
}

/** Formats a color in CSS Color 4 `rgb()` syntax, e.g. `rgb(255 0 0)` or `rgb(255 0 0 / 0.5)`. */
export function formatRgb(color: Rgb): string {
  return `rgb(${byte(color.r)} ${byte(color.g)} ${byte(color.b)}${alphaSuffix(color.alpha)})`;
}

/** Formats a color in CSS Color 4 `hsl()` syntax, e.g. `hsl(210 50% 40%)`. */
export function formatHsl(color: Rgb): string {
  const { h, s, l } = rgbToHsl(clampRgb(color));
  const body = `${trimmed(h, 1)} ${trimmed(s * 100, 1)}% ${trimmed(l * 100, 1)}%`;
  return `hsl(${body}${alphaSuffix(color.alpha)})`;
}

/**
 * Formats a color in CSS `oklch()` syntax with lightness as a percentage, e.g.
 * `oklch(62.8% 0.2577 29.23)`. Neutral colors get hue 0.
 */
export function formatOklch(color: Rgb): string {
  const { l, c, h } = rgbToOklch(color);
  const chroma = trimmed(c, 4);
  const hue = chroma === '0' ? '0' : trimmed(h, 2);
  return `oklch(${trimmed(l * 100, 2)}% ${chroma} ${hue}${alphaSuffix(color.alpha)})`;
}

/**
 * Formats a contrast ratio as `4.47:1`.
 *
 * The value is truncated rather than rounded to two decimals, so a ratio that misses a
 * WCAG threshold never displays as meeting it: 4.499 shows as 4.49, not 4.50. (WCAG's
 * Understanding documents say ratios must not be rounded up to pass.) Use the raw number
 * for comparisons.
 */
export function formatRatio(ratio: number): string {
  // The epsilon absorbs floating-point noise such as 20.999999999999996 for 21.
  const truncated = Math.floor(ratio * 100 + 1e-9) / 100;
  return `${truncated.toFixed(2)}:1`;
}
