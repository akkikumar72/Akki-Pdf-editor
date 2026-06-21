# Sejda Font Replacement Parity

Reference: https://www.sejda.com/pdf-editor  
Related: root [`plan.md`](../plan.md) §0.2 (text interaction model)

This plan specifies how Sejda handles **existing-text / font replacement** and tracks
Akki PDF Editor gaps. The primary user-visible defect is underline/distortion when
clicking PDF text (e.g. `0,00` on an Apoteket receipt) — original glyph ink bleeds
through an incomplete whiteout mask.

---

## A. Sejda reference behavior

Observed on the live editor with the same Apoteket receipt PDF, plus Sejda UI strings
and [`plan.md`](../plan.md) §0.2.

| Capability | Sejda behavior |
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

### Sejda DOM model (existing text)

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
| No font-substitution dialog | **P2** | Sejda modal on missing glyphs |
| Export StandardFonts fallback | **P1** | Helvetica for ArialMT when embedded reuse fails |

---

## E. Implementation checklist

### P0 — Stop ghost text (required for parity)

- [x] Hide PDF.js text-layer spans overlapping `sourceCoverRect` in `PdfCanvas.tsx`
- [x] Pad `sourceCoverRect` vertically so mask covers PDF.js span extents (`operationFactory.ts` + helper)

**Acceptance:** Click `0,00` → no visible original ink; no underline artifacts.

### P1 — Metric and font fidelity

- [x] Baseline-aligned overlay CSS (`app.css`) matching `savePdf` y-position
- [x] Shared text-baseline helper used by overlay + export
- [x] Embedded `@font-face` loads before overlay paints (`OperationOverlay.tsx`)

**Acceptance:** Replacement visually matches original weight/position; export matches screen.

### P2 — Sejda UX (deferred)

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

- Sejda font-substitution modal (P2)
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
