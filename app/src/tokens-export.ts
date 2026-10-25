import { nameProblem, type FixTarget, type PaletteColor } from './state';

export const TOKENS_FILENAME = 'contrastkit-tokens.json';

type TokenExport =
  | { readonly status: 'ready'; readonly json: string }
  | { readonly status: 'invalid'; readonly message: string };

/** Serialize actual palette colors and one selected requirement in the CLI token schema. */
export function prepareTokens(
  colors: readonly PaletteColor[],
  foreground: PaletteColor,
  background: PaletteColor,
  target: FixTarget,
): TokenExport {
  for (const [index, color] of colors.entries()) {
    const problem = nameProblem(colors, color.id, color.name);
    if (problem !== undefined) {
      return {
        status: 'invalid',
        message: `Color ${index + 1}: ${problem} Fix names to download tokens.`,
      };
    }
    if (color.name.trim().startsWith('$')) {
      return {
        status: 'invalid',
        message: `Rename color ${index + 1}: names starting with $ are reserved for token metadata.`,
      };
    }
  }

  return {
    status: 'ready',
    json:
      JSON.stringify(
        {
          // fromEntries preserves own properties such as __proto__ without invoking setters.
          colors: Object.fromEntries(colors.map(({ name, hex }) => [name.trim(), hex])),
          pairs: [
            {
              foreground: foreground.name.trim(),
              background: background.name.trim(),
              level: target.level,
              use: target.use,
            },
          ],
        },
        null,
        2,
      ) + '\n',
  };
}

/** Hand the JSON Blob to the browser, then release the temporary element and URL. */
export function downloadTokens(json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  const link = document.createElement('a');
  const revoke = URL.revokeObjectURL.bind(URL);
  link.href = url;
  link.download = TOKENS_FILENAME;
  try {
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Give the browser a task to start the download before revoking its Blob URL.
    window.setTimeout(() => {
      revoke(url);
    }, 0);
  }
}
