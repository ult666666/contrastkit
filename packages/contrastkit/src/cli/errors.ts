/** Exit codes shared by every command. */
export const EXIT = {
  /** The check passed, or there was nothing to check. */
  ok: 0,
  /** A contrast check failed, or no fix can reach the target. */
  failed: 1,
  /** The command line or an input file was invalid. */
  usage: 2,
} as const;

/** A problem with how the CLI was invoked or with its input. Exits with {@link EXIT.usage}. */
export class CliError extends Error {
  override name = 'CliError';

  /**
   * @param message - What went wrong, phrased for the person at the terminal.
   * @param showUsage - Whether to point at `--help` (for command-line mistakes).
   */
  constructor(
    message: string,
    readonly showUsage = false,
  ) {
    super(message);
  }
}
