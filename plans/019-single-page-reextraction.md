# Plan 019: Make page insert/delete/rotate O(page), not O(document)

> **Executor instructions**: Follow step by step; run every verification
> command. On any STOP condition, stop and report. Update the status row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat <planned-at SHA>..HEAD -- src/state/useEditorController.ts src/engine/pdfEngine.ts src/editor/pageOperations.ts`
> On mismatch with the excerpts below, STOP.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `41f0dd9` (update to the merged wave-2 SHA before executing), 2026-07-18

## Why this matters

Rotating, inserting, or deleting one page currently re-runs
`pdfEngine.extractTextAndFonts(bytes)` over the whole document
(`useEditorController.ts` → `updateDocumentBytes` → `loadPdfState`), and each
page inside that loop awaits `getPage` → `getAnnotations` → `getTextContent`
→ `getOperatorList` sequentially. On a 200-page document a single-page rotate
costs a full-document pdf.js extraction pass plus a pdf-lib parse — a
multi-second stall for an O(1) edit.

## Current state

- `src/state/useEditorController.ts` — `updateDocumentBytes` computes `sizes`
  once (already optimized) and calls `loadPdfState(next, { operations, past,
  future }, sizes)`; `loadPdfState` unconditionally calls
  `pdfEngine.extractTextAndFonts(loaded.bytes)`.
- `src/engine/pdfEngine.ts` — `extractTextAndFonts` loops every page; it has
  no page-range parameter.
- `src/editor/pageOperations.ts` — `shiftOperationsForInsertedPage` /
  `shiftOperationsForDeletedPage` already implement the index-shift math for
  operations; text items need the identical treatment.

## Steps

### Step 1: Add a page-scoped extraction
Extend `extractTextAndFonts(bytes, pageIndexes?: number[])` to visit only the
given pages (default: all). Fonts map merges as today.
**Verify**: `bun run test tests/pdfEngineLoad.test.ts` → pass, plus a new test
extracting only page 1 of a 2-page doc.

### Step 2: Add text-item shift helpers
In `src/editor/pageOperations.ts`, add `shiftTextItemsForInsertedPage` /
`shiftTextItemsForDeletedPage` mirroring the operation versions (unit-test
them next to `tests/pageOperations.test.ts`'s existing cases).
**Verify**: `bun run test tests/pageOperations.test.ts` → pass.

### Step 3: Incremental update in the controller
In `updateDocumentBytes`, accept a hint (`mutation: { kind: "rotate" | "insert" | "delete"; pageIndex: number }`):
- rotate → re-extract only the rotated page; splice its items (and merge any new fonts) into state.
- insert → shift items ≥ index; extract the new page (blank ⇒ no items) only.
- delete → drop the deleted page's items and shift the rest.
Keep the full-extraction path for open/restore untouched.
**Verify**: existing `tests/useEditorController.test.tsx` page-op tests pass;
add tests asserting `extractTextAndFonts` receives the page-scoped argument.

### Step 4: Full gate
**Verify**: `bun run typecheck && bun run lint && bun run test:coverage && bun run e2e` → all pass.

## Done criteria

- [ ] Rotating page k of an N-page doc calls pdf.js extraction for exactly 1 page (asserted in a test)
- [ ] Insert/delete shift text items exactly like operations (tests)
- [ ] Full gate green, 100% coverage maintained
- [ ] `plans/README.md` row updated

## STOP conditions

- Rotation changes extracted coordinates for OTHER pages too (would falsify
  the splice approach — verify early with a 2-page fixture where page 2 is
  rotated and page 1's items are compared before/after).
- Font keys collide between the incremental merge and the existing map in a
  way that breaks `embeddedFontKey` reuse.

## Maintenance notes

- Plan 022 (font-registry eviction) interacts: incremental extraction opens a
  new pdf.js document per mutation, minting new font ids — land 022's stable
  keying first or together.
