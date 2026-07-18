# Plan 023 (spike): Keyboard path for placing new overlays

> **Executor instructions**: Design/spike — deliverable is a working prototype
> for ONE tool (text) plus a written recommendation appended under
> "## Findings", not a full rollout. Update `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat <planned-at SHA>..HEAD -- src/components/PdfCanvas.tsx src/components/useStagePointerGestures.ts`
> On mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: L (full), M (this spike)
- **Risk**: MED
- **Depends on**: none
- **Category**: accessibility
- **Planned at**: commit `41f0dd9`, 2026-07-18

## Why this matters

Every path that creates a new overlay is pointer-only: the stage div has
`onClick`/pointer gestures and no `tabIndex`/`onKeyDown`
(`PdfCanvas.tsx` stage element), and drag-to-draw lives entirely in
`useStagePointerGestures`. Tool switching and editing existing overlays are
keyboard-operable (ribbon buttons, floating toolbar, `text-hit` buttons), but
a keyboard-only user cannot originate a text box, shape, whiteout, or link —
a full-workflow blocker for the core loop, and the largest accessibility gap
found in the deep audit.

## Spike scope

1. Make the stage focusable (`tabIndex=0`, visible focus outline via tokens)
   with an aria-label describing the interaction.
2. With the Text tool armed and stage focused: Enter places a text box at the
   page center (reusing `createOperationsForTool` with a synthetic viewport
   rect); arrow keys nudge the pending position before Enter confirms; Escape
   cancels. Reuse the existing `CanvasHintBanner` to announce the mode.
3. Write up: how the pattern generalizes to region tools (arrow-key rect
   sizing vs. fixed default sizes), what `aria-live` feedback is needed, and
   whether the gesture hook or a sibling keyboard hook should own it.

## Verification

- Unit test: focused stage + Enter with text tool → `onOperationAdd` called
  with a centered rect; Escape → no op added.
- `bun run typecheck && bun run lint && bun run test:coverage` green.
- Manual: Tab from the ribbon reaches the stage; no keyboard trap.

## STOP conditions

- Stage focus steals arrow-key scrolling in a way that breaks existing
  scroll/zoom UX — report with the observed behavior and options.
- The synthetic-rect path through `createOperationsForTool` needs style
  sampling that requires a real pointer position (check
  `sampledBackgroundColor` handling) — if so, document the degraded default.
