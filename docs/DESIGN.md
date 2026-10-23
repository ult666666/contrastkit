# contrastkit design notes

This document explains how contrastkit works and why it is built the way it is: the
architecture, the color math, the fix-search algorithm, the color-vision-deficiency (CVD)
model, the accessibility decisions in the web app, the trade-offs, and how correctness is
verified. Every number quoted here was produced by this repository's code or tests.

## 1. Architecture

```
contrastkit/
├── packages/contrastkit/   library + CLI (one npm package, zero runtime dependencies)
│   ├── src/                parse, format, convert, gamut, contrast, fix, cvd, audit
│   ├── src/cli/            the `contrastkit` command (the only code that uses Node APIs)
│   └── test/               Vitest unit and property tests (fast-check)
├── app/                    Palette Auditor (React + Vite), deployed to GitHub Pages
├── examples/               tokens.json for the CLI, library.mjs for the library
└── .github/workflows/      ci.yml and pages.yml
```

Data flows one way: **string → sRGB → linear RGB → (luminance | OKLab | CVD matrix) →
results**. Every public function accepts a `ColorInput` (a CSS string or an `Rgb` object)
and normalizes it with `toRgb`, which parses strings and validates objects. That is the
single validation boundary.

Decisions worth being able to defend:

- **One `Rgb` type, gamma-encoded, channels in [0, 1].** It is what CSS colors are defined
  in, so parsing and formatting are lossless for 8-bit colors. Linear RGB, OKLab and OKLCH
  are derived on demand.
- **The core library is platform-neutral.** An ESLint rule forbids `node:*` imports and
  globals such as `process` outside `src/cli`, because the browser app imports the same code.
- **The CLI is testable without a terminal.** `run(argv, io)` takes stdout, stderr,
  readFile and a color flag and returns an exit code; `main.ts` only wires in `process`.
- **The app compiles the library from source** through a Vite alias and a TypeScript `paths`
  entry, so it never needs a separate library build and always tests current code.
- **Typed errors.** `ContrastKitError` is the base class; `ColorParseError` carries the
  input and a specific reason ("hex colors need 3, 4, 6 or 8 digits, got 5");
  `InvalidArgumentError` covers bad values such as a target above 21:1 or a translucent
  background. The CLI maps these to exit code 2.

## 2. Color math

### sRGB and linear light

CSS colors are gamma-encoded: equal steps in the numbers are not equal steps in light.
Luminance and color mixing need linear light, so each channel is decoded with the sRGB
transfer function (IEC 61966-2-1): `c / 12.92` up to 0.04045, otherwise
`((c + 0.055) / 1.055) ^ 2.4`. Negative values are mirrored (as CSS Color 4 does), so
out-of-gamut intermediate results stay defined.

### OKLab and OKLCH (Ottosson 2020)

