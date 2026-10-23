/**
 * Base class for every error contrastkit throws on purpose, so callers can tell library
 * errors apart from bugs with a single `instanceof ContrastKitError` check.
 */
export class ContrastKitError extends Error {
  override name = 'ContrastKitError';
}

/** Longest input echoed back in an error message; longer inputs are shortened with "…". */
const MAX_ECHO_LENGTH = 60;

/** Thrown when a string is not a CSS color that contrastkit understands. */
export class ColorParseError extends ContrastKitError {
  override name = 'ColorParseError';

  /**
   * @param input - The string that failed to parse.
   * @param reason - Why it failed, phrased so it can follow "Cannot parse … as a color:".
   */
  constructor(
    readonly input: string,
    readonly reason: string,
  ) {
    const shown = input.length > MAX_ECHO_LENGTH ? `${input.slice(0, MAX_ECHO_LENGTH)}…` : input;
    super(`Cannot parse "${shown}" as a color: ${reason}`);
  }
}

/**
 * Thrown when an argument is well-formed but not acceptable, for example a contrast target
 * above 21:1 or a translucent background (whose contrast depends on what is behind it).
 */
export class InvalidArgumentError extends ContrastKitError {
  override name = 'InvalidArgumentError';
}
