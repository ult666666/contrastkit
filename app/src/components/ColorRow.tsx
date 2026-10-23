import { formatHex, tryParseColor } from 'contrastkit';
import { useId, useState, type ChangeEvent } from 'react';
import { displayName, type PaletteColor } from '../state';

interface ColorRowProps {
  readonly color: PaletteColor;
  readonly position: number;
  /** The color as currently drawn (simulated when a CVD simulation is on). */
  readonly shownHex: string;
  readonly nameError: string | undefined;
  readonly canRemove: boolean;
  readonly onRename: (name: string) => void;
  readonly onRecolor: (hex: string) => void;
  readonly onRemove: () => void;
}

/**
 * One palette entry: a name, a native color picker and a text field that accepts any CSS
 * color contrastkit can parse. The text field keeps what the person typed (for example
 * "rebeccapurple") and only commits valid, opaque colors.
 */
export function ColorRow({
  color,
  position,
  shownHex,
  nameError,
  canRemove,
  onRename,
  onRecolor,
  onRemove,
}: ColorRowProps) {
  const id = useId();
  const [draft, setDraft] = useState(color.hex);
  const [syncedHex, setSyncedHex] = useState(color.hex);
  const [valueError, setValueError] = useState<string>();

  // When the color changes elsewhere (an applied fix, a loaded link), show the new value.
  // This is React's "adjust state when a prop changes" pattern, without an effect.
  if (color.hex !== syncedHex) {
    setSyncedHex(color.hex);
    setDraft(color.hex);
    setValueError(undefined);
  }

  // Commits a color typed into the text field, keeping the text as typed.
  const commit = (hex: string): void => {
    setSyncedHex(hex);
    onRecolor(hex);
  };

  // The picker always produces #rrggbb; show it in the text field as well.
  const onPickerChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const hex = event.target.value.toLowerCase();
    setDraft(hex);
    setValueError(undefined);
    commit(hex);
  };

  const onValueChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const text = event.target.value;
    setDraft(text);
    const parsed = tryParseColor(text);
    if (!parsed.ok) {
      setValueError(`Not a color contrastkit understands: ${parsed.error.reason}.`);
    } else if (parsed.color.alpha < 1) {
      setValueError(
        'Use an opaque color: contrast with a translucent color depends on what is behind it.',
      );
    } else {
      setValueError(undefined);
      commit(formatHex(parsed.color));
    }
  };

  const label = displayName(color);
  return (
    <li className="color-row">
      <fieldset>
        <legend className="visually-hidden">
          Color {position}: {label}
        </legend>
        <span className="swatch swatch-large" style={{ background: shownHex }} aria-hidden="true" />
        <div className="field field-name">
          <label htmlFor={`${id}-name`}>Name</label>
          <input
            id={`${id}-name`}
            data-color-id={color.id}
            className="name-input"
            value={color.name}
            maxLength={40}
            autoComplete="off"
            aria-invalid={nameError !== undefined}
            aria-describedby={nameError === undefined ? undefined : `${id}-name-error`}
            onChange={(event) => {
              onRename(event.target.value);
            }}
          />
          {nameError !== undefined && (
            <p id={`${id}-name-error`} className="field-error">
              {nameError}
            </p>
          )}
        </div>
        <div className="field field-picker">
          <label htmlFor={`${id}-picker`}>Picker</label>
          <input id={`${id}-picker`} type="color" value={color.hex} onChange={onPickerChange} />
        </div>
        <div className="field field-value">
          <label htmlFor={`${id}-value`}>CSS color</label>
          <input
            id={`${id}-value`}
            className="value-input"
            value={draft}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={valueError !== undefined}
            aria-describedby={valueError === undefined ? `${id}-value-hint` : `${id}-value-error`}
            onChange={onValueChange}
          />
          {valueError === undefined ? (
            <p id={`${id}-value-hint`} className="field-hint">
              Hex, rgb(), hsl(), oklch() or a name
            </p>
          ) : (
            <p id={`${id}-value-error`} className="field-error">
              {valueError}
            </p>
          )}
        </div>
        <button
          type="button"
          className="button-secondary remove-button"
          disabled={!canRemove}
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          Remove
        </button>
      </fieldset>
    </li>
  );
}
