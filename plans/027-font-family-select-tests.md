# Plan 027: Add direct FontFamilySelect tests and dedupe react-select stubs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat e9a7d80..HEAD -- src/components/FontFamilySelect.tsx tests/floatingOperationToolbar.test.tsx tests/inspector.test.tsx`
> On mismatch with "Current state", STOP.
>
> **Prerequisite**: `src/components/FontFamilySelect.tsx` exists and exports
> `FontFamilySelect` and `fontFamilyPatch`.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none (can run parallel with 025/026)
- **Category**: tests
- **Planned at**: commit `e9a7d80`, 2026-07-19

## Why this matters

`FontFamilySelect` is the shared control for toolbar + Inspector font picking
(search, live preview, commit, clear-on-blur). Behavior is only exercised
through large duplicated `vi.mock("react-select")` stubs in
`tests/inspector.test.tsx` and `tests/floatingOperationToolbar.test.tsx`.
Those stubs can drift from each other and from the real component props.
A focused unit suite + one shared stub module makes regressions cheap to
catch without mounting the whole toolbar/inspector.

## Current state

- `src/components/FontFamilySelect.tsx` — exports:
  - `fontFamilyPatch(fontFamily: string): Partial<TextOperation>`
  - `FontFamilySelect` with props:
    `value`, `variant?`, `onPreview`, `onCommit`, `onMenuOpen?`, `className?`,
    `aria-label?`
  - Commit path: `onCommit(fontPreviewPatch(next)); onPreview();`
  - Blur / menu close: `onPreview()` with no args
  - Focused option rows call `onPreview(fontPreviewPatch(font))` via context
- Duplicated react-select mocks (~80 lines each) at the top of
  `tests/inspector.test.tsx` and inside `tests/floatingOperationToolbar.test.tsx`.

## Commands you will need

| Purpose   | Command                                              | Expected on success |
|-----------|------------------------------------------------------|---------------------|
| Typecheck | `bun run typecheck`                                  | exit 0              |
| Tests     | `bun run test tests/fontFamilySelect.test.tsx`       | all pass            |
| All tests | `bun run test:coverage`                              | exit 0, 100%        |
| Lint      | `bun run lint`                                       | exit 0              |

## Scope

**In scope**:
- `tests/fontFamilySelect.test.tsx` (create)
- `tests/helpers/reactSelectStub.tsx` (create) — shared mock module
- `tests/inspector.test.tsx` — import shared stub instead of inline mock
- `tests/floatingOperationToolbar.test.tsx` — same

**Out of scope**:
- Changing `FontFamilySelect` production behavior (unless a test reveals a
  clear bug — then STOP and report; do not silently "fix" product code here)
- Plans 025/026
- Replacing react-select in production

## Design

### Shared stub (`tests/helpers/reactSelectStub.tsx`)

Export a factory usable from `vi.mock("react-select", ...)`. Keep the same
testids the existing suites already click where possible:

- Toolbar suite today uses `rs-change-null`, `rs-blur`, `rs-menu-close`,
  `rs-menu-open`, etc. — **preserve those testids** when consolidating so
  existing assertions keep working.
- Inspector suite uses `inspector-font-change`, `inspector-font-blur`, …
  Prefer parameterizing testid prefix via a module-level variable set by each
  test file **before** importing the component under test, **or** keep both
  sets of buttons in the stub (toolbar + inspector ids) if that is simpler
  and still under ~120 lines.

The stub must still invoke `styles.*` callbacks (for coverage) and render
`components.Option` when provided so `FontOptionRow` effects run.

### Direct suite

`tests/fontFamilySelect.test.tsx` should:

1. `vi.mock("react-select", () => …)` using the shared stub.
2. Assert `fontFamilyPatch("Arial")` equals
   `{ fontFamily: "Arial", cssFontFamily: undefined, detectedFontName: undefined, embeddedFontKey: undefined }`.
3. Render `<FontFamilySelect value="Inter" onPreview={…} onCommit={…} />`:
   - trigger change → `onCommit` called with patch; `onPreview` called with
     `undefined` (clear) after commit.
   - trigger blur / menu-close → `onPreview()` clear.
   - focused Option path → `onPreview` called with a font patch (if the stub
     mounts Option with `isFocused`).
4. `variant="inspector"` → value label shows font label text (not only "Aa").

Do **not** import the real react-select in unit tests (jsdom + portals are
flaky); the pdfCanvas integration test may already cover a real-ish path —
leave it alone unless it breaks.

## Git workflow

- Branch: `advisor/027-font-family-select-tests` or shared advisor branch
- Commit: `test(fonts): unit-cover FontFamilySelect and share react-select stub`
- Do NOT push unless asked.

## Steps

### Step 1: Extract shared stub

Create `tests/helpers/reactSelectStub.tsx`. Point both existing test files at
it via `vi.mock("react-select", () => require("./helpers/reactSelectStub")…)`
or an equivalent ESM-friendly pattern already used in the repo.

**Verify**: `bun run test tests/inspector.test.tsx tests/floatingOperationToolbar.test.tsx` → all pass (no assertion changes required if testids preserved).

### Step 2: Add `tests/fontFamilySelect.test.tsx`

Implement the cases in Design.

**Verify**: `bun run test tests/fontFamilySelect.test.tsx` → all pass.

### Step 3: Full gate

**Verify**: `bun run lint && bun run typecheck && bun run test:coverage` → exit 0.

## Test plan

- Unit cases listed above (patch helper, commit/clear, blur, inspector label).
- No production coverage regression (100% gate).
- Pattern: `tests/floatingOperationToolbar.test.tsx` mock shape.

## Done criteria

- [ ] Shared stub module exists; both toolbar + inspector tests import it
      (no duplicated 80-line mock bodies)
- [ ] `tests/fontFamilySelect.test.tsx` covers `fontFamilyPatch` + commit/preview/clear
- [ ] `bun run test:coverage` exit 0
- [ ] No production file changes unless STOP reported

## STOP conditions

- Deduping the stub requires changing production `FontFamilySelect` props.
- Coverage gate fails only because of unreachable SSR `document` guard —
  keep the existing `v8 ignore` comments; do not delete them to "fix" coverage.
- ESM `vi.mock` factory cannot share a file cleanly — report the error; a
  duplicated thin re-export is acceptable as a fallback (document in NOTES).

## Maintenance notes

- Any new FontFamilySelect prop must update the shared stub once.
- Reviewers: ensure inspector/toolbar tests did not lose coverage of
  null-onChange / menu-open side effects when moving mocks.
