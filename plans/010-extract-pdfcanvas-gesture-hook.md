# Plan 010: Extract the stage pointer-gesture state machine out of `PdfCanvas.tsx` into a dedicated hook

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If a STOP condition occurs, stop and report — do not improvise.
> When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat c6d360f..HEAD -- src/components/PdfCanvas.tsx`
> If the file changed since this plan was written — especially if plan 009
> has not yet landed — re-read the file in full and re-derive the line ranges
> below yourself before proceeding; on a mismatch, treat it as a STOP
> condition.
>
> **Recommended order**: land plan 009 first. It is not a hard dependency
> (the ranges below are keyed to function/handler names, not just line
> numbers), but doing 009 first means you're extracting from an ~875-line
> file instead of an ~1061-line one, and the two diffs won't conflict with
> each other in review.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MEDIUM-HIGH
- **Depends on**: 009 (recommended, not required)
- **Category**: tech-debt / architecture
- **Planned at**: commit `c6d360f`, 2026-07-01

## Why this matters

Even after plan 009 removes the 286 lines of pure text/canvas utilities,
`PdfCanvas.tsx` is still doing three unrelated jobs in one component:

1. Rendering the react-pdf `<Document>`/`<Page>` and the layered overlay stack
   (text-hit targets, alignment guides, draw marquee, source-cover rects,
   floating toolbar, resize handles, operation overlays, the image file input).
2. Owning a **pointer-gesture state machine** — draw-to-create, drag-to-move,
   resize-by-handle, and click-vs-drag disambiguation — spread across five
   stage event handlers (`onPointerDown`, `onClick`, `onPointerMove`,
   `onPointerUp`, `onPointerCancel`/`onLostPointerCapture`) plus an overlay
   `onPointerDown` and a `ResizeHandles.onResizeStart` callback.
3. A handful of side-effect hooks (delete-key handling, Escape-to-cancel-draw,
   hint-banner timing, font registration, replaced-text-layer suppression).

Job (2) is where every new tool's interaction quirk has landed as another
`if (activeTool === "...")` branch inside an already-dense handler (e.g. the
`onClick` handler at lines 705–731 branches on `select` / `image` /
`isRegionTool(activeTool)` / default; `onPointerUp` at 810–834 has a
tool-specific `text`-only click-to-edit branch bolted on). Every future tool
with a custom click/drag behavior will keep growing these same five handlers.
Extracting the gesture state machine into its own hook gives future tools a
single, reviewable place to add interaction behavior without touching the
render tree, and gets `PdfCanvas.tsx` itself down to essentially a layout/JSX
shell.

This directly continues `plans/README.md` **DEBT-05** ("split PdfCanvas god
file"), open since the 2026-06-15 audit.

## Current state

Re-read `src/components/PdfCanvas.tsx` in full immediately before starting —
if plan 009 has landed, add ~186 to every line number below to get back to
the pre-009 reference points, or better, just search for the named
functions/handlers instead of trusting absolute line numbers. As of this
writing (pre-plan-009, commit `c6d360f`):

- **Types & constants**: `DragState` (51–60), `ResizeState` (62–67),
  `MIN_RESIZE_PX`/`DRAW_CLICK_THRESHOLD_PX`/`DRAW_CLICK_FALLBACK` (69–73),
  `DrawState` (75–78), `marqueeRect` (80–87), `pointFromEvent` (119–125).
- **Component-local gesture state** (inside the `PdfCanvas` function body):
  `dragMoved` ref (443, with a detailed comment on why it exists at 436–442),
  `drag`/`resize`/`draw` state (444–446), `activeGuides` (448),
  `moveModeOperationId` (449).
- **Effects that belong to the gesture machine, not rendering**: Escape-to-cancel-draw
  (557–566, depends on `draw`/`setDraw`).
- **The five stage handlers**, all attached to the `.page-stage` div (679–848):
  `onPointerDown` (685–704), `onClick` (705–731), `onPointerMove` (732–809,
  the largest single block — draw-move, resize-move, and drag-move are three
  sequential `if` blocks in one function), `onPointerUp` (810–834),
  `onPointerCancel` (835–841) and `onLostPointerCapture` (842–848) — **these
  last two are byte-for-byte identical bodies**, a small duplication worth
  collapsing into one function reference while you're in there.
- **`ResizeHandles.onResizeStart`** callback (944–960, inline in JSX) — sets up
  `resize` state; logically part of the same state machine even though it's
  registered via a child component's prop rather than a stage handler.
- **The overlay `onPointerDown`** (974–999, inline in JSX) — starts a `drag`;
  also logically part of the same state machine.
- **Cross-cutting dependencies the hook must account for** (read these
  carefully — this is the hard part of the extraction):
  - `operations` (prop) — read live inside `onPointerMove` to look up the
    dragged operation (777) and inside the overlay pointer-down to compute
    alignment lines (988–996). The hook must always see the *current*
    `operations`, not a stale closure — pass it as a hook argument on every
    render (a plain function argument, not captured once), or accept it as a
    parameter to the returned handlers.
  - `stageRef` (prop, a `MutableRefObject`) — read via `.current` inside
    handlers; do not copy `.current` into the hook's own ref at init time,
    always dereference through the passed-in ref object.
  - `pageWidth`/`pageHeight`/`scale` — used throughout for viewport↔PDF
    coordinate conversion (`clampRect`, `pdfRectToViewport`,
    `viewportRectToPdf` from `../utils/coordinates`).
  - `activeTool` — read in `onPointerDown`/`onClick`/`onPointerUp` to decide
    behavior; changes independently of gesture state.
  - `editingTextId` — read in `canDragOperation` (97–100) and the
    click-to-edit branch in `onPointerUp` (825–828); the hook needs both the
    current value and a setter (`setEditingTextId` is currently local
    component state at line 451 — decide whether it moves into the hook or
    stays in the component and gets passed in/out; recommend keeping it in
    the component since text-editing is a rendering concern (`OperationOverlay`'s
    `editing` prop), and passing it into the hook as a value + setter pair,
    matching how `onOperationUpdate`/`onOperationSelect` are already passed
    in as props).
  - `onOperationAdd`, `onOperationUpdate`, `onOperationSelect` (props) — called
    from inside handlers (e.g. 770, 808, 818 via `addAt`).
  - `addAt` (defined at 585, depends on `activeTool`, `editableTextRuns`,
    `stageRef`, sampling functions, `createOperationsForTool`) — called from
    `onPointerUp`'s draw-completion branch (818) and the text-hit-layer
    buttons (886, which stay in the component/JSX, not the hook). Decide
    whether `addAt` moves into the hook (it's gesture-completion logic) or
    stays in the component and is passed into the hook as a callback —
    **recommend passing it in as a callback** since it also depends on
    `editableTextRuns`/style-sampling, which are rendering-adjacent, not
    gesture-state concerns.
  - The **ink drag special-case**: `onPointerMove`'s drag branch checks
    `dragged.type === "ink"` (799) and calls `translatePoints` (from
    `../editor/selectionModel`) to translate every ink point by the same
    delta the bounding rect moved. This must move into the hook unchanged.
  - `drag.alignmentLines` is computed **once**, at drag start (in the overlay
    `onPointerDown`, via `collectAlignmentLines`), specifically so
    `onPointerMove` does not recompute it every frame (see the comment at
    55–59 explaining this was a deliberate perf fix — do not regress it).
- **Full regression safety net**: `tests/pdfCanvas.test.tsx` (1,456 lines, 20
  `describe` blocks) already covers every gesture path you're moving,
  including describe blocks "empty-area click/pointer behaviour" (~236),
  "creating operations by clicking" (~275), "drag-to-draw region tools"
  (~575), "overlay pointer interactions (drag)" (~676), "resize interactions"
  (~887), "keyboard delete" (~936), "re-render resets" (~1049), "resizable
  image/signature handles" (~1061), "resizable type branches" (~1178). This
  suite is your primary correctness oracle for this plan — it should pass
  **unmodified** (only import paths may need to change, never assertions).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Unit tests | `bun run test` | all pass, same pass count as before |
| Build | `bun run build` | exit 0 |
| E2E | `bun run e2e` | all pass (gesture behavior is exactly what e2e covers) |
| Line count check | `wc -l src/components/PdfCanvas.tsx` | well under 700 |

## Scope

**In scope**
- New file `src/components/useStagePointerGestures.ts` (a hook, despite the
  `.ts` extension being fine since it returns objects/functions, not JSX —
  match whatever convention `useEditorController.ts` in `src/state/` uses for
  hook file naming/extension)
- `src/components/PdfCanvas.tsx` — replace the extracted state/handlers with
  a call to the new hook and wire its returned props/handlers onto the JSX
- No behavior change; this is a structural refactor. Do not "improve" any
  gesture behavior while moving it — file that as a separate finding if you
  notice one.

**Out of scope**
- The JSX layer composition (text-hit layer, guides layer, operation layer,
  image input) — leave it in `PdfCanvas.tsx` for this plan. A follow-up could
  extract it into a `CanvasOverlayStack` component, but don't do that here;
  keep this plan's diff reviewable as "gesture logic moved, rendering
  untouched."
- `addAt`, `addLinkForOperation`, `previewOperation` — these stay in
  `PdfCanvas.tsx` and are passed into the hook as callbacks where needed
  (see "Current state" above).
- Any change to `ResizeHandles.tsx`, `OperationOverlay.tsx`, or
  `../utils/coordinates.ts` — only their call sites move, not their contents.
- Fixing the pre-existing `onClick` if-chain that partially bypasses
  `TOOL_BY_ID[tool].placement` for point/file tools (a real but separate
  finding — leave a code comment noting it if useful, don't fix it here).

## Steps

### Step 1: Design the hook's interface first, in a comment, before writing code

In a scratch comment (can be the first draft of the new file), write out the
hook's signature: what it takes as arguments (props/refs it needs live
access to) and what it returns (state to render + event handler props to
spread onto the stage div + the resize-start callback + the overlay
pointer-down callback). Use the "Current state" dependency list above to
make this exhaustive. This is the step most likely to reveal a dependency you
missed — if you find one requiring the hook to reach back into something not
listed above, that's fine, just document it; if it requires restructuring
something outside `PdfCanvas.tsx`, STOP and report instead.

### Step 2: Create `useStagePointerGestures.ts` and move the state machine

Move (do not duplicate) into the new hook:
- `DragState`, `ResizeState`, `DrawState` types, the `MIN_RESIZE_PX`/
  `DRAW_CLICK_THRESHOLD_PX`/`DRAW_CLICK_FALLBACK` constants, `marqueeRect`,
  `pointFromEvent` (or `pointFromEvent` may live in `../utils/coordinates.ts`
  instead if that reads more naturally next to `clampRect`/`pdfRectToViewport`/
  `viewportRectToPdf` — your call, but pick one canonical home, don't leave a
  copy in both places).
- `dragMoved` ref, `drag`/`resize`/`draw`/`activeGuides` state.
- The Escape-to-cancel-draw effect.
- The five stage handlers (merge `onPointerCancel`/`onLostPointerCapture`
  into one function reference, since their bodies are identical).
- The `ResizeHandles.onResizeStart` callback body.
- The overlay pointer-down-to-start-drag callback body.

Return an object shaped like (adjust names to taste, but keep the shape
discoverable):
```ts
{
  draw, drag, resize, activeGuides,
  stagePointerHandlers: { onPointerDown, onClick, onPointerMove, onPointerUp, onPointerCancel, onLostPointerCapture },
  handleResizeStart: (handle, event) => void,
  handleOverlayPointerDown: (operation, event) => void,
}
```

### Step 3: Rewire `PdfCanvas.tsx` to consume the hook

- Call the hook near the top of the component body, passing in
  `activeTool`, `operations`, `stageRef`, `pageWidth`, `pageHeight`, `scale`,
  `editingTextId`/`setEditingTextId`, `onOperationAdd`, `onOperationUpdate`,
  `onOperationSelect`, `addAt` (or however Step 1's design landed).
- Spread `stagePointerHandlers` onto the `.page-stage` div in place of the
  five inline handlers.
- Replace the inline `ResizeHandles.onResizeStart` and overlay
  `onPointerDown` bodies with calls to `handleResizeStart`/`handleOverlayPointerDown`.
- Delete the now-unused local `drag`/`resize`/`draw`/`activeGuides`/`dragMoved`
  state from the component (they live in the hook now).

**Verify after this step**: `bun run typecheck` → exit 0. Type errors here
are your fastest signal for a missed wiring — resolve them before moving on.

### Step 4: Full verification pass

Run, in order: `bun run typecheck`, `bun run lint`, `bun run test`,
`bun run build`, `bun run e2e`. All must pass with **no assertion changes**
in `tests/pdfCanvas.test.tsx` — if a test needs a changed assertion (not just
an import path), that's evidence of an accidental behavior change; STOP and
investigate rather than adjusting the test.

Then run `wc -l src/components/PdfCanvas.tsx` and confirm it's well under 700
lines (down from ~875 post-plan-009, or ~1061 if 009 hasn't landed).

### Step 5: Manual UI smoke pass

Per the repo's `verify-ui-after-changes` rule, this is a "bigger" structural
change and needs a `control-ui` browser pass against the dev server
(`bun run dev`, `http://localhost:5173/pdf-editor`) even though the automated
suites above already cover behavior. Follow
`.claude/skills/control-ui/SKILL.md`. At minimum, exercise: drawing a shape
(drag-to-draw), dragging an existing overlay to move it, resizing an overlay
via a handle, clicking existing text to edit it, and undo/redo after each.

