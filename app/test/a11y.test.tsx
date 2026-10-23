import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';

/**
 * Runs axe-core on the whole document and returns readable violations. jsdom has no
 * layout engine, so axe reports color contrast as "incomplete" rather than checking it;
 * test/theme-contrast.test.ts covers the app's colors instead.
 */
async function axeViolations(): Promise<string[]> {
  const results = await axe.run(document, { resultTypes: ['violations'] });
  return results.violations.map(
    (violation) =>
      `${violation.id}: ${violation.help} (${violation.nodes
        .map((node) => node.target.join(' '))
        .join(', ')})`,
  );
}

describe('accessibility (axe-core)', () => {
  it('has no violations on first load', async () => {
    render(<App />);
    expect(await axeViolations()).toEqual([]);
  });

  it('has no violations while validation errors are shown', async () => {
    const user = userEvent.setup();
    render(<App />);
    const [name] = screen.getAllByRole('textbox', { name: 'Name' });
    const [value] = screen.getAllByRole('textbox', { name: 'CSS color' });
    if (!name || !value) throw new Error('missing inputs');
    await user.clear(name);
    await user.clear(value);
    await user.type(value, 'not a color');
    expect(await axeViolations()).toEqual([]);
  });

  it('has no violations with a simulation, fixes and a notice on screen', async () => {
    window.history.replaceState(null, '', '/#broken');
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('radio', { name: /Protanopia/ }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Apply suggested fix/ })).toBeInTheDocument();
    expect(await axeViolations()).toEqual([]);
  });

  it('reports color contrast as not checkable in jsdom (covered by the theme test)', async () => {
    render(<App />);
    const results = await axe.run(document, { runOnly: ['color-contrast'] });
    expect(results.violations).toEqual([]);
    expect(results.passes).toEqual([]);
  });
});
