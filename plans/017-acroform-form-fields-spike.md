# Plan 017: Interactive AcroForm export

## Status

- **Priority**: P2
- **Status**: DONE
- **Category**: product capability
- **Completed**: 2026-08-27

## Outcome

Akkivo exports form-field operations as live AcroForm widgets through
`src/engine/formFieldWriter.ts`. The implementation supports:

- Single-line and multiline text fields
- Dropdowns and list boxes
- Radio groups and checkboxes
- Buttons with supported actions
- Date fields with optional viewer-side formatting helpers
- Required, read-only, default value, choice, appearance, alignment, and rotation
  settings
- Collision-safe field naming and reusable radio groups

The signature variant is intentionally exported as an interactive text-field
placeholder because the PDF library does not expose creation of unsigned
cryptographic signature fields.

## Verification

- `tests/formFieldWriter.test.ts` covers normalization, field creation,
  appearance, actions, naming, radio grouping, and the signature fallback.
- `tests/pdfEngineSave.test.ts` verifies that form operations flow through the
  PDF writer and produce loadable output.
- The unit and coverage suites enforce 100 percent source coverage.
- Production export should continue to be checked in multiple independent
  desktop and browser PDF readers.

## Remaining product work

- Add a genuine cryptographic signature field only when the signing semantics
  and library support are defined.
- Define manual form-field tab ordering.
- Decide whether a flatten-export option is needed.
- Keep bulk form-fill work separate until its product workflow is specified.
