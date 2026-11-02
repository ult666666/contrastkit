import { readFileSync } from 'node:fs';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { auditPalette } from '../src/audit';
import {
  ANOMALOUS_CVD_TYPES,
  ANOMALY_MATRICES,
  CVD_MATRICES,
  CVD_TYPES,
  cvdMatrix,
  formatCvdSimulation,
  parseCvdSimulation,
  simulateCvd,
  type AnomalousCvdType,
} from '../src/cvd';
import { deltaEOK } from '../src/difference';
import { InvalidArgumentError } from '../src/errors';
import { formatHex } from '../src/format';
import { byte, opaqueRgb } from './arbitraries';

interface Fixture {
  colors: string;
  daltonlensMatrices: Record<AnomalousCvdType, number[][][]>;
  colorspacious: { rows: [string, AnomalousCvdType, number, number, number, number][] };
  daltonlens: { rows: [AnomalousCvdType, number, string][] };
}
// Generated with colorspacious 1.1.2 and DaltonLens 0.1.5; see docs/DESIGN.md, section 5.
const fixture = JSON.parse(
  readFileSync(new URL('fixtures/cvd-reference.json', import.meta.url), 'utf8'),
) as Fixture;

const severity = fc.double({ min: 0, max: 1, noNaN: true });
const clip = (value: number): number => Math.min(1, Math.max(0, value));

describe('Machado et al. (2009) anomalous trichromacy table', () => {
  it.each(ANOMALOUS_CVD_TYPES)('%s: 11 published matrices, from identity to dichromacy', (type) => {
    const table = ANOMALY_MATRICES[type];
    expect(table).toHaveLength(11);
    expect(table[0]).toEqual([
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ]);
    const dichromacy = CVD_TYPES[ANOMALOUS_CVD_TYPES.indexOf(type)] ?? 'protanopia';
    expect(table[10]).toEqual(CVD_MATRICES[dichromacy]);
    for (const matrix of table) {
      for (const row of matrix) expect(row[0] + row[1] + row[2]).toBeCloseTo(1, 5);
    }
  });

  it('matches the independent copy of the table in DaltonLens exactly', () => {
    // Its copy writes some zeros as -0.000000; equal values, but toEqual tells -0 from 0.
    const positiveZero = (matrices: readonly (readonly (readonly number[])[])[]) =>
      matrices.map((matrix) => matrix.map((row) => row.map((value) => value + 0)));
    for (const type of ANOMALOUS_CVD_TYPES) {
      expect(positiveZero(ANOMALY_MATRICES[type])).toEqual(
        positiveZero(fixture.daltonlensMatrices[type]),
      );
    }
  });

  it('returns published matrices at the steps and interpolates linearly between them', () => {
    // colorspacious's own test value for deuteranomaly at severity 50 (a published step).
    expect(cvdMatrix('deuteranomaly', 0.5)[0]).toEqual([0.547494, 0.607765, -0.155259]);
    for (const type of ANOMALOUS_CVD_TYPES) {
      const table = ANOMALY_MATRICES[type];
      table.forEach((matrix, step) => {
        expect(cvdMatrix(type, step / 10)).toEqual(matrix);
      });
      // Halfway between 0.3 and 0.4, every entry is the mean of the two published entries.
      const [low, high, middle] = [table[3], table[4], cvdMatrix(type, 0.35)];
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const expected = ((low?.[i]?.[j] ?? NaN) + (high?.[i]?.[j] ?? NaN)) / 2;
          expect(middle[i]?.[j]).toBeCloseTo(expected, 12);
        }
      }
    }
  });
});

