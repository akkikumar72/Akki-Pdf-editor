# Plan 025: Isolate live text-preview state so font hover does not re-render the shell

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat e9a7d80..HEAD -- src/state/useEditorController.ts src/routes/EditorRoute.tsx src/components/PdfCanvas.tsx src/components/Inspector.tsx src/components/FontFamilySelect.tsx tests/useEditorController.test.tsx`
> If in-scope files changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.
>
> **Prerequisite**: `src/components/FontFamilySelect.tsx` must exist and
> `useEditorController` must already expose `textPreview` /
> `previewTextOperation` (the shared font-picker WIP). If those symbols are
> missing, STOP — do not re-implement the font picker in this plan.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW
- **Depends on**: none (but requires FontFamilySelect WIP on the branch)
- **Category**: perf
- **Planned at**: commit `e9a7d80`, 2026-07-19

## Why this matters

Live font preview was lifted into `useEditorController` so the Inspector and
inline toolbar share one preview bus. That puts a high-frequency hover state
on the same object every editor consumer reads via `useEditor()`. Each
keyboard/hover step through the font menu therefore re-renders
`EditorRoute` → `ToolRibbon` / `StatusBar` / `AppShell`, not just the canvas
overlay. `Inspector` and `PageRail` are already `memo`'d; the ribbon is not.
Moving preview into a narrow React context (state vs dispatch split) restores
the old cost model: only subscribers that need the live patch re-render.

## Current state

- `src/state/useEditorController.ts` — owns preview:
  ```ts
  const [textPreview, setTextPreview] = useState<{ id: string; patch: Partial<TextOperation> } | null>(null);
  const previewTextOperation = useCallback((id: string, patch?: Partial<TextOperation>) => {
    setTextPreview(patch ? { id, patch } : null);
  }, []);
  useEffect(() => {
    setTextPreview(null);
  }, [editState.selectedIds]);
  ```
  Returned on the controller object (`textPreview`, `previewTextOperation`).
- `src/routes/EditorRoute.tsx` — passes both into `Inspector` and `PdfCanvas`
  from `editor.*`.
- `src/components/PdfCanvas.tsx` — props `textPreview` / `onTextPreview`;
  merges via `previewOperation` onto overlays.
- `src/components/Inspector.tsx` — optional `onTextPreview` prop wired into
  `FontFamilySelect`.
- `src/state/editorContext.ts` — thin `EditorContext`; pattern to mirror for
  a second context module.
- Convention: package manager is **bun**; tests in `tests/*.test.tsx` with
  Vitest. Match existing context style in `editorContext.ts`.

## Commands you will need

| Purpose   | Command                                      | Expected on success        |
|-----------|----------------------------------------------|----------------------------|
| Typecheck | `bun run typecheck`                          | exit 0                     |
| Tests     | `bun run test`                               | all pass                   |
| Coverage  | `bun run test:coverage`                      | exit 0, 100% gate          |
| Lint      | `bun run lint`                               | exit 0                     |

## Scope

**In scope**:
- `src/state/textPreviewContext.tsx` (create)
- `src/state/useEditorController.ts` (remove preview state + return fields)
- `src/routes/EditorRoute.tsx` (wrap with provider; stop passing preview from controller)
- `src/components/PdfCanvas.tsx` (read preview from context OR keep props fed by a thin bridge — pick one approach below)
- `src/components/Inspector.tsx` (use dispatch from context; drop `onTextPreview` prop if unused)
- `tests/useEditorController.test.tsx` (remove / relocate preview tests)
- `tests/pdfCanvas.test.tsx` / `tests/inspector.test.tsx` (only as needed for wiring)
- New `tests/textPreviewContext.test.tsx` (or equivalent)

**Out of scope**:
- `FontFamilySelect.tsx` behavior / styling
- `OperationOverlay` embedded-font gate
- Plan 026 helper-text wiring (may consume context later; do not implement helper merge here)
- Plan 021 cast cleanup
- Formatting-only rewrites of unrelated `useCallback` bodies

## Design (required shape)

Create `src/state/textPreviewContext.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { TextOperation } from "../types/editor";

export type TextPreview = { id: string; patch: Partial<TextOperation> } | null;

const TextPreviewStateContext = createContext<TextPreview>(null);
const TextPreviewDispatchContext = createContext<(id: string, patch?: Partial<TextOperation>) => void>(() => {});

export function TextPreviewProvider({
  selectedIds,
  children,
}: {
  selectedIds: string[];
  children: ReactNode;
}) {
  const [textPreview, setTextPreview] = useState<TextPreview>(null);
  const previewTextOperation = useCallback((id: string, patch?: Partial<TextOperation>) => {
    setTextPreview(patch ? { id, patch } : null);
  }, []);
  useEffect(() => {
    setTextPreview(null);
  }, [selectedIds]);
  return (
    <TextPreviewDispatchContext.Provider value={previewTextOperation}>
      <TextPreviewStateContext.Provider value={textPreview}>
        {children}
      </TextPreviewStateContext.Provider>
    </TextPreviewDispatchContext.Provider>
  );
}

export function useTextPreview(): TextPreview {
  return useContext(TextPreviewStateContext);
}

export function useTextPreviewDispatch(): (id: string, patch?: Partial<TextOperation>) => void {
  return useContext(TextPreviewDispatchContext);
}
```

**Wiring**:
1. In `EditorRoute`, wrap the `AppShell` (or at least inspector + children) with
   `<TextPreviewProvider selectedIds={editState.selectedIds}>`.
2. Inside `PdfCanvas`, call `useTextPreview()` / `useTextPreviewDispatch()` and
   remove the `textPreview` / `onTextPreview` props from `PdfCanvasProps`
   **or** keep the props but have `EditorRoute` stop supplying them and instead
   add a one-line inner wrapper component that lives under the provider and
   passes context into `PdfCanvas`. Prefer **hooks inside PdfCanvas/Inspector**
   to avoid prop drilling.
3. `Inspector` uses `useTextPreviewDispatch()` for `FontFamilySelect.onPreview`.
   Remove the `onTextPreview` prop from `InspectorProps` and from `EditorRoute`.
4. Delete `textPreview` / `previewTextOperation` from the controller return value
   and the related `useState` / `useEffect` / `useCallback`.

**selectedIds dependency note**: clearing on `selectedIds` array identity is
the same behavior as today. Do not try to deep-compare IDs unless tests fail.

## Git workflow

- Branch: `advisor/025-isolate-text-preview` (or continue on the branch that
  already contains FontFamilySelect)
- Commit message style (single line, conventional):  
  `perf(editor): isolate text preview in dedicated context`
- Do NOT push or open a PR unless asked.

## Steps

### Step 1: Add `textPreviewContext.tsx`

Create the file with the design above. Export provider + two hooks.

**Verify**: `bun run typecheck` → may still pass if nothing imports it yet; exit 0 or only unused-export lint noise is fine. Prefer a tiny unit test in step 4.

### Step 2: Wrap `EditorRoute` and switch consumers

- Wrap with `TextPreviewProvider`.
- Update `PdfCanvas` + `Inspector` to use context hooks.
- Remove controller preview API and `EditorRoute` prop wiring.

**Verify**: `bun run typecheck` → exit 0.

### Step 3: Fix tests

- Move the controller test
  `"previewTextOperation sets and clears a live font preview..."` into
  `tests/textPreviewContext.test.tsx` (render the provider with
  `@testing-library/react`, assert state via a tiny probe child).
- Update `pdfCanvas` / `inspector` tests: wrap with `TextPreviewProvider` when
  they exercise preview, or pass through the same provider the app uses.
- Ensure no test still expects `result.current.textPreview` on the controller.

**Verify**: `bun run test` → all pass.

### Step 4: Full gate

**Verify**: `bun run lint && bun run test:coverage && bun run typecheck` → all exit 0.

## Test plan

- New `tests/textPreviewContext.test.tsx`:
  - dispatch with patch → probe sees `{ id, patch }`
  - dispatch without patch → `null`
  - change `selectedIds` prop → preview clears
- Keep existing canvas merge test
  (`merges a live textPreview patch onto the selected text overlay`) working
  under the provider.
- Pattern: `tests/useEditorController.test.tsx` for act/renderHook style;
  for provider, prefer `render` + probe component like other context tests if
  present, else minimal inline probe.

## Done criteria

- [ ] `textPreview` / `previewTextOperation` are **not** on `EditorController`
- [ ] `rg "textPreview|previewTextOperation" src/state/useEditorController.ts` → no matches
- [ ] `TextPreviewProvider` wraps the editor UI; PdfCanvas + Inspector consume context
- [ ] `bun run typecheck` exit 0
- [ ] `bun run test:coverage` exit 0
- [ ] `bun run lint` exit 0
- [ ] No files outside the in-scope list modified

## STOP conditions

- FontFamilySelect / preview wiring is missing on the branch (prerequisite).
- Splitting context requires changing `EditorProvider` in a way that breaks
  landing-route tests — report rather than widening scope to Landing.
- A legitimate consumer outside Inspector/PdfCanvas needs preview and is not
  listed — report before adding more subscribers.

## Maintenance notes

- Plan 026 will read `useTextPreview()` inside Inspector for helper text —
  that intentionally re-renders Inspector on hover (small tree). Do not "fix"
  that by putting helper text back on the controller.
- Reviewers: confirm ToolRibbon no longer sits under a parent that re-renders
  solely because preview changed (React DevTools "why did you render" optional).
