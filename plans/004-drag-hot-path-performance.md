# Plan 004: Make the drag/resize hot path cheap (throttle + memoize)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If a STOP condition occurs, stop and report — do not improvise.
> When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8c2aec8..HEAD -- src/components/PdfCanvas.tsx src/components/OperationOverlay.tsx src/routes/EditorRoute.tsx src/state/useEditorController.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `8c2aec8`, 2026-06-17

## Why this matters

Dragging or resizing an overlay currently dispatches a full reducer commit on every
`pointermove`, each rebuilding the `operations` array and pushing/coalescing a
history entry, and re-running the text-run grouping and alignment-line collection.
Because no overlay is memoized, every move re-renders all N overlays. On documents
with many edits this is the dominant cause of drag jank. The goal: one commit per
gesture and per-overlay render isolation, with no behavior change to undo
granularity or alignment guides.

## Current state

- `src/components/PdfCanvas.tsx` `onPointerMove` (around `:578-650`) calls
  `onOperationUpdate(...)` (→ `dispatch({type:"update"})`) on every move for both
  resize and drag.
- `src/state/editModel.ts:98-107` — each `update` rebuilds `operations` via `.map`
  and coalesces a history entry (`coalesceKey = update:${id}`, `:106`).
- `src/routes/EditorRoute.tsx` passes `editor.textItems.filter(...)` (a new array
  identity each render) into `PdfCanvas`, so the `useMemo(groupEditableTextRuns)`
  (`PdfCanvas.tsx` around `:411`) re-runs on every render.
- No `React.memo` anywhere (`rg "memo\(" src/` → none). `OperationOverlay`
  (`src/components/OperationOverlay.tsx:26`) is a plain function component with
  inline-created callbacks at the call site (`PdfCanvas.tsx:766-802`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Unit tests | `npm run test` | all pass |
| Build | `npm run build` | exit 0 |
| Browser tests | `npm run e2e` | all pass; the drag-with-guides test (`tests/e2e/editor.spec.ts:306`) and the source-mask move test (`:359`) must still pass |

## Scope

**In scope**
- `src/components/PdfCanvas.tsx` (drag/resize state + overlay mapping)
- `src/components/OperationOverlay.tsx` (wrap in `React.memo`)
- `src/state/useEditorController.ts` and/or `src/routes/EditorRoute.tsx` (memoize the
  per-page `textItems` slice so its identity is stable)

**Out of scope**
- The reducer history/coalescing logic in `src/state/editModel.ts` (keep one
  undo step per gesture — achieve it by committing once, not by changing coalescing)
- `PageRail` virtualization (separate finding, separate plan)
- Lazy-loading export/pdf-lib bundles (separate finding)

## Steps

### Step 1: Stabilize the per-page `textItems` reference

Compute the filtered current-page `textItems` with `useMemo` in
`useEditorController` (mirror `visibleOperations`) and pass the stable reference to
both `PdfCanvas` and `Inspector`, instead of `.filter(...)` inline in `EditorRoute`.

**Verify**: `npm run test` → all pass; `npm run typecheck` → exit 0.

### Step 2: Keep the live drag/resize rect in local component state

During a gesture, store the in-progress rect (and ink points) in `PdfCanvas` local
state and render the dragged overlay from it. Do **not** dispatch on each move.
Dispatch a single `update` on `onPointerUp`/`onPointerCancel`/`onLostPointerCapture`.
Keep alignment-guide feedback working (guides may read the live local rect).

**Verify**: `npm run e2e` → the drag-with-guides test still passes; manually confirm
one undo step reverts a full drag.

### Step 3: Memoize the overlay and stabilize its callbacks

Wrap `OperationOverlay` in `React.memo`. Hoist/`useCallback` the per-item handlers
in `PdfCanvas` so identities are stable (pass `operation.id`; avoid inline closures
that change every render). Be careful with the `previewOperation(operation)` wrapper.

**Verify**: `npm run e2e` → all pass; `npm run build` → exit 0.

## Test plan

- The existing e2e drag test (`tests/e2e/editor.spec.ts:306`) is the behavioral
  guard for drag + guides. The source-mask move test (`:359`) guards replacement
  masking. Both must pass unchanged.
- Optionally add a unit test asserting a single `update` action results from a
  simulated drag sequence if a hook test harness is introduced (see plan 006).
- Verification: `npm run test` and `npm run e2e` → all pass.

## Done criteria

- [ ] `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` all exit 0
- [ ] `npm run e2e` passes (drag-with-guides + source-mask-move tests included)
- [ ] A drag gesture produces exactly one undoable history entry
- [ ] `OperationOverlay` is wrapped in `React.memo` with stable callbacks
- [ ] `plans/README.md` status row updated

## STOP conditions

- A drag no longer produces exactly one undo step, or guides stop appearing.
- Memoization causes a stale overlay (selected/preview state not updating).
- The source-cover mask desyncs from the dragged replacement text.

## Maintenance notes

- If `PageRail` virtualization (deferred) is added later, re-check that the rail does
  not re-render all thumbnails on every drag commit.
- A reviewer should scrutinize undo granularity and that the ink-points translation
  added in the 2026-06-17 batch still applies on the single commit at pointer-up.
