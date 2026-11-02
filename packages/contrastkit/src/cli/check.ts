import { parseArgs } from 'node:util';
import { checkContrast, composite, type ContrastResult } from '../contrast';
import { formatCvdSimulation, simulateCvd, type CvdSimulation } from '../cvd';
import { deltaEOK } from '../difference';
import { formatHex, formatRatio } from '../format';
import { parseColor } from '../parse';
import type { Rgb } from '../types';
import { EXIT } from './errors';
import {
  colorArgument,
  displayColor,
  expectPositionals,
  json,
  parseCommandLine,
  parseSimulations,
  resolveTarget,
  verdict,
  type CommandContext,
  type Target,
} from './shared';
import type { Style } from './style';

/** `contrastkit check <foreground> <background>`: the ratio and every WCAG check. */
export function runCheck(args: readonly string[], { io, style }: CommandContext): number {
  const { values, positionals } = parseCommandLine(() =>
    parseArgs({
      args: [...args],
      allowPositionals: true,
      options: {
        level: { type: 'string' },
        large: { type: 'boolean' },
        target: { type: 'string' },
        cvd: { type: 'string', multiple: true },
        json: { type: 'boolean' },
      },
    }),
  );
  const [foregroundArg = '', backgroundArg = ''] = expectPositionals('check', positionals, [
    'foreground',
    'background',
  ]);
  const target = resolveTarget(values);
  const foreground = parseColor(colorArgument(foregroundArg));
  const background = parseColor(colorArgument(backgroundArg));
  const result = checkContrast(foreground, background);
  const pass = result.ratio >= target.ratio;
  const simulations = parseSimulations(values.cvd)?.map((simulation) =>
    simulatePair(simulation, composite(foreground, background), background),
  );

  if (values.json === true) {
    io.stdout(
      json({
        foreground: displayColor(foreground),
        background: formatHex(background),
        ...(foreground.alpha < 1 && { blended: formatHex(composite(foreground, background)) }),
        ratio: result.ratio,
        checks: {
          aaText: result.aaText,
          aaLargeText: result.aaLargeText,
          aaaText: result.aaaText,
          aaaLargeText: result.aaaLargeText,
          nonText: result.nonText,
        },
        target: { ratio: target.ratio, level: target.level, use: target.use },
        ...(simulations && { simulations }),
        pass,
      }),
    );
  } else {
    io.stdout(renderCheck(style, foreground, background, result, target, pass, simulations));
  }
  return pass ? EXIT.ok : EXIT.failed;
}

interface SimulatedPair extends CvdSimulation {
  readonly foreground: string;
  readonly background: string;
  /** ΔE_OK between the simulated colors. */
  readonly deltaE: number;
  /** ΔE_OK between the actual colors. */
  readonly typicalDeltaE: number;
}

/** The pair as simulated; a translucent foreground is simulated as the color it blends to. */
function simulatePair(simulation: CvdSimulation, foreground: Rgb, background: Rgb): SimulatedPair {
  const shownForeground = simulateCvd(foreground, simulation.type, simulation.severity);
  const shownBackground = simulateCvd(background, simulation.type, simulation.severity);
  return {
    ...simulation,
    foreground: formatHex(shownForeground),
    background: formatHex(shownBackground),
    deltaE: deltaEOK(shownForeground, shownBackground),
    typicalDeltaE: deltaEOK(foreground, background),
  };
}

const CRITERIA: readonly [keyof Omit<ContrastResult, 'ratio'>, string, string][] = [
  ['aaText', 'AA   normal text  ', '4.5:1'],
  ['aaLargeText', 'AA   large text   ', '3:1'],
  ['aaaText', 'AAA  normal text  ', '7:1'],
  ['aaaLargeText', 'AAA  large text   ', '4.5:1'],
  ['nonText', 'AA   non-text UI  ', '3:1'],
];

function renderCheck(
  style: Style,
  foreground: Rgb,
  background: Rgb,
  result: ContrastResult,
  target: Target,
  pass: boolean,
  simulations: readonly SimulatedPair[] | undefined,
): string {
  const lines = [
    `${displayColor(foreground)} on ${formatHex(background)}: ${style.bold(formatRatio(result.ratio))}`,
  ];
  if (foreground.alpha < 1) {
    lines.push(
      `The foreground is translucent; it blends to ${formatHex(composite(foreground, background))}.`,
    );
  }
  const sample = style.sample(foreground, background, '  The quick brown fox  ');
  if (sample !== '') lines.push(sample);
  lines.push('');
  for (const [key, label, needs] of CRITERIA) {
    lines.push(`  ${verdict(style, result[key])}  ${label}needs ${needs}`);
  }
  lines.push('');
  if (simulations !== undefined) {
    lines.push('Color vision simulation (Machado et al. 2009; the checks use the actual colors)');
    const width = Math.max(
      ...simulations.map((simulation) => formatCvdSimulation(simulation).length),
    );
    for (const simulation of simulations) {
      lines.push(
        `  ${formatCvdSimulation(simulation).padEnd(width)}  ${simulation.foreground} on ` +
          `${simulation.background}  ΔE_OK ${simulation.deltaE.toFixed(3)} ` +
          `(typical vision ${simulation.typicalDeltaE.toFixed(3)})`,
      );
    }
    lines.push('');
  }
  lines.push(
    pass
      ? style.pass(`Passes ${target.description} (needs ${target.ratio}:1).`)
      : style.fail(
          `Fails ${target.description}: ${formatRatio(result.ratio)} is below ${target.ratio}:1.`,
        ),
  );
  return `${lines.join('\n')}\n`;
}
