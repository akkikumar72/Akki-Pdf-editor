# Plan 026: Make Inspector font helper text follow the live font preview

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat e9a7d80..HEAD -- src/components/Inspector.tsx src/state/textPreviewContext.tsx tests/inspector.test.tsx`
> On mismatch with "Current state", STOP.
>
> **Depends on plan 025**: `useTextPreview()` must exist. If preview is still
> only on the controller (`editor.textPreview`), either finish 025 first or
> STOP and report — do not re-introduce controller preview for this polish.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/025-isolate-text-preview-context.md
- **Category**: bug
- **Planned at**: commit `e9a7d80`, 2026-07-19

## Why this matters

While the user browses fonts, the canvas overlay already merges the live
preview patch (which clears `embeddedFontKey`). The Inspector helper under
the Font field still reads the **committed** operation, so it can keep saying
"Matched the original embedded font (…)" while the page shows Arial/Courier.
That makes the picker feel broken even when the overlay is correct. Helper
copy should describe the same effective text op the canvas is showing.

## Current state

In `src/components/Inspector.tsx` (text branch):

```tsx
<p className="helper-text">
  {operation.embeddedFontKey
    ? `Matched the original embedded font${operation.detectedFontName ? ` (${operation.detectedFontName})` : ""}`
    : operation.detectedFontName || operation.cssFontFamily
      ? describeDetectedFont(operation.detectedFontName, operation.cssFontFamily, operation.fontFamily)
      : describeFallback(operation.fontFamily)}
</p>
```

Canvas merge (for reference — do not change unless needed) in
`PdfCanvas.tsx`:

```ts
const previewOperation = (operation: EditOperation): EditOperation => {
  if (operation.type !== "text" || textPreview?.id !== operation.id) return operation;
  return { ...operation, ...textPreview.patch };
};
```

After plan 025, Inspector can call `useTextPreview()` from
`src/state/textPreviewContext.tsx`.

Helpers live in `src/engine/fontResolver.ts`: `describeDetectedFont`,
`describeFallback`.

## Commands you will need

| Purpose   | Command                         | Expected on success |
|-----------|---------------------------------|---------------------|
| Typecheck | `bun run typecheck`             | exit 0              |
| Tests     | `bun run test tests/inspector.test.tsx` | all pass     |
| Coverage  | `bun run test:coverage`         | exit 0              |
| Lint      | `bun run lint`                  | exit 0              |

## Scope

**In scope**:
- `src/components/Inspector.tsx`
- `tests/inspector.test.tsx`

**Out of scope**:
- Floating toolbar chrome / labels
- Changing `describeDetectedFont` / `describeFallback` algorithms
- Export / PDF writer font selection
- Plan 025 context implementation (already done)

## Design

Inside the text-operation branch of `InspectorComponent`:

```tsx
const textPreview = useTextPreview();
const fontSource =
  operation.type === "text" && textPreview?.id === operation.id
    ? { ...operation, ...textPreview.patch }
    : operation;

// helper-text uses fontSource.embeddedFontKey / detectedFontName / cssFontFamily / fontFamily
```

Keep `FontFamilySelect` `value={operation.fontFamily}` (committed) — only the
helper paragraph (and nothing else in the form) should follow the preview.
Do not change size/color/align fields to preview values.

Optional: extract a tiny inner `TextFontHelper({ operation }: { operation: TextOperation })`
that calls `useTextPreview()` so the rest of `Inspector` does not subscribe.
Preferred if easy; not required if the whole Inspector already re-renders
cheaply under memo when only preview changes (after 025, Inspector will
re-render on preview only if it calls `useTextPreview` — that is intended).

## Git workflow

- Branch: same as 025 or `advisor/026-inspector-font-helper-preview`
- Commit: `fix(inspector): align font helper text with live preview`
- Do NOT push unless asked.

## Steps

### Step 1: Wire helper to preview-aware source

Implement the merge above; import `useTextPreview`.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Test

In `tests/inspector.test.tsx`, wrap with `TextPreviewProvider` (from 025).
Add a case:

1. Render Inspector with a text op that has `embeddedFontKey: "someKey"` and
   `detectedFontName: "Orig"`.
2. Assert helper mentions embedded / original.
3. From a test button or by rendering a sibling that calls
   `useTextPreviewDispatch()(op.id, { fontFamily: "Courier", embeddedFontKey: undefined, ... })`,
   dispatch a catalog preview patch.
4. Assert helper no longer claims the embedded match and instead follows
   `describeFallback("Courier")` (or whatever `describeFallback` returns —
   assert against the real helper output, do not hardcode a guessed string
   without calling the same function in the test).

**Verify**: `bun run test tests/inspector.test.tsx` → all pass.

### Step 3: Full gate

**Verify**: `bun run lint && bun run test:coverage && bun run typecheck` → exit 0.

## Test plan

- One focused regression test as in Step 2.
- Existing font-change tests must still pass (commit path unchanged).
- Pattern: existing `renderInspector` helper in `tests/inspector.test.tsx`.

## Done criteria

- [ ] Helper text uses preview-merged fields when `textPreview.id === operation.id`
- [ ] New inspector test covers embedded → catalog preview helper flip
- [ ] `bun run typecheck` / `lint` / `test:coverage` exit 0
- [ ] No files outside scope modified

## STOP conditions

- `useTextPreview` missing (025 not done).
- `describeFallback` / `describeDetectedFont` signatures differ from usage —
  adapt call sites only; do not rewrite fontResolver.
- Making the helper preview-aware seems to require changing FontFamilySelect —
  STOP; that is out of scope.

## Maintenance notes

- If more Inspector fields become preview-aware later, extract a shared
  `effectiveTextOperation(operation, preview)` helper next to the context.
- Reviewers: confirm commit (not preview) still drives the select value and
  update/undo history.
