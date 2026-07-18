# Plan 022: Evict embedded FontFaces when a document is closed or swapped

> **Executor instructions**: Follow step by step; run every verification
> command. On any STOP condition, stop and report. Update the status row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat <planned-at SHA>..HEAD -- src/engine/fontRegistry.ts src/state/useEditorController.ts src/components/PdfCanvas.tsx`
> On mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: interacts with plan 019 (see notes)
- **Category**: bug (memory leak)
- **Planned at**: commit `41f0dd9`, 2026-07-18

## Why this matters

`src/engine/fontRegistry.ts` keeps module-level `registered`/`loadPromises`
maps and calls `document.fonts.add(...)` with no eviction API anywhere.
Worse, pdf.js font ids are `${docId}_${fontID}` with a fresh `docId` per
`getDocument()` call, so every full re-extraction (open, restore, page ops)
mints new keys for the same fonts. In a long-lived SPA tab that opens several
documents (or does several page operations), `FontFace` objects accumulate
unboundedly.

## Design

1. Key registry entries by a stable document identity:
   `${documentFingerprint}:${fontKey}` — the fingerprint is available wherever
   `registerEmbeddedFont` is called (thread it through `PdfCanvas`'s
   font-registration effect from `document.fingerprint`).
2. Export `releaseFontsForDocument(fingerprint: string)` that
   `document.fonts.delete(...)`s and removes map entries for that prefix.
3. Call it from `useEditorController`: in `returnHome` and at the top of
   `openFile`/`openBlank`/`loadSavedSession` for the *previous* fingerprint
   (skip when the fingerprint is unchanged — page ops keep theirs, which is
   what makes this safe after wave-2's stable-fingerprint fix).

## Steps

1. Registry: add fingerprint-prefixed keys + `releaseFontsForDocument`.
   **Verify**: extend `tests/fontRegistry.test.ts` — register two docs' fonts,
   release one, assert `document.fonts.delete` called only for its faces.
2. Thread the fingerprint through `PdfCanvas`'s registration effect.
   **Verify**: `tests/pdfCanvas.test.tsx` font tests still pass.
3. Wire the release calls in the controller (previous-fingerprint tracking via a ref).
   **Verify**: new controller test — open doc A, open doc B, assert release was called with A's fingerprint.
4. Full gate: `bun run typecheck && bun run lint && bun run test:coverage && bun run e2e`.

## Done criteria

- [ ] Opening a second document releases the first document's FontFaces (test)
- [ ] Page ops do NOT release the current document's fonts (test)
- [ ] Full gate green; `plans/README.md` row updated

## STOP conditions

- The overlay still needs a released font (visible flicker in the e2e text
  test) — the release timing is wrong; report rather than debouncing blindly.
- jsdom's `document.fonts` polyfill (tests/setup.ts) can't express delete —
  check setup first; extend the polyfill if needed, don't skip the tests.
