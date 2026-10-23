import { formatRatio } from 'contrastkit';
import { useRef, useState, type KeyboardEvent } from 'react';
import { displayName, type PaletteColor } from '../state';

export type BadgeTone = 'aaa' | 'aa' | 'large' | 'fail';

export interface Badge {
  readonly tone: BadgeTone;
  readonly label: string;
  readonly description: string;
}

/** The highest WCAG requirement a ratio meets, summarized for one matrix cell. */
export function badgeFor(ratio: number): Badge {
  if (ratio >= 7) return { tone: 'aaa', label: 'AAA', description: 'passes AAA for all text' };
  if (ratio >= 4.5) return { tone: 'aa', label: 'AA', description: 'passes AA for normal text' };
  if (ratio >= 3) {
    return { tone: 'large', label: 'Large', description: 'large text and non-text UI only' };
  }
  return { tone: 'fail', label: 'Fail', description: 'fails every contrast requirement' };
}

interface ContrastMatrixProps {
  readonly colors: readonly PaletteColor[];
  readonly matrix: readonly (readonly number[])[];
  readonly shownHex: (id: string) => string;
  readonly foregroundId: string;
  readonly backgroundId: string;
  readonly onSelect: (foregroundId: string, backgroundId: string) => void;
}

/**
 * The pairwise contrast table as an ARIA grid: one Tab stop for the whole table, arrow
 * keys (plus Home/End, and Ctrl+Home/End) to move between cells, Enter or Space to preview
 * a pair. Each cell's text says the pair, the ratio and the level, so nothing depends on
 * the swatch colors.
 */
export function ContrastMatrix({
  colors,
  matrix,
  shownHex,
  foregroundId,
  backgroundId,
  onSelect,
}: ContrastMatrixProps) {
  const tableRef = useRef<HTMLTableElement>(null);
  const [active, setActive] = useState(() => [
    Math.max(
      0,
      colors.findIndex((color) => color.id === foregroundId),
    ),
    Math.max(
      0,
      colors.findIndex((color) => color.id === backgroundId),
    ),
  ]);
  const last = colors.length - 1;
  // Removing colors can leave the remembered cell outside the grid; clamp it.
  const activeRow = Math.min(active[0] ?? 0, last);
  const activeColumn = Math.min(active[1] ?? 0, last);

  const moveTo = (row: number, column: number): void => {
    setActive([row, column]);
    tableRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${row}-${column}"]`)?.focus();
  };

  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    row: number,
    column: number,
  ): void => {
    const target: Partial<Record<string, [number, number]>> = {
      ArrowRight: [row, Math.min(column + 1, last)],
      ArrowLeft: [row, Math.max(column - 1, 0)],
      ArrowDown: [Math.min(row + 1, last), column],
      ArrowUp: [Math.max(row - 1, 0), column],
      Home: event.ctrlKey ? [0, 0] : [row, 0],
      End: event.ctrlKey ? [last, last] : [row, last],
    };
    const next = target[event.key];
    if (next === undefined) return;
    event.preventDefault();
    moveTo(...next);
  };

  return (
    <section className="panel" aria-labelledby="matrix-heading">
      <h2 id="matrix-heading">Contrast matrix</h2>
      <p id="matrix-help" className="field-hint">
        Rows are text colors and columns are backgrounds. Use the arrow keys to move between cells
        and Enter to preview a pair.
      </p>
      <div className="matrix-scroll">
        <table
          role="grid"
          ref={tableRef}
          className="matrix"
          aria-labelledby="matrix-heading"
          aria-describedby="matrix-help"
        >
          <thead>
            <tr>
              <th scope="col" className="matrix-corner">
                Text \ background
              </th>
              {colors.map((color) => (
                <th scope="col" key={color.id}>
                  <span
                    className="swatch"
                    style={{ background: shownHex(color.id) }}
                    aria-hidden="true"
                  />
                  <span className="matrix-name">{displayName(color)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {colors.map((foreground, row) => (
              <tr key={foreground.id}>
                <th scope="row">
                  <span
                    className="swatch"
                    style={{ background: shownHex(foreground.id) }}
                    aria-hidden="true"
                  />
                  <span className="matrix-name">{displayName(foreground)}</span>
                </th>
                {colors.map((background, column) => {
                  const ratio = matrix[row]?.[column] ?? 1;
                  const badge = badgeFor(ratio);
                  const ratioText = formatRatio(ratio).slice(0, -2);
                  const selected = foreground.id === foregroundId && background.id === backgroundId;
                  return (
                    <td key={background.id}>
                      <button
                        type="button"
                        className="cell"
                        data-cell={`${row}-${column}`}
                        tabIndex={row === activeRow && column === activeColumn ? 0 : -1}
                        aria-pressed={selected}
                        // WCAG 2.5.3 (Label in Name): the name starts with the visible text.
                        aria-label={`${ratioText} ${badge.label}, ${displayName(foreground)} on ${displayName(background)}: ${badge.description}`}
                        onClick={() => {
                          setActive([row, column]);
                          onSelect(foreground.id, background.id);
                        }}
                        onKeyDown={(event) => {
                          onKeyDown(event, row, column);
                        }}
                      >
                        <span
                          className="chip"
                          style={{ background: shownHex(background.id) }}
                          aria-hidden="true"
                        >
                          <span
                            className="chip-mark"
                            style={{ background: shownHex(foreground.id) }}
                          />
                        </span>
                        <span className="cell-ratio">{ratioText}</span>{' '}
                        <span className={`badge badge-${badge.tone}`}>{badge.label}</span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="legend">
        <div>
          <dt>
            <span className="badge badge-aaa">AAA</span>
          </dt>
          <dd>7:1 or more: every text size at AAA.</dd>
        </div>
        <div>
          <dt>
            <span className="badge badge-aa">AA</span>
          </dt>
          <dd>4.5:1 or more: normal text at AA, large text at AAA.</dd>
        </div>
        <div>
          <dt>
            <span className="badge badge-large">Large</span>
          </dt>
          <dd>3:1 or more: large text (24px, or 18.66px bold) and non-text UI only.</dd>
        </div>
        <div>
          <dt>
            <span className="badge badge-fail">Fail</span>
          </dt>
          <dd>Below 3:1: fails every WCAG 2.2 contrast requirement.</dd>
        </div>
      </dl>
    </section>
  );
}
