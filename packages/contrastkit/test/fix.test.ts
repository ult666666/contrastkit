import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../src/contrast';
import { rgbToOklch } from '../src/convert';
import { InvalidArgumentError } from '../src/errors';
import { suggestFix } from '../src/fix';
import { parseColor } from '../src/parse';
import { byte, opaqueRgb8, unitInterval } from './arbitraries';

const BLACK = { r: 0, g: 0, b: 0, alpha: 1 };
const WHITE = { r: 1, g: 1, b: 1, alpha: 1 };

/** Targets that matter in practice plus arbitrary ones across the whole range. */
const target = fc.oneof(fc.constantFrom(3, 4.5, 7), fc.double({ min: 1, max: 21, noNaN: true }));

describe('suggestFix', () => {
  it('finds #767676, the closest AA gray, for #777777 on white', () => {
    const result = suggestFix('#777777', '#ffffff');
    expect(result.status).toBe('fixed');
    if (result.status !== 'fixed') return;
    const [best] = result.candidates;
    expect(best.hex).toBe('#767676');
    expect(best.direction).toBe('darker');
    expect(best.ratio).toBeCloseTo(4.542, 3);
    // White text cannot reach 4.5:1 on white, so darker is the only direction.
    expect(result.candidates).toHaveLength(1);
  });

  it('keeps the hue of a colored foreground', () => {
    const result = suggestFix('#ff6666', '#ffffff');
    expect(result.status).toBe('fixed');
    if (result.status !== 'fixed') return;
    const before = rgbToOklch(parseColor('#ff6666'));
    const after = rgbToOklch(result.candidates[0].color);
    expect(Math.abs(after.h - before.h)).toBeLessThan(2);
    expect(after.l).toBeLessThan(before.l);
    expect(result.candidates[0].ratio).toBeGreaterThanOrEqual(4.5);
  });

  it('lightens a foreground when that is the smaller change', () => {
    const result = suggestFix('#3b82f6', '#1e293b');
    expect(result.status).toBe('fixed');
    if (result.status === 'fixed') expect(result.candidates[0].direction).toBe('lighter');
  });

  it('uses level and use to pick the target, and an explicit target over both', () => {
    expect(suggestFix('#777777', '#ffffff', { use: 'large-text' })).toMatchObject({
      status: 'passes',
      target: 3,
    });
    expect(suggestFix('#2f80ed', '#ffffff', { level: 'AAA' }).target).toBe(7);
    expect(suggestFix('#2f80ed', '#ffffff', { target: 5.5, level: 'AAA' }).target).toBe(5.5);
  });

  it('reports "passes" when there is nothing to fix', () => {
    expect(suggestFix('#000', '#fff')).toEqual({ status: 'passes', target: 4.5, ratio: 21 });
  });

  it('reports "unachievable" with the best possible ratio', () => {
    // On mid-gray, black reaches only 4.69:1 and white 4.48:1; AAA needs 7.
    const result = suggestFix('#ffffff', '#777777', { level: 'AAA' });
    expect(result.status).toBe('unachievable');
    if (result.status === 'unachievable') {
      expect(result.maxRatio).toBeCloseTo(contrastRatio('#000', '#777777'), 12);
    }
  });

  it('keeps alpha and accounts for it: 30% black can never reach 4.5:1 on white', () => {
    expect(suggestFix('rgb(0 0 0 / 0.3)', '#ffffff').status).toBe('unachievable');
    const result = suggestFix('rgb(0 0 255 / 0.8)', '#ffffff', { level: 'AAA' });
    expect(result.status).toBe('fixed');
    if (result.status === 'fixed') expect(result.candidates[0].color.alpha).toBe(0.8);
  });

  it('validates its inputs', () => {
    expect(() => suggestFix('#000', '#fff', { target: 22 })).toThrow(InvalidArgumentError);
    expect(() => suggestFix('#000', '#fff', { target: 0.5 })).toThrow(/from 1 to 21, got 0.5/);
    expect(() => suggestFix('#000', '#fff', { target: Number.NaN })).toThrow(InvalidArgumentError);
    expect(() => suggestFix('#000', '#fff', { level: 'A' as never })).toThrow(/Unknown WCAG level/);
    expect(() => suggestFix('#000', 'rgb(0 0 0 / 0.5)')).toThrow(/must be opaque/);
  });

  describe('properties', () => {
    it('only returns in-gamut 8-bit colors that meet the target, closest first', () => {
      fc.assert(
        fc.property(opaqueRgb8, opaqueRgb8, target, (foreground, background, goal) => {
          const result = suggestFix(foreground, background, { target: goal });
          if (result.status === 'passes') {
            expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(goal);
          }
          if (result.status !== 'fixed') return;
          for (const candidate of result.candidates) {
            expect(candidate.ratio).toBeGreaterThanOrEqual(goal);
            // The hex code alone must pass too: it is what people will paste.
            expect(contrastRatio(candidate.hex, background)).toBeGreaterThanOrEqual(goal);
            expect(parseColor(candidate.hex)).toEqual(candidate.color);
            for (const channel of [candidate.color.r, candidate.color.g, candidate.color.b]) {
              expect(channel).toBeGreaterThanOrEqual(0);
              expect(channel).toBeLessThanOrEqual(1);
            }
          }
          const distances = result.candidates.map((candidate) => candidate.deltaE);
          expect(distances).toEqual([...distances].sort((a, b) => a - b));
        }),
        { numRuns: 500 },
      );
    });

    it('says "unachievable" exactly when neither black nor white reaches the target', () => {
      fc.assert(
        fc.property(opaqueRgb8, opaqueRgb8, target, (foreground, background, goal) => {
          const result = suggestFix(foreground, background, { target: goal });
          const best = Math.max(contrastRatio(BLACK, background), contrastRatio(WHITE, background));
          expect(result.status === 'unachievable').toBe(best < goal);
        }),
        { numRuns: 500 },
      );
    });

    it('handles translucent foregrounds the same way', () => {
      const translucent = fc
        .tuple(byte, byte, byte, unitInterval)
        .map(([r, g, b, alpha]) => ({ r: r / 255, g: g / 255, b: b / 255, alpha }));
      fc.assert(
        fc.property(translucent, opaqueRgb8, target, (foreground, background, goal) => {
          const result = suggestFix(foreground, background, { target: goal });
          if (result.status === 'fixed') {
            for (const candidate of result.candidates) {
              expect(candidate.color.alpha).toBe(foreground.alpha);
              expect(contrastRatio(candidate.color, background)).toBeGreaterThanOrEqual(goal);
            }
          }
          if (result.status === 'unachievable') {
            const atAlpha = (base: typeof BLACK) => ({ ...base, alpha: foreground.alpha });
            expect(
              Math.max(
                contrastRatio(atAlpha(BLACK), background),
                contrastRatio(atAlpha(WHITE), background),
              ),
            ).toBeLessThan(goal);
          }
        }),
      );
    });
  });
});
