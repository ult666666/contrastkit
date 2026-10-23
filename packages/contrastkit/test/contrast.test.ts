import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  checkContrast,
  checkRatio,
  composite,
  contrastRatio,
  meetsWcag,
  relativeLuminance,
  requiredRatio,
} from '../src/contrast';
import { srgbChannelToLinear } from '../src/convert';
import { InvalidArgumentError } from '../src/errors';
import { opaqueRgb, unitInterval } from './arbitraries';

describe('relativeLuminance', () => {
  it('is 0 for black, 1 for white and the channel weights for the primaries', () => {
    expect(relativeLuminance('#000')).toBe(0);
    expect(relativeLuminance('#fff')).toBe(1);
    expect(relativeLuminance('#f00')).toBeCloseTo(0.2126, 12);
    expect(relativeLuminance('#0f0')).toBeCloseTo(0.7152, 12);
    expect(relativeLuminance('#00f')).toBeCloseTo(0.0722, 12);
  });

  it('agrees with the old 0.03928 threshold for every 8-bit channel value', () => {
    // WCAG 2.0 printed 0.03928; the sRGB standard (and WCAG 2.2) use 0.04045. No n/255 lies
    // between them, so both definitions give bit-for-bit identical results for hex colors.
    const legacy = (v: number): number => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    for (let n = 0; n <= 255; n++) {
      expect(srgbChannelToLinear(n / 255)).toBe(legacy(n / 255));
    }
  });

  it('differs from the 0.03928 definition only for non-8-bit values in between', () => {
    const v = 0.04;
    const legacy = ((v + 0.055) / 1.055) ** 2.4;
    expect(srgbChannelToLinear(v)).toBe(v / 12.92);
    expect(Math.abs(srgbChannelToLinear(v) - legacy)).toBeLessThan(1e-5);
  });
});

describe('contrastRatio', () => {
  // Hand-checked against the WCAG formula: (L1 + 0.05) / (L2 + 0.05).
  it.each([
    ['#000000', '#ffffff', 21],
    ['#777777', '#ffffff', 4.478],
    ['#767676', '#ffffff', 4.542],
    ['#595959', '#ffffff', 7.005],
    ['#949494', '#ffffff', 3.033],
    ['#ff0000', '#ffffff', 3.998],
    ['#0000ff', '#ffffff', 8.592],
    ['#00ff00', '#000000', 15.304],
    ['#336699', '#336699', 1],
  ])('%s on %s is %d:1', (foreground, background, expected) => {
    expect(contrastRatio(foreground, background)).toBeCloseTo(expected, 3);
  });

  it('is exactly 21 for black on white', () => {
    expect(contrastRatio('black', 'white')).toBe(21);
  });

  it('is symmetric for opaque colors and always within [1, 21]', () => {
    fc.assert(
      fc.property(opaqueRgb, opaqueRgb, (a, b) => {
        const ratio = contrastRatio(a, b);
        expect(ratio).toBe(contrastRatio(b, a));
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(21);
      }),
    );
  });

  it('composites a translucent foreground over the background first', () => {
    // 50% black over white blends to rgb(127.5 127.5 127.5).
    expect(contrastRatio('rgb(0 0 0 / 0.5)', '#ffffff')).toBe(
      contrastRatio({ r: 0.5, g: 0.5, b: 0.5, alpha: 1 }, '#ffffff'),
    );
    expect(contrastRatio('rgb(0 0 0 / 0.5)', '#ffffff')).toBeCloseTo(3.977, 3);
  });

  it('treats a fully transparent foreground as the background itself', () => {
    expect(contrastRatio('transparent', '#123456')).toBe(1);
  });

  it('rejects a translucent background, whose contrast depends on what is behind it', () => {
    expect(() => contrastRatio('#000', 'rgb(255 255 255 / 0.5)')).toThrow(InvalidArgumentError);
    expect(() => contrastRatio('#000', 'rgb(255 255 255 / 0.5)')).toThrow(/must be opaque/);
  });
});

describe('composite', () => {
  it('returns an opaque foreground unchanged and a transparent one as the background', () => {
    expect(composite('#ff0000', '#0000ff')).toEqual({ r: 1, g: 0, b: 0, alpha: 1 });
    expect(composite('transparent', '#0000ff')).toEqual({ r: 0, g: 0, b: 1, alpha: 1 });
  });

  it('blends linearly in gamma-encoded sRGB with source-over', () => {
    fc.assert(
      fc.property(opaqueRgb, opaqueRgb, unitInterval, (top, bottom, alpha) => {
        const blended = composite({ ...top, alpha }, bottom);
        expect(blended.alpha).toBe(1);
        expect(blended.r).toBeCloseTo(top.r * alpha + bottom.r * (1 - alpha), 12);
      }),
    );
  });

  it('combines alphas when both layers are translucent', () => {
    const result = composite('rgb(255 0 0 / 0.5)', 'rgb(0 0 255 / 0.5)');
    expect(result.alpha).toBe(0.75);
    expect(result.r).toBeCloseTo(2 / 3, 12);
    expect(result.b).toBeCloseTo(1 / 3, 12);
    expect(composite('transparent', 'transparent')).toEqual({ r: 0, g: 0, b: 0, alpha: 0 });
  });
});

describe('WCAG conformance', () => {
  it('knows the WCAG 2.2 minimums', () => {
    expect(requiredRatio()).toBe(4.5);
    expect(requiredRatio('AA', 'large-text')).toBe(3);
    expect(requiredRatio('AA', 'non-text')).toBe(3);
    expect(requiredRatio('AAA', 'text')).toBe(7);
    expect(requiredRatio('AAA', 'large-text')).toBe(4.5);
    expect(requiredRatio('AAA', 'non-text')).toBe(3);
  });

  it('rejects unknown levels and uses', () => {
    expect(() => requiredRatio('A' as never)).toThrow(/Unknown WCAG level "A"/);
    expect(() => requiredRatio('AA', 'icon' as never)).toThrow(/Unknown use "icon"/);
    expect(() => requiredRatio('toString' as never)).toThrow(InvalidArgumentError);
  });

  it('never rounds a ratio up to pass', () => {
    expect(checkRatio(4.499).aaText).toBe(false);
    expect(checkRatio(4.5).aaText).toBe(true);
    expect(meetsWcag(6.999, 'AAA')).toBe(false);
    expect(meetsWcag(7, 'AAA')).toBe(true);
  });

  it('reports every criterion for #777777 on white (fails AA text, passes large text)', () => {
    expect(checkContrast('#777777', '#ffffff')).toEqual({
      ratio: contrastRatio('#777777', '#ffffff'),
      aaText: false,
      aaLargeText: true,
      aaaText: false,
      aaaLargeText: false,
      nonText: true,
    });
  });

  it('rejects ratios that cannot exist', () => {
    expect(() => checkRatio(0.5)).toThrow(/from 1 to 21, got 0.5/);
    expect(() => checkRatio(Number.NaN)).toThrow(InvalidArgumentError);
    expect(() => meetsWcag(Number.POSITIVE_INFINITY)).toThrow(InvalidArgumentError);
  });
});