describe('simulateCvd with a severity', () => {
  it('agrees with colorspacious 1.1.2 on 810 colors, types and severities', () => {
    let worst = 0;
    for (const [color, type, amount, r, g, b] of fixture.colorspacious.rows) {
      const simulated = simulateCvd(color, type, amount);
      // colorspacious does not clip, contrastkit does; clipping after encoding is the same.
      for (const [actual, expected] of [
        [simulated.r, r],
        [simulated.g, g],
        [simulated.b, b],
      ] as const) {
        worst = Math.max(worst, Math.abs(actual - clip(expected)));
      }
    }
    expect(fixture.colorspacious.rows).toHaveLength(810);
    expect(worst).toBeLessThan(1e-9);
  });

  it('agrees with DaltonLens 0.1.5 at the published steps, to the 8-bit value', () => {
    const colors = fixture.colors.split(' ');
    let compared = 0;
    for (const [type, amount, simulated] of fixture.daltonlens.rows) {
      simulated.split(' ').forEach((expected, i) => {
        const actual = formatHex(simulateCvd(colors[i] ?? '', type, amount));
        // DaltonLens computes in float32, so a channel can land one 8-bit step away.
        for (const offset of [1, 3, 5]) {
          const channel = (hex: string) => parseInt(hex.slice(offset, offset + 2), 16);
          expect(Math.abs(channel(actual) - channel(expected))).toBeLessThanOrEqual(1);
        }
        compared++;
      });
    }
    expect(compared).toBe(990);
  });

  it('gives exactly the dichromacy at severity 1 and the original color at severity 0', () => {
    fc.assert(
      fc.property(opaqueRgb, fc.constantFrom(...ANOMALOUS_CVD_TYPES), (color, type) => {
        const dichromacy = CVD_TYPES[ANOMALOUS_CVD_TYPES.indexOf(type)] ?? 'protanopia';
        expect(simulateCvd(color, type, 1)).toEqual(simulateCvd(color, dichromacy));
        expect(formatHex(simulateCvd(color, type, 0))).toBe(formatHex(color));
      }),
    );
  });

  it('keeps grays gray and stays in gamut at every severity', () => {
    fc.assert(
      fc.property(byte, severity, fc.constantFrom(...ANOMALOUS_CVD_TYPES), (n, amount, type) => {
        const gray = { r: n / 255, g: n / 255, b: n / 255, alpha: 1 };
        expect(formatHex(simulateCvd(gray, type, amount))).toBe(formatHex(gray));
      }),
    );
    fc.assert(
      fc.property(opaqueRgb, severity, fc.constantFrom(...ANOMALOUS_CVD_TYPES), (c, s, type) => {
        const simulated = simulateCvd(c, type, s);
        for (const channel of [simulated.r, simulated.g, simulated.b]) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
      }),
    );
  });

  it('changes continuously with severity', () => {
    fc.assert(
      fc.property(opaqueRgb, severity, fc.constantFrom(...ANOMALOUS_CVD_TYPES), (c, s, type) => {
        const nearby = Math.min(1, s + 1e-3);
        expect(deltaEOK(simulateCvd(c, type, s), simulateCvd(c, type, nearby))).toBeLessThan(0.01);
      }),
    );
  });

  it('makes a red/green pair harder to tell apart as deuteranomaly gets more severe', () => {
    const differences = [0, 0.2, 0.4, 0.6, 0.8, 1].map((amount) =>
      deltaEOK(
        simulateCvd('#d62728', 'deuteranomaly', amount),
        simulateCvd('#2ca02c', 'deuteranomaly', amount),
      ),
    );
    for (let i = 1; i < differences.length; i++) {
      expect(differences[i]).toBeLessThan(differences[i - 1] ?? 0);
    }
    expect(differences[0]).toBeCloseTo(deltaEOK('#d62728', '#2ca02c'), 12);
  });

  it('rejects severities outside [0, 1] and severities for the dichromacies', () => {
    for (const bad of [-0.1, 1.01, Number.NaN, Number.POSITIVE_INFINITY, '0.5' as never]) {
      expect(() => simulateCvd('#f00', 'deuteranomaly', bad)).toThrow(/from 0 to 1/);
    }
    expect(() => simulateCvd('#f00', 'protanopia', 0.5)).toThrow(InvalidArgumentError);
    expect(() => simulateCvd('#f00', 'protanopia', 0.5)).toThrow(/use protanomaly/);
    expect(() => cvdMatrix('monochromacy' as never)).toThrow(/tritanomaly/);
  });
});

