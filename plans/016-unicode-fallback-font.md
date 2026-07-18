# Plan 016: Embed a Unicode fallback font so non-Latin text exports instead of being skipped

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in the "STOP conditions" section occurs, stop and report. When
> done, update the status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0caadd8..HEAD -- src/engine/fontResolver.ts src/engine/operationWriters.ts src/engine/pdfEngine.ts`
> On any mismatch with the "Current state" excerpts, treat as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (supersedes the skip-and-report safety net from PR `improve/audit-fixes-wave1`)
- **Category**: bug
- **Planned at**: commit `0caadd8`, 2026-07-18

## Why this matters

`resolvePdfFont` (`src/engine/fontResolver.ts:155-178`) only ever returns
pdf-lib `StandardFonts` (Helvetica/Times/Courier), which encode WinAnsi
(Windows-1252). Any text operation containing Cyrillic, CJK, Greek, or most
emoji cannot be drawn. Since commit `357e47a` the export survives (the
operation is skipped and reported in the status bar), but the user's text is
still missing from the exported PDF. The full fix is embedding a bundled
Unicode-coverage fallback font via the already-registered fontkit when the
chosen standard font cannot encode the string.

## Current state

- `src/engine/pdfEngine.ts` `savePdf` — per-operation `try/catch` reports
  failures via `options.onOperationError` (search for "per-operation").
  `pdf.registerFontkit(fontkit)` is already called; `getReusedFont` shows the
  `pdf.embedFont(bytes, { subset: true })` pattern to copy.
- `src/engine/operationWriters.ts` `writeText` — resolves a font via
  `ctx.embeddedCovers`/`ctx.getReusedFont` (document's own embedded font) or
  `ctx.getFont` (standard font). `font.widthOfTextAtSize(...)` is the first
  call that throws on unencodable text (deliberately before the whiteout mask
  is drawn — keep that ordering).
- `src/engine/pdfEngine.ts` `embeddedCovers` — fontkit-based
  `hasGlyphForCodePoint` glyph-coverage check; reuse this pattern to test
  whether the fallback font covers the string.
- Text-drawing writers that need the same fallback: `writeText`,
  `writeAnnotation` (note text), `writeStamp`, `writeFormField`,
  `writeSignature` (typed mode).

## Design

1. Bundle a fallback font file under `src/assets/fonts/` (recommend
   `NotoSans-Regular.ttf`, SIL OFL — verify the license file is included).
   CJK coverage requires Noto Sans CJK (~MBs); decide with the owner whether
   Latin-extended+Cyrillic+Greek (plain Noto Sans) is enough for wave 1.
2. Extend `WriterContext` with `getFallbackFont(): Promise<PDFFont>` that
   lazily `pdf.embedFont(notoBytes, { subset: true })` once per save.
3. In each text-drawing writer: after resolving the primary font, check
   encodability (fontkit `hasGlyphForCodePoint` over the string, mirroring
   `embeddedCovers`); on failure, use the fallback font instead. Only if the
   fallback also cannot encode, let the existing throw → skip-and-report path
   handle it.
4. Vite: import the font as a URL/bytes (`?url` + fetch, or `?raw` — match how
   PDF.js assets are handled; a static import of bytes keeps it worker-free).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Typecheck | `bun run typecheck`      | exit 0              |
| Tests     | `bun run test:coverage`  | all pass, 100% coverage |
| Build     | `bun run build`          | exit 0              |
| E2E       | `bun run e2e`            | all pass            |

## Scope

**In scope**:
- `src/engine/fontResolver.ts`, `src/engine/operationWriters.ts`, `src/engine/pdfEngine.ts`
- New font asset + license file
- `tests/pdfEngineSave.test.ts` additions

**Out of scope**:
- On-canvas rendering of the fallback font (browser already renders Unicode fine)
- The skip-and-report machinery (keep as the last-resort path)

## Test plan

- Extend `tests/pdfEngineSave.test.ts` "per-operation error isolation" block:
  a Cyrillic text op must now be *written* (assert its hex-encoded glyph run
  or at least that `onOperationError` is NOT called and the fallback font
  appears in the page's font resources).
- A string the fallback also cannot cover (e.g. rare CJK if plain Noto Sans is
  chosen) still goes through skip-and-report.
- Bundle-size check: `bun run build` and confirm the font is emitted as an
  asset, not inlined into the main chunk.

## Done criteria

- [ ] Cyrillic/Greek text ops export as drawn text (test asserts it)
- [ ] `bun run typecheck && bun run lint && bun run test:coverage && bun run e2e` exit 0
- [ ] Font license file committed alongside the asset
- [ ] `plans/README.md` status row updated

## STOP conditions

- The chosen font pushes the built bundle beyond ~1 MB gzip growth — report
  and discuss subsetting or lazy-loading the font before proceeding.
- `pdf.embedFont` of the bundled font fails under the repo's pdf-lib version.
- The owner wants CJK coverage in wave 1 (different asset strategy needed).

## Maintenance notes

- If plan 018 (pdf-lib fork) lands, re-verify `embedFont` subsetting behavior.
- The skip-and-report status should become rare after this; keep it as the
  safety net for glyphs outside the fallback's coverage.
