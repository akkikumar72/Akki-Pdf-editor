# Plan 005: Make TXT/CSV/XLSX export reflect edits (not the original PDF text)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If a STOP condition occurs, stop and report — do not improvise.
> When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8c2aec8..HEAD -- src/engine/exportPipeline.ts src/types/editor.ts tests/exportPipeline.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug / direction
- **Planned at**: commit `8c2aec8`, 2026-06-17

## Why this matters

The headline feature is "click existing PDF text → replace it". PDF export bakes
those text edits into the bytes, but the data exports (`txt`, `csv`, `xlsx`) read
**only** `context.textItems` — the original extracted PDF text — and use
`operations` solely to filter by table region. So a user who replaces "$5" with
"$50" gets "$50" in the exported PDF but the stale "$5" in CSV/XLSX/TXT. This is
silent data corruption: it looks like it worked. This plan makes data export use
the effective (edited) text.

## Current state

- `src/engine/exportPipeline.ts:58-91` — `toText`, `toCsv`, `toXlsxBytes`, and the
  private `tableRows` read `textItems`; `operations` is only used to filter by
  `table-region` (`:76-88`). Replacement `text` ops and `whiteout` ops are ignored.
- `src/engine/pdfEngine.ts` `savePdf` (text branch, ~`:373`) shows the model for
  "effective text": a `text` op with `sourceCoverRect` replaces the original glyph
  at those bounds; `whiteout` removes content under its rect.
- `src/types/editor.ts:51-76` — `TextOperation` has `text`, `rect`,
  `sourceCoverRect`; `WhiteoutOperation` has `rect`.
- `tests/exportPipeline.test.ts` — existing CSV/XLSX clustering + formula-injection
  tests; use them as the structural pattern for new cases.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun run typecheck` | exit 0 |
| Unit tests | `bun run test` | all pass |
| Build | `bun run build` | exit 0 |

## Scope

**In scope**
- `src/engine/exportPipeline.ts` — add an "effective text items" derivation used by
  `toText`/`toCsv`/`toXlsxBytes`/`tableRows`
- `tests/exportPipeline.test.ts` — new cases

**Out of scope**
- The PDF and PNG export paths (already edit-aware)
- The CSV/XLSX formula-neutralization logic (already handled; keep it)
- Adding new operation types

## Steps

### Step 1: Derive effective text items from `textItems` + `operations`

Add a private helper `effectiveTextItems(textItems, operations)` that:
1. Drops any original `textItems` whose `rect` is significantly covered by a
   `whiteout` rect or a replacement `text` op's `sourceCoverRect` (same page).
2. Appends replacement/added `text` ops as synthetic `TextItem`s positioned by their
   `rect` (`str = operation.text`, `pageIndex`, `rect`), so row grouping places them
   correctly.
Reuse the page+rect overlap predicate style already used in `tableRows`
(`exportPipeline.ts:80-86`); define a small `rectsOverlap` helper if needed.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Route all three data exporters through the effective items

Have `toText`, `toCsv`, and `tableRows` consume `effectiveTextItems(...)` instead of
the raw `textItems`. (`toXlsxBytes` already goes through `tableRows`.) The
`table-region` filtering must apply **after** the effective merge.

**Verify**: `bun run test` → all pass.

### Step 3: Add regression tests

In `tests/exportPipeline.test.ts`, add cases: (a) a replacement `text` op overlapping
an original item makes CSV emit the new string and not the original; (b) a `whiteout`
op removes the original cell from output; (c) an added `text` op with no overlap
appears as a new cell. Model structure after the existing `toCsv` tests.

**Verify**: `bun run test` → all pass, including the new cases.

## Done criteria

- [ ] `bun run typecheck`, `bun run test`, `bun run build` all exit 0
- [ ] CSV/XLSX/TXT reflect replacement text, drop whiteout-covered text, and include added text
- [ ] Formula-neutralization still applied to the new synthetic cells
- [ ] `plans/README.md` status row updated

## STOP conditions

- Row/column grouping (`groupRows`) produces clearly wrong cell placement for the
  synthetic items after a reasonable attempt — report with an example.
- Making export edit-aware would require changing the `EditOperation` types.

## Maintenance notes

- New text-bearing operation types (e.g. future form-field value export) should be
  considered for inclusion in `effectiveTextItems`.
- A reviewer should confirm formula-neutralization (`neutralizeFormula`) runs on the
  merged synthetic cells — these now carry user-entered strings.
