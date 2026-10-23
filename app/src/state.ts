import type { ContrastUse, CvdType, WcagLevel } from 'contrastkit';

/** One editable palette color. `hex` is always a valid, opaque `#rrggbb`. */
export interface PaletteColor {
  readonly id: string;
  readonly name: string;
  readonly hex: string;
}

export type Simulation = 'none' | CvdType;

export const SIMULATIONS: readonly Simulation[] = [
  'none',
  'protanopia',
  'deuteranopia',
  'tritanopia',
];

/** The WCAG requirement the fix suggestions aim for. */
export interface FixTarget {
  readonly id: string;
  readonly label: string;
  readonly level: WcagLevel;
  readonly use: ContrastUse;
}

export const FIX_TARGETS: readonly FixTarget[] = [
  { id: 'AA-text', label: 'AA, normal text (4.5:1)', level: 'AA', use: 'text' },
  { id: 'AA-large-text', label: 'AA, large text (3:1)', level: 'AA', use: 'large-text' },
  { id: 'AAA-text', label: 'AAA, normal text (7:1)', level: 'AAA', use: 'text' },
  { id: 'AAA-large-text', label: 'AAA, large text (4.5:1)', level: 'AAA', use: 'large-text' },
  { id: 'non-text', label: 'Non-text UI (3:1)', level: 'AA', use: 'non-text' },
];

export const DEFAULT_TARGET_ID = 'AA-text';

export function findTarget(id: string): FixTarget {
  return FIX_TARGETS.find((target) => target.id === id) ?? defaultTarget();
}

function defaultTarget(): FixTarget {
  const [first] = FIX_TARGETS;
  if (first === undefined) throw new Error('FIX_TARGETS is empty');
  return first;
}

export const MIN_COLORS = 2;
export const MAX_COLORS = 12;
export const MAX_NAME_LENGTH = 40;

export interface AppState {
  readonly colors: readonly PaletteColor[];
  /** The selected pair: text color and background color. */
  readonly foregroundId: string;
  readonly backgroundId: string;
  readonly simulation: Simulation;
  readonly targetId: string;
  /** Source of new ids; only ever increases, so ids are never reused. */
  readonly nextId: number;
}

/** The state that is shared through the URL (ids are local, so colors are by position). */
export interface SharedState {
  readonly colors: readonly { readonly name: string; readonly hex: string }[];
  readonly foreground: number;
  readonly background: number;
  readonly simulation: Simulation;
  readonly targetId: string;
}

export const DEFAULT_SHARED_STATE: SharedState = {
  colors: [
    { name: 'Ink', hex: '#1f2933' },
    { name: 'Slate', hex: '#616e7c' },
    { name: 'Paper', hex: '#ffffff' },
    { name: 'Mist', hex: '#e4e7eb' },
    { name: 'Ocean', hex: '#2b6cb0' },
    { name: 'Leaf', hex: '#2f855a' },
    { name: 'Ember', hex: '#c53030' },
  ],
  foreground: 1,
  background: 3,
  simulation: 'none',
  targetId: DEFAULT_TARGET_ID,
};

/** Colors offered for newly added entries, in order. */
const NEW_COLOR_HEXES = ['#6b46c1', '#b7791f', '#2c7a7b', '#d53f8c', '#4a5568', '#9c4221'];

export function fromShared(shared: SharedState): AppState {
  const colors = shared.colors.map((color, index) => ({ id: `c${index}`, ...color }));
  const idAt = (index: number): string => colors[index]?.id ?? colors[0]?.id ?? '';
  return {
    colors,
    foregroundId: idAt(shared.foreground),
    backgroundId: idAt(shared.background),
    simulation: shared.simulation,
    targetId: shared.targetId,
    nextId: colors.length,
  };
}

export function toShared(state: AppState): SharedState {
  const indexOf = (id: string): number =>
    Math.max(
      0,
      state.colors.findIndex((color) => color.id === id),
    );
  return {
    colors: state.colors.map(({ name, hex }) => ({ name, hex })),
    foreground: indexOf(state.foregroundId),
    background: indexOf(state.backgroundId),
    simulation: state.simulation,
    targetId: state.targetId,
  };
}

export type Action =
  | { readonly type: 'add'; readonly color: PaletteColor }
  | { readonly type: 'remove'; readonly id: string }
  | { readonly type: 'rename'; readonly id: string; readonly name: string }
  | { readonly type: 'recolor'; readonly id: string; readonly hex: string }
  | { readonly type: 'select'; readonly foregroundId: string; readonly backgroundId: string }
  | { readonly type: 'swap' }
  | { readonly type: 'simulate'; readonly simulation: Simulation }
  | { readonly type: 'target'; readonly targetId: string }
  | { readonly type: 'load'; readonly shared: SharedState };

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'add':
      if (state.colors.length >= MAX_COLORS) return state;
      return { ...state, colors: [...state.colors, action.color], nextId: state.nextId + 1 };
    case 'remove': {
      if (state.colors.length <= MIN_COLORS) return state;
      const colors = state.colors.filter((color) => color.id !== action.id);
      if (colors.length === state.colors.length) return state;
      // Keep the selected pair on colors that still exist, and on two different ones.
      const remaining = colors.map((color) => color.id);
      const keep = (id: string, other: string): string =>
        remaining.includes(id) ? id : (remaining.find((candidate) => candidate !== other) ?? id);
      const foregroundId = keep(state.foregroundId, state.backgroundId);
      return {
        ...state,
        colors,
        foregroundId,
        backgroundId: keep(state.backgroundId, foregroundId),
      };
    }
    case 'rename':
      return updateColor(state, action.id, { name: action.name.slice(0, MAX_NAME_LENGTH) });
    case 'recolor':
      return updateColor(state, action.id, { hex: action.hex.toLowerCase() });
    case 'select':
      return { ...state, foregroundId: action.foregroundId, backgroundId: action.backgroundId };
    case 'swap':
      return { ...state, foregroundId: state.backgroundId, backgroundId: state.foregroundId };
    case 'simulate':
      return { ...state, simulation: action.simulation };
    case 'target':
      return { ...state, targetId: action.targetId };
    case 'load':
      return fromShared(action.shared);
  }
}

function updateColor(
  state: AppState,
  id: string,
  change: Partial<Pick<PaletteColor, 'name' | 'hex'>>,
): AppState {
  return {
    ...state,
    colors: state.colors.map((color) => (color.id === id ? { ...color, ...change } : color)),
  };
}

/** The color the "Add color" button creates next: a fresh id, a free name, a new hue. */
export function createColor(state: AppState): PaletteColor {
  const taken = new Set(state.colors.map((color) => color.name.trim().toLowerCase()));
  let number = state.colors.length + 1;
  while (taken.has(`color ${number}`)) number++;
  return {
    id: `c${state.nextId}`,
    name: `Color ${number}`,
    hex: NEW_COLOR_HEXES[state.nextId % NEW_COLOR_HEXES.length] ?? '#4a5568',
  };
}

/** Why a name cannot be used, or undefined when it is fine. */
export function nameProblem(
  colors: readonly PaletteColor[],
  id: string,
  name: string,
): string | undefined {
  const trimmed = name.trim();
  if (trimmed === '') return 'Enter a name.';
  const duplicate = colors.some(
    (color) => color.id !== id && color.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  return duplicate ? 'Another color already has this name.' : undefined;
}

/** A readable label even while a name is being edited and is temporarily empty. */
export function displayName(color: PaletteColor): string {
  return color.name.trim() === '' ? 'Unnamed color' : color.name.trim();
}
