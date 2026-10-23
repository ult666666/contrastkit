import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../src/App';
import { DEFAULT_SHARED_STATE } from '../src/state';
import { encodeHash } from '../src/url-state';

function renderApp(hash = '') {
  window.history.replaceState(null, '', `/${hash}`);
  const user = userEvent.setup();
  const view = render(<App />);
  return { user, ...view };
}

const status = (): HTMLElement => screen.getByRole('status');
const grid = (): HTMLElement => screen.getByRole('grid', { name: 'Contrast matrix' });
const cell = (name: RegExp): HTMLElement => within(grid()).getByRole('button', { name });
const previewHeading = (): HTMLElement => screen.getByRole('heading', { level: 2, name: / on / });

describe('Palette Auditor', () => {
  it('shows the default palette, matrix and selected pair', () => {
    renderApp();
    expect(screen.getByRole('heading', { level: 1, name: 'Palette Auditor' })).toBeInTheDocument();
    expect(screen.getAllByRole('textbox', { name: 'Name' })).toHaveLength(7);
    expect(within(grid()).getAllByRole('button')).toHaveLength(49);
    expect(previewHeading()).toHaveTextContent('Slate on Mist');
    expect(screen.getByText('4.20:1')).toBeInTheDocument();
    // Every cell names the pair, ratio and level in text, not only with color.
    expect(cell(/^4\.20 Large, Slate on Mist: large text/)).toHaveAttribute('aria-pressed', 'true');
    expect(cell(/^14\.75 AAA, Ink on Paper: passes AAA/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('lists every WCAG check for the selected pair in words', () => {
    renderApp();
    expect(screen.getByText('AA, normal text').closest('li')).toHaveTextContent(
      'Fail AA, normal text (needs 4.5:1)',
    );
    expect(screen.getByText('AA, large text').closest('li')).toHaveTextContent('Pass');
  });

  it('selects a pair with the mouse', async () => {
    const { user } = renderApp();
    await user.click(cell(/, Ink on Paper:/));
    expect(previewHeading()).toHaveTextContent('Ink on Paper');
    expect(screen.getByText('14.75:1')).toBeInTheDocument();
  });

  it('moves through the grid with the arrow keys and selects with Enter', async () => {
    const { user } = renderApp();
    // The grid is one Tab stop; it starts on the selected cell.
    const selected = cell(/, Slate on Mist:/);
    expect(selected).toHaveAttribute('tabindex', '0');
    expect(
      within(grid())
        .getAllByRole('button')
        .filter((b) => b.tabIndex === 0),
    ).toHaveLength(1);

    selected.focus();
    await user.keyboard('{ArrowRight}');
    expect(cell(/, Slate on Ocean:/)).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(cell(/, Paper on Ocean:/)).toHaveFocus();
    await user.keyboard('{Home}');
    expect(cell(/, Paper on Ink:/)).toHaveFocus();
    await user.keyboard('{End}');
    expect(cell(/, Paper on Ember:/)).toHaveFocus();
    await user.keyboard('{Control>}{Home}{/Control}');
    expect(cell(/, Ink on Ink:/)).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowLeft}');
    expect(cell(/, Ink on Ink:/)).toHaveFocus();
    await user.keyboard('{Control>}{End}{/Control}');
    expect(cell(/, Ember on Ember:/)).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowLeft}');
    expect(cell(/, Leaf on Leaf:/)).toHaveFocus();
    expect(cell(/, Leaf on Leaf:/)).toHaveAttribute('tabindex', '0');

    await user.keyboard('{ArrowLeft}{Enter}');
    expect(previewHeading()).toHaveTextContent('Leaf on Ocean');
    await user.keyboard('{a}');
    expect(previewHeading()).toHaveTextContent('Leaf on Ocean');
  });

  it('applies the suggested fix, announces it and keeps focus in place', async () => {
    const { user } = renderApp();
    await user.click(
      screen.getByRole('button', { name: 'Apply suggested fix: change Slate to #5d6977' }),
    );

    expect(screen.getByText('4.51:1')).toBeInTheDocument();
    expect(screen.getByText('Meets AA, normal text (4.5:1). Nothing to fix.')).toHaveFocus();
    expect(status()).toHaveTextContent('Slate changed to #5d6977. Contrast on Mist is now 4.51:1.');
    expect(screen.getAllByRole('textbox', { name: 'CSS color' })[1]).toHaveValue('#5d6977');
  });

  it('suggests fixes for the chosen target and explains impossible ones', async () => {
    const { user } = renderApp();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Target' }), 'AA-large-text');
    expect(screen.getByText('Meets AA, large text (3:1). Nothing to fix.')).toBeInTheDocument();

    await user.click(cell(/, Paper on Slate:/));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Target' }), 'AAA-text');
    expect(screen.getByText(/No lightness of Paper reaches 7:1 on Slate/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Apply/ })).not.toBeInTheDocument();

    // Ocean on Paper passes AA but misses AAA; a darker Ocean fixes it.
    await user.click(cell(/, Ocean on Paper:/));
    expect(
      screen.getByRole('button', { name: /^Apply suggested fix: change Ocean to #/ }),
    ).toBeVisible();
  });

  it('swaps text and background', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Swap text and background' }));
    expect(previewHeading()).toHaveTextContent('Mist on Slate');
    expect(status()).toHaveTextContent('Swapped: Mist on Slate.');
  });

  it('edits names and colors, validating as you type', async () => {
    const { user } = renderApp();
    const [, slateName] = screen.getAllByRole('textbox', { name: 'Name' });
    const [, slateValue] = screen.getAllByRole('textbox', { name: 'CSS color' });
    if (!slateName || !slateValue) throw new Error('missing inputs');

    await user.clear(slateName);
    await user.type(slateName, 'Graphite');
    expect(previewHeading()).toHaveTextContent('Graphite on Mist');

    await user.clear(slateName);
    expect(slateName).toHaveAttribute('aria-invalid', 'true');
    expect(slateName).toHaveAccessibleDescription('Enter a name.');
    await user.type(slateName, 'ink');
    expect(slateName).toHaveAccessibleDescription('Another color already has this name.');

    await user.clear(slateValue);
    await user.type(slateValue, 'rgb(0 0 0');
    expect(slateValue).toHaveAttribute('aria-invalid', 'true');
    expect(slateValue).toHaveAccessibleDescription(/Not a color contrastkit understands/);
    await user.type(slateValue, ')');
    expect(slateValue).toHaveAttribute('aria-invalid', 'false');
    expect(slateValue).toHaveValue('rgb(0 0 0)');
    expect(screen.getAllByLabelText('Picker')[1]).toHaveValue('#000000');

    await user.clear(slateValue);
    await user.type(slateValue, 'rgb(0 0 0 / 50%)');
    expect(slateValue).toHaveAccessibleDescription(/Use an opaque color/);

    await user.clear(slateValue);
    await user.type(slateValue, 'rebeccapurple');
    expect(slateValue).toHaveValue('rebeccapurple');
    expect(screen.getAllByLabelText('Picker')[1]).toHaveValue('#663399');
  });

  it('updates the text field when the color picker changes', () => {
    renderApp();
    const picker = screen.getAllByLabelText('Picker')[0];
    if (!picker) throw new Error('missing picker');
    fireEvent.change(picker, { target: { value: '#123456' } });
    expect(screen.getAllByRole('textbox', { name: 'CSS color' })[0]).toHaveValue('#123456');
  });

  it('adds and removes colors, moving focus sensibly', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Add color' }));
    const names = screen.getAllByRole('textbox', { name: 'Name' });
    expect(names).toHaveLength(8);
    expect(names[7]).toHaveFocus();
    expect(names[7]).toHaveValue('Color 8');
    expect(status()).toHaveTextContent('Added Color 8.');

    await user.click(screen.getByRole('button', { name: 'Remove Ocean' }));
    expect(screen.getAllByRole('textbox', { name: 'Name' })).toHaveLength(7);
    expect(document.activeElement).toHaveValue('Leaf');
    expect(status()).toHaveTextContent('Removed Ocean.');

    // The last row has no next neighbor, so focus goes to the previous one.
    await user.click(screen.getByRole('button', { name: 'Remove Color 8' }));
    expect(document.activeElement).toHaveValue('Ember');
  });

  it('keeps between two and twelve colors', async () => {
    const { user } = renderApp('#c=A.000000&c=B.ffffff');
    expect(screen.getByRole('button', { name: 'Remove A' })).toBeDisabled();
    expect(screen.getByText(/A palette needs at least 2 colors/)).toBeInTheDocument();
    for (let i = 0; i < 10; i++)
      await user.click(screen.getByRole('button', { name: 'Add color' }));
    expect(screen.getByRole('button', { name: 'Add color' })).toBeDisabled();
    expect(screen.getByText(/The palette is full \(12 colors\)/)).toBeInTheDocument();
  });

  it('simulates color vision deficiencies on the swatches but not the ratios', async () => {
    const { user } = renderApp();
    const leafHeader = within(grid()).getByRole('columnheader', { name: 'Leaf' });
    const swatch = leafHeader.querySelector<HTMLElement>('.swatch');
    expect(swatch?.style.background).toBe('rgb(47, 133, 90)');

    await user.click(screen.getByRole('radio', { name: /Deuteranopia/ }));
    expect(swatch?.style.background).not.toBe('rgb(47, 133, 90)');
    expect(status()).toHaveTextContent('Simulating Deuteranopia');
    expect(screen.getByText('4.20:1')).toBeInTheDocument();
    expect(screen.getByText(/Sample drawn as simulated for Deuteranopia/)).toBeInTheDocument();

    const warnings = screen.getByRole('heading', { name: 'Hard to tell apart' }).nextElementSibling;
    expect(warnings).toHaveTextContent('Leaf and Ember with deuteranopia');

    await user.click(screen.getByRole('radio', { name: 'Typical color vision' }));
    expect(swatch?.style.background).toBe('rgb(47, 133, 90)');
    expect(status()).toHaveTextContent('Showing typical color vision.');
  });

  it('says when no pair is confusable', async () => {
    const { user } = renderApp('#c=A.000000&c=B.ffffff');
    await user.click(screen.getByRole('radio', { name: /Protanopia/ }));
    expect(screen.getByText(/No pair drops below a color difference of 0.08/)).toBeInTheDocument();
  });

  it('keeps the URL hash in sync and restores state from it', async () => {
    const { user, unmount } = renderApp();
    expect(window.location.hash).toBe(encodeHash(DEFAULT_SHARED_STATE));
    await user.click(screen.getByRole('radio', { name: /Tritanopia/ }));
    await user.click(cell(/, Ink on Paper:/));
    const hash = window.location.hash;
    expect(hash).toContain('sim=tritanopia');
    expect(hash).toContain('fg=0&bg=2');
    unmount();

    renderApp(hash);
    expect(previewHeading()).toHaveTextContent('Ink on Paper');
    expect(screen.getByRole('radio', { name: /Tritanopia/ })).toBeChecked();
  });

  it('loads a palette pasted into the address bar and reports broken links', () => {
    renderApp('#c=broken');
    expect(screen.getByRole('alert')).toHaveTextContent('could not be read');
    expect(screen.getAllByRole('textbox', { name: 'Name' })).toHaveLength(7);

    act(() => {
      window.history.replaceState(null, '', '/#c=Night.000000&c=Day.ffffff&fg=0&bg=1');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(previewHeading()).toHaveTextContent('Night on Day');

    act(() => {
      window.history.replaceState(null, '', '/#c=only-one.000000');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(previewHeading()).toHaveTextContent('Night on Day');
  });

  it('dismisses the broken-link notice', async () => {
    const { user } = renderApp('#c=broken');
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('copies a link to the current state', async () => {
    const { user } = renderApp();
    await user.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(await navigator.clipboard.readText()).toBe(window.location.href);
    expect(status()).toHaveTextContent('Link copied.');
  });

  it('explains how to copy the link when the clipboard is unavailable', async () => {
    const { user } = renderApp();
    const original = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = () => Promise.reject(new Error('denied'));
    try {
      await user.click(screen.getByRole('button', { name: 'Copy link' }));
      expect(status()).toHaveTextContent('Could not copy automatically.');
    } finally {
      navigator.clipboard.writeText = original;
    }
  });

  it('switches and remembers the theme', async () => {
    const { user } = renderApp();
    const theme = screen.getByRole('combobox', { name: 'Theme' });
    await user.selectOptions(theme, 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(window.localStorage.getItem('contrastkit-theme')).toBe('dark');
    await user.selectOptions(theme, 'system');
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('starts with a saved theme', () => {
    window.localStorage.setItem('contrastkit-theme', 'light');
    renderApp();
    expect(screen.getByRole('combobox', { name: 'Theme' })).toHaveValue('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('offers a skip link to the main content', () => {
    renderApp();
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });
});
