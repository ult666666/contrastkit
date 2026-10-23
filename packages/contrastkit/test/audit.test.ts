import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { auditPalette, checkRequirements, DEFAULT_CONFUSION_THRESHOLD } from '../src/audit';
import { contrastRatio } from '../src/contrast';
import { ColorParseError, InvalidArgumentError } from '../src/errors';
import { opaqueRgb8 } from './arbitraries';

const palette = {
  text: '#1f2937',
  muted: '#6b7280',
  surface: '#ffffff',
  success: '#16a34a',
  danger: '#dc2626',
};

describe('auditPalette', () => {
  it('builds a symmetric contrast matrix with 1 on the diagonal', () => {
    const audit = auditPalette(palette);
    expect(audit.colors.map((color) => color.name)).toEqual(Object.keys(palette));
    expect(audit.colors[0]?.hex).toBe('#1f2937');
    audit.matrix.forEach((row, i) => {
      expect(row[i]).toBe(1);
      row.forEach((ratio, j) => {
        expect(ratio).toBe(audit.matrix[j]?.[i]);
      });
    });
    expect(audit.matrix[0]?.[2]).toBe(contrastRatio('#1f2937', '#ffffff'));
  });

  it('reports every unordered pair once with its WCAG checks', () => {
    const audit = auditPalette(palette);
    expect(audit.pairs).toHaveLength(10);
    expect(audit.pairs.find((pair) => pair.a === 'muted' && pair.b === 'surface')).toMatchObject({
      aaText: true,
      aaaText: false,
      nonText: true,
    });
    expect(audit.pairs.find((pair) => pair.a === 'success' && pair.b === 'danger')).toMatchObject({
      aaText: false,
      aaLargeText: false,
      nonText: false,
    });
  });

  it('flags pairs that become hard to tell apart under a deficiency', () => {
    const audit = auditPalette(palette);
    expect(audit.confusionThreshold).toBe(DEFAULT_CONFUSION_THRESHOLD);
    const confusion = audit.cvdConfusions.find(
      (entry) => entry.type === 'deuteranopia' && entry.a === 'success' && entry.b === 'danger',
    );
    expect(confusion).toBeDefined();
    expect(confusion?.deltaE).toBeLessThan(DEFAULT_CONFUSION_THRESHOLD);
    expect(confusion?.typicalDeltaE).toBeGreaterThan(0.3);
    // Text on white stays obviously different for everyone.
    expect(audit.cvdConfusions.some((entry) => entry.a === 'text' && entry.b === 'surface')).toBe(
      false,
    );
  });

  it('does not repeat pairs that already look alike in typical vision', () => {
    const audit = auditPalette({ gray: '#777777', gray2: '#787878', red: '#ff0000' });
    expect(audit.cvdConfusions.some((entry) => entry.a === 'gray' && entry.b === 'gray2')).toBe(
      false,
    );
  });

  it('respects a custom threshold and a subset of deficiencies', () => {
    const audit = auditPalette(palette, { confusionThreshold: 0.01, cvdTypes: ['protanopia'] });
    expect(audit.confusionThreshold).toBe(0.01);
    expect(audit.cvdConfusions).toEqual([]);
  });

  it('accepts a list of entries as well as an object', () => {
    const fromList = auditPalette(
      Object.entries(palette).map(([name, color]) => ({ name, color })),
    );
    expect(fromList).toEqual(auditPalette(palette));
  });

  it('flags a CVD confusion only when the simulated distance is below the threshold', () => {
    fc.assert(
      fc.property(opaqueRgb8, opaqueRgb8, (a, b) => {
        const audit = auditPalette([
          { name: 'a', color: a },
          { name: 'b', color: b },
        ]);
        for (const confusion of audit.cvdConfusions) {
          expect(confusion.deltaE).toBeLessThan(audit.confusionThreshold);
          expect(confusion.typicalDeltaE).toBeGreaterThanOrEqual(audit.confusionThreshold);
        }
      }),
    );
  });

  it('handles an empty palette', () => {
    expect(auditPalette({})).toEqual({
      colors: [],
      matrix: [],
      pairs: [],
      confusionThreshold: DEFAULT_CONFUSION_THRESHOLD,
      cvdConfusions: [],
    });
  });

  it.each([
    [[{ name: '', color: '#fff' }], /non-empty name/],
    [
      [
        { name: 'a', color: '#fff' },
        { name: 'a', color: '#000' },
      ],
      /two colors named "a"/,
    ],
    [{ overlay: 'rgb(0 0 0 / 0.5)' }, /must be opaque, but "overlay" has alpha 0.5/],
  ])('rejects invalid palettes (%j)', (input, message) => {
    expect(() => auditPalette(input)).toThrow(InvalidArgumentError);
    expect(() => auditPalette(input)).toThrow(message);
  });

  it('names the palette color that does not parse', () => {
    expect(() => auditPalette({ brand: '#12' })).toThrow(ColorParseError);
    expect(() => auditPalette({ brand: '#12' })).toThrow(/\(palette color "brand"\)/);
  });

  it('passes through errors that are not parse errors', () => {
    expect(() => auditPalette({ brand: { r: 2, g: 0, b: 0, alpha: 1 } })).toThrow(
      InvalidArgumentError,
    );
  });

  it('rejects invalid options', () => {
    expect(() => auditPalette(palette, { confusionThreshold: 0 })).toThrow(/positive number/);
    expect(() => auditPalette(palette, { confusionThreshold: Number.NaN })).toThrow(
      InvalidArgumentError,
    );
    expect(() => auditPalette(palette, { cvdTypes: ['monochromacy' as never] })).toThrow(
      /Unknown color vision deficiency/,
    );
  });
});

describe('checkRequirements', () => {
  const audit = auditPalette(palette);

  it('checks each declared pair at its level and use', () => {
    const results = checkRequirements(audit, [
      { foreground: 'text', background: 'surface' },
      { foreground: 'muted', background: 'surface', level: 'AAA' },
      { foreground: 'success', background: 'surface', use: 'non-text' },
    ]);
    expect(
      results.map((result) => [result.level, result.use, result.required, result.pass]),
    ).toEqual([
      ['AA', 'text', 4.5, true],
      ['AAA', 'text', 7, false],
      ['AA', 'non-text', 3, true],
    ]);
    expect(results[0]?.ratio).toBe(contrastRatio('#1f2937', '#ffffff'));
  });

  it('uses the default level for pairs that do not declare one', () => {
    const [result] = checkRequirements(
      audit,
      [{ foreground: 'muted', background: 'surface' }],
      'AAA',
    );
    expect(result).toMatchObject({ level: 'AAA', required: 7, pass: false });
  });

  it('rejects names that are not in the palette', () => {
    expect(() => checkRequirements(audit, [{ foreground: 'link', background: 'surface' }])).toThrow(
      /Unknown color "link"; the palette has "text", "muted"/,
    );
  });
});
