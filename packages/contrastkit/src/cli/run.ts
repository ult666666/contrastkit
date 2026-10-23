import { version } from '../../package.json';
import { ContrastKitError } from '../errors';
import { runAudit } from './audit';
import { runCheck } from './check';
import { CliError, EXIT } from './errors';
import { runFix } from './fix';
import type { CliIo, CommandContext } from './shared';
import { createStyle } from './style';

export type { CliIo } from './shared';

export const USAGE = `contrastkit ${version}: accessible color, measured

Usage
  contrastkit check <foreground> <background> [--level AA|AAA] [--large] [--target <ratio>] [--json]
  contrastkit fix   <foreground> <background> [--level AA|AAA] [--large] [--target <ratio>] [--json]
  contrastkit audit <tokens.json> [--require AA|AAA] [--json]

Colors may be hex (the # is optional), rgb(), hsl(), oklch() or CSS color names.
Quote anything with spaces, parentheses or #, e.g. 'rgb(0 0 0 / 50%)'.

Options
  --level AA|AAA     WCAG level to check or fix for (default AA)
  --large            Large text: at least 24px, or 18.66px bold
  --target <ratio>   A custom contrast ratio from 1 to 21 instead of --level/--large
  --require AA|AAA   audit: level for pairs that do not declare one (default AA);
                     if the file declares no pairs, check every pair at this level
  --json             Print machine-readable JSON
  -h, --help         Show this help
  -v, --version      Show the version

Exit codes
  0  passed (or a fix was found)
  1  a check failed, or no fix can reach the target
  2  invalid usage or input
`;

/**
 * Runs the CLI with `argv` (the arguments after the program name) and returns the exit
 * code. All I/O goes through `io`, so tests can run commands without a real terminal.
 */
export function run(argv: readonly string[], io: CliIo): number {
  const context: CommandContext = { io, style: createStyle(io.color) };
  const [command, ...rest] = argv;
  try {
    switch (command) {
      case 'check':
        return runCheck(rest, context);
      case 'fix':
        return runFix(rest, context);
      case 'audit':
        return runAudit(rest, context);
      case undefined:
      case 'help':
      case '--help':
      case '-h':
        io.stdout(USAGE);
        return command === undefined ? EXIT.usage : EXIT.ok;
      case '--version':
      case '-v':
        io.stdout(`${version}\n`);
        return EXIT.ok;
      default:
        throw new CliError(`unknown command "${command}"`, true);
    }
  } catch (error) {
    if (error instanceof CliError || error instanceof ContrastKitError) {
      io.stderr(`contrastkit: ${error.message}\n`);
      if (error instanceof CliError && error.showUsage) {
        io.stderr('Run "contrastkit --help" for usage.\n');
      }
      return EXIT.usage;
    }
    throw error;
  }
}
