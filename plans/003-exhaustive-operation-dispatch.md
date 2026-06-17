# Plan 003: Enforce exhaustive operation dispatch in the PDF writer and overlay renderer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 8c2aec8..HEAD -- src/engine/pdfEngine.ts src/components/OperationOverlay.tsx src/types/editor.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/002-pdf-operation-writers.md (recommended to land first; not strictly required)
- **Category**: tech-debt / bug-prevention
- **Planned at**: commit `8c2aec8`, 2026-06-17

## Why this matters

`AGENTS.md` states the operation set (`EditOperation` union in `src/types/editor.ts`)
is dispatched "in lockstep" across the factory, overlay renderer, PDF writer, and
inspector — adding an operation type means touching all four. Today only the
`editReducer` enforces this with a `never` exhaustiveness check. The PDF writer
(`savePdf`) and the on-screen overlay renderer (`OperationOverlay`) dispatch on
`operation.type` with flat `if` chains and a silent fallback. A new drawable
operation that forgets the `savePdf` branch renders on screen and in PNG export
but **silently vanishes from the exported PDF**, with no compile error. This plan
makes the compiler enforce the invariant.

## Current state

- `src/engine/pdfEngine.ts:353-685` — `savePdf` iterates operations and dispatches
  via a sequence of independent `if (operation.type === ...)` blocks. There is no
  `default`/`never` guard; an unmatched type is skipped silently. Note that a
  `text` operation with `whiteout: true` deliberately runs **two** blocks (the
  whiteout-mask block at `:359` and the text block at `:373`), so any switch
  refactor must keep drawing the mask before the text for `text` ops.
- `src/components/OperationOverlay.tsx:85-256` — same flat-`if` pattern, ending in
  a generic fallback `return <div>` (`:251-255`) that swallows unhandled types.
- `src/types/editor.ts:149-161` — the `EditOperation` union (12 members).
- `src/state/editModel.ts:154-158` — the exemplar exhaustiveness pattern to follow:
  ```ts
  default: {
    const exhaustive: never = action;
    void exhaustive;
    return state;
  }
  ```
- `table-region` is intentionally **not drawn** in `savePdf` and renders only a
  label overlay; the exhaustive handling must include an explicit, no-op branch
  for it (a comment explaining it is a non-exported region marker), not a fall-through.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `npm run typecheck` | exit 0, no errors |
| Lint | `npm run lint` | exit 0 |
| Unit tests | `npm run test` | all pass |
| Build | `npm run build` | exit 0 |
| Browser tests | `npm run e2e` | all pass (needs Chromium) |

## Scope

**In scope**
- `src/engine/pdfEngine.ts` (the `savePdf` operation loop only)
- `src/components/OperationOverlay.tsx` (the render dispatch only)

**Out of scope**
- Changing the `EditOperation` union shape in `src/types/editor.ts`
- Changing exported PDF bytes for any existing operation type (draw order, colors,
  positions must be byte-equivalent for current types)
- The `savePdf` font/embedding helpers above the operation loop

## Steps

### Step 1: Convert the `OperationOverlay` dispatch to an exhaustive switch

Refactor the flat `if` chain into `switch (operation.type)` with one `case` per
union member and a `default` that does `const _exhaustive: never = operation`.
Preserve every existing rendered output exactly (the combined
`whiteout || annotation+highlight` branch can stay a small helper or be split into
the `whiteout` and `annotation` cases). Keep `safeImageSrc` gating unchanged.

**Verify**: `npm run typecheck` → exit 0; `npm run test` → all pass.

### Step 2: Convert the `savePdf` operation loop to an exhaustive switch

Refactor the per-operation `if` blocks into `switch (operation.type)`. For the
`text` case, draw the whiteout mask (anchored to `sourceCoverRect ?? rect`) before
the text, replicating the current behavior. Add an explicit no-op `table-region`
case with a comment. End with a `never` default.

**Verify**: `npm run test` → all pass (including `tests/pdfEngineSave.test.ts`);
`npm run build` → exit 0.

### Step 3: Prove the guard works, then revert the probe

Temporarily add a 13th member to the `EditOperation` union locally and confirm BOTH
`npm run typecheck` fails at the `savePdf` and `OperationOverlay` defaults. Then
remove the probe. (Do not commit the probe.)

**Verify**: with probe present `npm run typecheck` → fails at both files; after
removing it → exit 0.

## Test plan

- No new test files strictly required; rely on `tests/pdfEngineSave.test.ts` plus
  the manual probe in Step 3 to confirm exhaustiveness.
- Optionally extend `tests/pdfEngineSave.test.ts` with one case per remaining
  drawable type (see plan 006) to lock draw output.
- Verification: `npm run test` → all pass.

## Done criteria

- [ ] `npm run typecheck` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm run test` exits 0
- [ ] `npm run build` exits 0
- [ ] Both `savePdf` and `OperationOverlay` use `switch` with a `never` default
- [ ] Adding a union member causes a typecheck failure at both sites (verified in Step 3)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Converting `savePdf` changes exported bytes for an existing type (draw order
  regression) — e.g. the whiteout mask stops preceding text for replacement ops.
- A refactor would require changing the `EditOperation` union or any factory/inspector code.
- Typecheck/test fails twice after a reasonable fix attempt.

## Maintenance notes

- This is the compiler-enforced backstop for the AGENTS.md "lockstep" invariant.
  After this lands, adding an operation type will fail typecheck until the writer
  and overlay both handle it — which is the desired behavior.
- A reviewer should confirm the exported PDF is unchanged for existing types
  (draw order for `text + whiteout` is the main risk).
