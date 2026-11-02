import { parseArgs } from 'node:util';
import {
  auditPalette,
  checkRequirements,
  type PairRequirement,
  type PaletteAudit,
  type RequirementResult,
} from '../audit';
import type { ContrastUse, WcagLevel } from '../contrast';
import { formatCvdSimulation, type CvdKind } from '../cvd';
import { formatRatio } from '../format';
import { CliError, EXIT } from './errors';
import {
  expectPositionals,
  json,
  parseCommandLine,
  parseLevel,
  parseSimulations,
  verdict,
  type CommandContext,
} from './shared';
import type { Style } from './style';
import { parseTokens } from './tokens';

const USE_LABELS: Readonly<Record<ContrastUse, string>> = {
  text: 'text',
  'large-text': 'large text',
  'non-text': 'non-text',
};

/** Palettes larger than this get a pointer to --json instead of a matrix too wide to read. */
const MAX_MATRIX_COLORS = 12;

/**
 * `contrastkit audit <tokens.json>`: checks the declared pairs (or, with --require and no
 * declared pairs, every pair) and reports CVD confusions. Exits 1 if any check fails.
 */
export function runAudit(args: readonly string[], { io, style }: CommandContext): number {
  const { values, positionals } = parseCommandLine(() =>
    parseArgs({
      args: [...args],
      allowPositionals: true,
      options: {
        require: { type: 'string' },
        cvd: { type: 'string', multiple: true },
        json: { type: 'boolean' },
      },
    }),
  );
  const [file = ''] = expectPositionals('audit', positionals, ['tokens.json']);
  const requiredLevel = parseLevel(values.require, '--require');
  const tokens = parseTokens(readJson(io.readFile, file));

  const simulations = parseSimulations(values.cvd);
  const audit = auditPalette(tokens.colors, simulations ? { cvdTypes: simulations } : {});
  const requirements: readonly PairRequirement[] =
    tokens.pairs.length > 0 || requiredLevel === undefined
      ? tokens.pairs
      : audit.pairs.map((pair) => ({ foreground: pair.a, background: pair.b }));
  const results = checkRequirements(audit, requirements, requiredLevel ?? 'AA');
  const failures = results.filter((result) => !result.pass).length;

  if (values.json === true) {
    io.stdout(
      json({
        file,
        colors: audit.colors.map(({ name, hex }) => ({ name, hex })),
        matrix: audit.matrix,
        pairs: audit.pairs,
        requirements: results,
        confusionThreshold: audit.confusionThreshold,
        ...(simulations && { simulations }),
        cvdConfusions: audit.cvdConfusions,
        failures,
        pass: failures === 0,
      }),
    );
  } else {
    const labels = simulations?.map(formatCvdSimulation);
    io.stdout(
      renderAudit(style, file, audit, results, tokens.pairs.length > 0, requiredLevel, labels),
    );
  }
  return failures === 0 ? EXIT.ok : EXIT.failed;
}

function readJson(readFile: (path: string) => string, file: string): unknown {
  let text: string;
  try {
    text = readFile(file);
  } catch (error) {
    const reason =
      (error as { code?: unknown }).code === 'ENOENT' ? 'file not found' : String(error);
    throw new CliError(`cannot read "${file}": ${reason}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError(`"${file}" is not valid JSON: ${(error as Error).message}`);
  }
}

function renderAudit(
  style: Style,
  file: string,
  audit: PaletteAudit,
  results: readonly RequirementResult[],
  declaredPairs: boolean,
  requiredLevel: WcagLevel | undefined,
  simulationLabels: readonly string[] | undefined,
): string {
  const lines = [style.bold(`Palette audit: ${file}`), `${audit.colors.length} colors`, ''];

  lines.push(style.bold('Colors'));
  const nameWidth = Math.max(...audit.colors.map(({ name }) => name.length));
  audit.colors.forEach(({ name, hex, color }, index) => {
    const swatch = style.swatch(color);
    lines.push(
      `  ${String(index + 1).padStart(2)}  ${swatch}${swatch === '' ? '' : ' '}${name.padEnd(nameWidth)}  ${hex}`,
    );
  });
  lines.push('');

  if (audit.colors.length <= MAX_MATRIX_COLORS) {
    lines.push(style.bold('Contrast matrix (numbers refer to the list above)'));
    lines.push(`      ${audit.colors.map((_, i) => String(i + 1).padStart(6)).join('')}`);
    audit.matrix.forEach((row, i) => {
      const cells = row.map((ratio, j) =>
        i === j ? style.dim('—'.padStart(6)) : formatRatio(ratio).slice(0, -2).padStart(6),
      );
      lines.push(`  ${String(i + 1).padStart(2)}  ${cells.join('')}`);
    });
  } else {
    lines.push(`Contrast matrix: ${audit.colors.length} colors are too many to print; use --json.`);
  }
  lines.push('');

  if (results.length === 0) {
    lines.push(
      'No pairs declared, so nothing was checked. Add "pairs" to the file, or pass',
      '--require AA to check every pair of colors as normal text.',
    );
  } else {
    const source = declaredPairs ? 'Declared pairs' : `Every pair at ${requiredLevel ?? 'AA'}`;
    lines.push(style.bold(source));
    const rows = results.map((result) => ({
      result,
      label: `${result.foreground} on ${result.background}`,
    }));
    const labelWidth = Math.max(...rows.map(({ label }) => label.length));
    for (const { result, label } of rows) {
      const ratio = formatRatio(result.ratio).padStart(7);
      lines.push(
        `  ${verdict(style, result.pass)}  ${label.padEnd(labelWidth)}  ${ratio}  ` +
          `${result.level} ${USE_LABELS[result.use]} (needs ${result.required}:1)`,
      );
    }
  }
  lines.push('');

  lines.push(
    style.bold(`Color vision warnings (ΔE_OK below ${audit.confusionThreshold} after simulation)`),
  );
  const label = (confusion: { type: CvdKind; severity: number }) => formatCvdSimulation(confusion);
  const labelWidth = Math.max(
    12,
    ...audit.cvdConfusions.map((confusion) => label(confusion).length),
  );
  if (audit.cvdConfusions.length === 0) {
    lines.push(
      simulationLabels === undefined
        ? '  None: every pair stays distinguishable in all three simulations.'
        : `  None: every pair stays distinguishable with ${simulationLabels.join(', ')}.`,
    );
  } else {
    for (const confusion of audit.cvdConfusions) {
      lines.push(
        `  ${style.warn('WARN')}  ${label(confusion).padEnd(labelWidth)}  ${confusion.a} / ${confusion.b}: ` +
          `ΔE_OK ${confusion.deltaE.toFixed(3)} (typical vision ${confusion.typicalDeltaE.toFixed(3)})`,
      );
    }
  }
  lines.push('');

  const failures = results.filter((result) => !result.pass).length;
  if (results.length === 0) lines.push('Result: nothing checked.');
  else if (failures === 0)
    lines.push(style.pass(`Result: all ${results.length} checked pairs pass.`));
  else lines.push(style.fail(`Result: ${failures} of ${results.length} checked pairs fail.`));
  return `${lines.join('\n')}\n`;
}
