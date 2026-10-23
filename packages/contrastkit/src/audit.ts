import {
  checkRatio,
  contrastRatio,
  requiredRatio,
  type ContrastChecks,
  type ContrastUse,
  type WcagLevel,
} from './contrast';
import { oklabDistance, rgbToOklab } from './convert';
import { CVD_TYPES, simulateCvd, type CvdType } from './cvd';
import { ColorParseError, InvalidArgumentError } from './errors';
import { formatHex } from './format';
import { toRgb } from './parse';
import type { ColorInput, Rgb } from './types';

/**
 * Default ΔE_OK below which two colors count as hard to tell apart: four times the 0.02
 * just-noticeable difference CSS Color 4 uses. A JND is measured on large patches side by
 * side; interface colors are often small and far apart, so a margin of several JNDs is
 * needed. docs/DESIGN.md lists the measurements behind this value.
 */
export const DEFAULT_CONFUSION_THRESHOLD = 0.08;

/** A named color in a palette. */
export interface PaletteEntry {
  readonly name: string;
  readonly color: ColorInput;
}

/** A palette as a list of entries or as a `{ name: color }` object (in key order). */
export type PaletteInput = readonly PaletteEntry[] | Readonly<Record<string, ColorInput>>;

/** Options for {@link auditPalette}. */
export interface AuditOptions {
  /** ΔE_OK below which colors count as hard to distinguish. Default 0.08. */
  readonly confusionThreshold?: number;
  /** Which deficiencies to simulate. Default: all three. */
  readonly cvdTypes?: readonly CvdType[];
}

export interface AuditedColor {
  readonly name: string;
  readonly color: Rgb;
  readonly hex: string;
}

/** Contrast between two palette colors, with every WCAG check. */
export interface PairReport extends ContrastChecks {
  readonly a: string;
  readonly b: string;
  readonly ratio: number;
  /** ΔE_OK in typical color vision. */
  readonly deltaE: number;
}

/** Two colors that are distinct in typical vision but hard to tell apart under a CVD. */
export interface CvdConfusion {
  readonly type: CvdType;
  readonly a: string;
  readonly b: string;
  /** ΔE_OK between the simulated colors (below the threshold). */
  readonly deltaE: number;
  /** ΔE_OK in typical vision (at or above the threshold). */
  readonly typicalDeltaE: number;
}

export interface PaletteAudit {
  readonly colors: readonly AuditedColor[];
  /**
   * `matrix[i][j]` is the contrast ratio between `colors[i]` and `colors[j]`. Contrast is
   * symmetric for opaque colors, so the matrix is too, with 1 on the diagonal.
   */
  readonly matrix: readonly (readonly number[])[];
  /** Every unordered pair of colors, in palette order. */
  readonly pairs: readonly PairReport[];
  readonly confusionThreshold: number;
  /** Pairs that become hard to distinguish under each simulated deficiency. */
  readonly cvdConfusions: readonly CvdConfusion[];
}

/** A pair that must meet a contrast level, as declared in a design-tokens file. */
export interface PairRequirement {
  readonly foreground: string;
  readonly background: string;
  /** Default: the `defaultLevel` passed to {@link checkRequirements}. */
  readonly level?: WcagLevel;
  /** Default: "text". */
  readonly use?: ContrastUse;
}

export interface RequirementResult {
  readonly foreground: string;
  readonly background: string;
  readonly level: WcagLevel;
  readonly use: ContrastUse;
  readonly ratio: number;
  readonly required: number;
  readonly pass: boolean;
}

/**
 * Audits a palette: the contrast of every pair, which WCAG levels each pair meets, and
 * which pairs become hard to tell apart for people with a color vision deficiency.
 *
 * A pair is reported as a CVD confusion when its ΔE_OK is at least the threshold in
 * typical vision but drops below it after simulating the deficiency (see
 * {@link simulateCvd}). Pairs that already look alike in typical vision are not repeated
 * for every deficiency.
 *
 * Palette colors must be opaque: contrast against a translucent color depends on what is
 * behind it.
 *
 * @throws {@link InvalidArgumentError} for empty or duplicate names, translucent colors,
 * a threshold that is not a positive number, or an unknown deficiency type.
 * @throws {@link ColorParseError} naming the palette color that does not parse.
 */
