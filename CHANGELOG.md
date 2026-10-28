# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Node 20 is no longer supported; it reached end-of-life in April 2026. The package needs
  Node 22 or newer, and CI runs on Node 22 and 24.

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
