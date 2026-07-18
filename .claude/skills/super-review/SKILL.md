---
name: super-review
description: Deep multi-pass PR review for this repo — verifies every suspicious hunk AND every claimed fix against the actual source at the PR head, sweeps repo-specific invariant lenses (redaction fail-closed, operation-dispatch lockstep, undo-snapshot integrity, IndexedDB session lifecycle), and posts severity-ranked inline comments. Use whenever the user asks to review, re-review, audit, or "check" a pull request or a set of PRs, including "review the latest PR", "look over my PR", or "add review comments" — even if they don't say the word "review" but want feedback on a branch's changes before merge.
---

# Super Review

A PR review is only worth posting if every finding survives an attempt to refute it, and
every claim in the PR description survives an attempt to break it. This skill structures a
review as: gather → two lists → verify both lists → lens sweep → report. The output is a
GitHub review with inline comments; the standard of evidence is "I read the implementation,
not just the diff."

## Phase 1 — Gather

1. Identify the target PR(s). With GitHub MCP tools use `list_pull_requests` /
   `pull_request_read`; with the `gh` CLI use `gh pr view/diff`. Note the **base branch**:
   stacked PRs (wave-2 based on wave-1) change what "introduced here" means.
2. Fetch both branches into the local clone (`git fetch origin <head> <base>`) so you can
   read any file at the PR head with `git show origin/<head>:<path>`. Never settle for the
   diff's context lines — the bug is usually in the code the diff *doesn't* show.
3. Check for existing reviews/comments on the PR (`pull_request_read` method
   `get_review_comments`, or `gh pr view --comments`). If this is a re-review, the job is
   to find what previous passes missed — re-posting known findings wastes the author's
   attention and yours.

## Phase 2 — Two lists

Read the complete diff once and build two lists:

- **Candidates**: every hunk that could plausibly be wrong — state passed through without
  transformation, new caches, catch blocks, regex changes, async ordering, memoization.
- **Claims**: every bullet in the PR description ("undo history survives page ops",
  "masks stay fully opaque"). Claims are candidates too — the most dangerous bug in a
  fix-PR is the fix that doesn't fix, or fixes one caller of three.

## Phase 3 — Verify (the core)

For each entry on both lists, read the real implementation at the PR head and try to
**refute** it before you report it:

- Trace the data: if a value is preserved across an operation (history snapshots across a
  page delete, a cached handle across a browser event), ask what invariant the operation
  changes and whether the preserved value was rebuilt to match. Snapshots that store raw
  state are stale the moment the state's coordinate system moves.
- Check both failure directions of error handling: a `try/catch` that "keeps the export
  alive" is correct for cosmetic ops and a disclosure for redaction ops. Ask "what does
  skipping this specific operation mean for the user?" per operation type, not per catch.
- For framework-timing arguments ("the following event finds no active gesture"), verify
  the framework guarantee (e.g. React 18 flushes discrete-event state synchronously before
  the next event task) instead of accepting the comment. If the guarantee holds, the
  finding dies — say so in the summary; verified-correct subtleties are review output too.
- **Tests as spec**: find the test that covers each claim, then check it exercises the
  *hard* path. A "history survives page ops" test that only rotates (indexes don't move)
  does not cover insert/delete (indexes move). Untested hard paths next to tested easy
  paths are where confirmed bugs live.
- For stacked PRs, classify every issue: introduced here / pre-existing / fixed in the
  stacked follow-up. Only the first class blocks; the third gets a "fine if the follow-up
  lands with it" note.

Kill anything you cannot make concrete. A finding needs a failure scenario — specific
input/state → specific wrong outcome. "This could be cleaner" is not a finding; put real
cleanups in the summary as optional notes or drop them.

## Phase 4 — Lens sweep

Run the checklist in [references/lenses.md](references/lenses.md). It encodes this repo's
invariants (from AGENTS.md) plus general lenses; each item says what to read and what
breaking it looks like. For a PR over ~800 changed lines, or several PRs at once, fan the
lenses out to parallel subagents — but subagent output is *candidates*, not findings:
verify each one yourself (Phase 3) before it reaches the PR.

## Phase 5 — Report

Post via a pending review: create pending → add inline comments → submit as **COMMENT**
(use REQUEST_CHANGES only if the user asks for gatekeeping). Anchor each comment to the
head-side line.

- Order comments by severity; one comment per root cause, not per symptom.
- Every comment states the failure scenario and a concrete fix (a code suggestion when it
  fits in a few lines). A comment the author can't act on is noise.
- The summary leads with what was verified and held up — the author needs to know which
  claims were independently confirmed, not just what's broken — then findings in severity
  order, then optional notes.
- Re-reviews: post only findings not already on the PR. If nothing new survives
  verification, do not post a token comment; report "no new findings" to the user with
  what you re-checked.

## Bar for findings

Confirmed means you can name the input, the state, and the wrong output. If after honest
effort a finding is still "plausible", either downgrade it to a question in the comment
("was this intentional? if X then Y breaks") or drop it. The review's credibility is the
product of its weakest comment.
