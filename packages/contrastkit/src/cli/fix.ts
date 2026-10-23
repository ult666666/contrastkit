import { parseArgs } from 'node:util';
import { suggestFix, type FixResult } from '../fix';
import { formatHex, formatOklch, formatRatio } from '../format';
import { parseColor } from '../parse';
import type { Rgb } from '../types';
import { EXIT } from './errors';
import {
  colorArgument,
  displayColor,
  expectPositionals,
  json,
  parseCommandLine,
  resolveTarget,
  type CommandContext,
  type Target,
} from './shared';
import type { Style } from './style';

/** `contrastkit fix <foreground> <background>`: the closest foreground that passes. */
export function runFix(args: readonly string[], { io, style }: CommandContext): number {
  const { values, positionals } = parseCommandLine(() =>
    parseArgs({
      args: [...args],
      allowPositionals: true,
      options: {
        level: { type: 'string' },
        large: { type: 'boolean' },
        target: { type: 'string' },
        json: { type: 'boolean' },
      },
    }),
  );
  const [foregroundArg = '', backgroundArg = ''] = expectPositionals('fix', positionals, [
    'foreground',
    'background',
  ]);
  const target = resolveTarget(values);
  const foreground = parseColor(colorArgument(foregroundArg));
  const background = parseColor(colorArgument(backgroundArg));
  const result = suggestFix(foreground, background, { target: target.ratio });

  if (values.json === true) {
    io.stdout(
      json({
        foreground: displayColor(foreground),
        background: formatHex(background),
        status: result.status,
        ratio: result.ratio,
        target: { ratio: target.ratio, level: target.level, use: target.use },
        ...(result.status === 'fixed' && {
          candidates: result.candidates.map(({ color, ...candidate }) => ({
            ...candidate,
            css: displayColor(color),
            oklch: formatOklch(color),
          })),
        }),
        ...(result.status === 'unachievable' && { maxRatio: result.maxRatio }),
      }),
    );
  } else {
    io.stdout(renderFix(style, foreground, background, result, target));
  }
  return result.status === 'unachievable' ? EXIT.failed : EXIT.ok;
}

function renderFix(
  style: Style,
  foreground: Rgb,
  background: Rgb,
  result: FixResult,
  target: Target,
): string {
  const header = `${displayColor(foreground)} on ${formatHex(background)}: ${style.bold(
    formatRatio(result.ratio),
  )}, target ${target.ratio}:1 (${target.description})`;
  const lines = [header, ''];

  switch (result.status) {
    case 'passes':
      lines.push(style.pass('Already meets the target; nothing to fix.'));
      break;
    case 'unachievable':
      lines.push(
        style.fail(
          `No lightness of this color reaches ${target.ratio}:1 on ${formatHex(background)}; ` +
            `the best possible is ${formatRatio(result.maxRatio)}.`,
        ),
        foreground.alpha < 1
          ? 'Raise the foreground’s opacity or change the background instead.'
          : 'Change the background instead.',
      );
      break;
    case 'fixed': {
      lines.push('Suggestions, closest first (only OKLCH lightness changes):');
      result.candidates.forEach((candidate, index) => {
        const swatch = style.swatch(candidate.color);
        lines.push(
          [
            `  ${index + 1}.`,
            `${swatch}${swatch === '' ? '' : ' '}${displayColor(candidate.color).padEnd(9)}`,
            formatRatio(candidate.ratio).padStart(7),
            `ΔE_OK ${candidate.deltaE.toFixed(3)}`,
            candidate.direction.padEnd(7),
            formatOklch(candidate.color),
          ].join('  '),
        );
      });
      lines.push('', style.pass(`Closest fix: ${displayColor(result.candidates[0].color)}`));
      break;
    }
  }
  return `${lines.join('\n')}\n`;
}
