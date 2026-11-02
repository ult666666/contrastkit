import type { CvdConfusion } from 'contrastkit';
import { SIMULATIONS, isAnomalous, type Simulation } from '../state';

export const SIMULATION_LABELS: Readonly<Record<Simulation, string>> = {
  none: 'Typical color vision',
  protanopia: 'Protanopia (no red-sensitive cones)',
  deuteranopia: 'Deuteranopia (no green-sensitive cones)',
  tritanopia: 'Tritanopia (no blue-sensitive cones)',
  protanomaly: 'Protanomaly (weak red-sensitive cones)',
  deuteranomaly: 'Deuteranomaly (weak green-sensitive cones)',
  tritanomaly: 'Tritanomaly (weak blue-sensitive cones)',
};

/** The complete form that each anomalous trichromacy reaches at severity 1. */
const COMPLETE_FORM: Readonly<Record<string, string>> = {
  protanomaly: 'protanopia',
  deuteranomaly: 'deuteranopia',
  tritanomaly: 'tritanopia',
};

/** "Deuteranomaly (weak green-sensitive cones), severity 0.60", or the plain label. */
export function describeSimulation(simulation: Simulation, severity: number): string {
  const label = SIMULATION_LABELS[simulation];
  return isAnomalous(simulation) ? `${label}, severity ${severity.toFixed(2)}` : label;
}

interface VisionPanelProps {
  readonly simulation: Simulation;
  readonly severity: number;
  readonly confusions: readonly CvdConfusion[];
  readonly threshold: number;
  readonly nameOf: (id: string) => string;
  readonly onSimulate: (simulation: Simulation) => void;
  readonly onSeverity: (severity: number) => void;
}

export function VisionPanel({
  simulation,
  severity,
  confusions,
  threshold,
  nameOf,
  onSimulate,
  onSeverity,
}: VisionPanelProps) {
  return (
    <section className="panel" aria-labelledby="vision-heading">
      <h2 id="vision-heading">Color vision</h2>
      <fieldset className="radio-group">
        <legend>Draw colors as seen with</legend>
        {SIMULATIONS.map((option) => (
          <label key={option} className="radio">
            <input
              type="radio"
              name="simulation"
              value={option}
              checked={simulation === option}
              onChange={() => {
                onSimulate(option);
              }}
            />
            {SIMULATION_LABELS[option]}
          </label>
        ))}
      </fieldset>
      {isAnomalous(simulation) && (
        <div className="field severity">
          <label htmlFor="severity">Severity</label>
          <input
            id="severity"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={severity}
            // A link can set a severity between the 0.05 steps, which the input itself would
            // report snapped to a step; the text names the severity that is simulated.
            aria-valuetext={severity.toFixed(2)}
            aria-describedby="severity-hint"
            onChange={(event) => {
              onSeverity(Number(event.target.value));
            }}
          />
          {/* Plain text, not <output>: that is a live region and would repeat every step. */}
          <span className="severity-value">{severity.toFixed(2)}</span>
          <p id="severity-hint" className="field-hint">
            0 is typical vision and 1 is {COMPLETE_FORM[simulation]}. The model&apos;s severity is
            not a clinical measurement.
          </p>
        </div>
      )}
      <p className="field-hint">
        Simulations use the model of Machado, Oliveira and Fernandes (2009) and are approximations.
        Contrast ratios always use the palette&apos;s own colors.
      </p>

      <h3>Hard to tell apart</h3>
      {confusions.length === 0 ? (
        <p>
          No pair drops below a color difference of {threshold} (ΔE<sub>OK</sub>) in any simulation.
        </p>
      ) : (
        <ul className="confusions">
          {confusions.map((confusion) => (
            <li key={`${confusion.type}-${confusion.severity}-${confusion.a}-${confusion.b}`}>
              <strong>{nameOf(confusion.a)}</strong> and <strong>{nameOf(confusion.b)}</strong> with{' '}
              {confusion.type}
              {isAnomalous(confusion.type) && ` at severity ${confusion.severity.toFixed(2)}`}: ΔE
              <sub>OK</sub> {confusion.deltaE.toFixed(3)} (typical vision{' '}
              {confusion.typicalDeltaE.toFixed(3)})
            </li>
          ))}
        </ul>
      )}
      {confusions.length > 0 && (
        <p className="field-hint">
          Don&apos;t rely on color alone to tell these pairs apart; add text, icons or patterns
          (WCAG 1.4.1).
        </p>
      )}
    </section>
  );
}
