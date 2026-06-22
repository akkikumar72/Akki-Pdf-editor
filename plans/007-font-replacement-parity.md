# Font Replacement Parity

Reference: a leading online PDF editor (URL redacted)  
Related: root [`plan.md`](../plan.md) §0.2 (text interaction model)

This plan specifies how the reference editor handles **existing-text / font replacement** and tracks
Akki PDF Editor gaps. The primary user-visible defect is underline/distortion when
clicking PDF text (e.g. `0,00` on an Apoteket receipt) — original glyph ink bleeds
through an incomplete whiteout mask.

---

## A. Reference behavior

Observed on the live editor with the same Apoteket receipt PDF, plus the reference editor UI strings
and [`plan.md`](../plan.md) §0.2.

| Capability | the reference editor behavior |
|------------|----------------|
| Activation | **Text** tool → click existing PDF text → in-place editable run (`div.text-editable`) |
| Original text | Hidden/replaced cleanly — no ghost glyphs or underline artifacts |
| Font detection | Auto-inherits family, weight, italic, size, color from PDF |
| Embedded fonts | Document fonts appear in picker as `doc-font`; used for rendering when available |
| Metric fidelity | Replacement text visually matches original position and weight |
| Background | Original glyph area covered (whiteout) with sampled page background |
| Font substitution | Modal when typed chars missing: "Choose a replacement font" + "Very similar" + "Always use…" + Replace / Keep original |
| Style toolbar | Bold, Italic, Font family, Size, Color (hex + eyedropper), Link, Move, Clone, Delete |
| Export | Downloaded PDF preserves edits with no underline/distortion |
| Constraints | Warns on scans, rotated pages, complex scripts, text too small, embedded-font missing glyphs |

### Reference DOM model (existing text)

```
div.page-wrap.rendered
  div#text-editable-N          ← contenteditable replacement (no ghost layer beneath)
```

No parallel PDF.js text-layer span remains visible under the editable run.

---

## B. Akki current behavior

| Step | Code path |
|------|-----------|
| Load | `pdfEngine.extractTextAndFonts()` → `textItems` + `documentFonts` |
| Click text | `PdfCanvas` `.text-hit` → `createOperationsForTool({ sourceTextItem })` |
| Operation | `operationFactory.ts` → `TextOperation` with `whiteout`, `sourceCoverRect`, `embeddedFontKey` |
| Render | `OperationOverlay.tsx` + `.operation--source-cover` in `PdfCanvas.tsx` |
| Export | `pdfEngine.savePdf()` — mask at `sourceCoverRect`, `drawText` with embedded-font reuse |

### Layer stack (today)

```
PDF.js canvas (raster)
PDF.js text layer spans          ← STILL VISIBLE after replace (bug)
.operation--source-cover         ← whiteout mask
.operation--text                  ← editable overlay
```

---

## C. Root cause (confirmed 2026-06-21)

Measured on `http://localhost:5173/pdf-editor` after clicking **Replace: 0,00**:

| Layer | top (px) | bottom (px) | width (px) |
|-------|----------|-------------|------------|
| Akki whiteout mask | 839.54 | 853.34 | 26.85 |
| Akki overlay | 839.54 | 853.34 | 30.91 |
| PDF.js text span | **842.06** | **855.80** | 26.75 |

The PDF.js span sits ~2.5px lower and extends below the mask. The "underline" is
residual original ink — not CSS `text-decoration`.

---

## D. Gap matrix

| Gap | Severity | Notes |
|-----|----------|-------|
| PDF.js text layer not suppressed | **P0** | Direct cause of underline artifact |
| Mask rect vertical misalignment (~2px) | **P0** | Mask from PDF transform rect; PDF.js span uses different box |
| Baseline vs CSS center alignment | **P1** | Screen/export divergence |
| Embedded font not prioritized on screen | **P1** | Falls back to ArialMT/Liberation Sans |
| No font-substitution dialog | **P2** | the reference editor modal on missing glyphs |
| Export StandardFonts fallback | **P1** | Helvetica for ArialMT when embedded reuse fails |

---

## E. Implementation checklist

### P0 — Stop ghost text (required for parity)

- [x] Hide PDF.js text-layer spans overlapping `sourceCoverRect` in `PdfCanvas.tsx`
- [x] Pad `sourceCoverRect` vertically so mask covers PDF.js span extents (`operationFactory.ts` + helper)

**Acceptance:** Click `0,00` → no visible original ink; no underline artifacts.

### P0b — Stop whiteout bleeding onto neighbors (landed 2026-06-22)

The cover/overlay white box used the full PDF.js line box (~1em) and the editable run
painted its own opaque fill, so a tightly-leaded line above had its descenders clipped
and a moved run dragged a white box with it.

