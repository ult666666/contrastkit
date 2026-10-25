# Palette Token Download Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Export the current palette and selected requirement into a real CLI-auditable tokens file.

**Architecture:** A pure `prepareTokens` serializer derives validation and JSON from actual palette state; a small `downloadTokens` helper owns Blob/anchor cleanup. App connects both to the existing PaletteEditor actions and live announcements.

**Tech Stack:** Existing React/TypeScript, Vitest/jsdom, built Node CLI; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-25-token-download-design.md`

## Global Constraints

- The download is `contrastkit-tokens.json`.
- CVD simulation changes only the preview; it must never change exported colors.
- No new production dependencies, import workflow or redesign.
- Source changes stay inside this exclusive ContrastKit clone; no merge or deployment.

## Review Focus

- Empty, whitespace-only, duplicate-case and metadata names must never create a broken token file.
- Selection changes and every target must preserve foreground/background direction, level and use.
- CVD state must not alter palette values in JSON.
- Dots and special object-property names must survive serialization and the real parser.
- Browser download failure must give accessible feedback and release temporary resources.

### Task 1: Export the edited palette through the real CLI schema

**Files:** Create `app/src/tokens-export.ts`, `app/test/tokens-export.test.tsx`; modify `app/src/App.tsx`, `app/src/components/PaletteEditor.tsx`, `app/package.json`, README.

**Interfaces:** `prepareTokens(colors, foreground, background, target)` returns `{status:'ready',json:string}` or `{status:'invalid',message:string}`. `downloadTokens(json:string):void` creates the named JSON download. PaletteEditor receives `onExport` and optional `exportProblem` props.

- [x] Add tests capturing real Blob downloads and running the built CLI: failure/fix/success, all five targets, three CVD states, invalid-name recovery, unusual keys, browser failure. Add app `pretest` to build the actual CLI before tests.
- [x] Run `npm test -w app`; expect missing-download-button failures before product edits while old tests pass.
- [x] Implement serializer, safe key construction, download cleanup and editor action with its polite live hint; announce successful/failed downloads through the existing status.
- [x] Run app tests, strict typecheck/lint and fix implementation failures; apply the React quality checklist.
- [x] Document a repeatable UI → downloaded JSON → built CLI fail/fix/pass scenario and the name/CVD scope.
- [x] Run full tests, formatting, typecheck, lint and production build; inspect the exact diff and commit.

After pushing a scoped draft PR, attach it and request parent review of the exact head. Read hosted checks only through Code Review/GitHub connector tooling.