describe('parseCvdSimulation and formatCvdSimulation', () => {
  it('reads dichromacies and anomalous trichromacies with a severity', () => {
    expect(parseCvdSimulation('deuteranopia')).toEqual({ type: 'deuteranopia', severity: 1 });
    expect(parseCvdSimulation(' Deuteranomaly:0.6 ')).toEqual({
      type: 'deuteranomaly',
      severity: 0.6,
    });
    expect(parseCvdSimulation('tritanomaly:.25')).toEqual({ type: 'tritanomaly', severity: 0.25 });
    expect(parseCvdSimulation('protanopia:1')).toEqual({ type: 'protanopia', severity: 1 });
  });

  it('round-trips every simulation through its text form', () => {
    fc.assert(
      fc.property(fc.constantFrom(...ANOMALOUS_CVD_TYPES), severity, (type, amount) => {
        expect(parseCvdSimulation(formatCvdSimulation({ type, severity: amount }))).toEqual({
          type,
          severity: amount,
        });
      }),
    );
    expect(formatCvdSimulation({ type: 'tritanopia', severity: 1 })).toBe('tritanopia');
  });

  it.each([
    ['deuteranomaly', /needs a severity from 0 to 1, such as deuteranomaly:0.6/],
    ['deuteranomaly:1.5', /from 0 to 1, got 1.5/],
    ['deuteranomaly:abc', /from 0 to 1/],
    ['deuteranomaly:-0.2', /from 0 to 1/],
    ['deuteranomaly:0.6:1', /not a color vision simulation/],
    ['protanopia:0.5', /use protanomaly for severity 0.5/],
    ['monochromacy', /not a color vision simulation/],
    ['', /not a color vision simulation/],
  ])('rejects %j', (text, message) => {
    expect(() => parseCvdSimulation(text)).toThrow(InvalidArgumentError);
    expect(() => parseCvdSimulation(text)).toThrow(message);
  });

  it('rejects a very long invalid severity quickly', () => {
    const started = performance.now();
    expect(() => parseCvdSimulation(`deuteranomaly:${'9'.repeat(100_000)}x`)).toThrow(/0 to 1/);
    expect(() => parseCvdSimulation(`deuteranomaly:0.${'9'.repeat(100_000)}`)).not.toThrow();
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('auditPalette with anomalous trichromacy', () => {
  const palette = { success: '#2f855a', warning: '#b7791f', danger: '#c53030', text: '#1f2933' };

  it('reports confusions for the chosen severity, and fewer for milder ones', () => {
    const at = (amount: number) =>
      auditPalette(palette, { cvdTypes: [{ type: 'deuteranomaly', severity: amount }] })
        .cvdConfusions;
    const strong = at(0.9);
    expect(strong.length).toBeGreaterThan(0);
    for (const confusion of strong) {
      expect(confusion).toMatchObject({ type: 'deuteranomaly', severity: 0.9 });
      expect(confusion.deltaE).toBeCloseTo(
        deltaEOK(
          simulateCvd(palette[confusion.a as keyof typeof palette], 'deuteranomaly', 0.9),
          simulateCvd(palette[confusion.b as keyof typeof palette], 'deuteranomaly', 0.9),
        ),
        12,
      );
    }
    expect(at(0.1)).toEqual([]);
    expect(at(0.1).length).toBeLessThanOrEqual(at(0.5).length);
  });

  it('keeps the default audit (the three dichromacies at severity 1) unchanged', () => {
    const audit = auditPalette(palette);
    expect(audit.cvdConfusions.length).toBeGreaterThan(0);
    for (const confusion of audit.cvdConfusions) {
      expect(CVD_TYPES).toContain(confusion.type);
      expect(confusion.severity).toBe(1);
    }
    expect(
      auditPalette(palette, { cvdTypes: [{ type: 'deuteranomaly', severity: 1 }] }).cvdConfusions,
    ).toEqual(
      audit.cvdConfusions
        .filter((c) => c.type === 'deuteranopia')
        .map((c) => ({ ...c, type: 'deuteranomaly' })),
    );
  });

  it('rejects invalid simulations', () => {
    expect(() =>
      auditPalette(palette, { cvdTypes: [{ type: 'deuteranomaly', severity: 2 }] }),
    ).toThrow(/from 0 to 1/);
  });
});