- [x] Trim the whiteout cover top to the glyph ascent (`replacementCoverTopTrim` in
  [`textMetrics.ts`](../src/utils/textMetrics.ts)) — mask hugs the run, line above intact.
- [x] Make the editable/replacement run transparent; only `.operation--source-cover`
  masks the original ([`OperationOverlay.tsx`](../src/components/OperationOverlay.tsx)).
  Moved/edited text is now pure glyphs (the reference editor `.text-editable` parity, §I.2).

**Acceptance:** Editing `534,93` under a tight line leaves the line above's descenders
intact; dragging the run shows only text with no trailing white box; original stays masked.

### P1 — Metric and font fidelity

- [x] Baseline-aligned overlay CSS (`app.css`) matching `savePdf` y-position
- [x] Shared text-baseline helper used by overlay + export
- [x] Embedded `@font-face` loads before overlay paints (`OperationOverlay.tsx`)

**Acceptance:** Replacement visually matches original weight/position; export matches screen.

### P2 — Reference UX (deferred)

- [ ] Font substitution modal when typed character missing from embedded font
- [ ] "Always use this replacement" preference
- [ ] Inspector message: "Embedded font, characters might be missing"

---

## F. Tests

| Check | Location |
|-------|----------|
| Mask rect padding helper | `tests/operationFactory.test.ts` |
| Text-layer span suppression | `tests/e2e/editor.spec.ts` |
| Export baseline y-position | `tests/pdfEngineSave.test.ts` (extends plan 006) |
| Manual smoke | control-ui pass on receipt `0,00` replacement |

---

## G. Out of scope

- the reference editor font-substitution modal (P2)
- Full fontkit metric positioning for all fonts (iterate after P0)
- BUG-07 multi-line flattening, BUG-01 rotation desync

---

## H. Key files

| File | Role |
|------|------|
| `src/components/PdfCanvas.tsx` | Text-hit layer, source-cover, text-layer suppression |
| `src/components/OperationOverlay.tsx` | Text overlay render + embedded font gate |
| `src/editor/operationFactory.ts` | Replacement op creation + padded rects |
| `src/utils/textMetrics.ts` | Shared baseline / cover-rect padding |
| `src/engine/pdfEngine.ts` | Export mask + drawText positioning |
| `src/engine/fontRegistry.ts` | Embedded font `@font-face` registration |
| `src/styles/app.css` | `.operation--text` baseline alignment |

---

## I. Reference text-selection & cursor UX (captured via control-ui, 2026-06-21)

Live inspection of `a leading online PDF editor (URL redacted)` with the **Text** tool active on the
Apoteket receipt. Findings come from the computed styles + matched CSS rules of the running
editor, so another agent can reproduce and verify them exactly.

### I.1 Two-layer model

the reference editor separates **hit-detection / hover** from the **editable run**:

```
.page canvas                         ← rasterized page
.textLayer (PDF.js, inset:0)         ← hover + I-beam + whiteout live HERE
  └ div  (one per text run)          ← transparent glyphs, opacity 0.4, pointer-events:auto
.text-editable / .existingTextEdit   ← contenteditable overlay, created on click
```

- The hover outline and the whiteout are both applied to the **same PDF.js `.textLayer > div`**
  (not a separate hit button). The editable overlay is layered on top only after a click.

### I.2 Exact CSS (copy from the reference editor, verbatim)

```css
/* page-wide I-beam while the Text tool is active */
[data-tool="text"] .textLayer,
[data-tool="text"] canvas { cursor: text; }

/* each PDF.js text run: transparent glyphs, invisible dashed outline by default */
.textLayer > div {
  color: transparent;
  cursor: text;
  opacity: 0.4;
  pointer-events: auto;
  white-space: pre;
  outline: transparent dashed 2px;   /* present but invisible */
  overflow: hidden;
}

/* HOVER: the dashed box turns reference-blue around just that run */
[data-tool="text"] .textLayer > div:hover { outline-color: rgb(2, 130, 229); }

/* once a run is edited or not editable, suppress the hover box */
[data-tool="text"] .textLayer > div.edited:hover,
[data-tool="text"] .textLayer > div.not-editable:hover { outline-color: transparent; }
.fill-sign-mode .textLayer > div:hover { outline-color: transparent; }

/* whiteout the original glyphs by flipping the SAME span opaque-white */
.textLayer > .edited { background-color: rgb(255, 255, 255); opacity: 1; user-select: none; }

/* the editable overlay mirrors the dashed border */
.text-editable { border: 2px dashed transparent; line-height: 1; overflow: visible; }
.text-editable:hover        { border-color: rgb(2, 130, 229); }
.text-editable:hover:focus  { border-color: transparent; }   /* hidden while typing */

/* movable when selected, caret while editing */
.text-editable.ui-draggable-handle   { cursor: move; }
.text-editable.ui-draggable-disabled  { cursor: inherit; }   /* -> text caret during edit */

/* the overlay is inert unless a relevant tool is active */
.text-editable { pointer-events: none; }
[data-tool="highlight"] .text-editable,
[data-tool="text-replace"] .text-editable,
[data-tool="text"] .text-editable { pointer-events: all; }
```

