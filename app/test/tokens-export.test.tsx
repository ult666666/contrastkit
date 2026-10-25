import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';

interface Download {
  readonly name: string;
  readonly blob: Blob;
}

interface AuditReport {
  readonly colors: readonly { readonly name: string; readonly hex: string }[];
  readonly requirements: readonly {
    readonly foreground: string;
    readonly background: string;
    readonly level: string;
    readonly use: string;
    readonly pass: boolean;
  }[];
  readonly failures: number;
  readonly pass: boolean;
}

// npm runs the app workspace's test command from app/.
const cli = resolve('../packages/contrastkit/dist/cli.js');
const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
let downloads: Download[];
let directory: string;
let rejectNextDownload: boolean;

beforeEach(() => {
  downloads = [];
  rejectNextDownload = false;
  directory = mkdtempSync(join(tmpdir(), 'contrastkit-tokens-'));
  const blobs = new Map<string, Blob>();
  // Only the browser/OS download boundary is replaced: the Blob and JSON stay real.
  URL.createObjectURL = (blob: Blob): string => {
    const url = `blob:https://contrastkit.test/${blobs.size}`;
    blobs.set(url, blob);
    return url;
  };
  URL.revokeObjectURL = (url: string): void => {
    blobs.delete(url);
  };
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    if (rejectNextDownload) {
      rejectNextDownload = false;
      throw new Error('Browser blocked download');
    }
    const blob = blobs.get(this.href);
    if (!blob) throw new Error('Download has no Blob payload');
    downloads.push({ name: this.download, blob });
  });
});

afterEach(async () => {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
  if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
  else Reflect.deleteProperty(URL, 'createObjectURL');
  if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
  else Reflect.deleteProperty(URL, 'revokeObjectURL');
  vi.restoreAllMocks();
  rmSync(directory, { recursive: true, force: true });
});

function openApp(hash = '') {
  window.history.replaceState(null, '', `/${hash}`);
  render(<App />);
  return userEvent.setup();
}

async function auditDownload(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Download tokens JSON' }));
  const download = downloads.at(-1);
  if (!download) throw new Error('No download was produced');
  expect(download.name).toBe('contrastkit-tokens.json');
  expect(download.blob.type).toBe('application/json');
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Expected text JSON'));
    };
    reader.onerror = () => {
      reject(new Error('Could not read downloaded JSON'));
    };
    reader.readAsText(download.blob);
  });
  const path = join(directory, download.name);
  writeFileSync(path, text);
  // Spawn the built executable against the downloaded file, not an in-memory CLI stub.
  const result = spawnSync(process.execPath, [cli, 'audit', path, '--json'], { encoding: 'utf8' });
  expect(result.stderr).toBe('');
  expect(result.error).toBeUndefined();
  return { status: result.status, report: JSON.parse(result.stdout) as AuditReport };
}

describe('palette tokens download', () => {
  it('downloads a failing selected pair, then the actual suggested fix makes the same CLI audit pass', async () => {
    const user = openApp();
    const before = await auditDownload(user);
    expect(before.status).toBe(1);
    expect(before.report.failures).toBe(1);
    expect(before.report.requirements).toEqual([
      expect.objectContaining({
        foreground: 'Slate',
        background: 'Mist',
        level: 'AA',
        use: 'text',
        pass: false,
      }),
    ]);
    await user.click(
      screen.getByRole('button', { name: 'Apply suggested fix: change Slate to #5d6977' }),
    );
    const after = await auditDownload(user);
    expect(after.status).toBe(0);
    expect(after.report.pass).toBe(true);
    expect(after.report.requirements).toEqual([
      expect.objectContaining({
        foreground: 'Slate',
        background: 'Mist',
        level: 'AA',
        use: 'text',
        pass: true,
      }),
    ]);
    expect(after.report.colors).toContainEqual({ name: 'Slate', hex: '#5d6977' });
    expect(screen.getByRole('status')).toHaveTextContent(/Downloaded contrastkit-tokens.json/);
  });

  it.each([
    ['AA-text', 'AA', 'text'],
    ['AA-large-text', 'AA', 'large-text'],
    ['AAA-text', 'AAA', 'text'],
    ['AAA-large-text', 'AAA', 'large-text'],
    ['non-text', 'AA', 'non-text'],
  ])('exports the current direction and target %s', async (target, level, use) => {
    const user = openApp('#c=Ink.000000&c=Paper.ffffff&fg=0&bg=1');
    await user.click(screen.getByRole('button', { name: 'Swap text and background' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Target' }), target);
    const exported = await auditDownload(user);
    expect(exported.status).toBe(0);
    expect(exported.report.requirements).toEqual([
      expect.objectContaining({ foreground: 'Paper', background: 'Ink', level, use, pass: true }),
    ]);
  });

  it.each(['Protanopia', 'Deuteranopia', 'Tritanopia'])(
    'exports actual colors while previewing %s',
    async (simulation) => {
      const user = openApp('#c=Leaf.2f855a&c=Ember.c53030&fg=1&bg=0');
      await user.click(screen.getByRole('radio', { name: new RegExp(simulation) }));
      const exported = await auditDownload(user);
      expect(exported.status).toBe(1);
      expect(exported.report.colors).toEqual([
        { name: 'Leaf', hex: '#2f855a' },
        { name: 'Ember', hex: '#c53030' },
      ]);
      expect(exported.report.requirements[0]).toMatchObject({
        foreground: 'Ember',
        background: 'Leaf',
      });
    },
  );

  it('blocks empty, duplicate and metadata names with a live explanation, then recovers without losing unusual keys', async () => {
    const user = openApp('#c=Ink.000000&c=Paper.ffffff&fg=0&bg=1');
    const name = screen.getAllByRole('textbox', { name: 'Name' })[0];
    if (!name) throw new Error('Missing color name');
    const button = screen.getByRole('button', { name: 'Download tokens JSON' });
    for (const [invalid, reason] of [
      ['  ', /name/i],
      [' paper ', /unique|duplicate|another/i],
      ['$ink', /\$|metadata/i],
    ] as const) {
      await user.clear(name);
      await user.type(name, invalid);
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(reason);
      const hint = document.getElementById(button.getAttribute('aria-describedby') ?? '');
      expect(hint).toHaveAttribute('aria-live', 'polite');
      await user.click(button);
      expect(downloads).toHaveLength(0);
    }
    await user.clear(name);
    await user.type(name, ' __proto__ ');
    const otherName = screen.getAllByRole('textbox', { name: 'Name' })[1];
    if (!otherName) throw new Error('Missing background name');
    await user.clear(otherName);
    await user.type(otherName, 'surface.default');
    expect(button).toBeEnabled();
    const exported = await auditDownload(user);
    expect(exported.status).toBe(0);
    expect(exported.report.colors).toEqual([
      { name: '__proto__', hex: '#000000' },
      { name: 'surface.default', hex: '#ffffff' },
    ]);
    expect(exported.report.requirements[0]).toMatchObject({
      foreground: '__proto__',
      background: 'surface.default',
    });
  });

  it('announces browser download failure and allows a later successful download', async () => {
    const user = openApp();
    rejectNextDownload = true;
    await user.click(screen.getByRole('button', { name: 'Download tokens JSON' }));
    expect(screen.getByRole('status')).toHaveTextContent(/could not.*download|download.*failed/i);
    expect(downloads).toHaveLength(0);
    expect((await auditDownload(user)).status).toBe(1);
    expect(screen.getByRole('status')).toHaveTextContent(/Downloaded/);
  });
});
