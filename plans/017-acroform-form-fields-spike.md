# Plan 017 (spike): Export form-field operations as real, fillable AcroForm fields

> **Executor instructions**: This is a design/spike plan — the deliverable is
> a validated prototype plus a written recommendation, not shipped product
> code. Honor the STOP conditions. Update the status row in `plans/README.md`
> when done.
>
> **Drift check (run first)**: `git diff --stat 0caadd8..HEAD -- src/engine/operationWriters.ts src/types/editor.ts`
> On mismatch with the excerpts below, STOP.

## Status

- **Priority**: P2
- **Effort**: M (spike)
- **Risk**: MED
- **Depends on**: none; blocks any future CSV bulk form-fill feature
- **Category**: direction
- **Planned at**: commit `0caadd8`, 2026-07-18

## Why this matters

The Forms tool collects a full field data model —
`FormFieldOperation` in `src/types/editor.ts` has `kind`
("text" | "multiline" | "dropdown" | "radio" | "signature"), `name`, `value`,
`options`, `checked`, `required` — but `writeFormField`
(`src/engine/operationWriters.ts`, search `writeFormField`) only draws static
rectangles/ellipses/text. The exported PDF contains no AcroForm dictionary, so
the "form" is not fillable in any viewer. This is the largest gap between what
the UI promises and what the export delivers.

## Current state

- `src/engine/operationWriters.ts` `writeFormField` — static draw calls only;
  zero usage of pdf-lib's `PDFForm` API anywhere in `src/` (verify:
  `grep -rn "getForm\|createTextField\|createCheckBox\|createRadioGroup\|createDropdown" src/` → no matches).
- pdf-lib (1.17.1) supports `pdf.getForm()`, `form.createTextField(name)`,
  `createCheckBox`, `createRadioGroup`, `createDropdown`, each with
  `addToPage(page, { x, y, width, height, ... })`.
- The repo's operation rects are already in PDF points with the correct
  origin, so `addToPage` placement should map 1:1 from `operation.rect`.

## Spike tasks

1. Prototype (in a scratch test file, e.g. `tests/acroformSpike.test.ts`):
   map each `FormFieldKind` to a pdf-lib form field created via `getForm()`,
   placed with `addToPage` at `operation.rect`, honoring `value`, `options`,
   `checked`, `required` (`field.enableRequired()`).
2. Radio groups: decide the grouping key (shared `name` across
   `form-radio` ops) and prototype two radios in one group.
3. Field-name collisions: pdf-lib throws on duplicate field names — decide
   dedup strategy (suffixing vs. erroring in the UI).
4. Signature kind: pdf-lib has no signature-field creation API — document the
   recommendation (keep drawing a labeled box, or create a read-only text
   field as a placeholder).
5. Validate exported files in at least: macOS Preview, Chrome's PDF viewer,
   and (if available) Acrobat Reader — fields must render, accept input, and
   persist values on save.
6. Write the recommendation: full build plan outline, including whether a
   "flatten" export toggle is needed for backward compatibility with the
   current static-drawing behavior.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Tests     | `bun run test tests/acroformSpike.test.ts` | spike assertions pass |
| Typecheck | `bun run typecheck`      | exit 0              |

## Scope

**In scope**: scratch spike test file; a written recommendation appended to
this plan file under "## Findings".

**Out of scope**: changing `writeFormField` in `src/` (that's the follow-up
build plan); UI changes; the inspector.

## Done criteria

- [ ] Spike test creates a PDF with a text field, checkbox, radio group, and dropdown that pdf-lib can reload and read values from
- [ ] Manual viewer validation notes recorded in "## Findings"
- [ ] Recommendation written (including the flatten-toggle decision)
- [ ] `plans/README.md` status row updated

## STOP conditions

- pdf-lib 1.17.1's form API turns out broken for a needed field kind — record
  which, and fold that evidence into plan 018 (fork evaluation) instead of
  working around it.
- Exported fields render in pdf-lib reload but not in real viewers.
