# Plan 011: Retire the unreachable `form-field` `kind: "checkbox"` code path

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If a STOP condition occurs, stop and report — do not improvise.
> When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat c6d360f..HEAD -- src/types/editor.ts src/engine/pdfEngine.ts src/styles/app.css tests/pdfEngineSave.test.ts tests/operationOverlay.test.tsx`
> If any in-scope file changed since this plan was written, re-read it before
> proceeding; on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (dead code / parallel representations)
- **Planned at**: commit `c6d360f`, 2026-07-01

## Why this matters

Commit `d0384b1` ("replace the checkbox tool with a click-to-fill check
mark") retired the old checkbox-placement tool in favor of `mark-check`
(which creates a `form-mark`/`mark: "check"` operation, a different, newer
union member). That migration was done cleanly at the tool-registry and
factory level — but it left the **old representation fully wired and now
unreachable**: `FormFieldKind` still includes `"checkbox"`, `pdfEngine.ts`
still has a dedicated writer branch for it, and `app.css` still styles it.
Nothing in the UI can create a `form-field` operation with `kind: "checkbox"`
any more (confirmed: no entry in `TOOL_BY_ID`/`TOOL_GROUPS` in
`src/editor/toolRegistry.ts` maps to it, and `src/editor/operationFactory.ts`
has no branch producing it).

This is exactly the kind of debt the "delete a whole layer instead of
polishing it" principle targets: two parallel representations exist for the
same concept (a checkable form mark) — the new `form-mark` type is the one
actually in use, and the old `form-field`/`checkbox` combination is dead
weight that only exists in types, a writer branch, CSS, and two tests. There
is no live create path to preserve, so this is a straightforward deletion,
not a migration.

**Note on backward compatibility**: this app is local-first with no server
persistence (see `AGENTS.md`) — documents live in the browser and are
reconstructed from source PDF bytes + operations on each load
(`src/utils/storage.ts`). If any user has a browser session that was
autosaved *before* commit `d0384b1` landed and still contains a persisted
`form-field`/`kind: "checkbox"` operation, removing the writer branch means
that operation will fall through to the generic overlay fallback (a plain
unstyled box, `OperationOverlay.tsx`'s final `return` at the bottom of the
function) instead of rendering as a checkbox, and will fall through to
`pdfEngine.ts`'s `form-field` branch without the inner checkbox-box drawing
on export (it will still render as a plain field rectangle, not crash). This
is a graceful degradation, not a crash, and the window for an affected
session is narrow (one session, created in the few days around the tool
swap). Proceed with the removal; do not build a migration path for this.

## Current state

- `src/types/editor.ts:29` —
  ```ts
  export type FormFieldKind = "text" | "multiline" | "dropdown" | "radio" | "checkbox" | "signature";
  ```
- `src/editor/toolRegistry.ts` — no tool maps to `FormFieldKind: "checkbox"`;
  the `forms` group's tools are `form-text` → `text`, `form-multiline` →
  `multiline`, `form-dropdown` → `dropdown`, `form-radio` → `radio`,
  `form-signature` → `signature`, plus the unrelated `mark-check` tool
  (produces a `form-mark` operation, not a `form-field`). Confirm this with
  `grep -n "checkbox" src/editor/operationFactory.ts src/editor/toolRegistry.ts`
  — expect zero matches for a live create path.
- `src/engine/pdfEngine.ts:593–627` — the `form-field` writer branch. Inside
  it, lines 606–615 are the dead sub-branch:
  ```ts
  if (operation.kind === "checkbox") {
    const boxSize = Math.min(rect.width, rect.height) * 0.58;
    const boxRect = {
      x: rect.x + 5,
      y: rect.y + (rect.height - boxSize) / 2,
      width: boxSize,
      height: boxSize,
    };
    page.drawRectangle({ ...boxRect, borderColor: hexToRgb("#475569"), borderWidth: 1 });
    if (operation.checked) drawCheckMark(page, boxRect, "#111827", opacity, 1.4);
  } else if (operation.kind === "radio") {
    // ... (this branch and everything after it is unrelated and stays)
  ```
  Note: `drawCheckMark` (defined at `pdfEngine.ts:134`) is also called from
  the live `form-mark` branch (line 565) — do not remove `drawCheckMark`
  itself, only its call from the dead checkbox sub-branch.
- `src/styles/app.css:2018–2029`:
  ```css
  .operation--form-checkbox,
  .operation--form-radio {
    place-items: center;
  }

  .operation--form-checkbox::before {
    content: "";
    width: min(1rem, 60%);
    aspect-ratio: 1;
    border: 1px solid currentColor;
    border-radius: var(--radius-xs);
  }

  .operation--form-radio::before {
    /* ... unrelated, stays ... */
  }
  ```
- `src/components/OperationOverlay.tsx:319–324` — the shared `form-field`
  render branch (used by every `FormFieldKind`, not checkbox-specific — no
  change needed here beyond the CSS class no longer ever resolving to
  `operation--form-checkbox`, which is fine since the type change makes that
  string unreachable).
- `src/components/Inspector.tsx` has **no** checkbox-kind-specific branch —
  the `checkbox-row` class at lines 114–121 is an unrelated "Whiteout behind
  text" toggle on `text` operations. Do not touch `Inspector.tsx`.
- Dead-code-only tests:
  - `tests/pdfEngineSave.test.ts:574–~645` — one `it` block titled "draws
    checkbox (checked/unchecked), radio (checked/unchecked), signature and
    text fields" that constructs seven `form-field` operations, two of which
    (`f_check_on`, `f_check_off`, lines 577–596) use `kind: "checkbox"`. The
    rest of the test (radio/signature/text) is live coverage and must stay.
  - `tests/operationOverlay.test.tsx:588–597` — one `it` block, "renders a
    checked form-field showing the check and value", entirely dedicated to
    `kind: "checkbox"`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Typecheck | `bun run typecheck` | exit 0 — will immediately flag any remaining `kind: "checkbox"` literal as a type error, which is your safety net for finding every call site |
| Lint | `bun run lint` | exit 0 |
| Unit tests | `bun run test` | all pass; test count drops by exactly 1 (the removed `operationOverlay.test.tsx` case) |
| Build | `bun run build` | exit 0 |

## Scope

**In scope**
- `src/types/editor.ts` — remove `"checkbox"` from `FormFieldKind`
- `src/engine/pdfEngine.ts` — remove the dead checkbox sub-branch, keep `drawCheckMark` and the radio branch
- `src/styles/app.css` — remove the two dead checkbox rules, keep the radio rule
- `tests/pdfEngineSave.test.ts` — remove the two checkbox-kind operations and their assertions from the shared test; rename the `it` title to drop "checkbox"
- `tests/operationOverlay.test.tsx` — remove the one checkbox-specific test case

**Out of scope**
- `FormFieldOperation`'s `checked` field itself (still used by `radio` and by
  `form-mark`'s conceptually-similar state) — do not remove it from the type
- `Inspector.tsx`, `OperationOverlay.tsx`'s shared `form-field` render branch,
  `operationFactory.ts`'s form-field creation logic, `toolRegistry.ts` — none
  of these reference the checkbox kind and none need changes
- The `mark-check` tool / `form-mark` operation type — this is the live
  replacement and is untouched by this plan
- Any IndexedDB session-migration logic — per "Why this matters" above, none is added

## Steps

### Step 1: Remove the type literal

In `src/types/editor.ts:29`, remove `"checkbox"` from `FormFieldKind`.

**Verify**: `bun run typecheck` → this will now fail at every remaining
reference to `kind: "checkbox"` on a `FormFieldOperation`. Use these failures
as your worklist for the remaining steps — do not rely solely on the file
list above; if `tsc` surfaces a location not listed here, treat that as more
accurate than this plan and fix it too.

### Step 2: Remove the dead writer branch

In `src/engine/pdfEngine.ts`, delete the `if (operation.kind === "checkbox") { ... }`
block (lines 606–615 as cited above) and change the following
`} else if (operation.kind === "radio") {` into a plain `if (operation.kind === "radio") {`
(adjust brace structure accordingly — read the surrounding `if/else if` chain
in full first so the remaining `else if`/`else` branches after `radio` stay
correctly attached).

**Verify**: `bun run typecheck` → one step closer to exit 0.

### Step 3: Remove the dead CSS

In `src/styles/app.css`, remove `.operation--form-checkbox,` from the shared
selector at line 2018 (leaving `.operation--form-radio { place-items: center; }`
as its own rule), and delete the entire `.operation--form-checkbox::before { ... }`
block (lines 2023–2029). Leave `.operation--form-radio::before` untouched.

### Step 4: Update `tests/pdfEngineSave.test.ts`

In the `it` block currently titled `"draws checkbox (checked/unchecked),
radio (checked/unchecked), signature and text fields"`:
- Remove the two operations with `id: "f_check_on"` and `id: "f_check_off"`
  (`kind: "checkbox"`) from the `operations` array.
- Remove any assertions later in the same test that reference those two
  operation ids or checkbox-specific drawn content.
- Rename the test title to drop "checkbox," (e.g. `"draws radio
  (checked/unchecked), signature and text fields"`).
- Leave every radio/signature/text assertion untouched.

### Step 5: Update `tests/operationOverlay.test.tsx`

Delete the entire `it("renders a checked form-field showing the check and
value", ...)` block (lines 588–597 as cited above) — it has no remaining
purpose once `kind: "checkbox"` is unreachable. Do not replace it with
anything; `form-mark` already has its own dedicated overlay-rendering tests
elsewhere in this file (glyph rendering for check/cross/dot).

### Step 6: Full verification pass

Run, in order: `bun run typecheck`, `bun run lint`, `bun run test`,
`bun run build`. All must exit 0. The unit test pass count should be exactly
one lower than before this plan (the deleted `operationOverlay.test.tsx`
case) — confirm this with the test runner's summary line, not just "all
green," so you notice if you accidentally deleted more than one test.

## Test plan

- No new tests are added — this plan only removes tests for a code path that
  can no longer be reached from the UI.
- The remaining `pdfEngineSave.test.ts` radio/signature/text assertions and
  the existing `form-mark` overlay-rendering tests in
  `tests/operationOverlay.test.tsx` continue to provide coverage for the live
  form-field and check-mark functionality.

## Done criteria

- [ ] `grep -rn "\"checkbox\"" src/types/editor.ts src/engine/pdfEngine.ts src/styles/app.css` returns no matches related to `FormFieldKind`
- [ ] `bun run typecheck`, `bun run lint`, `bun run test`, `bun run build` all exit 0
- [ ] Unit test pass count is exactly one lower than before this plan landed
- [ ] `.operation--form-radio` styling is visually unchanged (only the checkbox-specific rules were removed)
- [ ] `plans/README.md` status row for 011 updated

## STOP conditions

- `tsc` surfaces a `kind: "checkbox"` reference in a file not listed in
  "Scope" above (e.g. a fixture, a storage-migration helper, or an e2e test)
  — stop and report it; do not silently expand scope without noting why.
- Any test beyond the two named in Steps 4–5 needs a change — stop and
  report which one, since that would suggest the checkbox kind is reachable
  from somewhere this plan didn't account for.

## Maintenance notes

- This plan is independent of plans 009/010 (different files) and can land
  before, after, or in parallel with them.
- If a future audit wants to go further, `plans/README.md`'s existing
  **DIR-03** deferred finding (the `signature` operation's `drawn` mode has
  no writer branch at all, and `image` mode is fully wired but has no UI
  entry point — `src/types/editor.ts`'s `SignatureOperation.mode`) is the
  same class of problem in a different operation type and would make a good
  follow-up plan using this one as a template.
