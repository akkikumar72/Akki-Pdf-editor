# Plan 013: Documenso-grade signature draw pad (perfect-freehand ink)

> Written as a record of shipped work (branch
> `claude/signature-section-feature-5u7tg8`), not a pre-work executor plan —
> the implementation and this document landed together.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (isolated to the signature studio; placement/writer paths unchanged)
- **Depends on**: none (builds on the 012 signature studio)
- **Category**: product parity / feature quality
- **Status**: DONE

## Why this matters

The 012 signature studio's Draw tab was a naive sketch pad: fixed-width
`lineTo` segments with no smoothing, no pressure, no undo, a 1x backing store
(blurry on retina displays), and a save path that exported the entire 440x160
canvas — so a small signature drawn in one corner carried huge transparent
margins into its placement box and rendered tiny/off-center on the page.

[Documenso](https://github.com/documenso/documenso)'s signature pad is the
reference implementation of doing this well in the browser: it models strokes
as point data and renders them through
[`perfect-freehand`](https://github.com/steveruizok/perfect-freehand)
(velocity/pressure-thinned variable-width outlines), which is what makes the
ink look like a real pen line and makes stroke-level editing possible.

## What shipped

- **`perfect-freehand` dependency** — the same library Documenso uses.
- **`src/utils/signatureInk.ts`** (new, pure, fully unit-tested):
  - `strokeOutline` — expands input samples into a closed variable-width
    outline (velocity-simulated pressure for mouse/touch, real pressure for
    pens via `pointerType`/`event.pressure`).
  - `fillOutline`/`renderInk` — midpoint-quadratic canvas tracing of the
    outline polygons (the canonical perfect-freehand rendering technique),
    against a minimal `InkPathContext` so tests need no real canvas.
  - `inkBounds` — ink extent measured on outlines (includes stroke width).
  - `exportInkPng` — transparent PNG cropped to the ink bounds plus a 12px
    margin, rendered at 2x for crispness. Keeps the existing security
    invariant: output is validated as `data:image/png` before use.
- **`SignatureModal` Draw tab rewritten around a stroke model**
  (`InkStroke[]` state instead of immediate-mode canvas paint):
  - strokes are data → **Undo** (per stroke) joins Clear; ink color is
    captured per stroke, so recoloring mid-signature keeps earlier ink;
  - the backing store is scaled by `devicePixelRatio` (stroke math stays in
    the logical 440x160 space; CSS pins the display box via `aspect-ratio`);
  - Save exports through `exportInkPng`, so the persisted/placed signature is
    tight around the ink instead of the whole pad.
- **Reuse flow unchanged by design**: saved signatures still persist locally
  in the IndexedDB `signatures` store (`src/utils/storage.ts`) with the
  "Save signature for reuse" checkbox, and the one-click `SignaturePicker`
  still offers them on the next placement — that already matched Documenso's
  "save it and reuse it later" behavior, now the saved artifact is a clean
  trimmed PNG.

## Verification

`bun run typecheck`, `bun run lint`, `bun run test:coverage` (858 tests,
100% statements/branches/functions/lines), `bun run build` — all green.
New/updated suites: `tests/signatureInk.test.ts` (pure ink module),
`tests/signatureModal.test.tsx` (stroke capture, undo/clear, DPR scaling,
pen pressure branch, capture-failure notices).
