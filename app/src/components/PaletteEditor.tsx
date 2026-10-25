import { MAX_COLORS, MIN_COLORS, nameProblem, type PaletteColor } from '../state';
import { ColorRow } from './ColorRow';

interface PaletteEditorProps {
  readonly colors: readonly PaletteColor[];
  readonly shownHex: (id: string) => string;
  readonly exportProblem: string | undefined;
  readonly onExport: () => void;
  readonly onAdd: () => void;
  readonly onRemove: (id: string) => void;
  readonly onRename: (id: string, name: string) => void;
  readonly onRecolor: (id: string, hex: string) => void;
}

export function PaletteEditor({
  colors,
  shownHex,
  exportProblem,
  onExport,
  onAdd,
  onRemove,
  onRename,
  onRecolor,
}: PaletteEditorProps) {
  const canAdd = colors.length < MAX_COLORS;
  const canRemove = colors.length > MIN_COLORS;
  return (
    <section className="panel" aria-labelledby="palette-heading">
      <h2 id="palette-heading">Palette</h2>
      <ol className="color-list">
        {colors.map((color, index) => (
          <ColorRow
            key={color.id}
            color={color}
            position={index + 1}
            shownHex={shownHex(color.id)}
            nameError={nameProblem(colors, color.id, color.name)}
            canRemove={canRemove}
            onRename={(name) => {
              onRename(color.id, name);
            }}
            onRecolor={(hex) => {
              onRecolor(color.id, hex);
            }}
            onRemove={() => {
              onRemove(color.id);
            }}
          />
        ))}
      </ol>
      <div className="palette-actions">
        <button type="button" id="add-color" disabled={!canAdd} onClick={onAdd}>
          Add color
        </button>
        <button
          type="button"
          disabled={exportProblem !== undefined}
          aria-describedby="tokens-export-hint"
          onClick={onExport}
        >
          Download tokens JSON
        </button>
        <p className="field-hint" id="palette-limits">
          {canAdd
            ? `${colors.length} of ${MAX_COLORS} colors.`
            : `The palette is full (${MAX_COLORS} colors).`}{' '}
          {!canRemove && `A palette needs at least ${MIN_COLORS} colors.`}
        </p>
      </div>
      <p className="field-hint" id="tokens-export-hint" aria-live="polite">
        {exportProblem ??
          'Downloads actual colors and the selected pair and target for CLI audits.'}
      </p>
    </section>
  );
}
