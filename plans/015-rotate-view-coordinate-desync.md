# Plan 015: Fix "Rotate view" so overlays land where the user clicks on rotated pages

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0caadd8..HEAD -- src/utils/coordinates.ts src/components/PdfCanvas.tsx src/components/useStagePointerGestures.ts src/routes/EditorRoute.tsx src/components/ToolRibbon.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `0caadd8`, 2026-07-18

## Why this matters

The toolbar's "Rotate view" button (`ToolRibbon.tsx:161`, wired in
`EditorRoute.tsx:83` to `setRotation((value) => (value + 90) % 360)`) rotates
the rendered page via react-pdf's `<Page rotate={rotation}>`, but every
coordinate transform in the app assumes an unrotated page. After one click,
click-to-place, drag, resize, marquee selection, and text hit-testing all
compute PDF coordinates against the wrong axes — overlays land somewhere other
than where the user clicked. This is a one-click, always-reachable core bug.

## Current state

- `src/utils/coordinates.ts` (entire file, ~33 lines) — `viewportRectToPdf`,
  `pdfRectToViewport`, `viewportPointToPdf` take only `pageHeight` and `scale`.
  No rotation parameter exists anywhere in the file.
- `src/components/PdfCanvas.tsx:627-647` — the stage div is sized
  `width: pageWidth * scale, minHeight: pageHeight * scale` with no
  width/height swap at 90°/270°, while `<Page rotate={rotation}>` rotates the
  canvas inside it.
- `rotation` state lives in `useEditorController.ts` (`rotation`,
  `setRotation`) and is persisted in saved sessions (`session.rotation`).
- The *permanent* rotation path (`rotateCurrentPage` →
  `pdfEngine.rotatePage`) re-bakes the PDF bytes and re-extracts text; it is
  correct and out of scope.

Two acceptable resolutions, in preference order:

1. **Option A (recommended): remove view-only rotation.** Delete the "Rotate
   view" button, `rotation` state, and its session persistence; keep only
   "Rotate page permanently", which needs no compensating math. Simpler, and
   Sejda-style editors survive without a transient view rotation.
2. **Option B: make the coordinate layer rotation-aware.** Add
   `rotation` to `viewportRectToPdf`/`pdfRectToViewport`/`viewportPointToPdf`
   (swap width/height and transform axes for 90/180/270) and thread it through
   every call site (PdfCanvas, useStagePointerGestures, OperationOverlay,
   textRunGrouping, alignmentGuides, toolbarPlacement).

Confirm with the repo owner which option before starting; default to Option A
if unreachable.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `bun install`            | exit 0              |
| Typecheck | `bun run typecheck`      | exit 0              |
| Tests     | `bun run test:coverage`  | all pass, 100% coverage |
| Lint      | `bun run lint`           | exit 0, zero warnings |
| E2E       | `bun run e2e`            | 18+ pass            |

## Scope

**In scope (Option A)**:
- `src/components/ToolRibbon.tsx` (remove the Rotate-view button)
- `src/routes/EditorRoute.tsx` (remove `onRotate` wiring)
- `src/state/useEditorController.ts` (remove `rotation`/`setRotation`; keep reading legacy `session.rotation` harmlessly)
- `src/components/PdfCanvas.tsx` (remove the `rotation` prop and `<Page rotate>`)
- `src/utils/storage.ts` types (mark `rotation` optional-legacy; do not break old sessions)
- Tests covering the removed surface

**Out of scope**:
- `rotateCurrentPage` / `pdfEngine.rotatePage` (permanent rotation — already correct)
- `src/utils/coordinates.ts` (unchanged under Option A)

## Steps (Option A)

### Step 1: Remove the button and wiring
Delete the Rotate-view button from `ToolRibbon.tsx` and the `onRotate` prop
end-to-end (ToolRibbon props type, EditorRoute usage).
**Verify**: `bun run typecheck` → exit 0 after also completing steps 2–3 (the
prop removal cascades).

### Step 2: Remove rotation state
In `useEditorController.ts`, delete `rotation`/`setRotation`/the `rotation`
field in `saveCurrentSession` and `loadSavedSession` (`setRotation(session.rotation ?? 0)`).
Keep the `SavedSession.rotation?` type field so old IndexedDB records still parse.
**Verify**: `grep -rn "setRotation" src/` → no matches.

### Step 3: Remove the canvas prop
In `PdfCanvas.tsx`, drop the `rotation` prop and the `rotate` pass-through to
react-pdf's `<Page>`.
**Verify**: `grep -rn "rotate={" src/` → no matches (except `rotateCurrentPage` wiring).

### Step 4: Update tests
Remove/adjust tests asserting rotate-view behavior (search `tests/` for
`onRotate`, `rotation`). Add a regression test asserting `SavedSession` records
containing `rotation` still restore.
**Verify**: `bun run test:coverage` → all pass, 100%.

## Done criteria

- [ ] `bun run typecheck && bun run lint && bun run test:coverage && bun run e2e` all exit 0
- [ ] `grep -rn "Rotate view" src/` returns no matches
- [ ] Old sessions containing `rotation` restore without error (covered by a test)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The repo owner wants Option B (rotation-aware coordinates) — that is a
  different, larger plan; report back for a rewrite of the steps.
- Any e2e test fails after the removal in a way not obviously caused by a
  removed control.
- `session.rotation` turns out to drive anything besides the view transform.

## Maintenance notes

- If view rotation is ever re-introduced, it must go through a rotation-aware
  `coordinates.ts` (Option B); grep for `pdfRectToViewport` call sites first.
- Reviewer should scrutinize saved-session backward compatibility.
