# Plan 018 (spike): Evaluate migrating from abandoned pdf-lib to a maintained fork

> **Executor instructions**: Design/spike plan — deliverable is an evaluation
> and recommendation, not a merged migration. Honor STOP conditions. Update
> the status row in `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat 0caadd8..HEAD -- src/engine/ package.json`
> On mismatch with the excerpts below, STOP.

## Status

- **Priority**: P3
- **Effort**: M (spike; the migration itself is separate)
- **Risk**: MED
- **Depends on**: none (017's findings feed into this)
- **Category**: migration
- **Planned at**: commit `0caadd8`, 2026-07-18

## Why this matters

`pdf-lib@1.17.1` (last release 2021) and `@pdf-lib/fontkit@1.1.1` (2020) are
community-confirmed unmaintained, and they are the write path for the app's
entire value proposition — flattening overlay operations into exported PDF
bytes. No upstream fixes will ever land. The exposure is contained by design:
only `src/engine/pdfEngine.ts`, `src/engine/operationWriters.ts`, and
`src/engine/fontResolver.ts` import pdf-lib (the AGENTS.md-documented engine
boundary), so a fork swap is mechanical if the fork is truly API-compatible.

## Current state

- `package.json`: `"pdf-lib": "^1.17.1"`, `"@pdf-lib/fontkit": "^1.1.1"`.
- pdf-lib imports (verify): `grep -rln "from \"pdf-lib\"" src/ tests/` →
  `src/engine/pdfEngine.ts`, `src/engine/operationWriters.ts`,
  `src/engine/fontResolver.ts`, plus test files that assert on PDF internals
  (`tests/pdfEngineSave.test.ts` and others import `PDFDocument`, `PDFDict`,
  `decodePDFRawStream`, ...).
- Candidate fork: `@cantoo-scribe/pdf-lib` (most active community fork).

## Spike tasks

1. Freshness/supply-chain check per repo policy: the candidate version must be
   ≥72h old (`curl -s https://registry.npmjs.org/@cantoo-scribe/pdf-lib` →
   check `time`); install with `--ignore-scripts`.
2. In a throwaway branch: alias the dependency
   (`"pdf-lib": "npm:@cantoo-scribe/pdf-lib@<version>"`) so imports stay
   untouched, run `bun install --ignore-scripts`.
3. Run the full gate: `bun run typecheck && bun run test:coverage && bun run e2e`.
   The unit suite decodes content streams byte-for-byte — it is the real
   compatibility test.
4. Diff two exported fixtures (e.g. `pdf/sample-invoice.pdf` with a text +
   whiteout + link op) between baseline and fork builds; inspect for
   structural differences (object streams, font subsetting).
5. Check whether the fork fixes anything the repo works around (e.g. font
   embedding quirks, AcroForm gaps found in plan 017).
6. Write the recommendation: migrate now / pin and wait / stay.

## Commands you will need

| Purpose   | Command                                        | Expected |
|-----------|------------------------------------------------|----------|
| Install   | `bun install --ignore-scripts`                 | exit 0   |
| Gate      | `bun run typecheck && bun run test:coverage && bun run e2e` | all pass |

## Scope

**In scope**: throwaway branch experiment; findings appended to this plan
under "## Findings".

**Out of scope**: merging the swap (separate PR after a decision); rewriting
engine code to a different library family (pdfcpu, mupdf) — out of budget.

## Done criteria

- [ ] Fork evaluated against the full test/e2e gate with results recorded
- [ ] Exported-bytes diff findings recorded
- [ ] Written recommendation with a pinned candidate version
- [ ] `plans/README.md` status row updated

## STOP conditions

- The fork fails typecheck (API drift) — record the surface and stop; a
  migration would then be a real project, not a swap.
- The fork's npm package is younger than 72 hours or fails the supply-chain
  sniff test (install scripts, surprising maintainers).
