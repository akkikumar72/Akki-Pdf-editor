# coss-migration: test + 100% coverage regeneration spec

The UI revamp + legacy purge are already on this branch (`akash/shadcn-ui`, PR #5).
The test/coverage layer was completed locally but lost when the env restarted
(the env git proxy was down so it could never be committed). Regenerate it from
this spec. All previously achieved and verified; targets are realistic.

## Setup
- bun only. `bun install`. Branch `akash/shadcn-ui`.
- Commit as `Akash Kumar Pathak <4746256+akkikumar72@users.noreply.github.com>`, NO AI/Claude trailers. `git config core.hooksPath .githooks`.

## Coverage tooling
- `bun add -d @vitest/coverage-v8 fake-indexeddb`
- package.json script: `"test:coverage": "vitest run --config vitest.config.ts --coverage --coverage.include='src/**'"`
- vitest.config.ts `test.coverage`: provider `v8`, `include: ["src/**"]`, thresholds lines/functions/branches/statements = 100.
- **exclude** (unused vendored coss primitives + non-runtime/composition roots): `src/main.tsx`, `src/App.tsx`, `src/routes/**`, `src/types/**`, `src/hooks/use-media-query.ts`, and every `src/components/ui/*.tsx` EXCEPT the ones the app imports: keep coverage on `button.tsx`, `badge.tsx`, `card.tsx`, `dialog.tsx`, `scroll-area.tsx`, `spinner.tsx` (exclude the other ~45).
- **Run coverage with `--pool=forks`** — v8 has a `coverage/.tmp` worker race on the default pool. Run ONCE, foreground; never run concurrent vitest (it crashes the tmp dir).

## Source change (real bug fix, needed for a test)
- `src/state/editModel.ts` `"remove"` case: `commit()`'s default param swallows an explicit `undefined` selectedId, so removing the selected op never cleared selection. Fix: `const next = state.selectedId === action.id ? undefined : state.selectedId; return { ...commit(state, operations, next, "Delete edit"), selectedId: next };`

## Documented `/* v8 ignore next */` (unreachable/defensive or impractical in jsdom)
- fontResolver.ts: the `?? DEFAULT_FONT` / `?? FONT_CHOICES[0]` right-operands (~9) — each `.find()` targets a label always present in FONT_CHOICES.
- pdfEngine.ts: `embeddedCovers` missing-glyph `return false` (needs a hand-built subset font fixture fontkit can parse — impractical), and `insertBlankPage`'s `?? {width:612,height:792}` default (a loadable PDF always has a page).
- storage.ts: the `if (!db.objectStoreNames.contains(STORE))` false-branch inside `onupgradeneeded` (unreachable at fixed schema VERSION=1).
- PdfCanvas.tsx: 8 single-line defensive guards — `getCanvasSample` stage/canvas null checks, `sampleTextColor`/`sampleTextFontWeight` `!sample` returns, `isGenericCssFontFamily`/`isInternalPdfFontName` `?? ""`, ResizeHandles `onResizeStart` + overlay `onPointerDown` `stageRef.current` guards.

## Test files to (re)create
- Engine -> 100%: `pdfEngine.test.ts` (real pdf-lib + mock `pdfjs-dist/.../pdf.worker.min.mjs?url` to the real worker), `pdfEngineExtract.test.ts` (mock `pdfjs-dist` for extractTextAndFonts/loadDocument internals), `pdfEngineFontkit.test.ts` (mock `@pdf-lib/fontkit` for metadata + reused-font embed-failure). Extend `fontResolver.test.ts`, `fontRegistry.test.ts` (stub FontFace/document.fonts, re-import fresh), `exportPipeline.test.ts` (export() dispatch incl. docx).
  - NOTE: pdf.js delivers font bytes as cross-realm Uint8Array -> `instanceof Uint8Array` is false in jsdom, so real extraction never sets `info.bytes`; cover fontkit branches via the mocked-pdfjs tests. The embeddedCovers CJK case throws "WinAnsi cannot encode" -> assert `.rejects.toThrow()`. Use valid base64 for PNG/JPEG image data URLs.
- Utils/editor -> 100%: `ids.test.ts` (stub crypto), `storage.test.ts` (fake-indexeddb/auto + a failing indexedDB stub for error branches), `toolRegistry.test.ts`, extend `coordinates.test.ts`, `download.test.ts` (spy URL.createObjectURL/anchor/fake timers for deferred revoke), `fileValidation.test.ts`, `url.test.ts`, `alignmentGuides.test.ts`, `selectionModel.test.ts`, `operationFactory.test.ts` (every tool branch + text-style sub-branches).
- Components -> 100% under `tests/components/`: `AppShell`, `ToolRibbon`, `CanvasControls`, `Inspector`, `PageRail`, `StatusBar`, `FloatingOperationToolbar`, `OperationOverlay`, `ResizeHandles`, `PdfCanvas`, `ui`. Mock `react-pdf` (Document renders children + exposes onLoadSuccess; Page renders a real `.react-pdf__Page__canvas` + onRenderSuccess); mock `../../src/utils/fileValidation`; stub ResizeObserver, canvas getContext (fake 2d ctx with a swappable pixel painter for the color/weight sampling bands), getBoundingClientRect, setPointerCapture, FileReader. Drive every interaction: per-tool empty clicks, text-hit replacement, drag/resize geometry + min-size clamps, alignment snapping, delete/backspace guards, image-input + link-prompt branches, move/edit-mode resets, font preview via react-select.

## Definition of done
`bun run typecheck` + `bun run lint` (0 errors) + `bun run test` + `bun run test:coverage` (100%, with the documented ignores) + `bun run build` all green. Commit, push to `akash/shadcn-ui`, update PR #5 description with final coverage. Previously reached: ~402 tests, 34 files; engine/utils/editor/PdfCanvas at 100%; ~1% remained on Inspector/ToolHub/CanvasControls/FloatingOperationToolbar — finish those.
