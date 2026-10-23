import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { formatHex, formatHsl, formatOklch, formatRatio, formatRgb } from '../src/format';
import { parseColor } from '../src/parse';
import { opaqueRgb8 } from './arbitraries';

describe('formatHex', () => {
  it('writes opaque colors as #rrggbb and translucent ones as #rrggbbaa', () => {
    expect(formatHex({ r: 1, g: 0.5, b: 0, alpha: 1 })).toBe('#ff8000');
    expect(formatHex({ r: 1, g: 0.5, b: 0, alpha: 0.5 })).toBe('#ff800080');
  });

  it('clamps out-of-range channels', () => {
    expect(formatHex({ r: 1.2, g: -0.1, b: 0, alpha: 1 })).toBe('#ff0000');
  });

  it('round-trips every 8-bit color through parseColor', () => {
    fc.assert(
      fc.property(opaqueRgb8, (color) => {
        expect(parseColor(formatHex(color))).toEqual(color);
      }),
    );
  });
});

describe('formatRgb, formatHsl and formatOklch', () => {
  it('use CSS Color 4 space-separated syntax', () => {
    const orange = parseColor('#ff8800');
    expect(formatRgb(orange)).toBe('rgb(255 136 0)');
    expect(formatHsl(parseColor('#336699'))).toBe('hsl(210 50% 40%)');
    expect(formatOklch(parseColor('#ff0000'))).toBe('oklch(62.8% 0.2577 29.23)');
  });

  it('add alpha after a slash only when the color is translucent', () => {
    const translucent = parseColor('rgb(255 0 0 / 0.25)');
    expect(formatRgb(translucent)).toBe('rgb(255 0 0 / 0.25)');
    expect(formatHsl(translucent)).toBe('hsl(0 100% 50% / 0.25)');
    expect(formatOklch(translucent)).toBe('oklch(62.8% 0.2577 29.23 / 0.25)');
  });

  it('give neutral colors hue 0 in oklch()', () => {
    expect(formatOklch(parseColor('#808080'))).toBe('oklch(59.99% 0 0)');
  });

  it('round-trip rgb() exactly and oklch() to within one 8-bit step', () => {
    // oklch() is printed with display precision (4 decimals of chroma), which is not
    // always enough to pin down an exact 8-bit value.
    fc.assert(
      fc.property(opaqueRgb8, (color) => {
        expect(parseColor(formatRgb(color))).toEqual(color);
        const back = parseColor(formatOklch(color));
        for (const channel of ['r', 'g', 'b'] as const) {
          const steps = Math.abs(
            Math.round(back[channel] * 255) - Math.round(color[channel] * 255),
          );
          expect(steps).toBeLessThanOrEqual(1);
        }
      }),
    );
  });
});

describe('formatRatio', () => {
  it.each([
    [21, '21.00:1'],
    [20.999999999999996, '21.00:1'],
    [4.478089453577214, '4.47:1'],
    [4.4999, '4.49:1'],
    [4.5, '4.50:1'],
    [1, '1.00:1'],
  ])('formats %d as %s (truncated, never rounded up)', (ratio, expected) => {
    expect(formatRatio(ratio)).toBe(expected);
  });
});
