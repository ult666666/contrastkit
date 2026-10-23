import { checkContrast, formatRatio, suggestFix, type ContrastChecks } from 'contrastkit';
import { useRef } from 'react';
import { displayName, FIX_TARGETS, type FixTarget, type PaletteColor } from '../state';

const CHECKS: readonly { key: keyof ContrastChecks; label: string; needs: string }[] = [
  { key: 'aaText', label: 'AA, normal text', needs: '4.5:1' },
  { key: 'aaLargeText', label: 'AA, large text', needs: '3:1' },
  { key: 'aaaText', label: 'AAA, normal text', needs: '7:1' },
  { key: 'aaaLargeText', label: 'AAA, large text', needs: '4.5:1' },
  { key: 'nonText', label: 'Non-text UI (SC 1.4.11)', needs: '3:1' },
];

interface PairPreviewProps {
  readonly foreground: PaletteColor;
  readonly background: PaletteColor;
  /** Applies the active color-vision simulation (identity when it is off). */
  readonly shown: (hex: string) => string;
  readonly simulationLabel: string | undefined;
  readonly target: FixTarget;
  readonly onTargetChange: (id: string) => void;
  readonly onSwap: () => void;
  readonly onApplyFix: (hex: string) => void;
}

export function PairPreview({
  foreground,
  background,
  shown,
  simulationLabel,
  target,
  onTargetChange,
  onSwap,
  onApplyFix,
}: PairPreviewProps) {
  const statusRef = useRef<HTMLParagraphElement>(null);
  const result = checkContrast(foreground.hex, background.hex);
  const fix = suggestFix(foreground.hex, background.hex, { level: target.level, use: target.use });
  const textName = displayName(foreground);
  const backgroundName = displayName(background);

  let status: string;
  switch (fix.status) {
    case 'passes':
      status = `Meets ${target.label}. Nothing to fix.`;
      break;
    case 'unachievable':
      status =
        `No lightness of ${textName} reaches ${fix.target}:1 on ${backgroundName}; the best ` +
        `possible is ${formatRatio(fix.maxRatio)}. Change the background instead.`;
      break;
    case 'fixed':
      status = `${formatRatio(fix.ratio)} misses ${target.label}. These keep the hue and change only lightness:`;
      break;
  }

  return (
    <section className="panel" aria-labelledby="preview-heading">
      <div className="panel-heading">
        <h2 id="preview-heading">
          {textName} on {backgroundName}
        </h2>
        <button type="button" className="button-secondary" onClick={onSwap}>
          Swap text and background
        </button>
      </div>

      <div
        className="sample"
        style={{ background: shown(background.hex), color: shown(foreground.hex) }}
      >
        <p className="sample-normal">
          Normal text at 16px: the quick brown fox jumps over the lazy dog.
        </p>
        <p className="sample-large">Large text at 24px</p>
        <p className="sample-bold">Bold text at 18.66px</p>
        <p className="sample-ui">
          <span
            className="sample-icon"
            style={{ borderColor: shown(foreground.hex) }}
            aria-hidden="true"
          />
          Icons and borders need 3:1
        </p>
      </div>
      <p className="field-hint">
        {simulationLabel === undefined
          ? 'Sample in the actual colors.'
          : `Sample drawn as simulated for ${simulationLabel}. The ratio below uses the actual colors.`}
      </p>

      <p className="ratio">
        <span className="ratio-value">{formatRatio(result.ratio)}</span> contrast
        <span className="field-hint">
          {' '}
          ({foreground.hex} on {background.hex})
        </span>
      </p>
      <ul className="checks">
        {CHECKS.map(({ key, label, needs }) => (
          <li key={key} className={result[key] ? 'check-pass' : 'check-fail'}>
            <span className="check-icon" aria-hidden="true">
              {result[key] ? '✓' : '✗'}
            </span>
            <strong>{result[key] ? 'Pass' : 'Fail'}</strong> {label}
            <span className="check-needs"> (needs {needs})</span>
          </li>
        ))}
      </ul>

      <h3>Fix the text color</h3>
      <div className="field field-inline">
        <label htmlFor="fix-target">Target</label>
        <select
          id="fix-target"
          value={target.id}
          onChange={(event) => {
            onTargetChange(event.target.value);
          }}
        >
          {FIX_TARGETS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <p ref={statusRef} tabIndex={-1} className="fix-status">
        {status}
      </p>
      {fix.status === 'fixed' && (
        <ul className="fixes">
          {fix.candidates.map((candidate, index) => (
            <li key={candidate.hex}>
              <span
                className="swatch swatch-large"
                style={{ background: shown(candidate.hex) }}
                aria-hidden="true"
              />
              <span className="fix-details">
                <strong>{candidate.hex}</strong> · {formatRatio(candidate.ratio)} ·{' '}
                {index === 0 ? 'closest' : candidate.direction}, ΔE<sub>OK</sub>{' '}
                {candidate.deltaE.toFixed(3)}
              </span>
              <button
                type="button"
                className={index === 0 ? undefined : 'button-secondary'}
                onClick={() => {
                  onApplyFix(candidate.hex);
                  // The fix list disappears once the pair passes; keep focus on the result.
                  statusRef.current?.focus();
                }}
              >
                {index === 0 ? 'Apply suggested fix' : 'Apply'}
                <span className="visually-hidden">
                  : change {textName} to {candidate.hex}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
