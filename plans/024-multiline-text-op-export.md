# Plan 024: Multi-line text operations always fail export with standard fonts

> **Executor instructions**: Follow step by step; run every verification
> command. On any STOP condition, stop and report. Update the status row in
> `plans/README.md` when done.
>
> **Drift check (run first)**: `git diff --stat <planned-at SHA>..HEAD -- src/engine/operationWriters.ts`
> On mismatch with the excerpts below, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `2925759` (rebase onto the merged PR SHA before executing), 2026-07-18

## Why this matters

`writeText`'s pre-flight encodability probe (`src/engine/operationWriters.ts`,
`font.widthOfTextAtSize(cleanForPdfEncoding(operation.text), operation.fontSize)`)
was fixed to tolerate tabs (mirroring pdf-lib's internal `cleanText`), but a
genuine newline (`\n`, `\r`, `\f`, `\u000B`) in a text operation still throws:
pdf-lib's `drawText` calls `lineSplit` on those characters and renders each
line separately with its own positioning, while our probe measures the whole
string as one line and — depending on the standard font — may or may not
throw purely on the newline character itself (WinAnsi *can* encode `\n`, so
the immediate throw isn't from the character, but the single-line width
computation is representationally wrong for what actually renders). Text
operations are edited in a multi-line-capable textarea/contenteditable
(unlike stamp labels/notes, which are effectively single-line), so newlines
are a real, reachable input here — a user pasting or typing a line break into
a text box degrades export in a way this repo has not characterized.

## Current state

- `src/engine/operationWriters.ts`, `writeText` — single `font.widthOfTextAtSize(...)`
  call used both as the atomic encodability probe and as the width driving
  `align === "center" | "right"` positioning. No line-splitting anywhere in
  this function; `page.drawText`'s own `maxWidth`/`lineHeight` options handle
  wrapping internally, but our alignment math assumes one line.
- `cleanForPdfEncoding` (same file) already normalizes tabs; it does **not**
  touch `\n\r\f\u000B` (those are pdf-lib's actual newline delimiters, not
  simple substitutions).
- Where text ops get multi-line input: confirm via the text overlay's
  `contentEditable` div (`src/components/OperationOverlay.tsx`) and whether
  `Enter` inserts a line break there today (may currently be a no-op —
  verify before assuming this is reachable through the UI vs. only through
  find-and-replace/programmatic paths).

## Steps

### Step 1: Characterize current behavior
Write a failing/documenting test in `tests/pdfEngineSave.test.ts` that saves a
text op with `text: "Line one\nLine two"` and records what happens today
(throws? renders wrong? silently mis-positions?). Do this **before** changing
any source, so the fix has a clear before/after.
**Verify**: `bun run test tests/pdfEngineSave.test.ts` — new test passes as a
characterization (asserting today's actual behavior, not the desired one).

### Step 2: Decide product behavior
Multi-line text ops need one of:
- (a) Split on the same newline chars pdf-lib uses, measure/align each line
  independently, and call `drawText` per line (or rely on pdf-lib's own
  `lineHeight`/`maxWidth` wrapping and only fix the alignment math to use the
  *widest* line's width for center/right).
- (b) Reject multi-line input at the UI layer (textarea/contentEditable
  strips or disallows Enter for `text` ops) so this never reaches the writer.
Pick one with the repo owner if ambiguous; (a) is more correct, (b) is
cheaper if multi-line text ops aren't an intended feature.

### Step 3: Implement the chosen fix
If (a): compute `lines = text.split(/[\n\f\r\u000B]/)`, measure each with
`font.widthOfTextAtSize`, use `Math.max(...widths)` for center/right alignment,
and keep the probe atomic (throw before any drawing if ANY line fails to
encode). If (b): find and adjust the input handler that captures text edits.
**Verify**: the Step 1 characterization test now asserts the fixed behavior
(update its expectations); `bun run test:coverage` stays at 100%.

### Step 4: Full gate
**Verify**: `bun run typecheck && bun run lint && bun run test:coverage && bun run e2e`.

## Done criteria

- [ ] A text op containing a genuine newline exports correctly (or is
      prevented from being created, per the Step 2 decision) — covered by a test
- [ ] Full gate green, 100% coverage maintained
- [ ] `plans/README.md` row updated

## STOP conditions

- The UI already prevents newlines in text ops (Step 1 characterization finds
  this is unreachable) — downgrade this plan to a `plans/README.md` "considered
  and rejected" entry with that finding instead of implementing (a)/(b).
- Fixing alignment math for multi-line breaks single-line alignment tests —
  the per-line width computation must be provably equivalent to the current
  single-line one when `lines.length === 1`.
