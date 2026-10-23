import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { deltaEOK } from '../src/difference';
import { opaqueRgb } from './arbitraries';

describe('deltaEOK', () => {
  it('is 0 for identical colors and about 1 between black and white', () => {
    expect(deltaEOK('#336699', 'rgb(51 102 153)')).toBe(0);
    expect(deltaEOK('black', 'white')).toBeCloseTo(1, 6);
  });

  it('is symmetric and non-negative', () => {
    fc.assert(
      fc.property(opaqueRgb, opaqueRgb, (a, b) => {
        expect(deltaEOK(a, b)).toBeGreaterThanOrEqual(0);
        expect(deltaEOK(a, b)).toBe(deltaEOK(b, a));
      }),
    );
  });

  it('ignores alpha', () => {
    expect(deltaEOK('#ff000080', '#ff0000')).toBe(0);
  });
});
