import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { version } from '../package.json';
import { run } from '../src/cli/run';

const EXAMPLE_TOKENS = readFileSync(
  new URL('../../../examples/tokens.json', import.meta.url),
  'utf8',
);
const ANSI_ESCAPE = '\u001b[';

interface CliRun {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the CLI in memory: `files` stands in for the file system. */
function cli(args: string[], files: Record<string, string> = {}, color = false): CliRun {
  let stdout = '';
  let stderr = '';
  const code = run(args, {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    readFile: (path) => {
      const content = files[path];
      if (content === undefined) {
        throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
      }
      return content;
    },
    color,
  });
  return { code, stdout, stderr };
}

const tokens = (value: unknown): Record<string, string> => ({
  'tokens.json': JSON.stringify(value),
});

describe('contrastkit check', () => {
  it('fails AA for #777777 on white and lists every criterion', () => {
    const { code, stdout } = cli(['check', '#777777', '#ffffff']);
    expect(code).toBe(1);
    expect(stdout).toContain('#777777 on #ffffff: 4.47:1');
    expect(stdout).toContain('FAIL  AA   normal text  needs 4.5:1');
    expect(stdout).toContain('PASS  AA   large text   needs 3:1');
    expect(stdout).toContain('PASS  AA   non-text UI  needs 3:1');
    expect(stdout).toContain('Fails AA for normal text: 4.47:1 is below 4.5:1.');
  });

  it('passes with --large, accepts hex without "#" and any CSS color', () => {
    expect(cli(['check', '777', 'fff', '--large'])).toMatchObject({ code: 0 });
    expect(cli(['check', 'black', 'hsl(0 0% 100%)']).code).toBe(0);
  });

  it('honors --level and --target', () => {
    expect(cli(['check', '#595959', '#fff', '--level', 'aaa']).code).toBe(0);
    expect(cli(['check', '#767676', '#fff', '--level', 'AAA']).code).toBe(1);
    expect(cli(['check', '#949494', '#fff', '--target', '3']).stdout).toContain(
      'Passes a 3:1 target (needs 3:1).',
    );
  });

  it('explains translucent foregrounds', () => {
    const { stdout } = cli(['check', 'rgb(0 0 0 / 0.6)', 'white']);
    expect(stdout).toContain('rgb(0 0 0 / 0.6) on #ffffff');
    expect(stdout).toContain('it blends to #666666');
  });

  it('prints JSON with --json', () => {
    const { code, stdout } = cli(['check', '#777', '#fff', '--json']);
    expect(code).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({
      foreground: '#777777',
      background: '#ffffff',
      checks: { aaText: false, aaLargeText: true, nonText: true },
      target: { ratio: 4.5, level: 'AA', use: 'text' },
      pass: false,
    });
    expect(JSON.parse(cli(['check', '#0006', '#fff', '--json']).stdout)).toHaveProperty('blended');
  });
});

describe('contrastkit fix', () => {
  it('suggests #767676 for #777777 on white', () => {
    const { code, stdout } = cli(['fix', '777', 'fff']);
    expect(code).toBe(0);
    expect(stdout).toContain('1.  #767676     4.54:1  ΔE_OK 0.003  darker');
    expect(stdout).toContain('Closest fix: #767676');
  });

  it('says when there is nothing to fix', () => {
    const { code, stdout } = cli(['fix', 'black', 'white']);
    expect(code).toBe(0);
    expect(stdout).toContain('Already meets the target');
  });

  it('exits 1 when no lightness can reach the target', () => {
    const { code, stdout } = cli(['fix', 'fff', '777', '--level', 'AAA']);
    expect(code).toBe(1);
    expect(stdout).toContain('the best possible is 4.68:1');
    expect(stdout).toContain('Change the background instead.');
    expect(cli(['fix', 'rgb(0 0 0 / 0.3)', 'white']).stdout).toContain(
      'Raise the foreground’s opacity',
    );
  });

  it('keeps alpha exact by printing translucent suggestions as rgb()', () => {
    const { stdout } = cli(['fix', 'rgb(0 0 255 / 0.8)', 'white', '--level', 'AAA']);
    expect(stdout).toMatch(/Closest fix: rgb\(\d+ \d+ \d+ \/ 0\.8\)/);
  });

  it('prints JSON with --json', () => {
    const fixed = JSON.parse(cli(['fix', '#777', '#fff', '--json']).stdout) as Record<
      string,
      unknown
    >;
    expect(fixed).toMatchObject({
      status: 'fixed',
      candidates: [{ hex: '#767676', css: '#767676', direction: 'darker' }],
    });
    const impossible = JSON.parse(
      cli(['fix', 'fff', '777', '--target', '7', '--json']).stdout,
    ) as Record<string, unknown>;
    expect(impossible).toMatchObject({ status: 'unachievable', target: { ratio: 7 } });
    expect(impossible).toHaveProperty('maxRatio');
  });
});

describe('contrastkit audit', () => {
  const files = { 'tokens.json': EXAMPLE_TOKENS };

  it('passes the example tokens file and reports CVD warnings', () => {
    const { code, stdout } = cli(['audit', 'tokens.json'], files);
    expect(code).toBe(0);
    expect(stdout).toContain('10 colors');
    expect(stdout).toContain(
      'PASS  text.primary on surface.default   14.67:1  AA text (needs 4.5:1)',
    );
    expect(stdout).toContain('AA large text (needs 3:1)');
    expect(stdout).toContain('AA non-text (needs 3:1)');
    expect(stdout).toContain('WARN  deuteranopia  status.success / status.danger');
    expect(stdout).toContain('Result: all 7 checked pairs pass.');
  });

  it('fails when --require raises the default level', () => {
    const { code, stdout } = cli(['audit', 'tokens.json', '--require', 'AAA'], files);
    expect(code).toBe(1);
    expect(stdout).toContain('FAIL  brand.primary on surface.default');
    expect(stdout).toContain('Result: 4 of 7 checked pairs fail.');
  });

  it('prints the whole audit as JSON', () => {
    const { code, stdout } = cli(['audit', 'tokens.json', '--json'], files);
    expect(code).toBe(0);
    const report = JSON.parse(stdout) as {
      colors: unknown[];
      matrix: number[][];
      requirements: unknown[];
      cvdConfusions: unknown[];
      pass: boolean;
    };
    expect(report.colors).toHaveLength(10);
    expect(report.matrix).toHaveLength(10);
    expect(report.requirements).toHaveLength(7);
    expect(report.cvdConfusions.length).toBeGreaterThan(0);
    expect(report.pass).toBe(true);
  });

  it('only reports when no pairs are declared, unless --require is given', () => {
    const palette = tokens({ colors: { ink: '#777777', paper: '#ffffff' } });
    const reportOnly = cli(['audit', 'tokens.json'], palette);
    expect(reportOnly.code).toBe(0);
    expect(reportOnly.stdout).toContain('No pairs declared, so nothing was checked.');
    expect(reportOnly.stdout).toContain('Result: nothing checked.');
    expect(reportOnly.stdout).toContain('None: every pair stays distinguishable');

    const strict = cli(['audit', 'tokens.json', '--require', 'AA'], palette);
    expect(strict.code).toBe(1);
    expect(strict.stdout).toContain('Every pair at AA');
    expect(strict.stdout).toContain('FAIL  ink on paper');
  });

  it('skips the matrix for palettes too large to print', () => {
    const colors = Object.fromEntries(
      Array.from({ length: 13 }, (_, i) => [`gray${i}`, `rgb(${i * 20} ${i * 20} ${i * 20})`]),
    );
    expect(cli(['audit', 'tokens.json'], tokens({ colors })).stdout).toContain(
      '13 colors are too many to print; use --json',
    );
  });

  it('reads nested groups and W3C design-token $value entries', () => {
    const { code, stdout } = cli(
      ['audit', 'tokens.json', '--json'],
      tokens({
        colors: {
          $description: 'ignored',
          text: { $type: 'color', body: { $value: '#111' } },
          bg: '#fff',
        },
        pairs: [{ foreground: 'text.body', background: 'bg', level: 'AAA', use: 'text' }],
      }),
    );
    expect(code).toBe(0);
    expect((JSON.parse(stdout) as { colors: unknown }).colors).toEqual([
      { name: 'text.body', hex: '#111111' },
      { name: 'bg', hex: '#ffffff' },
    ]);
  });

  it.each([
    [{}, /must be a JSON object with a "colors" object/],
    [{ colors: {} }, /does not contain any colors/],
    [{ colors: { a: 12 } }, /colors.a must be a CSS color string/],
    [{ colors: { a: { $value: 12 } } }, /colors.a.\$value must be a CSS color string/],
    [{ colors: { a: '#fff' }, pairs: {} }, /"pairs" must be an array/],
    [{ colors: { a: '#fff' }, pairs: [{ foreground: 'a' }] }, /pairs\[0\] needs "foreground"/],
    [
      { colors: { a: '#fff' }, pairs: [{ foreground: 'a', background: 'a', level: 'A' }] },
      /pairs\[0\].level must be "AA" or "AAA"/,
    ],
    [
      { colors: { a: '#fff' }, pairs: [{ foreground: 'a', background: 'a', use: 'icon' }] },
      /pairs\[0\].use must be "text", "large-text" or "non-text"/,
    ],
    [{ colors: { a: '#fff' }, pairs: [{ foreground: 'a', background: 'b' }] }, /Unknown color "b"/],
    [{ colors: { a: '#fff', b: '#12' } }, /palette color "b"/],
    [{ colors: { veil: 'rgb(0 0 0 / 0.5)' } }, /must be opaque, but "veil"/],
  ])('rejects invalid tokens (%j) with exit code 2', (content, message) => {
    const { code, stderr } = cli(['audit', 'tokens.json'], tokens(content));
    expect(code).toBe(2);
    expect(stderr).toMatch(message);
  });

  it('reports unreadable and malformed files', () => {
    expect(cli(['audit', 'missing.json']).stderr).toContain(
      'cannot read "missing.json": file not found',
    );
    expect(cli(['audit', 'bad.json'], { 'bad.json': '{ nope' }).stderr).toContain(
      '"bad.json" is not valid JSON',
    );
    const unreadable = run(['audit', 'dir'], {
      stdout: () => undefined,
      stderr: (text) => {
        expect(text).toContain('cannot read "dir": Error: EISDIR');
      },
      readFile: () => {
        throw new Error('EISDIR');
      },
      color: false,
    });
    expect(unreadable).toBe(2);
  });
});

describe('contrastkit usage', () => {
  it('prints help and version', () => {
    expect(cli(['--help'])).toMatchObject({
      code: 0,
      stdout: expect.stringContaining('Usage') as string,
    });
    expect(cli(['help']).code).toBe(0);
    expect(cli(['-v'])).toEqual({ code: 0, stdout: `${version}\n`, stderr: '' });
    expect(cli([]).code).toBe(2);
  });

  it.each([
    [['frobnicate'], /unknown command "frobnicate"/],
    [['check', '#777'], /"check" expects <foreground> <background>, but got 1 argument/],
    [['check', '#777', '#fff', '--bogus'], /Unknown option '--bogus'/],
    [['check', '#777', '#fff', '--level', 'A'], /--level must be AA or AAA, got "A"/],
    [['fix', '#777', '#fff', '--target', 'lots'], /--target must be a number from 1 to 21/],
    [['fix', '#777', '#fff', '--target', ''], /--target must be a number from 1 to 21/],
    [['fix', '#777', '#fff', '--target', '4', '--level', 'AA'], /either --target or --level/],
    [['audit', 'a.json', '--require', 'B'], /--require must be AA or AAA/],
    [['check', 'bleu', 'white'], /Cannot parse "bleu" as a color/],
    [['check', '#000', 'rgb(255 255 255 / 0.5)'], /background must be opaque/],
  ])('rejects %j with exit code 2', (args, message) => {
    const { code, stderr } = cli(args);
    expect(code).toBe(2);
    expect(stderr).toMatch(message);
  });

  it('points to --help only for command-line mistakes', () => {
    expect(cli(['frobnicate']).stderr).toContain('Run "contrastkit --help" for usage.');
    expect(cli(['check', 'bleu', 'white']).stderr).not.toContain('--help');
  });

  it('lets unexpected errors through instead of hiding them', () => {
    const boom = new Error('disk full');
    expect(() =>
      run(['check', '#000', '#fff'], {
        stdout: () => {
          throw boom;
        },
        stderr: () => undefined,
        readFile: () => '',
        color: false,
      }),
    ).toThrow(boom);
  });
});

describe('terminal styling', () => {
  it('adds ANSI colors and swatches only when color is enabled', () => {
    expect(cli(['check', '#777', '#fff']).stdout).not.toContain(ANSI_ESCAPE);
    const styled = cli(['check', 'rgb(0 0 0 / 0.5)', '#fff'], {}, true).stdout;
    expect(styled).toContain(ANSI_ESCAPE);
    // The sample text is drawn in the blended foreground on the background.
    expect(styled).toContain('\u001b[38;2;128;128;128;48;2;255;255;255m');
    expect(cli(['fix', '777', 'fff'], {}, true).stdout).toContain('\u001b[38;2;118;118;118m██');
    const audit = cli(['audit', 'tokens.json'], { 'tokens.json': EXAMPLE_TOKENS }, true).stdout;
    expect(audit).toContain('\u001b[33mWARN\u001b[39m');
  });

  it('spells out PASS and FAIL so meaning never depends on color', () => {
    const styled = cli(['check', '#777', '#fff'], {}, true).stdout;
    expect(styled).toContain('PASS');
    expect(styled).toContain('FAIL');
  });
});
