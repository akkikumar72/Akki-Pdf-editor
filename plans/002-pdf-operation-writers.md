# Plan 002: Split PDF operation writers from PdfEngine

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If a STOP condition occurs, stop and report.
>
> **Drift check (run first)**: `git diff --stat no-commit..HEAD -- src/engine/pdfEngine.ts src/types/editor.ts tests`
> This repo did not have an initial commit when this plan was written. If Git reports `no-commit` as invalid, inspect the listed files directly and continue.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt, architecture
- **Planned at**: commit `no-commit`, 2026-06-14

## Why this matters

`PdfEngine` correctly owns PDF.js/pdf-lib details, but `savePdf` has grown into a long operation-type switch. This is acceptable for v1, yet adding more tools will make every writer change touch the same large method and increase regression risk. A writer registry keeps PDF export details behind the engine boundary while giving each operation family a smaller, testable implementation.

## Current state

- `src/engine/pdfEngine.ts:151-475` loads the PDF and writes all operation types in one loop.
- The same method handles text whiteout, annotations, shapes, ink, images, signatures, stamps, form marks, form fields, and links.
- `src/engine/exportPipeline.ts:21` correctly calls only `engine.savePdf`, so callers already have a deep interface.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Unit tests | `npm run test` | exit 0; all tests pass |
| Build | `npm run build` | exit 0; production build completes |
| Browser tests | `npm run e2e` | exit 0; all Playwright tests pass |
| Security audit | `npm audit --audit-level=moderate` | exit 0; zero vulnerabilities |

## Scope

**In scope**
- `src/engine/pdfEngine.ts`
- New files under `src/engine/` such as `operationWriters.ts`
- Tests for PDF export behavior if new writer seams can be unit-tested

**Out of scope**
- Changing the public `PdfEngine.savePdf(originalBytes, operations)` signature
- Replacing `pdf-lib`
- Adding direct text-stream rewriting

## Steps

### Step 1: Extract writer context

Create `src/engine/operationWriters.ts` with a `PdfWriterContext` containing `pdf`, `page`, `rect`, `opacity`, `getFont`, and color/data helpers needed by operation writers. Move helpers such as `hexToRgb`, `dataUrlMimeType`, and vector checkmark drawing only if they are writer-specific.

**Verify**: `npm run build` -> exit 0.

### Step 2: Move operation-family writers one at a time

Extract writer functions for `text/whiteout`, `annotation`, `shape/ink`, `media/signature/stamp`, `form`, and `link`. `PdfEngine.savePdf` should keep responsibility for loading/saving the document and iterating operations, but dispatch to the writer registry.

**Verify**: after each family, run `npm run test` -> all tests pass.

### Step 3: Add export regression tests

Add a test that creates a one-page PDF, writes at least text, highlight, shape, stamp, form field, and link operations, then loads the resulting bytes with `pdf-lib` to confirm save output is valid and page count is preserved. Avoid brittle binary snapshots.

**Verify**: `npm run test` -> all tests pass and includes the new export validity test.

### Step 4: Final gate

Run the full release gate.

**Verify**:
- `npm run test` -> all tests pass
- `npm run build` -> exit 0
- `npm run e2e` -> all tests pass
- `npm audit --audit-level=moderate` -> zero vulnerabilities

## Done criteria

- [ ] `PdfEngine.savePdf` is under 120 lines and delegates operation rendering
- [ ] All pdf-lib writer details remain inside `src/engine/`
- [ ] No UI component imports pdf-lib
- [ ] New export validity test covers at least five operation families
- [ ] `plans/README.md` marks this plan DONE

## STOP conditions

- Extracting writers changes exported PDF bytes in a way the new validity test cannot explain.
- A writer needs UI state or DOM data to export correctly.
- The change requires altering `EditOperation` types outside a narrow writer-specific improvement.