Accent color is **`rgb(2, 130, 229)` = `#0282E5`** (reference blue). Border weight **2px dashed**.

### I.3 Observed cursor + selection states

| State | Cursor | Visual |
|-------|--------|--------|
| Text tool active, over empty page | `text` (I-beam) | none |
| Hover an existing run (not yet edited) | `text` (I-beam) | 2px dashed `#0282E5` box hugging the run |
| Click a run | `text` caret placed **at click position** | overlay opens; original glyphs whited out via `.edited` |
| While typing (focused) | text caret | dashed border hidden (`:hover:focus`) |
| Selected run, not editing (draggable) | `move` | dashed border on hover; drag repositions text |
| Run already edited / not editable | default | no hover box |

Live DOM at edit time: the active run is
`div.existingTextEdit.text-editable.ui-draggable.ui-draggable-handle.ui-draggable-disabled`
with `contenteditable="true"`, `cursor: auto`; sibling runs are `contenteditable="false"`,
`cursor: move`, `border: 1.875px dashed rgba(0,0,0,0)`.

### I.4 Akki current behavior (gap)

| Aspect | the reference editor | Akki today | File |
|--------|-------|------------|------|
| Hover indicator | 2px **dashed** `#0282E5` outline, no fill | 1px **solid** accent border + soft background fill | `.text-hit:hover` in [`src/styles/app.css`](../src/styles/app.css) (~1716) |
| Hit surface | reuses PDF.js `.textLayer > div` | separate `<button class="text-hit">` per run | [`src/components/PdfCanvas.tsx`](../src/components/PdfCanvas.tsx) (~735) |
| Page cursor | I-beam over whole page when tool active | I-beam only on hit buttons | `.text-hit-layer.is-active .text-hit` (~1711) |
| Caret on click | placed **where clicked** | collapsed at **start** of run | [`src/components/OperationOverlay.tsx`](../src/components/OperationOverlay.tsx) (~93) |
| Non-editing selected text | `cursor: move`, drag to reposition | `grab` / move-mode on operation | `.operation` (~1740), `.operation.is-move-mode` (~1759) |
| Whiteout mechanism | same span flipped opaque-white (`.edited`) | separate `.operation--source-cover` mask | covered by §C/§E |

---

## J. Parity checklist for text-selection / cursor UX

Hover + cursor parity (the user-visible "hover shows a dashed box, I-beam, caret on click"
behavior). Each item is independently verifiable in a control-ui pass.

- [ ] **Dashed hover outline.** Change `.text-hit:hover` to a 2px dashed accent outline with
  **no background fill**, hugging the run (use `outline`, not `border`, to avoid reflow).
  Acceptance: hovering `534,93` shows a thin dashed blue box and no fill, matching the reference editor.
- [ ] **I-beam over the active page.** When the Text tool is active, apply `cursor: text` to
  the page/text-hit layer surface (not just individual buttons), so the I-beam shows between
  runs too. Acceptance: cursor is an I-beam anywhere over the page with Text active.
- [ ] **Caret at click position.** In [`OperationOverlay.tsx`](../src/components/OperationOverlay.tsx)
  (~89–101), place the caret at the clicked character (via `caretPositionFromPoint` /
  `caretRangeFromPoint`) instead of collapsing to start. Acceptance: clicking mid-word puts
  the caret there, like the reference editor.
- [ ] **Move cursor on selected (non-editing) text.** Confirm a selected text overlay that is
  not being edited shows `cursor: move` and can be dragged to reposition (already partially via
  `.operation.is-move-mode`). Acceptance: select a run, see `move`, drag relocates it.
- [ ] **Suppress hover box on already-replaced runs.** A run whose replacement exists must not
  show the hover outline (Akki already hides the hit target — verify no residual hover box).
  Acceptance: after replacing `0,00`, hovering its location shows no dashed box.

### Verification (control-ui)

1. Serve `bun run dev`, open `http://localhost:5173/pdf-editor`, load the Apoteket receipt.
2. Select the Text tool; hover a numeric run and screenshot the dashed box + I-beam.
3. Click mid-word and confirm caret position; type and confirm border hides while focused.
4. Compare side-by-side with `a leading online PDF editor (URL redacted)` (same receipt) screenshots.
5. Leave document state restored; unlock the browser.
