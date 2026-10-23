import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { relativeLuminance } from '../src/contrast';
import { linearToRgb } from '../src/convert';
import { CVD_MATRICES, CVD_TYPES, simulateCvd } from '../src/cvd';
import { deltaEOK } from '../src/difference';
import { InvalidArgumentError } from '../src/errors';
import { formatHex } from '../src/format';
import { determinant, type Vector3 } from '../src/math';
import { byte, opaqueRgb, unitInterval } from './arbitraries';

const cross = ([a1, a2, a3]: Vector3, [b1, b2, b3]: Vector3): Vector3 => [
  a2 * b3 - a3 * b2,
  a3 * b1 - a1 * b3,
  a1 * b2 - a2 * b1,
];

describe('simulateCvd (Machado et al. 2009, severity 1.0)', () => {
  it.each(CVD_TYPES)('%s: every matrix row sums to 1, so grays map to themselves', (type) => {
    for (const row of CVD_MATRICES[type]) {
      expect(row[0] + row[1] + row[2]).toBeCloseTo(1, 5);
    }
  });

  it('leaves every neutral gray at exactly the same hex value', () => {
    fc.assert(
      fc.property(byte, fc.constantFrom(...CVD_TYPES), (n, type) => {
        const gray = { r: n / 255, g: n / 255, b: n / 255, alpha: 1 };
        expect(formatHex(simulateCvd(gray, type))).toBe(formatHex(gray));
      }),
    );
  });

  it('always returns colors inside sRGB and keeps alpha', () => {
    fc.assert(
      fc.property(opaqueRgb, unitInterval, fc.constantFrom(...CVD_TYPES), (color, alpha, type) => {
        const simulated = simulateCvd({ ...color, alpha }, type);
        for (const channel of [simulated.r, simulated.g, simulated.b]) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(1);
        }
        expect(simulated.alpha).toBe(alpha);
      }),
    );
  });

  it('protanopia and deuteranopia collapse one dimension of color (rank-2 matrices)', () => {
    // Dichromats have two cone types instead of three, so a dichromacy simulation must
    // map 3-D color onto a plane: the determinant is zero up to the coefficients' precision.
    expect(Math.abs(determinant(CVD_MATRICES.protanopia))).toBeLessThan(1e-6);
    expect(Math.abs(determinant(CVD_MATRICES.deuteranopia))).toBeLessThan(1e-6);
  });

  it.each(['protanopia', 'deuteranopia'] as const)(
    '%s: every color on the confusion line through mid-gray looks like that gray',
    (type) => {
      const [row0, row1] = CVD_MATRICES[type];
      // The null direction of the matrix: changes along it are invisible to the simulation.
      const direction = cross(row0, row1);
      const largest = Math.max(...direction.map(Math.abs));
      const unit = direction.map((v) => v / largest) as unknown as Vector3;
      const gray = simulateCvd(linearToRgb({ r: 0.5, g: 0.5, b: 0.5 }), type);
      fc.assert(
        fc.property(fc.double({ min: -0.45, max: 0.45, noNaN: true }), (t) => {
          const color = linearToRgb({
            r: 0.5 + t * unit[0],
            g: 0.5 + t * unit[1],
            b: 0.5 + t * unit[2],
          });
          const simulated = simulateCvd(color, type);
          expect(simulated.r).toBeCloseTo(gray.r, 5);
          expect(simulated.g).toBeCloseTo(gray.g, 5);
          expect(simulated.b).toBeCloseTo(gray.b, 5);
        }),
      );
    },
  );

  it('documents that the tritanopia matrix is not rank 2', () => {
    // A known limitation of the model for tritanopia (see the module docs).
    expect(Math.abs(determinant(CVD_MATRICES.tritanopia))).toBeGreaterThan(0.2);
  });

  it('darkens red for protanopes (missing L cones) but not for deuteranopes', () => {
    const red = relativeLuminance('#ff0000');
    expect(relativeLuminance(simulateCvd('#ff0000', 'protanopia'))).toBeLessThan(red * 0.6);
    expect(relativeLuminance(simulateCvd('#ff0000', 'deuteranopia'))).toBeGreaterThan(red);
  });

  it('makes a typical red/green pair hard to tell apart under deuteranopia', () => {
    // matplotlib's tab10 red and green: clearly different in typical vision.
    const [red, green] = ['#d62728', '#2ca02c'];
    expect(deltaEOK(red, green)).toBeGreaterThan(0.3);
    const simulated = deltaEOK(
      simulateCvd(red, 'deuteranopia'),
      simulateCvd(green, 'deuteranopia'),
    );
    expect(simulated).toBeLessThan(0.05);
  });

  it('rejects unknown deficiency types', () => {
    expect(() => simulateCvd('#f00', 'achromatopsia' as never)).toThrow(InvalidArgumentError);
    expect(() => simulateCvd('#f00', 'achromatopsia' as never)).toThrow(/protanopia/);
  });
});
