# 012 — Sejda parity suite (6 feature areas)

Status: IN PROGRESS (2026-07-02). Driven by the Sejda-comparison loop; live DOM/CSS
measurements taken from https://www.sejda.com/pdf-editor on 2026-07-02, codebase audits
by four read-only subagents against `main`.

## Gap matrix

| #   | Feature                    | Sejda behavior (measured)                                                                                                                                                                                                                                             | Ours today                                                                            | Gap size                                                                                       |
| --- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | Find & Replace             | Modal (`#searchReplaceTextPrompt`): Find+Replace inputs, Match case (off), Include links (on), Find / Replace / Replace all; match flagged pink + `1px solid rgb(255,20,147)`; status text green bottom-left                                                          | Nothing — no search UI, no matcher                                                    | Large (new UI + matcher; replacement = existing `text` op with `whiteout` + `sourceCoverRect`) |
| 2   | Annotate on text selection | Text layer spans stay selectable (`color: transparent; opacity:.4; cursor:text`); native selection → per-line rects; highlight = 0.3-opacity rect, strikeout = 5px mid-line (mix-blend multiply), underline = 5px bottom                                              | `highlight`/`strikeout`/`underline` are free-rect region tools                        | Medium (selection→rects mapping; ops already exist)                                            |
| 3   | Multi-select + group drag  | "Selected {} objects" / "Moving {} objects"; jQuery-UI internals                                                                                                                                                                                                      | `selectedId` single everywhere                                                        | Large (state refactor: `selectedIds[]`, `translate` action, marquee-select, shift-click)       |
| 4   | Link editing               | Popover with 4 radio kinds: external URL / email / phone / internal page; edits existing PDF `/Link` annots (`[data-tool=link] .annotation.link` pointer-events + dashed hover)                                                                                       | Single URL field; `tel:` rejected; no GoTo; existing PDF links never read             | Large (target-kind union + import pass + GoTo writer)                                          |
| 5   | Signature flow             | Modal tabs Type/Draw/Upload/Camera; 12 handwriting fonts (Stalemate, Over the Rainbow, Caveat, Cedarville Cursive, Dancing Script, Give You Glory, Kristi, Mr De Haviland, Norican, Reenie Beanie, Satisfy, Zeyada); 7 ink colors; Save-signature checkbox (reusable) | Typed-only popover, fixed EB Garamond; `image` mode wired in overlay/writer but no UI | Medium-large (modal + fonts + storage; plumbing exists)                                        |
| 6   | Image UX + stamps          | Click-to-place ghost, rotate handle, stamp modal (Subject/Author/date-style/7 colors → SVG rounded-rect "Approved / By … at …")                                                                                                                                       | Fixed 180×120 drop, no aspect sizing, no ghost, no rotation, label-only stamp         | Medium (ghost + aspect local; rotation = lockstep; stamp enrich = lockstep)                    |

## Shared enablers

- `{ type: "add-many"; operations: EditOperation[] }` reducer action (replace-all,
  multi-line annotate) — keep the exhaustive `never` default.
- Multi-select later adds `select { ids, additive }` + `translate { ids, dx, dy }`.

## Execution waves

- **Wave 1 (parallel):**
  - **A — Find & Replace + annotate-on-selection** (`textSearch.ts`, `textSelection.ts`,
    `FindReplaceDialog.tsx`, `add-many`, annotate snap in `PdfCanvas`).
  - **B — Signature modal + stamp enrichment + image placement** (`SignatureModal.tsx`,
    signature store in `storage.ts`, handwriting fonts, stamp subject/author/date,
    aspect-correct image sizing + placement ghost).
- **Wave 2 (parallel, after wave 1 merges):**
  - **C — Multi-select + group drag** (`selectedIds[]` refactor, marquee select,
    "Selected N objects").
  - **D — Link properties** (target-kind union, tabbed dialog, `tel:` + internal-page
    GoTo, import existing `/Link` annotations as editable overlays).

Deferred from this suite: signature Camera tab (needs getUserMedia UX), image rotation
handle (4-file lockstep + pdf-lib rotation math), group resize, combined multi-object
property editing.

## Invariants (enforced; do not regress)

- `sanitizeUrl` at create/edit/export; only `http`/`https`/`mailto` (+ `tel:` added by D
  with its own validation); `javascript:`/`data:` rejected.
- `<img>` overlays only `data:image/(png|jpeg)`.
- Reducer/writer/overlay exhaustive `never` dispatch; EditOperation changes touch
  factory + overlay + writer + inspector.
- 100% unit coverage gate (`vitest.config.ts`) — every new branch tested or
  `/* v8 ignore */` with justification.
