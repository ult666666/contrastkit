# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-11-05

### Added

- Anomalous trichromacy: `simulateCvd(color, 'protanomaly' | 'deuteranomaly' | 'tritanomaly',
severity)` with a severity from 0 to 1, using all of Machado, Oliveira & Fernandes's (2009)
  published matrices (`ANOMALY_MATRICES`, severities 0.0 to 1.0 in steps of 0.1) and linear
  interpolation between them (`cvdMatrix`). Severity 1 gives exactly the dichromacy.
- `parseCvdSimulation` and `formatCvdSimulation` for the `deuteranomaly:0.6` text form.
- `auditPalette` accepts `{ type, severity }` entries in `cvdTypes`, and each CVD confusion
  reports its `severity`.
- CLI `--cvd <simulation>` (repeatable) for `check`, which prints the simulated pair, and
  `audit`, which looks for confusable pairs under the chosen simulations.
- Palette Auditor: protanomaly, deuteranomaly and tritanomaly options with a keyboard-operable
  severity slider; links store the severity (`sim=deuteranomaly:0.6`).
- Differential tests against colorspacious 1.1.2 (810 simulations, within 5e-13 per channel)
  and DaltonLens 0.1.5 (990 simulations at the published steps, within one 8-bit step), from a
  committed fixture whose generator is documented in docs/DESIGN.md.

### Changed

- Node 20 is no longer supported; it reached end-of-life in April 2026. The package needs
  Node 22 or newer, and CI runs on Node 22 and 24.
- The web app's tests run on jsdom 30. jsdom is now declared at the workspace root, where
  vitest resolves test environments; Dependabot's lockfile for this update placed it under
  `app/node_modules`, so every app test failed to start. Development needs Node 22.22.2+ or
  24.15+, the floors jsdom 30 declares (`engines` in the root `package.json`).
- Palette Auditor shows the color-format hint once above the palette instead of under every
  color, and every color field still references it for screen readers. The tagline, notes and
  footer are shorter.
- The README is shorter. The tokens file, the GitHub Actions job and the web-to-CI workflow
  moved to `docs/CI.md`, and the full limits and roadmap to `docs/DESIGN.md`.

## [0.1.0] - 2026-10-23

### Added

- Library (zero runtime dependencies, ESM + CommonJS + type declarations):
  - Parsing of hex, `rgb()`/`rgba()`, `hsl()`/`hsla()`, `oklch()` and the 148 CSS named
    colors, with typed errors (`ColorParseError`, `InvalidArgumentError`); formatting to hex,
    `rgb()`, `hsl()` and `oklch()`.
  - Conversions between sRGB, linear sRGB, OKLab, OKLCH and HSL, and CSS Color 4 gamut
    mapping into sRGB.
  - WCAG 2.2 relative luminance, contrast ratio (with compositing of translucent
    foregrounds) and checks for SC 1.4.3, 1.4.6 and 1.4.11.
  - `suggestFix`: the closest passing foreground by OKLCH lightness, ranked by ΔE_OK.
  - `simulateCvd`: protanopia, deuteranopia and tritanopia after Machado, Oliveira &
    Fernandes (2009).
  - `auditPalette` and `checkRequirements` for palette-wide audits.
- CLI `contrastkit` with `check`, `fix` and `audit` commands, `--json` output and exit codes
  for CI.
- Palette Auditor web app (React + Vite), deployable to GitHub Pages.
- CI workflow (lint, format, typecheck, tests with coverage, builds on Node 20/22/24) and a
  GitHub Pages deployment workflow.
