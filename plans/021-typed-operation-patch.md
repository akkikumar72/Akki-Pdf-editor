# Plan 021: Replace the 33 `as Partial<EditOperation>` casts with a distributive patch type

> **Executor instructions**: Follow step by step; run every verification
> command. On any STOP condition, stop and report. Update the status row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat <planned-at SHA>..HEAD -- src/types/editor.ts src/state/editModel.ts src/components/Inspector.tsx src/components/FloatingOperationToolbar.tsx src/components/PdfCanvas.tsx src/components/useStagePointerGestures.ts`
> On mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW-MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `41f0dd9`, 2026-07-18

## Why this matters

`EditAction`'s `update` variant takes `patch: Partial<EditOperation>`.
Because `EditOperation` is a discriminated union, `Partial<EditOperation>`
only admits fields common to all 11 variants, so every variant-specific patch
(`text`, `stroke`, `mark`, `target`, `label`, …) needs `as Partial<EditOperation>`
— 33 casts across `Inspector.tsx` (25), `FloatingOperationToolbar.tsx` (5),
`PdfCanvas.tsx` (2), `useStagePointerGestures.ts` (1). The casts compile away
real mistakes: `onUpdate(inkOpId, { text: "x" })` type-checks today.

## Design

Add next to the union in `src/types/editor.ts`:

```ts
/** A patch valid for at least one operation variant — no casts at call sites. */
export type EditOperationPatch = {
  [K in EditOperation["type"]]: Partial<Extract<EditOperation, { type: K }>>;
}[EditOperation["type"]];
```

Change `EditAction`'s `update.patch`, `editReducer`'s spread site
(`editModel.ts` — the runtime spread/merge stays identical), and the
`onUpdate`/`updateOperation` signatures to `EditOperationPatch`. Then delete
the casts file by file; the compiler now rejects genuinely-invalid patches.

## Steps

1. Add `EditOperationPatch`; switch `EditAction`/reducer/`updateOperation`.
   **Verify**: `bun run typecheck` (expect call-site errors listing every cast to remove).
2. Remove casts in `Inspector.tsx`, then `FloatingOperationToolbar.tsx`, then
   `PdfCanvas.tsx` + `useStagePointerGestures.ts`.
   **Verify** after each file: `bun run typecheck` → exit 0.
3. `grep -rn "as Partial<EditOperation>" src/` → 0 matches.
4. Full gate: `bun run typecheck && bun run lint && bun run test:coverage && bun run e2e`.

## Done criteria

- [ ] Zero `as Partial<EditOperation>` in `src/`
- [ ] A deliberate wrong-variant patch (e.g. `{ text: "x" }` aimed at an ink op) fails typecheck — verify manually, do not commit it
- [ ] Full gate green
- [ ] `plans/README.md` row updated

## STOP conditions

- The distributive type makes a *legitimate* cross-variant patch impossible
  (e.g. the shared `rect`/`opacity` patches from gestures) — report the exact
  signature conflict rather than widening back to `Partial<EditOperation>`.
- Tests exercise `update` with mixed-variant patches that were previously
  silently ignored — flag them; they're latent bugs, not test fixtures to keep.
