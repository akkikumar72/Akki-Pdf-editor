# Review lenses

Each lens: what to read, and what a violation looks like. Repo-specific lenses first —
they encode invariants from AGENTS.md and bugs this codebase has actually had.

## Repo-specific

### Redaction is fail-closed
Whiteout masks and `text` ops with `whiteout: true` are redactions, not decorations.
Read `src/engine/operationWriters.ts` (`writeText`, `writeWhiteoutMask`) and
`src/engine/pdfEngine.ts` (`savePdf` error handling), plus the data-export mirror in
`src/engine/exportPipeline.ts` (`effectiveTextItems`) and the Find mirror in
`src/utils/textSearch.ts` (`isTextItemReplaced`).
Violations: a mask drawn at less than opacity 1; a mask skipped on error while the export
still downloads; the three mirrors disagreeing on the mask anchor
(`sourceCoverRect ?? (whiteout ? rect : none)`); TXT/CSV/XLSX emitting text the PDF masks.

### Operation-dispatch lockstep
The `EditOperation` union (`src/types/editor.ts`) is dispatched in lockstep across factory
(`src/editor/operationFactory.ts`), overlay (`src/components/OperationOverlay.tsx`), PDF
writer (`savePdf` switch), and inspector. Adding or removing a variant must touch all
four, plus `normalizeLegacyOperations` (`src/editor/linkTarget.ts`) so stale IndexedDB
sessions can't resurrect a retired type into a writer that no longer handles it.

### Undo/history snapshot integrity
History entries in `src/state/editModel.ts` store **raw operation-array snapshots**.
Any change that transforms live operations (page insert/delete shifting `pageIndex`,
coordinate migrations) must transform `past`/`future` snapshots identically, or undo
restores operations in a coordinate system that no longer exists. Check
`updateDocumentBytes` in `src/state/useEditorController.ts` and anything calling
`loadPdfState` with preserved history.

### Session/storage lifecycle
`src/utils/storage.ts` owns IndexedDB. Watch: fingerprint stability (a re-minted
fingerprint orphans the previous autosave row), shared-connection invalidation (both
`versionchange` *and* `close` must reset the cached handle — browsers force-close
connections under storage pressure), and that restored sessions pass through
`normalizeLegacyOperations`.

### Sanitization at every entry
`sanitizeUrl` (`src/utils/url.ts`) must hold at create, edit, and export; only
http/https/mailto survive, mailto delegates to the email validator, userinfo is rejected.
CSV/XLSX formula neutralization lives in `exportPipeline.ts` — check it neutralizes
without corrupting benign cells. File imports go through `src/utils/fileValidation.ts`
(size + magic bytes) before parsing. `<img>` overlays render only `data:image/(png|jpeg)`.

### Engine boundary and cleanup
UI must not reach past `src/engine/` to touch pdf-lib/PDF.js directly. PDF.js documents
opened in `pdfEngine` are destroyed in a `finally`. Exports/parses of the same bytes
should not be duplicated per call (page sizes are passed through where already computed).

## General

### State & async
Preserved-across-mutation state (see undo lens), stale closures in event handlers,
gesture lifecycles (`pointercancel` must discard, `lostpointercapture` ordering —
React 18 flushes discrete-event state before the next event dispatches, so
setState-then-next-event reasoning is valid there and invalid for continuous events),
double-dispatch batching, effect cleanup on unmount.

### Error handling directionality
For each new catch: list what can throw inside it, and for each op/branch decide whether
skip-and-continue is safe or fail-open. Check the user-facing message matches the actual
error (a message blaming font encoding for an image decode failure sends the user hunting
the wrong bug).

### Performance
New observers/listeners: what re-triggers them (a MutationObserver filter that matches
ancestors of the hot node still fires on unrelated sibling churn)? Memoization: are the
props actually referentially stable across the re-renders being avoided? Algorithmic
rewrites: does the new complexity argument rest on a data-order invariant, and is that
invariant guaranteed by the code or by luck? Caching keyed on the right inputs?

### Tests
Map each PR claim to its test; flag claims whose test only exercises the easy path
(rotate vs insert/delete, ASCII vs length-changing case folds). New coverage-gate or CI
changes: do they still run the suites they claim to gate?

### CI / supply chain
Workflow `permissions:` blocks, pinned toolchain versions, `--frozen-lockfile`
`--ignore-scripts` on install, cache keys derived from the lockfile, dependency pins not
silently loosened, no second lockfile introduced (bun.lock is the only source of truth).

### Accessibility & UX
Escape/close paths restore focus to the trigger; `role`/`aria-label` on new interactive
elements; keyboard reachability of new surfaces; status messages for async outcomes.
