import { auditPalette, contrastRatio, formatHex, formatRatio, simulateCvd } from 'contrastkit';
import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { flushSync } from 'react-dom';
import { ContrastMatrix } from './components/ContrastMatrix';
import { PairPreview } from './components/PairPreview';
import { PaletteEditor } from './components/PaletteEditor';
import { SIMULATION_LABELS, VisionPanel } from './components/VisionPanel';
import {
  createColor,
  DEFAULT_SHARED_STATE,
  displayName,
  findTarget,
  fromShared,
  reducer,
  toShared,
  type PaletteColor,
  type Simulation,
} from './state';
import { useTheme, type Theme } from './theme';
import { decodeHash, encodeHash } from './url-state';

const BROKEN_LINK_NOTICE =
  'This link’s palette could not be read, so the default palette is shown instead.';

interface Announcement {
  readonly id: number;
  readonly text: string;
}

export function App() {
  const [initial] = useState(() => decodeHash(window.location.hash));
  const [state, dispatch] = useReducer(reducer, initial ?? DEFAULT_SHARED_STATE, fromShared);
  const [notice, setNotice] = useState(initial === null ? BROKEN_LINK_NOTICE : undefined);
  const [announcement, setAnnouncement] = useState<Announcement>({ id: 0, text: '' });
  const [theme, setTheme] = useTheme();

  // A new node for every message makes screen readers announce repeats too.
  const announce = useCallback((text: string) => {
    setAnnouncement((previous) => ({ id: previous.id + 1, text }));
  }, []);

  // Keep the URL in sync so the address bar is always a shareable link. replaceState does
  // not add history entries, so Back still leaves the app.
  const hash = encodeHash(toShared(state));
  useEffect(() => {
    if (window.location.hash !== hash) window.history.replaceState(null, '', hash);
  }, [hash]);

  // A link pasted into this tab (or edited by hand) loads without a reload.
  useEffect(() => {
    const onHashChange = (): void => {
      const shared = decodeHash(window.location.hash);
      if (shared) {
        dispatch({ type: 'load', shared });
        setNotice(undefined);
      } else if (shared === null) {
        setNotice(BROKEN_LINK_NOTICE);
      }
    };
    window.addEventListener('hashchange', onHashChange);
    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  const { colors, simulation } = state;
  // Ids are unique even while two names are the same, so the audit works on ids.
  const audit = useMemo(
    () => auditPalette(colors.map((color) => ({ name: color.id, color: color.hex }))),
    [colors],
  );
  const shown = useCallback(
    (hex: string) => (simulation === 'none' ? hex : formatHex(simulateCvd(hex, simulation))),
    [simulation],
  );
  const byId = new Map(colors.map((color) => [color.id, color]));
  const colorById = (id: string): PaletteColor => byId.get(id) ?? fallbackColor(colors);
  const foreground = colorById(state.foregroundId);
  const background = colorById(state.backgroundId);
  const confusions =
    simulation === 'none'
      ? audit.cvdConfusions
      : audit.cvdConfusions.filter((confusion) => confusion.type === simulation);

  const addColor = (): void => {
    const color = createColor(state);
    flushSync(() => {
      dispatch({ type: 'add', color });
    });
    const input = document.querySelector<HTMLInputElement>(`[data-color-id="${color.id}"]`);
    input?.focus();
    input?.select();
    announce(`Added ${color.name}.`);
  };

  const removeColor = (id: string): void => {
    const index = colors.findIndex((color) => color.id === id);
    const neighbor = colors[index + 1] ?? colors[index - 1];
    flushSync(() => {
      dispatch({ type: 'remove', id });
    });
    // The removed row took focus with it; continue from its neighbor.
    if (neighbor) document.querySelector<HTMLElement>(`[data-color-id="${neighbor.id}"]`)?.focus();
    announce(`Removed ${displayName(colorById(id))}.`);
  };

  const applyFix = (hex: string): void => {
    dispatch({ type: 'recolor', id: foreground.id, hex });
    announce(
      `${displayName(foreground)} changed to ${hex}. Contrast on ${displayName(background)} is now ` +
        `${formatRatio(contrastRatio(hex, background.hex))}.`,
    );
  };

  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      announce('Link copied. It reopens this palette, pair and simulation.');
    } catch {
      announce('Could not copy automatically. Copy the address bar instead; it holds the link.');
    }
  };

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to main content
      </a>
      <header className="site-header">
        <div>
          <h1>Palette Auditor</h1>
          <p className="tagline">
            WCAG 2.2 contrast for every pair in a palette, perceptual fixes and color-vision checks.
          </p>
        </div>
        <div className="header-actions">
          <div className="field field-inline">
            <label htmlFor="theme">Theme</label>
            <select
              id="theme"
              value={theme}
              onChange={(event) => {
                setTheme(event.target.value as Theme);
              }}
            >
              <option value="system">Match system</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </div>
          <button type="button" onClick={() => void copyLink()}>
            Copy link
          </button>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        {notice !== undefined && (
          <div className="notice" role="alert">
            <p>{notice}</p>
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setNotice(undefined);
              }}
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="layout">
          <div className="column">
            <PaletteEditor
              colors={colors}
              shownHex={(id) => shown(colorById(id).hex)}
              onAdd={addColor}
              onRemove={removeColor}
              onRename={(id, name) => {
                dispatch({ type: 'rename', id, name });
              }}
              onRecolor={(id, hex) => {
                dispatch({ type: 'recolor', id, hex });
              }}
            />
            <VisionPanel
              simulation={simulation}
              confusions={confusions}
              threshold={audit.confusionThreshold}
              nameOf={(id) => displayName(colorById(id))}
              onSimulate={(next: Simulation) => {
                dispatch({ type: 'simulate', simulation: next });
                announce(
                  next === 'none'
                    ? 'Showing typical color vision.'
                    : `Simulating ${SIMULATION_LABELS[next]}.`,
                );
              }}
            />
          </div>
          <div className="column">
            <ContrastMatrix
              colors={colors}
              matrix={audit.matrix}
              shownHex={(id) => shown(colorById(id).hex)}
              foregroundId={foreground.id}
              backgroundId={background.id}
              onSelect={(foregroundId, backgroundId) => {
                dispatch({ type: 'select', foregroundId, backgroundId });
              }}
            />
            <PairPreview
              foreground={foreground}
              background={background}
              shown={shown}
              simulationLabel={simulation === 'none' ? undefined : SIMULATION_LABELS[simulation]}
              target={findTarget(state.targetId)}
              onTargetChange={(targetId) => {
                dispatch({ type: 'target', targetId });
              }}
              onSwap={() => {
                dispatch({ type: 'swap' });
                announce(`Swapped: ${displayName(background)} on ${displayName(foreground)}.`);
              }}
              onApplyFix={applyFix}
            />
          </div>
        </div>
        <div className="visually-hidden" role="status">
          <span key={announcement.id}>{announcement.text}</span>
        </div>
      </main>

      <footer className="site-footer">
        <p>
          Built with <a href="https://github.com/ult666666/contrastkit">contrastkit</a>. Contrast
          follows WCAG 2.2; color-vision simulation follows Machado et al. (2009). Everything runs
          in your browser.
        </p>
      </footer>
    </>
  );
}

function fallbackColor(colors: readonly PaletteColor[]): PaletteColor {
  const [first] = colors;
  if (first === undefined) throw new Error('The palette is empty');
  return first;
}
