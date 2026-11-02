# Using contrastkit in CI

## The tokens file

Describe your colors and the pairs that must pass in a tokens file. Groups nest with dots, and
W3C Design Tokens style `{ "$value": ... }` entries work. Here is part of
[`examples/tokens.json`](../examples/tokens.json):

```json
{
  "colors": {
    "text": { "primary": "#1f2937", "muted": "#4b5563", "inverse": "#ffffff" },
    "surface": { "default": "#ffffff", "subtle": "#f3f4f6" },
    "status": {
      "$type": "color",
      "success": { "$value": "#15803d" },
      "danger": { "$value": "#b91c1c" }
    }
  },
  "pairs": [
    { "foreground": "text.primary", "background": "surface.default" },
    { "foreground": "status.success", "background": "surface.subtle", "use": "large-text" },
    { "foreground": "border.strong", "background": "surface.default", "use": "non-text" }
  ]
}
```

Each pair is checked at its own `level` (or `--require`, default AA) for its `use`: `text`,
`large-text` or `non-text`. Color-vision confusions are reported as warnings and do not fail
the audit. The [README](../README.md#use-it-in-ci) shows the output for this file. With
`--require AAA`, the same file ends with `Result: 4 of 7 checked pairs fail.` and exits with
code 1.

## A GitHub Actions job

This job blocks merges when tokens lose contrast. Until contrastkit is on npm, it builds the
CLI from this repository:

```yaml
name: Design tokens
on: [push, pull_request]
permissions:
  contents: read
jobs:
  contrast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/checkout@v7
        with:
          repository: ult666666/contrastkit
          path: .contrastkit
      - uses: actions/setup-node@v7
        with:
          node-version: 24
      - run: npm ci && npm run build --workspace contrastkit
        working-directory: .contrastkit
      - run: node .contrastkit/packages/contrastkit/dist/cli.js audit tokens.json --require AA
```

This repository's own [CI](../.github/workflows/ci.yml) runs the same audit on the example file.

## From the web app to CI

In [Palette Auditor](https://ult666666.github.io/contrastkit/), **Download tokens JSON** saves
`contrastkit-tokens.json`. It holds every palette color and one requirement for the selected
foreground and background pair, with its target level and use. A color-vision simulation only
changes the preview; the file always has the palette's own colors.

To repair a pair and check the result with the CLI:

1. Open the default palette. **Slate on Mist** fails AA normal text at 4.20:1.
2. Select **Download tokens JSON** and save it as `tokens-before.json` in your checkout.
3. Select **Apply suggested fix: change Slate to #5d6977**. The pair now passes at 4.51:1.
4. Download again and save it as `tokens-after.json`.
5. After `npm ci && npm run build`, audit both files:

```sh
node packages/contrastkit/dist/cli.js audit tokens-before.json --json
# exit 1: the declared Slate/Mist pair fails
node packages/contrastkit/dist/cli.js audit tokens-after.json --json
# exit 0: the same declared pair passes
```

Empty or duplicate color names disable the download, with an explanation that screen readers
announce. Names are trimmed, and duplicates are compared without case. A name that starts with
`$` must be changed, because the CLI reserves those keys for token metadata. Dotted names work
as token names. The rest of the editor keeps working while you fix a name.
