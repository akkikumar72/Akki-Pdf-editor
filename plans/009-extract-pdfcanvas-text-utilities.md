# Plan 009: Extract pure text-style-sampling and text-run-grouping utilities out of `PdfCanvas.tsx`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If a STOP condition occurs, stop and report — do not improvise.
> When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat c6d360f..HEAD -- src/components/PdfCanvas.tsx`
> If the file changed since this plan was written, re-read it in full and
> compare against the line ranges cited below before proceeding; on a
> mismatch, treat it as a STOP condition and re-derive the ranges yourself.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (do this before plan 010, which depends on the resulting file shape)
- **Category**: tech-debt / architecture
- **Planned at**: commit `c6d360f`, 2026-07-01

## Why this matters

`src/components/PdfCanvas.tsx` is **1,061 lines** — it just crossed the
project's 1,000-line-per-file threshold (a presumptive code-quality blocker;
see `plans/README.md` DEBT-05, open since the 2026-06-15 audit). Two large,
fully self-contained blocks of **pure, React-free utility functions** account
for 286 of those lines and have nothing to do with rendering or gesture
handling:

1. Canvas-pixel color/weight sampling (used to infer style when adding a new
   text box near existing PDF text).
2. PDF.js `TextItem` clustering into editable "runs" (grouping individual
   glyph-runs into clickable, replaceable text blocks).

Neither block touches component state, refs, or JSX. Moving them out is a
zero-risk, high-value first step: it gets the file under 900 lines immediately
and makes the *next* (harder) extraction — the pointer-gesture state machine,
covered by plan 010 — easier to review in isolation.

## Current state

Read `src/components/PdfCanvas.tsx` in full before starting. As of this
writing:

- **Lines 127–290** (`toHex` through `sampleTextFontWeight`): canvas-pixel
  sampling. Depends only on the DOM `HTMLCanvasElement`/`CanvasRenderingContext2D`
  APIs and the `ViewportRect` type from `../types/editor`. No other function in
  the file calls into this block except `addAt` (line 585, via
  `sampleTextBackgroundColor`/`sampleTextColor`/`sampleTextFontWeight`, called
  at lines 597, 600, 603).
- **Lines 292–413** (`isGenericCssFontFamily` through
  `findNearbyTextRunForStyle`): PDF text-run grouping. Depends on the
  `TextItem` type and `pdfRectToViewport` from `../utils/coordinates` (already
  imported at line 21). Called from two places only: the `editableTextRuns`
  `useMemo` at line 458 (`groupEditableTextRuns(textItems)`) and `addAt` at
  line 589 (`findNearbyTextRunForStyle(...)`).
- Both blocks are **already covered by dedicated unit test suites** that
  import `PdfCanvas` and exercise these functions indirectly through
  component behavior: `tests/pdfCanvas.test.tsx` describe blocks "text style
  inheritance + grouping" (~line 1081), "resizable type branches" (~1178),
  "text run grouping coverage" (~1192), and "sampled font weight thresholds"
  (~1273).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run lint` | exit 0 |
| Unit tests | `bun run test` | all pass, same test count as before |
| Build | `bun run build` | exit 0 |
| Line count check | `wc -l src/components/PdfCanvas.tsx` | < 900 |

## Scope

**In scope**
- New file `src/utils/canvasTextStyleSampling.ts`
- New file `src/utils/textRunGrouping.ts`
- `src/components/PdfCanvas.tsx` — remove the moved functions, add imports
- No behavior change anywhere; this is a pure code-motion refactor

**Out of scope**
- The pointer-gesture handlers (`onPointerDown`/`onPointerMove`/`onPointerUp`/etc.),
  the overlay/layer JSX, or any other part of `PdfCanvas.tsx` — that is plan 010
- Renaming or changing the signature of any moved function
- Touching `tests/pdfCanvas.test.tsx` (it should keep passing unmodified,
  proving the extraction is behavior-preserving)

## Steps

### Step 1: Create `src/utils/canvasTextStyleSampling.ts`

Move these functions, in order, verbatim (including their `/* v8 ignore next */`
comments) out of `PdfCanvas.tsx` lines 127–290 into the new file:

- `toHex`, `rgbToHex`
- the `CanvasSample` type
- `hexToRgb`, `colorDistance`
- `getCanvasSample`
- `sampleTextBackgroundColor`
- `sampleTextColor`
- `sampleTextFontWeight`

Export every function that `PdfCanvas.tsx` will still call:
`sampleTextBackgroundColor`, `sampleTextColor`, `sampleTextFontWeight`. You may
keep `toHex`, `rgbToHex`, `hexToRgb`, `colorDistance`, `getCanvasSample`,
`CanvasSample` module-private (not exported) since only the three sampling
functions are used outside this block — but check `tests/` first (see Step 3)
in case a test imports one of the smaller helpers directly, and export it if so.

