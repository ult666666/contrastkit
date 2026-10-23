import { describe, expect, it } from 'vitest';
import { ColorParseError, ContrastKitError, InvalidArgumentError } from '../src/errors';

describe('errors', () => {
  it('ColorParseError keeps the input and reason and is a ContrastKitError', () => {
    const error = new ColorParseError('#12', 'hex colors need 3, 4, 6 or 8 digits');
    expect(error).toBeInstanceOf(ContrastKitError);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ColorParseError');
    expect(error.input).toBe('#12');
    expect(error.reason).toBe('hex colors need 3, 4, 6 or 8 digits');
    expect(error.message).toBe(
      'Cannot parse "#12" as a color: hex colors need 3, 4, 6 or 8 digits',
    );
  });

  it('shortens very long inputs in the message but keeps the full input', () => {
    const input = 'x'.repeat(200);
    const error = new ColorParseError(input, 'unknown color');
    expect(error.input).toBe(input);
    expect(error.message).toContain(`"${'x'.repeat(60)}…"`);
  });

  it('InvalidArgumentError is a ContrastKitError', () => {
    const error = new InvalidArgumentError('target must be between 1 and 21');
    expect(error).toBeInstanceOf(ContrastKitError);
    expect(error.name).toBe('InvalidArgumentError');
  });
});