OKLab is a perceptual space: Euclidean distance approximates how different colors look.
The conversion is linear RGB → LMS (Ottosson's M1) → cube root → OKLab (M2). The cube
root models the compressive response of vision. OKLCH is the polar form: lightness `L`,
chroma `C = √(a² + b²)` and hue `h = atan2(b, a)`. Hue is reported as 0 when chroma is below
1e-6, since grays converted from sRGB come out with chroma near 1e-8 and their "hue" is
rounding noise.

**A precision finding.** Ottosson's published M2 and its published inverse are not exact
inverses: their product differs from the identity by up to **6.2e-8** (M1 and its inverse
by 2.4e-10). Over 400,000 sampled colors, an sRGB → OKLab → sRGB round trip was off by at
most **1.7e-6**. So "in gamut" allows a tolerance of 1e-5 per channel, about 1/400 of an
8-bit step. A tolerance of 1e-6 was too tight: it made in-gamut colors look out of gamut and
needlessly lose chroma.

### Gamut mapping (CSS Color 4)

An `oklch()` color can lie outside sRGB. `gamutMapOklch` follows CSS Color 4's algorithm:

1. `L ≥ 1` → white, `L ≤ 0` → black; in-gamut colors are returned unchanged.
2. If simply clipping the channels changes the color by less than one JND (ΔE_OK < 0.02),
   use the clipped color.
3. Otherwise binary-search chroma (keeping L and h) between 0 (a gray, always in gamut) and
   the original. In-gamut midpoints raise the lower bound. Out-of-gamut midpoints whose
   clip is within a JND also raise it, and the search returns once that clip is within
   epsilon of exactly one JND. Midpoints whose clip is further away lower the upper bound.

The JND step matters. Plain chroma reduction turned `oklch(36.11% 0.246 264.11)`, which is
`#0006bb` written with display precision and lands a hair outside sRGB, into `#001fac`:
25 steps off in green. Near some faces of the sRGB cube the constant-hue path runs almost
parallel to the boundary. With step 2 the same input maps back to exactly `#0006bb`; a test
pins this case.

### Distances

ΔE_OK is the Euclidean distance in OKLab. CSS Color 4 uses 0.02 as a just-noticeable
difference (JND).

## 3. WCAG 2.2 contrast

- **Relative luminance**: `L = 0.2126 R + 0.7152 G + 0.0722 B` on linearized channels.
- **Contrast ratio**: `(L1 + 0.05) / (L2 + 0.05)` with L1 the lighter, from 1 to 21. The
  0.05 terms model ambient light (flare) on the screen.
- **0.03928 vs 0.04045.** WCAG 2.0 printed 0.03928 as the linearization threshold, a value
  copied from a draft of the sRGB standard. The standard uses 0.04045, and WCAG's
  definition was corrected to 0.04045 in 2021 (WCAG 2.2 has 0.04045). We use 0.04045. No
  8-bit value lies between the two (10/255 ≈ 0.0392, 11/255 ≈ 0.0431), so for hex colors
  the results are bit-for-bit identical; a test checks all 256 values.
- **Translucent foregrounds** are composited over the background first (source-over in
  gamma-encoded sRGB, as browsers blend). A translucent background is rejected: its
  contrast depends on what lies behind it.
- **No rounding up.** WCAG's Understanding documents say ratios must not be rounded to
  pass: 4.499:1 fails 4.5:1. Comparisons use the raw number, and `formatRatio` truncates
  rather than rounds, so a displayed value never looks like a pass it is not. (#777777 on
  white is 4.478…, shown as 4.47:1; some tools round it to 4.48.)

| Criterion                    | Level | Normal text                      | Large text |
| ---------------------------- | ----- | -------------------------------- | ---------- |
| SC 1.4.3 Contrast (Minimum)  | AA    | 4.5:1                            | 3:1        |
| SC 1.4.6 Contrast (Enhanced) | AAA   | 7:1                              | 4.5:1      |
| SC 1.4.11 Non-text Contrast  | AA    | 3:1 (UI components and graphics) |            |

Large text is at least 18pt (24px), or 14pt (about 18.66px) bold. Non-text contrast has no
AAA version, so the AAA target for `non-text` stays 3:1.

## 4. The fix search

`suggestFix(foreground, background, { target | level, use })` changes only the
foreground's OKLCH lightness. It keeps the hue, keeps chroma where sRGB allows it, and keeps
alpha exactly. Lightness is the perceptual dimension that drives luminance, so the smallest
lightness change that passes is usually the least visible fix.

1. If the pair already passes, return `{ status: 'passes' }`.
2. For each direction, darker (towards L = 0) and lighter (towards L = 1):
   - If the end of the direction fails, skip it. Black and white have the lowest and
     highest possible luminance, so nothing in between can do better (compositing at a
     fixed alpha is monotonic in each channel, so this holds for translucent colors too).
   - Otherwise binary-search L between the original (fails) and the end (passes) until
     the interval is below 1e-5, about 17 steps. Each probe is gamut-mapped, then rounded
     to 8-bit, so the returned color is exactly what its hex code produces. The invariant
     "the upper bound passes" means the returned color has been measured to pass.
3. If neither direction works, return `{ status: 'unachievable', maxRatio }`. Otherwise
   return the candidates sorted by ΔE_OK from the original, closest first.

Cost: at most 2 × 18 probes, each a gamut map (≤ ~14 chroma steps) plus a contrast
computation, so microseconds per pair.

The bisection assumes contrast changes monotonically along each direction. That is true in
the common case (the fail/pass predicate flips once, even when the path crosses the
background's luminance) but not guaranteed for every gamut-mapped path. When it fails, the
result still passes but may not be the very closest passing color. The property tests
check what is guaranteed:

- every candidate meets the target, including its hex code re-parsed;
- every candidate is in gamut with 8-bit channels;
- candidates are sorted by ΔE_OK;
- `unachievable` is returned **exactly** when neither black nor white reaches the target
  (500 random cases per property).

## 5. Color-vision-deficiency simulation

**Method:** Machado, Oliveira & Fernandes (2009). The paper models anomalous trichromacy
as a shift of one cone type's spectral sensitivity and publishes one 3×3 matrix per
deficiency and severity. contrastkit uses the severity-1.0 matrices (dichromacy) and
applies them in linear RGB, then clips to the gamut and re-encodes.

**Why Machado rather than Viénot 1999 + Brettel 1997?** It covers all three deficiencies
with one published set of coefficients. The coefficients can also be checked: every row
sums to 1 (to 1e-6), and the protan and deutan matrices are singular, with determinants of
1.4e-7 and 5.8e-7. A misremembered digit would almost certainly break one of those
checks. Viénot 1999 does not cover tritanopia, and a sound Brettel 1997 implementation needs
cone-fundamental data at specific wavelengths that are not reproduced here.

**Verified properties:**

- neutral grays keep exactly the same hex value (rows sum to 1);
- outputs are always in gamut;
- protan and deutan are rank 2: they collapse one dimension of color, as losing a cone
  type does;
- every color on the confusion line through mid-gray (the matrix's null direction)
  simulates to that same gray (property test);
- protanopia darkens pure red while deuteranopia does not, matching the physiology.

Machado's matrices are not projections, so idempotence (simulating twice changes nothing),
a property of Viénot/Brettel-style projections, does not apply and is not tested.

**Limitations:** an average observer, not any individual; dichromacy only (anomalous
trichromacy is more common and milder); the tritanopia matrix is not rank 2 and tritan
simulations are generally considered less reliable; it assumes an sRGB display.

## 6. Palette audits

`auditPalette` returns the full contrast matrix (symmetric for opaque colors), every
unordered pair with its WCAG checks and ΔE_OK, and **CVD confusions**: pairs whose ΔE_OK is
at least a threshold in typical vision but falls below it after simulation. Pairs that
already look alike in typical vision are not repeated for every deficiency. Palette colors
must be opaque.

**Threshold: 0.08 (four JNDs), configurable.** A JND is measured on large patches side by
side; interface colors are often small and far apart. These measurements (ΔE_OK, produced
by this code) guided the choice:

| Pair                                     | Typical | Protanopia | Deuteranopia | Tritanopia |
| ---------------------------------------- | ------: | ---------: | -----------: | ---------: |
| matplotlib tab10 red / green             |   0.338 |      0.207 |        0.039 |      0.347 |
| Material red / green (#f44336 / #4caf50) |   0.322 |      0.176 |        0.036 |      0.355 |
| Bootstrap danger / success               |   0.306 |      0.099 |        0.074 |      0.343 |
| tab10 green / orange                     |   0.286 |      0.007 |        0.135 |      0.311 |
| tab10 blue / purple                      |   0.142 |      0.017 |        0.054 |      0.131 |
| pure red / pure green                    |   0.520 |      0.441 |        0.222 |      0.473 |
| dark text / white                        |   0.723 |      0.716 |        0.725 |      0.724 |

0.08 flags the classic red/green status pairs under deuteranopia and green/orange under
protanopia. It leaves pure red and pure green alone, since their lightness still differs.
It is a heuristic, not a standard; `--json` and the library expose the raw ΔE values.

`checkRequirements` checks declared foreground/background pairs at their level and use.

## 7. CLI

- `check` prints all five WCAG checks and exits 1 if the selected target fails.
- `fix` prints the candidates and exits 1 only if the target is unachievable.
- `audit` checks declared pairs (each at its own `level`, default `--require`, default AA)
  and reports CVD warnings. If the tokens file declares no pairs, `--require` checks every
  pair; without it, `audit` only reports.
- Exit codes: 0 pass, 1 failed check, 2 usage or input error. That makes `audit` usable as
  a CI gate.
- The tokens format: nested groups joined with dots, string values or W3C-style
  `{ "$value": … }` tokens; other `$` keys are ignored.
- Output uses 24-bit ANSI swatches only on a TTY without `NO_COLOR`, and PASS / FAIL / WARN
  are always written out. Hex colors may omit `#`, because an unquoted `#` starts a
  comment in most shells.
- Arguments are parsed with `node:util` `parseArgs`, so there are no dependencies.

## 8. Web app: accessibility decisions

An accessibility tool has to be accessible itself.

- **Structure:** a skip link, `header`/`main`/`footer` landmarks, one `h1` and section
  `h2`s, a `<fieldset>` per palette row, and visible `<label>`s on every control.
- **The matrix is an ARIA grid** (WAI-ARIA Authoring Practices grid pattern): a native
  table with `role="grid"`, row and column headers, and one button per cell with a **roving
  tabindex**. The whole grid is one Tab stop; arrow keys, Home/End and Ctrl+Home/End move
  focus; Enter or Space selects. Selection is shown by `aria-pressed` and by a shape change
  (a thick double border), not by color.
- **Label in Name (WCAG 2.5.3):** each cell's accessible name starts with its visible text
  ("4.20 Large, Slate on Mist: large text and non-text UI only"). A real-browser axe run
  caught the first version, whose name did not contain the visible text; jsdom had not.
- **No meaning by color alone:** badges say AAA / AA / Large / Fail and also differ by fill
  and border style; checks say Pass/Fail next to the ✓/✗; errors are text tied to their
  input with `aria-describedby` and `aria-invalid`.
- **Announcements:** a polite `role="status"` region reports applied fixes, added and
  removed colors, swaps, simulation changes and copied links. A fresh node per message
  makes repeats announce too.
- **Focus management:** after removing a color, focus moves to a neighboring row; after
  adding one, to its name field; after applying a fix (which removes the Apply buttons), to
  the fix result.
- **Visible focus** is a 3px outline with an offset in both themes. Its contrast against
  the page and panels is checked like any other color pair.
- **Motion** (transitions, smooth scrolling) only happens under
  `prefers-reduced-motion: no-preference`.
- **Themes** use CSS `light-dark()` with `color-scheme`, following the system unless a
  theme is chosen (stored in `localStorage`, applied before first paint).
- **Shareable state:** palette, selected pair, simulation and fix target live in the URL
  hash (`#c=Ink.1f2933&c=Paper.ffffff&fg=0&bg=1&sim=none&target=AA-text`), updated with
  `replaceState` so Back still leaves the app. Invalid links fall back to the default
  palette with a notice.
- **A deliberate exception:** the preview sample renders the user's colors at their real
  contrast, which can fail on purpose. Everything the sample shows is also stated in text
  (ratio and checks), and the real-browser axe run excludes only that element.
- **Simulation is visual only.** Swatches and the preview are drawn as simulated, but
  ratios always use the actual colors, as WCAG defines them.

## 9. Trade-offs

| Choice                       | Benefit                                          | Cost                                                     |
| ---------------------------- | ------------------------------------------------ | -------------------------------------------------------- |
| Fix changes lightness only   | Keeps the brand hue; easy to explain             | A hue or chroma change could be closer in rare cases     |
| Bisection on lightness       | ~17 probes per direction; result always verified | "Closest" assumes monotonic contrast along the path      |
| CSS Color 4 gamut mapping    | Standard behavior; no needless desaturation      | Result can differ from the constant-hue color by < 1 JND |
| Machado 2009 at severity 1.0 | One model for all three types; checkable numbers | No anomalous trichromacy; tritan less reliable           |
| Truncate displayed ratios    | Never shows a fail as a pass                     | Differs by 0.01 from tools that round                    |
| sRGB only                    | Matches WCAG 2 and most design tokens            | No Display P3 or wide-gamut checks                       |
| App imports library source   | No build-order coupling; always current          | The app bundle compiles the library itself               |

## 10. How correctness is verified

- **Hand-checked WCAG values:** black/white = 21 exactly; #777777/white = 4.478 (fails AA
  text, passes large text and non-text); #767676 = 4.542; #595959 = 7.005; #949494 =
  3.033; pure red on white = 3.998 (fails AA text); #0000ff on white = 8.592;
  #00ff00 on black = 15.304.
- **Reference values:** white maps to OKLab (1, 0, 0) within 1e-7; neutral grays have
  L = ∛(linear value) and a = b = 0. The sRGB primaries reproduce the commonly cited OKLCH
  values (red = oklch(62.8% 0.2577 29.23)).
- **Independent cross-check against Chromium 152's CSS engine** (one-off, during
  development): all 148 named colors identical; RGB → OKLCH for 30 colors within 3.3e-5
  in L and 4.4e-5 in C (Chromium converts via CIE XYZ with CSS Color 4's matrices); OKLCH →
  8-bit sRGB identical for all 8 samples. Ten of the Chromium values are kept as test
  fixtures.
- **Property tests (fast-check):** round trips (sRGB ↔ OKLCH ↔ HSL, hex, rgb() and
  oklch() formatting); gamut mapping always in gamut and within one JND of the original's
  lightness/hue line; contrast symmetric and within [1, 21]; the fix-search and CVD
  properties above; audit confusions consistent with the threshold.
- **CLI tests** run every command, flag and error path in memory, including exit codes,
  JSON output, TTY styling and the example tokens file.
- **App tests** (Testing Library + user-event in jsdom) cover editing, validation, grid
  keyboard navigation, applying fixes, focus management, simulation, URL-hash sync, theme
  and clipboard. **axe-core** finds no violations in three UI states. jsdom cannot measure
  color contrast, so a dogfooding test audits the app's own theme tokens with contrastkit
  (15 pairings, both themes).
- **Real browser** (production build via `vite preview`, Chromium 152, axe-core 4.14.0):
  0 violations in the light and dark themes, excluding only the preview sample; 54 rules
  passed. 8 color-contrast checks were "incomplete" because axe could not determine the
  background of elements clipped by the matrix's scroll area; those colors are covered by
  the token audit. Keyboard navigation and the fix flow were exercised there by hand, and
  at 375px wide the page does not scroll sideways.

## 11. Toolchain notes

The brief asked for current stable versions with CI on Node 20, 22 and 24. In October 2026
several latest majors no longer support Node 20 (which reached end-of-life in April 2026),
so the newest versions that do were pinned:

| Package                   | Used  | Latest seen | Reason                                            |
| ------------------------- | ----- | ----------- | ------------------------------------------------- |
| typescript                | 6.0.x | 7.0         | typescript-eslint 8.72 supports TypeScript < 6.1  |
| eslint, @eslint/js        | 9.39  | 10.x        | eslint-plugin-jsx-a11y 6.10.2 supports ESLint ≤ 9 |
| vitest, coverage-v8       | 4.1   | 5.0         | Vitest 5 requires Node ≥ 22.12                    |
| tsup                      | 8.5   | 9.0         | tsup 9 requires Node ≥ 22.18                      |
| jsdom                     | 29.1  | 30.1        | jsdom 30 requires Node ≥ 22.22                    |
| @testing-library/jest-dom | 6.9   | 7.0         | 6.10+ requires Node ≥ 22                          |

npm reports ESLint 9 as no longer supported, so moving to ESLint 10 is the first upgrade
once jsx-a11y supports it. tsup 8 passes `baseUrl` to its declaration build, which
TypeScript 6 deprecates, so `tsup.config.ts` sets `ignoreDeprecations: "6.0"` for that
build only. npm 11 skips the install scripts of esbuild and fsevents unless approved; they
are not needed (esbuild ships its binary as an optional dependency).

## References

- W3C, _Web Content Accessibility Guidelines (WCAG) 2.2_, https://www.w3.org/TR/WCAG22/ —
  relative luminance, contrast ratio, SC 1.4.1, 1.4.3, 1.4.6, 1.4.11 and 2.5.3, and their
  Understanding documents.
- W3C, _CSS Color Module Level 4_, https://www.w3.org/TR/css-color-4/ — color syntax,
  named colors, sRGB transfer function, OKLab/OKLCH, ΔE_OK and gamut mapping.
- Björn Ottosson, _A perceptual color space for image processing_ (2020),
  https://bottosson.github.io/posts/oklab/
- G. M. Machado, M. M. Oliveira, L. A. F. Fernandes, _A Physiologically-based Model for
  Simulation of Color Vision Deficiency_, IEEE TVCG 15(6), 2009, doi:10.1109/TVCG.2009.113.
- F. Viénot, H. Brettel, J. D. Mollon, _Digital video colourmaps for checking the
  legibility of displays by dichromats_, Color Research & Application 24(4), 1999
  (considered, not used).
- H. Brettel, F. Viénot, J. D. Mollon, _Computerized simulation of color appearance for
  dichromats_, JOSA A 14(10), 1997 (considered, not used).
- IEC 61966-2-1:1999, the sRGB standard.
- W3C WAI-ARIA Authoring Practices, Grid pattern,
  https://www.w3.org/WAI/ARIA/apg/patterns/grid/
- NO_COLOR convention, https://no-color.org/