Add the necessary import at the top of the new file:
```ts
import type { ViewportRect } from "../types/editor";
```

### Step 2: Create `src/utils/textRunGrouping.ts`

Move these functions, in order, verbatim out of `PdfCanvas.tsx` lines 292–413
into the new file:

- `isGenericCssFontFamily`, `isInternalPdfFontName`
- `sameTextLine`, `styleSpecificityScore`, `chooseRunStyleItem`
- `mergeTextRun`
- `groupEditableTextRuns`
- `findNearbyTextRunForStyle`

Export `groupEditableTextRuns` and `findNearbyTextRunForStyle` (the two
call sites in `PdfCanvas.tsx`). Add the necessary imports:
```ts
import type { TextItem, ViewportRect } from "../types/editor";
import { pdfRectToViewport } from "./coordinates";
```

### Step 3: Check for direct test imports of the moved functions

Run: `grep -rn "from \"../src/components/PdfCanvas\"" tests/ ; grep -rn "PdfCanvas" tests/*.test.ts` —
none of the current tests should import individual functions from
`PdfCanvas.tsx` (they exercise it only through rendered component behavior),
but confirm this before proceeding. If a test does import one of the moved
functions directly, update that test's import path to the new module instead
of re-exporting from `PdfCanvas.tsx`.

### Step 4: Update `PdfCanvas.tsx`

- Delete the moved code (lines 127–413 in the original numbering — re-verify
  the exact range against the file as it exists right now, since Step 1/2
  don't change line numbers until this step).
- Add two new imports near the top, alongside the existing `../utils/...`
  imports (e.g. near line 21-26):
  ```ts
  import { sampleTextBackgroundColor, sampleTextColor, sampleTextFontWeight } from "../utils/canvasTextStyleSampling";
  import { findNearbyTextRunForStyle, groupEditableTextRuns } from "../utils/textRunGrouping";
  ```
- Everything else in the file (the `addAt` function, the `editableTextRuns`
  `useMemo`, all JSX) stays exactly as-is — the call sites don't change,
  only where the callees are defined.

**Verify**: `bun run typecheck` → exit 0 (this will catch any missed import
or type mismatch immediately).

### Step 5: Full verification pass

Run, in order: `bun run typecheck`, `bun run lint`, `bun run test`,
`bun run build`. All must exit 0, and the unit test count/pass count must be
identical to a run against the pre-change code (this is a pure move, so no
test should need to change — if one does, that's a signal the move wasn't
behavior-preserving; STOP and investigate rather than editing the test to
match).

Then run `wc -l src/components/PdfCanvas.tsx` and confirm it dropped by
roughly 286 lines (to well under 900).

## Test plan

- No new tests are needed — this is a pure extraction and the existing
  `tests/pdfCanvas.test.tsx` suite already exercises every moved function
  indirectly (see "Current state" above).
- Optional, not required: if you want direct unit coverage of the two new
  modules in isolation (recommended for future maintainability but not a
  blocker for this plan), add `tests/canvasTextStyleSampling.test.ts` and
  `tests/textRunGrouping.test.ts` following the style of existing small-utility
  test files like `tests/textMetrics.test.ts` or `tests/coordinates.test.ts`.
  If you add these, they are additive — do not remove or weaken the existing
  `pdfCanvas.test.tsx` coverage.

## Done criteria

- [ ] `src/utils/canvasTextStyleSampling.ts` and `src/utils/textRunGrouping.ts` exist and export the functions listed above
- [ ] `src/components/PdfCanvas.tsx` no longer defines any of the moved functions, only imports and calls them
- [ ] `wc -l src/components/PdfCanvas.tsx` reports under 900 lines
- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` all exit 0
- [ ] `tests/pdfCanvas.test.tsx` passes unmodified (or only its import paths changed, if Step 3 found a direct import)
- [ ] `plans/README.md` status row for 009 updated

## STOP conditions

- Any moved function turns out to reference component state, a ref, or a
  prop closure that you didn't expect from reading "Current state" above —
  stop and report the actual dependency rather than threading extra
  parameters through to force the extraction.
- A test fails after the move and the fix isn't "update an import path" —
  stop and report; do not change test expectations to match new behavior.

## Maintenance notes

- This plan is a prerequisite for plan 010 (extracting the pointer-gesture
  state machine and overlay-layer JSX), which targets the remainder of
  `PdfCanvas.tsx` after this extraction lands.
- Once both `canvasTextStyleSampling.ts` and `textRunGrouping.ts` exist,
  `plans/README.md` DEBT-02/DEBT-03 (dedupe `hexToRgb`/color helpers scattered
  elsewhere in the codebase, e.g. `pdfEngine.ts`) becomes easier: those
  helpers now have one canonical home to consolidate around instead of a
  copy embedded in a 1000-line component.