export function auditPalette(palette: PaletteInput, options: AuditOptions = {}): PaletteAudit {
  const threshold = options.confusionThreshold ?? DEFAULT_CONFUSION_THRESHOLD;
  if (!(threshold > 0 && Number.isFinite(threshold))) {
    throw new InvalidArgumentError(
      `The confusion threshold must be a positive number, got ${threshold}`,
    );
  }
  const colors = normalizePalette(palette);

  const matrix = colors.map((row) =>
    colors.map((column) => contrastRatio(row.color, column.color)),
  );

  const pairs = unorderedPairs(colors).map(([a, b]): PairReport => {
    const ratio = contrastRatio(a.color, b.color);
    return {
      a: a.name,
      b: b.name,
      ratio,
      deltaE: distance(a.color, b.color),
      ...checkRatio(ratio),
    };
  });

  const cvdConfusions: CvdConfusion[] = [];
  for (const type of options.cvdTypes ?? CVD_TYPES) {
    for (const [a, b] of unorderedPairs(colors)) {
      const typicalDeltaE = distance(a.color, b.color);
      const deltaE = distance(simulateCvd(a.color, type), simulateCvd(b.color, type));
      if (typicalDeltaE >= threshold && deltaE < threshold) {
        cvdConfusions.push({ type, a: a.name, b: b.name, deltaE, typicalDeltaE });
      }
    }
  }

  return { colors, matrix, pairs, confusionThreshold: threshold, cvdConfusions };
}

/**
 * Checks declared foreground/background pairs of an audited palette against their WCAG
 * levels. Requirements without a level use `defaultLevel`; without a use, "text".
 *
 * @throws {@link InvalidArgumentError} if a requirement names a color not in the palette.
 */
export function checkRequirements(
  audit: PaletteAudit,
  requirements: readonly PairRequirement[],
  defaultLevel: WcagLevel = 'AA',
): RequirementResult[] {
  const byName = new Map(audit.colors.map((color) => [color.name, color]));
  const find = (name: string): AuditedColor => {
    const color = byName.get(name);
    if (color === undefined) {
      const known = audit.colors.map((entry) => `"${entry.name}"`).join(', ');
      throw new InvalidArgumentError(`Unknown color "${name}"; the palette has ${known}`);
    }
    return color;
  };

  return requirements.map(({ foreground, background, level = defaultLevel, use = 'text' }) => {
    const ratio = contrastRatio(find(foreground).color, find(background).color);
    const required = requiredRatio(level, use);
    return { foreground, background, level, use, ratio, required, pass: ratio >= required };
  });
}

// Array.isArray narrows readonly arrays to any[]; this guard keeps the element type.
function isEntryList(palette: PaletteInput): palette is readonly PaletteEntry[] {
  return Array.isArray(palette);
}

function normalizePalette(palette: PaletteInput): AuditedColor[] {
  const entries = isEntryList(palette)
    ? palette
    : Object.entries(palette).map(([name, color]) => ({ name, color }));

  const seen = new Set<string>();
  return entries.map(({ name, color }) => {
    if (typeof name !== 'string' || name.trim() === '') {
      throw new InvalidArgumentError('Every palette color needs a non-empty name');
    }
    if (seen.has(name))
      throw new InvalidArgumentError(`The palette has two colors named "${name}"`);
    seen.add(name);

    const rgb = withPaletteContext(name, () => toRgb(color));
    if (rgb.alpha < 1) {
      throw new InvalidArgumentError(
        `Palette colors must be opaque, but "${name}" has alpha ${rgb.alpha}; ` +
          'contrast against a translucent color depends on what is behind it',
      );
    }
    return { name, color: rgb, hex: formatHex(rgb) };
  });
}

/** Runs `parse`, adding the palette color's name to any parse error. */
function withPaletteContext(name: string, parse: () => Rgb): Rgb {
  try {
    return parse();
  } catch (error) {
    if (error instanceof ColorParseError) {
      throw new ColorParseError(error.input, `${error.reason} (palette color "${name}")`);
    }
    throw error;
  }
}

/** Every unordered pair [items[i], items[j]] with i < j, in order. */
function unorderedPairs<T>(items: readonly T[]): [T, T][] {
  return items.flatMap((first, i) => items.slice(i + 1).map((second): [T, T] => [first, second]));
}

function distance(a: Rgb, b: Rgb): number {
  return oklabDistance(rgbToOklab(a), rgbToOklab(b));
}
