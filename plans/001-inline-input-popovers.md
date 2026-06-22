# Plan 001: Replace prompt inputs with inline editor popovers

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If a STOP condition occurs, stop and report.
>
> **Drift check (run first)**: `git diff --stat no-commit..HEAD -- src/components/PdfCanvas.tsx src/editor/operationFactory.ts src/components/FloatingOperationToolbar.tsx tests/e2e/editor.spec.ts`
> This repo did not have an initial commit when this plan was written. If Git reports `no-commit` as invalid, inspect the listed files directly and continue.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: product, tech-debt
- **Planned at**: commit `no-commit`, 2026-06-14

## Why this matters

The editor now has a reference-style inline object toolbar for selected content, but creation flows for links, stamps, signatures, annotation notes, form names, and PDF passwords still use `window.prompt`. Browser prompts interrupt the workbench, cannot be styled, and are not testable as part of the inline editor UX. Replacing them with local popovers keeps input behavior consistent with the rest of the editor.

## Current state

- `src/components/PdfCanvas.tsx:86-96` passes `window.prompt.bind(window)` into the operation factory.
- `src/components/PdfCanvas.tsx:99-108` uses `window.prompt` for link edits and link creation from a selected object.
- `src/App.tsx:61` uses `window.prompt` for encrypted PDF passwords.
- `src/editor/operationFactory.ts:118-221` depends on an injected prompt boundary for annotation, link, stamp, signature, and form defaults.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Unit tests | `bun run test` | exit 0; all tests pass |
| Build | `bun run build` | exit 0; production build completes |
| Browser tests | `bun run e2e` | exit 0; all Playwright tests pass |

## Scope

**In scope**
- `src/components/PdfCanvas.tsx`
- `src/components/FloatingOperationToolbar.tsx`
- `src/editor/operationFactory.ts`
- New component under `src/components/` for inline input popovers
- `tests/e2e/editor.spec.ts`
- Focused unit tests if the operation creation API changes

**Out of scope**
- Cloud imports, OAuth, or backend storage
- Camera signature capture
- Changing the overlay-first PDF editing model

## Steps

### Step 1: Introduce a local input request model

Create a small typed model for pending editor input, for example `PendingInputRequest = { kind: "link" | "stamp" | "signature" | "annotation" | "form-field" | "password"; anchor?: ViewportRect; defaultValue?: string; ... }`. Store it in `PdfCanvas` for page-scoped inputs and in `App` for password input.

**Verify**: `bun run test` -> all tests pass.

### Step 2: Add an inline popover component

Add a component that renders near the selected overlay or clicked page position. It should support one text input, optional multiline textarea, optional comma-separated options input for dropdown fields, Confirm/Cancel buttons, Escape to cancel, Enter to confirm for single-line inputs, and focus trapping while open.

**Verify**: `bun run build` -> exit 0.

### Step 3: Replace prompt calls

Change `createOperationsForTool` so it can either create immediately or return a required input descriptor. Alternatively keep the factory pure and call it after the popover resolves. Remove direct `window.prompt` calls from `PdfCanvas.tsx` except during a transitional commit that still passes tests.

**Verify**: `rg -n "window\\.prompt" src/components/PdfCanvas.tsx src/editor/operationFactory.ts` -> no matches.

### Step 4: Extend browser coverage

Add Playwright coverage for opening the Forms dropdown, placing a text field through the inline popover, editing a selected link through the inline popover, and canceling a stamp input.

**Verify**: `bun run e2e` -> all tests pass.

## Done criteria

- [ ] No `window.prompt` calls remain in `src/components/PdfCanvas.tsx` or `src/editor/operationFactory.ts`
- [ ] Inline inputs are keyboard reachable and dismissible
- [ ] `bun run test`, `bun run build`, and `bun run e2e` all pass
- [ ] `plans/README.md` marks this plan DONE

## STOP conditions

- The inline input model requires changing `EditOperation` shapes unrelated to input capture.
- A popover cannot be reliably positioned without changing coordinate conversion logic.
- E2E tests require disabling browser dialogs instead of testing the new UI.
