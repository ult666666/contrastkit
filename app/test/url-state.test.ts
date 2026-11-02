import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEVERITY,
  DEFAULT_SHARED_STATE,
  FIX_TARGETS,
  SIMULATIONS,
  isAnomalous,
  type SharedState,
} from '../src/state';
import { decodeHash, encodeHash } from '../src/url-state';

const hexColor = fc
  .integer({ min: 0, max: 0xffffff })
  .map((n) => `#${n.toString(16).padStart(6, '0')}`);

const sharedState: fc.Arbitrary<SharedState> = fc
  .array(fc.record({ name: fc.string({ maxLength: 40 }), hex: hexColor }), {
    minLength: 2,
    maxLength: 12,
  })
  .chain((colors) =>
    fc.record({
      colors: fc.constant(colors),
      foreground: fc.integer({ min: 0, max: colors.length - 1 }),
      background: fc.integer({ min: 0, max: colors.length - 1 }),
      simulation: fc.constantFrom(...SIMULATIONS),
      severity: fc.double({ min: 0, max: 1, noNaN: true }),
      targetId: fc.constantFrom(...FIX_TARGETS.map((target) => target.id)),
    }),
  )
  // Only the anomalous trichromacies carry a severity in links.
  .map((state) =>
    isAnomalous(state.simulation) ? state : { ...state, severity: DEFAULT_SEVERITY },
  );

describe('URL hash state', () => {
  it('encodes the palette in a readable form', () => {
    expect(encodeHash(DEFAULT_SHARED_STATE)).toBe(
      '#c=Ink.1f2933&c=Slate.616e7c&c=Paper.ffffff&c=Mist.e4e7eb&c=Ocean.2b6cb0' +
        '&c=Leaf.2f855a&c=Ember.c53030&fg=1&bg=3&sim=none&target=AA-text',
    );
  });

  it('round-trips any valid state, including names with dots and symbols', () => {
    fc.assert(
      fc.property(sharedState, (state) => {
        expect(decodeHash(encodeHash(state))).toEqual(state);
      }),
    );
    const tricky: SharedState = {
      ...DEFAULT_SHARED_STATE,
      colors: [
        { name: 'text.primary', hex: '#111111' },
        { name: 'a&b=c #1 ✓', hex: '#eeeeee' },
      ],
      foreground: 0,
      background: 1,
    };
    expect(decodeHash(encodeHash(tricky))).toEqual(tricky);
  });

  it('writes an anomalous trichromacy with its severity and reads older links', () => {
    const state = { ...DEFAULT_SHARED_STATE, simulation: 'deuteranomaly' as const, severity: 0.35 };
    expect(encodeHash(state)).toContain('sim=deuteranomaly%3A0.35');
    expect(decodeHash(encodeHash(state))).toEqual(state);
    expect(decodeHash('#c=A.000000&c=B.ffffff&sim=deuteranopia')).toMatchObject({
      simulation: 'deuteranopia',
      severity: DEFAULT_SEVERITY,
    });
  });

  it('returns undefined for an empty hash', () => {
    expect(decodeHash('')).toBeUndefined();
    expect(decodeHash('#')).toBeUndefined();
  });

  it('falls back to the first pair when the indices are missing', () => {
    expect(decodeHash('#c=A.000000&c=B.ffffff')).toMatchObject({
      foreground: 0,
      background: 1,
      simulation: 'none',
      targetId: 'AA-text',
    });
  });

  it.each([
    ['#c=A.000000', 'too few colors'],
    [`#${Array.from({ length: 13 }, (_, i) => `c=C${i}.000000`).join('&')}`, 'too many colors'],
    ['#c=A.00000g&c=B.ffffff', 'a bad hex value'],
    ['#c=A&c=B.ffffff', 'a color without a hex value'],
    [`#c=${'x'.repeat(41)}.000000&c=B.ffffff`, 'a name that is too long'],
    ['#c=A.000000&c=B.ffffff&fg=2', 'an index out of range'],
    ['#c=A.000000&c=B.ffffff&bg=-1', 'a negative index'],
    ['#c=A.000000&c=B.ffffff&fg=0.5', 'a fractional index'],
    ['#c=A.000000&c=B.ffffff&sim=colorblind', 'an unknown simulation'],
    ['#c=A.000000&c=B.ffffff&sim=deuteranomaly', 'an anomalous simulation without a severity'],
    ['#c=A.000000&c=B.ffffff&sim=deuteranomaly:1.5', 'a severity above 1'],
    ['#c=A.000000&c=B.ffffff&sim=protanopia:0.5', 'a severity for a dichromacy'],
    ['#c=A.000000&c=B.ffffff&target=AAAA', 'an unknown target'],
  ])('rejects %s (%s)', (hash) => {
    expect(decodeHash(hash)).toBeNull();
  });
});
