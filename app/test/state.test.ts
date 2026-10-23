import { describe, expect, it } from 'vitest';
import {
  createColor,
  DEFAULT_SHARED_STATE,
  displayName,
  findTarget,
  fromShared,
  MAX_COLORS,
  nameProblem,
  reducer,
  toShared,
  type AppState,
} from '../src/state';

const initial = fromShared(DEFAULT_SHARED_STATE);

function twoColors(): AppState {
  return fromShared({
    ...DEFAULT_SHARED_STATE,
    colors: [
      { name: 'A', hex: '#000000' },
      { name: 'B', hex: '#ffffff' },
    ],
    foreground: 0,
    background: 1,
  });
}

describe('app state', () => {
  it('starts from the default palette with Slate on Mist selected', () => {
    expect(initial.colors).toHaveLength(7);
    expect(initial.colors.find((color) => color.id === initial.foregroundId)?.name).toBe('Slate');
    expect(initial.colors.find((color) => color.id === initial.backgroundId)?.name).toBe('Mist');
    expect(toShared(initial)).toEqual(DEFAULT_SHARED_STATE);
  });

  it('adds colors with fresh ids and free names, up to the maximum', () => {
    let state = initial;
    while (state.colors.length < MAX_COLORS) {
      state = reducer(state, { type: 'add', color: createColor(state) });
    }
    const ids = new Set(state.colors.map((color) => color.id));
    const names = new Set(state.colors.map((color) => color.name));
    expect(ids.size).toBe(MAX_COLORS);
    expect(names.size).toBe(MAX_COLORS);
    expect(reducer(state, { type: 'add', color: createColor(state) })).toBe(state);
  });

  it('skips names that are already taken', () => {
    const state = reducer(initial, {
      type: 'rename',
      id: initial.colors[0]?.id ?? '',
      name: 'Color 8',
    });
    expect(createColor(state).name).toBe('Color 9');
  });

  it('keeps the selected pair valid and distinct when a selected color is removed', () => {
    const state = reducer(initial, { type: 'remove', id: initial.foregroundId });
    expect(state.colors).toHaveLength(6);
    const ids = state.colors.map((color) => color.id);
    expect(ids).toContain(state.foregroundId);
    expect(ids).toContain(state.backgroundId);
    expect(state.foregroundId).not.toBe(state.backgroundId);

    const bothSame = reducer(
      reducer(initial, { type: 'select', foregroundId: 'c2', backgroundId: 'c2' }),
      { type: 'remove', id: 'c2' },
    );
    expect(bothSame.foregroundId).not.toBe(bothSame.backgroundId);
  });

  it('never drops below two colors and ignores unknown ids', () => {
    const state = twoColors();
    expect(reducer(state, { type: 'remove', id: 'c0' })).toBe(state);
    expect(reducer(initial, { type: 'remove', id: 'nope' })).toBe(initial);
  });

  it('renames (capped at 40 characters) and recolors', () => {
    const renamed = reducer(initial, { type: 'rename', id: 'c0', name: 'x'.repeat(50) });
    expect(renamed.colors[0]?.name).toHaveLength(40);
    const recolored = reducer(initial, { type: 'recolor', id: 'c0', hex: '#ABCDEF' });
    expect(recolored.colors[0]?.hex).toBe('#abcdef');
  });

  it('selects, swaps, simulates, retargets and loads', () => {
    const selected = reducer(initial, { type: 'select', foregroundId: 'c0', backgroundId: 'c2' });
    expect(selected).toMatchObject({ foregroundId: 'c0', backgroundId: 'c2' });
    expect(reducer(selected, { type: 'swap' })).toMatchObject({
      foregroundId: 'c2',
      backgroundId: 'c0',
    });
    expect(reducer(initial, { type: 'simulate', simulation: 'tritanopia' }).simulation).toBe(
      'tritanopia',
    );
    expect(reducer(initial, { type: 'target', targetId: 'AAA-text' }).targetId).toBe('AAA-text');
    expect(reducer(selected, { type: 'load', shared: DEFAULT_SHARED_STATE })).toEqual(initial);
  });

  it('validates names', () => {
    expect(nameProblem(initial.colors, 'c0', '  ')).toBe('Enter a name.');
    expect(nameProblem(initial.colors, 'c0', 'slate')).toBe('Another color already has this name.');
    expect(nameProblem(initial.colors, 'c1', 'Slate')).toBeUndefined();
    expect(displayName({ id: 'x', name: ' ', hex: '#000000' })).toBe('Unnamed color');
  });

  it('falls back to the default fix target for unknown ids', () => {
    expect(findTarget('AAA-large-text').level).toBe('AAA');
    expect(findTarget('unknown').id).toBe('AA-text');
  });
});
