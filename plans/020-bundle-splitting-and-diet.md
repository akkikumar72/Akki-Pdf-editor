# Plan 020: Split the bundle so the landing page stops paying for the editor

> **Executor instructions**: Follow step by step; run every verification
> command. On any STOP condition, stop and report. Update the status row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat <planned-at SHA>..HEAD -- src/App.tsx src/components/FloatingOperationToolbar.tsx src/styles/tokens.css vite.config.ts vercel.json`
> On mismatch with the excerpts below, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `41f0dd9`, 2026-07-18

## Why this matters

Measured on the wave-1 build: one 1,948 kB (760 kB gzip) JS chunk serves both
routes — the landing page ("drop a PDF here") downloads and parses pdf-lib
(758 kB source), fontkit (1,087 kB), main-thread pdfjs (614 kB), and
react-select + emotion + floating-ui (246 kB) before it can render anything.
There is no `React.lazy` anywhere in `src/`. Separately, `tokens.css` line 4
`@import`s 10 Google-Fonts handwriting families on every route that only the
signature feature uses (render-blocking CSS chain).

## Steps

### Step 1: Lazy editor route
`React.lazy(() => import("./routes/EditorRoute"))` + `<Suspense>` fallback in
`src/App.tsx`. `pdfjs.GlobalWorkerOptions.workerSrc` stays at App module scope
(it must run before the editor chunk loads — verify it still does).
**Verify**: `bun run build` → at least 2 route chunks; the chunk reachable
from `/` must not contain `pdf-lib` (check with `grep -l "PDFDocument" dist/assets/*.js`).

### Step 2: Signature fonts on demand
Move the handwriting-fonts `@import` (tokens.css:4) into a lazily-injected
`<link rel="stylesheet">`. CRITICAL: typed-signature overlays on the canvas
render with these fonts too, so the injector must be a shared
`ensureSignatureFontsLoaded()` called from BOTH `SignatureModal` mount AND the
`OperationOverlay` signature branch (mode "typed"). Session restore with an
existing typed signature is the regression to test.
**Verify**: unit test asserting the link is injected once; e2e signature flow
still renders the cursive preview.

### Step 3 (optional, measure first): font picker diet
Dynamic-import `react-select` when the font dropdown first opens, or replace
with a small listbox reusing `fontSearchScore`. Only do this if step 1's
numbers still show it in the landing chunk.
**Verify**: `bun run build` before/after byte diff recorded in this file.

### Step 4: Full gate + UI pass
**Verify**: `bun run typecheck && bun run lint && bun run test:coverage && bun run e2e`;
manual/browser check that landing → import → editor works with the split chunks
and the CSP (`script-src 'self'`) still loads them.

## Done criteria

- [ ] Landing-page-reachable JS < 250 kB gzip (record the measured number here)
- [ ] Typed signatures render in cursive after a session restore (test or e2e)
- [ ] Full gate green
- [ ] `plans/README.md` row updated

## STOP conditions

- The pdf.js worker fails to boot from the lazy chunk (workerSrc ordering) —
  report rather than moving worker setup into the lazy module blindly.
- CSP blocks the dynamically injected fonts stylesheet (style-src allows
  https://fonts.googleapis.com — should be fine; verify, don't assume).