## Test plan

- No new tests should be needed if the extraction is behavior-preserving —
  `tests/pdfCanvas.test.tsx` is the oracle (see "Current state").
- If `tests/pdfCanvas.test.tsx` currently imports internals that no longer
  exist on `PdfCanvas.tsx` (unlikely, since it renders the component and
  drives it via simulated events, not direct function calls) — check first;
  if so, update only the import, not the assertions.
- Optional, not required: add a small dedicated unit test file for the new
  hook using `@testing-library/react`'s `renderHook`, covering the
  click-vs-drag disambiguation (`dragMoved`) and the ink-drag point
  translation, if you want a faster-running unit-level oracle than the full
  component test suite for future changes to just the gesture logic.

## Done criteria

- [ ] `src/components/useStagePointerGestures.ts` exists and owns all gesture state/handlers listed in "Current state"
- [ ] `src/components/PdfCanvas.tsx` no longer defines `DragState`/`ResizeState`/`DrawState`, the five stage handlers, or the resize/overlay pointer-down callback bodies — it calls the hook and wires its outputs onto JSX
- [ ] `wc -l src/components/PdfCanvas.tsx` reports well under 700 lines
- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build`, `bun run e2e` all exit 0
- [ ] `tests/pdfCanvas.test.tsx` passes with no assertion changes (import-path-only changes are fine)
- [ ] Manual control-ui pass confirms draw/drag/resize/text-edit/undo-redo all still work
- [ ] `plans/README.md` status row for 010 updated

## STOP conditions

- The `dragMoved` ref, `drag.alignmentLines`-computed-once-at-start
  invariant, or the ink-point-translation special case turn out to need
  behavior changes (not just relocation) to work inside a hook — stop and
  report the specific conflict rather than changing behavior to make the
  extraction easier.
- Any `tests/pdfCanvas.test.tsx` assertion needs to change (not just an
  import path) — stop and report which one and why, rather than editing the
  test.
- The hook ends up needing to import something from `PdfCanvas.tsx` back
  (a circular dependency) — stop and report; it means a dependency was
  mis-assigned to the wrong side of the split.

## Maintenance notes

- After this lands, any future tool that needs custom click/drag/resize
  behavior has one file to extend (`useStagePointerGestures.ts`) instead of
  five scattered handler bodies inside a 1000+-line component.
- This plan intentionally leaves the JSX overlay-stack composition (text-hit
  layer, guides layer, operation layer) inside `PdfCanvas.tsx`. If a later
  audit still finds the file too large after this lands, that JSX block
  (roughly 145 lines: lines 865–1047 in the pre-plan-009/010 numbering) is
  the next extraction candidate, as a `CanvasOverlayStack` component — but
  don't preemptively do that here.
- Consider revisiting the `onClick` handler's tool-branching (currently
  `select` / `image` / `isRegionTool` / default) once this hook exists — it's
  a good candidate to route through `TOOL_BY_ID[tool].placement` instead of
  hardcoded tool-id checks, matching how region tools already dispatch. Not
  in scope here; note it as a follow-up if you notice it while extracting.
