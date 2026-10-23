import { composite } from '../contrast';
import type { Rgb } from '../types';

/**
 * Terminal styling. When color is off (output is not a TTY, or NO_COLOR is set) every
 * helper returns the text unchanged and swatches are empty, so piped output stays plain.
 * Pass/fail is always spelled out in words, never shown by color alone.
 */
export interface Style {
  bold(text: string): string;
  dim(text: string): string;
  pass(text: string): string;
  fail(text: string): string;
  warn(text: string): string;
  /** A two-cell block in the given color (24-bit ANSI), or "" without color. */
  swatch(color: Rgb): string;
  /** `text` drawn in `foreground` on `background` (composited if translucent), or "". */
  sample(foreground: Rgb, background: Rgb, text: string): string;
}

const ESC = '\u001b[';

function byte(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 255);
}

function rgbCode(color: Rgb): string {
  return `${byte(color.r)};${byte(color.g)};${byte(color.b)}`;
}

export function createStyle(enabled: boolean): Style {
  if (!enabled) {
    const plain = (text: string): string => text;
    return {
      bold: plain,
      dim: plain,
      pass: plain,
      fail: plain,
      warn: plain,
      swatch: () => '',
      sample: () => '',
    };
  }
  const wrap =
    (open: string, close: string) =>
    (text: string): string =>
      `${ESC}${open}m${text}${ESC}${close}m`;
  return {
    bold: wrap('1', '22'),
    dim: wrap('2', '22'),
    pass: wrap('32', '39'),
    fail: wrap('31', '39'),
    warn: wrap('33', '39'),
    swatch: (color) => `${ESC}38;2;${rgbCode(color)}m██${ESC}39m`,
    sample: (foreground, background, text) =>
      `${ESC}38;2;${rgbCode(composite(foreground, background))};48;2;${rgbCode(background)}m${text}${ESC}0m`,
  };
}
