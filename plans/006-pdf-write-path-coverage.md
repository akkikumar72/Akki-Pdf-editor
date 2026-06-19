# Plan 006: Strengthen test coverage of the PDF write path and export dispatch

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If a STOP condition occurs, stop and report — do not improvise.
> When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8c2aec8..HEAD -- src/engine/pdfEngine.ts src/engine/exportPipeline.ts tests/pdfEngineSave.test.ts tests/exportPipeline.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (complements 003 and 005)
- **Category**: tests
- **Planned at**: commit `8c2aec8`, 2026-06-17

## Why this matters

`savePdf` is the function the app exists for, yet `tests/pdfEngineSave.test.ts`
exercises only 4 of ~14 draw branches and most assertions are "the result re-loads"
rather than "the right thing was drawn". `ExportPipeline.export()` — the format
dispatch the UI actually calls — has zero coverage. A regression in image
embedding, form fields, the whiteout-mask anchoring, font reuse, or the PNG
null-stage error path ships silently. This plan raises the write-path oracle from
"loads OK" to "drew the expected content" and covers the dispatch.

## Current state

- `src/engine/pdfEngine.ts:297-688` — `savePdf` branches across whiteout, text
  (+mask/`sourceCoverRect`/embedded-font reuse/align), annotation
  (highlight/strikeout/underline/note), shape (ellipse/line/arrow/rect), ink, image,
  signature (image/typed), stamp, form-mark (check/cross/dot), form-field
  (checkbox/radio/signature/text), link.
- `tests/pdfEngineSave.test.ts:12-95` — 4 cases (one text, one transparent shape,
  link sanitization, out-of-range page); assertions mostly check the bytes re-load.
- `src/engine/exportPipeline.ts:19-56` — `export(format, context)` dispatches
  pdf/txt/csv/xlsx/png; the `png` branch throws `"No rendered page is available for
  PNG export."` when `pageStage` is null (`:45`). The constructor takes an injectable
  `engine` (`:17`), so a fake engine can be passed in tests.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun run typecheck` | exit 0 |
| Unit tests | `bun run test` | all pass, including new cases |
| Build | `bun run build` | exit 0 |

## Scope

**In scope**
- `tests/pdfEngineSave.test.ts` — add per-type content assertions
- `tests/exportPipeline.test.ts` — add `export()` dispatch tests
- A small test-only pdf-lib inspection helper may be added under `tests/`

**Out of scope**
- Changing `savePdf` or `exportPipeline` behavior (tests only; if 003/005 land
  first, test against their behavior)
- Adding a coverage-threshold tool/config (optional follow-up, not required here)

## Steps

### Step 1: Add content assertions to the PDF writer tests

For each major drawable type, save then re-load with `pdf-lib` and assert on the
result: link annotation URI present (already partially done), an embedded image
XObject exists for `image`, the whiteout mask for a replacement `text` op is drawn
at `sourceCoverRect` (not `rect`), and the font-reuse path is exercised when glyphs
are covered vs. falling back when not. Keep assertions robust, not brittle binary
snapshots.

**Verify**: `bun run test` → all pass.

### Step 2: Cover `ExportPipeline.export()` dispatch

Construct `new ExportPipeline(fakeEngine)` with a stub `savePdf`, spy on
`downloadBlob` (mock `../src/utils/download`), and mock `html-to-image`'s `toPng`.
Assert each format produces a blob of the right MIME/extension, and that
`export("png", { pageStage: null })` rejects with the expected message.

**Verify**: `bun run test` → all pass.

## Test plan

- New cases live in the two existing test files; model structure after the current
  tests in each.
- Verification: `bun run test` → all pass; the suite count increases by the number
  of added cases.

## Done criteria

- [ ] `bun run typecheck`, `bun run test`, `bun run build` all exit 0
- [ ] Each major `savePdf` draw branch has at least one content assertion
- [ ] `ExportPipeline.export()` has tests for all five formats + the PNG null-stage error
- [ ] `plans/README.md` status row updated

## STOP conditions

- Asserting drawn content requires reaching into pdf-lib internals in a way that is
  too brittle to maintain — report and propose a coarser oracle.
- A new test reveals an actual `savePdf` bug — STOP and report it (do not fix it
  inside this tests-only plan; open it as a finding).

## Maintenance notes

- If plan 003 (exhaustive dispatch) lands, every operation type will have a writer
  branch; this suite should then cover each.
- Consider adding `@vitest/coverage-v8` with a starting line threshold as a separate
  follow-up so write-path gaps become visible in CI.
