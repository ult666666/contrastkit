import { parseArgs } from 'node:util';
import { checkContrast, composite, type ContrastResult } from '../contrast';
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
        pass,
      }),
    );
  } else {
    io.stdout(renderCheck(style, foreground, background, result, target, pass));
  }
  return pass ? EXIT.ok : EXIT.failed;
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
  lines.push(
    pass
      ? style.pass(`Passes ${target.description} (needs ${target.ratio}:1).`)
      : style.fail(
          `Fails ${target.description}: ${formatRatio(result.ratio)} is below ${target.ratio}:1.`,
        ),
  );
  return `${lines.join('\n')}\n`;
}
