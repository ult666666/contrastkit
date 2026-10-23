import type { CvdConfusion } from 'contrastkit';
import { SIMULATIONS, type Simulation } from '../state';

export const SIMULATION_LABELS: Readonly<Record<Simulation, string>> = {
  none: 'Typical color vision',
  protanopia: 'Protanopia (no red-sensitive cones)',
  deuteranopia: 'Deuteranopia (no green-sensitive cones)',
  tritanopia: 'Tritanopia (no blue-sensitive cones)',
};

interface VisionPanelProps {
  readonly simulation: Simulation;
  readonly confusions: readonly CvdConfusion[];
  readonly threshold: number;
  readonly nameOf: (id: string) => string;
  readonly onSimulate: (simulation: Simulation) => void;
}

export function VisionPanel({
  simulation,
  confusions,
  threshold,
  nameOf,
  onSimulate,
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
      <p className="field-hint">
        Simulations follow Machado, Oliveira and Fernandes (2009) for complete loss of one cone
        type. They are approximations. Contrast ratios always use the actual colors.
      </p>

      <h3>Hard to tell apart</h3>
      {confusions.length === 0 ? (
        <p>
          No pair drops below a color difference of {threshold} (ΔE<sub>OK</sub>) in any simulation.
        </p>
      ) : (
        <ul className="confusions">
          {confusions.map((confusion) => (
            <li key={`${confusion.type}-${confusion.a}-${confusion.b}`}>
              <strong>{nameOf(confusion.a)}</strong> and <strong>{nameOf(confusion.b)}</strong> with{' '}
              {confusion.type}: ΔE<sub>OK</sub> {confusion.deltaE.toFixed(3)} (typical vision{' '}
              {confusion.typicalDeltaE.toFixed(3)})
            </li>
          ))}
        </ul>
      )}
      {confusions.length > 0 && (
        <p className="field-hint">
          Pairs listed here should not be the only way to tell two things apart: add text, icons or
          patterns (WCAG 1.4.1, Use of Color).
        </p>
      )}
    </section>
  );
}
