import {
  DEFAULT_TARGET_ID,
  FIX_TARGETS,
  MAX_COLORS,
  MAX_NAME_LENGTH,
  MIN_COLORS,
  SIMULATIONS,
  type SharedState,
  type Simulation,
} from './state';

/**
 * Serializes the shareable state into a URL hash, e.g.
 * `#c=Ink.1f2933&c=Paper.ffffff&fg=0&bg=1&sim=none&target=AA-text`.
 *
 * Each color is `name.hex`; names may contain dots because the hex never does, so
 * decoding splits at the last one. URLSearchParams takes care of escaping.
 */
export function encodeHash(state: SharedState): string {
  const params = new URLSearchParams();
  for (const { name, hex } of state.colors) params.append('c', `${name}.${hex.replace('#', '')}`);
  params.set('fg', String(state.foreground));
  params.set('bg', String(state.background));
  params.set('sim', state.simulation);
  params.set('target', state.targetId);
  return `#${params.toString()}`;
}

/**
 * Reads state from a URL hash. Returns undefined for an empty hash and null for one that
 * is not a valid palette, so the app can tell "nothing shared" from "broken link".
 */
export function decodeHash(hash: string): SharedState | undefined | null {
  const query = hash.startsWith('#') ? hash.slice(1) : hash;
  if (query === '') return undefined;
  const params = new URLSearchParams(query);

  const colors: { name: string; hex: string }[] = [];
  for (const entry of params.getAll('c')) {
    const dot = entry.lastIndexOf('.');
    const name = entry.slice(0, dot);
    const hex = entry.slice(dot + 1);
    if (dot < 0 || name.length > MAX_NAME_LENGTH || !/^[0-9a-f]{6}$/i.test(hex)) return null;
    colors.push({ name, hex: `#${hex.toLowerCase()}` });
  }
  if (colors.length < MIN_COLORS || colors.length > MAX_COLORS) return null;

  // A missing index falls back to the first pair; a malformed one rejects the link.
  const index = (key: string, fallback: number): number | null => {
    const raw = params.get(key);
    if (raw === null) return fallback;
    const value = Number(raw);
    return /^\d+$/.test(raw) && value < colors.length ? value : null;
  };
  const foreground = index('fg', 0);
  const background = index('bg', 1);
  if (foreground === null || background === null) return null;

  const simulation = (params.get('sim') ?? 'none') as Simulation;
  if (!SIMULATIONS.includes(simulation)) return null;
  const targetId = params.get('target') ?? DEFAULT_TARGET_ID;
  if (!FIX_TARGETS.some((target) => target.id === targetId)) return null;

  return { colors, foreground, background, simulation, targetId };
}
