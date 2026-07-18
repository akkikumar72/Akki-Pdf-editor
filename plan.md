> **SUPERSEDED (2026-07-18).** This inventory served as the V1 feature map and most
> of its checklist has shipped (text replacement, shapes, whiteout, signatures,
> links, forms, find & replace, alignment guides, selective undo, toolbar
> placement fixes). Do NOT treat the gaps or bugs described below as current —
> the live backlog is `plans/README.md`. Still-open items from this document
> (attachments, form tab order, publish-for-signing) are recorded there.

# Reference PDF Editor — Toolbar Feature Inventory

Reference: a leading online PDF editor (URL redacted)

This document lists every toolbar action, dropdown, and sub-option observed in the
the reference online PDF editor. It is meant as an implementation checklist for adding the
same capabilities to **Akki PDF Editor**. No implementation is included here — this
is purely a feature map for whoever picks it up next.

> Captured by walking through the live editor (loaded with a sample Uber receipt
> PDF) and inspecting every toolbar button, dropdown, contextual toolbar, and
> element tooltip.
>
> **Update:** Section 0 below was added after actually *performing* each action
> inside the PDF (placing text, drawing shapes, whiteout, etc.) and inspecting the
> resulting live DOM, so it describes the real interaction mechanics, not just the
> button names.

---

## 0. How editing actually works (interaction model) — VERIFIED LIVE

This is the single most important part for implementation. Every tool in the reference editor
follows the **same overlay-based interaction pattern**. Edits are **NOT** baked
into the PDF/canvas while you work — each edit is a separate, absolutely-positioned
HTML/SVG element layered on top of the rendered page, and they are only flattened
into the PDF when you press **Apply changes / Download**.

### 0.1 The universal pattern (applies to every tool)
1. **Activate a tool** from the toolbar → the button gets a sticky active state
   (`active active-sticky`) and a **"Press ESC to cancel"** hint appears at the top.
2. **Interact on the page**, one of three gestures depending on the tool:
   - **Click to place** (Text, Form fields, Signature, Image) → drops an element
     with a default size at the click point.
   - **Drag to draw** (Shapes, Whiteout, Links, Freehand draw/highlight) → press +
     drag defines the element's bounding box.
   - **Drag-select over existing text** (Highlight / Underline / Strikeout) → marks
     the selected text run.
3. **An overlay element is inserted** over the page. Observed wrapper classes:
   - Text → `div.text-editable` (a `contenteditable`)
   - Shapes → `div.shape-editable.shape-rectangle` (or ellipse/line/arrow)
   - Whiteout → `div.shape-editable.whiteout`
4. **The element is interactive** via jQuery-UI-style behaviors:
   - `ui-draggable` → drag to **move** it anywhere on the page.
   - `ui-resizable` → **resize handles** appear on all 4 edges + 4 corners
     (`ui-resizable-handle ui-resizable-n/s/e/w/ne/nw/se/sw`).
   - `active` → currently selected element.
5. **A floating contextual toolbar appears directly above the selected element**
   with the styling controls for that element type plus the shared
   **Move / Clone (duplicate) / Delete** buttons. It follows the element.
6. **Press ESC or click empty space** to deselect / exit the tool.

> Implementation takeaway for Akki PDF Editor: render each annotation as an
> absolutely-positioned, draggable + resizable overlay (`div`/`svg`) above the
> page, keep an in-memory list of edits, show a per-element floating toolbar on
> selection, and only rasterize/stamp them into the PDF on export.

### 0.2 Text — VERIFIED
- Activate **Text** → click empty area → inserts a `contenteditable` box showing
  the placeholder **"Type your text"** → start typing.
- Click on **existing PDF text** → it becomes editable in place (this is the
  "edit existing text" capability — the original text is swapped for an editable run).
- Floating toolbar above a selected text box (confirmed buttons, left→right):
  - **Bold** (`font-bold-opts`)
  - **Italic** (`font-italic-opts`)
  - **Font family** dropdown — built-ins seen: Courier, **Helvetica (default/selected)**,
    Times New Roman, plus the document's own embedded fonts (`doc-font`).
  - **Font size** (numeric input; shows a ⚠ warning icon when size is out of range)
  - **Color** — swatch + **hex input** (`color-type-hex`) + **eyedropper**
    (`color-picker`, "Select a color from the document")
  - **Convert text → link** (`text-to-link-opts`)
  - **Move** (`move-btn`), **Clone** (`clone-btn`), **Delete** (`delete-opts`)
- The box is draggable to reposition.

### 0.3 Shapes — VERIFIED
- Activate **Shapes → Rectangle/Ellipse/Line/Arrow** → "Press ESC to cancel" →
  **drag** on the page to draw.
- Result: `div.shape-editable.shape-rectangle` with **default border `5px solid red`**
  and **transparent fill**, fully **resizable** (handles on every edge/corner) and
  **draggable**.
- Floating toolbar: **Border width**, **Border color**, **Background (fill) color**,
  and for Line/Arrow **Line width / Line color**, plus **Clone** and **Delete**.

### 0.4 Whiteout — VERIFIED
- Same **drag-to-draw** model. Produces `div.shape-editable.whiteout` = a
  **white-filled rectangle** (`background: rgb(255,255,255)`) that visually
  **covers/erases** whatever is beneath it (confirmed it hid part of a text row).
- Draggable + resizable like any shape. (It is literally a shape locked to white fill.)

### 0.5 Annotate — VERIFIED (tool activation) / behavior by design
- **Highlight / Underline / Strikeout text**: activate the tool, then
  **drag-select across existing PDF text**; the selected run gets highlighted,
  underlined, or struck through. (Requires a real text-layer selection.)
- **Highlight freehand / Draw freehand**: **drag** to paint a freehand stroke
  (highlighter = thick translucent; draw = pen line). Has color / line-width controls.
- **Show or hide annotations**: toggles visibility of all annotations.

### 0.6 Images / Sign — flow
- **Images → Upload an image** opens a file picker; the image is placed as a
  draggable + resizable overlay with rotate / change-color / delete controls.
  ("New Stamp" places a preset stamp e.g. DRAFT.)
- **Sign → New Signature** opens the Create-signature dialog (Type / Draw /
  Upload Image / Camera). The saved signature is then dropped onto the page and
  behaves like a movable/resizable image.

### 0.7 Links / Forms — flow
- **Links**: activate → **draw a rectangle** over content to define the clickable
  region → choose target (external URL / email / phone / internal page).
- **Forms**: pick a field type (text, textarea, dropdown, radio, checkbox,
  signature box) → place it on the page → configure via the field-properties panel
  (name, value, options, required, max length, repeat on all pages, etc.).

### 0.8 Undo — VERIFIED (important nuance)
- The **Undo** button does **not** just pop the last action. It opens an
  **"Undo changes" panel** that lists **every edit** with its **name, timestamp,
  and page number** (e.g. "Whiteout — 17:19:31 — Page 1"), each with a checkbox and
  a **"Revert selected"** button.
- So it is effectively a **selective change history / revert manager**, not a plain
  linear undo stack. Worth replicating for a power-user editing experience.

### 0.9 Page-level + document-level — flow
- Per-page mini toolbar: **zoom in/out**, **rotate left/right**, **delete page**,
  **duplicate**, and **Insert page here** (between pages).
- **Apply changes** commits everything and leads to **Download** (this is where the
  overlays get flattened into the output PDF).

---

## 1. Top editing toolbar (left → right)

| # | Tool | Tooltip | Has dropdown? |
|---|------|---------|---------------|
| 1 | **Text** | "Add text. Change or delete existing text." | Yes (caret) |
| 2 | **Links** | "Add links. Change existing links." | No |
| 3 | **Forms** | "Fill out forms. Add new form fields" | Yes |
| 4 | **Images** | "Add images. Delete existing images." | Yes |
| 5 | **Sign** | "Add signature" | Yes |
| 6 | **Whiteout** | "Whiteout" | No |
| 7 | **Annotate** | "Highlight, underline, strike out text. Draw freehand" | Yes |
| 8 | **Shapes** | "Add rectangles, ellipse, circles, lines or arrows." | Yes |
| 9 | **Undo** | "Undo" | No |

---

## 2. Tool-by-tool breakdown

### 2.1 Text
- Click on empty space to **add a new text box**.
- Click on existing text to **edit / change / delete** it (in-place editing).
- Caret dropdown ("More text related tools."):
  - **Find & Replace**
    - Match case
    - Include links
    - "Always use the above replacement choice"
- **Contextual formatting toolbar** (appears while a text box is selected/edited):
  - **Font family** — selectable list (e.g. Selawik / Segoe UI, Roboto, Times New
    Roman, Arial, plus fonts detected in the source document).
  - **Font size**
  - **Bold**
  - **Italic**
  - **Text alignment**
  - **Text color** / **Color**
    - Pick from swatches
    - **Choose a color by hex code**
    - **Select a color from the document** (eyedropper)
  - **Move**, **Duplicate**, **Delete** the text box

### 2.2 Links
- **Create a link** (draw a link region over content).
- Edit existing links.
- Link properties / target types:
  - **Link to external URL**
  - **Link to email address**
  - **Link to phone number**
  - **Link to internal page**
- **Delete link**.

### 2.3 Forms ("Fill out forms. Add new form fields")
Dropdown grouped into sections:

**Add new form fields**
- **Text** — "Text box (single line)"
- **Text multiline** — "Textarea (multiple lines)"
- **Drop-down list** — "Dropdown list with multiple options"
- **Radio button** — "Radio option"
- **Checkbox**
- **Signature box** — "Signature box for others to sign"

**Change existing form fields**
- **Form Edit mode** — "Toggle between editing or filling out form fields"
- **Change tab order**

**Share publicly with others**
- **Publish for others to fill & sign**

**Form field properties** (per-field panel):
- Field name
- Field value
- Radio group (e.g. "There are N radios in this group")
- Options (one per line)
- Allow multiple selections
- Divide into boxes
- Max length
- Field is mandatory
- Repeat on all pages
- Duplicate field
- Field properties

### 2.4 Images
- **Upload an image** (file upload; also supports drag/drop).
- Sub-actions seen in the image popup:
  - **New Image**
  - **Delete existing image**
  - **New Stamp** (e.g. a "DRAFT" stamp)
- Selected-image controls:
  - **Move**, **Duplicate**, **Rotate**, **Delete image**
  - **Change color**

### 2.5 Sign
- **New Signature** → opens **Create signature** dialog with tabs:
  - **Type** — type your name, choose a **color**, pick from multiple handwriting
    font styles.
  - **Draw** — "Sign your name using your mouse or touchpad."
  - **Upload Image** — choose an image version: **Original**, **Transparent A**,
    **Transparent B**.
  - **Camera** — "Sign on a white piece of paper and hold it in front of the
    camera."
  - **Save signature** checkbox (remember signature for reuse).
- Place saved signatures onto the page.

### 2.6 Whiteout
- Single action: draw a white rectangle to **cover/erase** existing content.

### 2.7 Annotate ("Highlight, underline, strike out text. Draw freehand")
Dropdown grouped into sections:

**Text annotations**
- **Strike out** — "Strikethrough text"
- **Highlight** — "Highlight text"
- **Underline** — "Underline text"

**Freehand**
- **Highlight** (freehand) — "Highlight freehand"
- **Draw** (freehand) — "Draw freehand"

**Global**
- **Show / hide annotations** ("Show or hide annotations" / "Hide all annotations")
- **Remove annotation**
- Annotation controls: **Color / Change color**, **Line color**, **Line width**

### 2.8 Shapes ("Add rectangles, ellipse, circles, lines or arrows.")
Dropdown options:
- **Ellipse** (circles)
- **Rectangle**
- **Line**
- **Arrow**

Shape contextual controls:
- **Border width**
- **Border color**
- **Background color** (fill)
- **Line width** / **Line color** (for line/arrow)
- **Move**, **Duplicate**, **Rotate**, **Delete**

### 2.9 Undo
- **Undo** the last change. (Redo behavior pairs with this.)

---

## 3. Shared element controls (contextual, when an object is selected)
These appear for text boxes, images, shapes, signatures, etc.:
- **Move**
- **Duplicate** / **Duplicate objects**
- **Delete**
- **Rotate**
- **Align objects left / right / top / bottom**
- Color controls: **Color**, **Background color**, **Border color**, **Line color**,
  hex input, eyedropper ("Select a color from the document")
- Width controls: **Border width**, **Line width**

---

## 4. Page-level controls (per-page toolbar)
- **Zoom in** / **Zoom out**
- **Rotate left** / **Rotate right**
- **Delete page**
- **Insert page here** (insert blank/new page between pages)
- **Navigate through the document** (page navigator)
- Page number indicator

---

## 5. Document-level actions
- **Apply changes** (commit edits) → leads to **Download** the edited PDF.
- **Attachments** ("Upload an attachment").
- Recover unsaved changes prompt ("You've previously made edits to this file…").

---

## 6. Text move UX — reference (verified live 2026-06-17)

Observed on the live reference editor with an existing-text overlay (`#text-editable-2`,
content **"Akki Pathak"**) on an Uber receipt PDF. Reproduced by selecting the text,
clicking **Move** on the floating toolbar, and dragging while inspecting DOM/CSS.

### 6.1 Why this matters for Akki PDF Editor

Akki currently differs in three ways that hurt text repositioning UX:

| Behavior | the reference editor (target) | Akki PDF Editor (today) |
|----------|----------------|-------------------------|
| Move activation | **Two paths:** click Move *or* direct cursor-drag on text | Any pointer-down on overlay starts drag immediately |
| Move toolbar feedback | Cursor changes to `move` after Move click; drag works even without it | Move icon is passive/decorative (`floating-toolbar__button--passive`) |
| Text resize chrome | **No** resize handles on text | `ResizeHandles` shown for text (`isResizableOperation` returns `true`) |
| Alignment feedback | Smart snap guides during drag | None |
| Toolbar placement | **Left-aligned** with text, ~15px above | **Centered** then clamped — can end up **276px+ away horizontally** |

The user goal: **drag text naturally (with or without clicking Move) → see alignment
guides → toolbar stays tight to the selected block → no heavy crop/resize bar on text.**

### 6.2 Move mode activation (two equivalent paths)

**Path A — click Move, then drag (explicit mode)**

1. User selects a text overlay (click on it).
2. Floating contextual toolbar appears **above** the element (follows its position).
3. Text overlay has jQuery-UI draggable **disabled by default**
   (`ui-draggable-disabled`; `draggable('option', 'disabled') === true`).
4. User clicks the **Move** button (`.move-btn`, four-way arrow icon) on the toolbar.
5. Drag becomes enabled: `ui-draggable-disabled` removed, element `cursor: move`.
6. User drags the text box itself (Move is a mode gate, not a drag handle).
7. On drag end, drag is **auto-disabled again** (returns to edit-safe state).

**Path B — direct cursor drag (implicit move) — VERIFIED**

User can **skip the Move click entirely**: pointer-down on the selected text and
drag immediately repositions it. Observed behavior:

- Drag succeeds even while `draggable('option', 'disabled') === true` (jQuery UI
  still handles the gesture on `.ui-draggable-handle`).
- Alignment guides appear during drag (~84 lines observed).
- The Move button does **not** gain an `.active` / `aria-pressed` class — the reference editor
  does not visually “select” the Move icon when drag starts implicitly.
- Implicit feedback is the drag itself + snap guides, not toolbar button state.
- After explicit Move click, cursor becomes `move`; during implicit drag it stays
  `auto` — both paths work.

> Akki takeaway: support **both** paths. Default: pointer-down on a selected text
> overlay starts move-drag (with guides). Optional: clicking Move sets `moveMode` and
> changes cursor to `move`. Do **not** require Move click before every drag — that
> would be a regression vs the reference editor. Wire the passive Move icon in
> `FloatingOperationToolbar.tsx` as an optional explicit toggle, not the only gate.

### 6.3 Drag behavior

- **Containment:** element stays within the page wrapper (`.page-wrap`).
- **No resize handles** on text during move or selection (confirmed: `ui-resizable`
  absent, zero `.ui-resizable-handle` nodes).
- **Border chrome is minimal:** `.text-editable { border: 2px dashed transparent; }`
  — no heavy selection frame or crop bar.
- **Floating toolbar hides during drag** (`#text-editable-menu { display: none }`),
  then reappears at the new position after drop.
- Pointer cursor: `grab` in move mode, `grabbing` while dragging.

> Akki takeaway: exclude `type === "text"` from `isResizableOperation()` (or add a
> separate `isMoveOnlyOperation()`). Hide `FloatingOperationToolbar` while dragging.

### 6.4 Alignment guides (“grid view”)

This is **not** a literal dot-grid background. It is **Figma-style smart alignment
guides** that appear **only while dragging**.

**DOM structure (per page):**

```html
<div class="page-wrap rendered">
  <!-- canvas, textLayer, annotationLayer, … -->
  <div class="guidesLayer"></div>   <!-- empty when idle -->
  <div class="text-editable …">Akki Pathak</div>
</div>
```

**During drag**, `guidesLayer` is populated with many guide lines (~76 observed on a
busy receipt page). Each guide:

```html
<div class="guide horizontal" style="top: 76px;"></div>
<div class="guide vertical" style="left: 1318px;"></div>
<!-- when snapped: -->
<div class="guide horizontal snapped" style="top: 107px;"></div>
```

**CSS (from the reference editor stylesheet):**

```css
.guidesLayer { position: absolute; top: 0; pointer-events: none; mix-blend-mode: multiply; }
.guide.horizontal { border-top: 1px dashed rgb(255, 215, 157); height: 1px; width: 100%; }
.guide.vertical   { border-left: 1px dashed rgb(255, 215, 157); height: 100%; width: 1px; }
.guide.horizontal.snapped { border-top: 1px solid rgb(255, 140, 66); }
.guide.vertical.snapped   { border-left: 1px solid rgb(255, 140, 66); }
```

**Guide sources:** edges of other page content — existing PDF text runs, other
overlays (shapes, stamps, whiteout), and sibling edit elements. Guides are
recomputed on every drag move.

**Snap behavior:**

- jQuery draggable `snapTolerance: 20` (px).
- When the moving element's edge aligns within tolerance, the guide gets `.snapped`
  (dashed yellow → solid orange) and the element position snaps.
- **All guides are removed** when drag ends (`guidesLayer` innerHTML cleared).

> Akki takeaway: add a `guidesLayer` sibling inside `.page-stage` in `PdfCanvas.tsx`.
> On drag move, compute candidate horizontal/vertical lines from:
> - PDF.js text layer item rects (`textItems`)
> - Other `EditOperation` rects on the same page
> - Page margins (optional: edges at 0 / pageWidth / pageHeight)
> Render matching guides in viewport coords; highlight snapped pairs in accent orange.
> Clear on pointer-up.

### 6.5 Interaction flow (step-by-step)

```
Select text overlay
  → floating toolbar visible (Bold, Italic, Font, Size, Color, Link, Move, Clone, Delete)
Click Move icon
  → cursor: grab; drag enabled; resize handles stay hidden
Pointer down on text + drag
  → toolbar hides
  → alignment guides appear in guidesLayer
  → element follows pointer; snaps when near guide (±20px)
Pointer up
  → guides cleared
  → drag disabled again
  → toolbar reappears above new position
  → edit state unchanged (text content, font, etc. preserved)
```

### 6.6 Suggested Akki implementation checklist

**State (`PdfCanvas` or editor controller):**

- [ ] `moveModeOperationId: string | null` — optional explicit toggle when Move clicked.
- [ ] Allow drag on selected text pointer-down **without** requiring move mode first.
- [ ] Do not enter text edit mode while dragging.

**`FloatingOperationToolbar.tsx`:**

- [ ] Change Move from passive `<span>` to `<button>` (optional explicit move toggle).
- [ ] Fix `getToolbarPlacement` — **left-align** with text, ~12–15px vertical gap.
- [ ] Fix `clampToolbarLeft` — clamp near text block, not just page edge.
- [ ] Measure actual toolbar width via ref instead of `estimatedWidth = 430`.
- [ ] `aria-pressed={moveModeActive}` when explicit move mode is on.

**`PdfCanvas.tsx`:**

- [ ] Start drag on selected text pointer-down (implicit move path).
- [ ] Remove text from `isResizableOperation()` (keep resize for shapes/images).
- [ ] Hide toolbar while dragging; reposition after drop.
- [ ] Render `<div class="guides-layer" aria-hidden="true">` inside page stage.
- [ ] In drag move branch: compute guides, apply snap, update operation rect.
- [ ] Clear guides in `onPointerUp`.

**`app.css`:**

- [ ] `.guides-layer` + `.guide.horizontal` / `.guide.vertical` / `.snapped` (match the reference editor colors or use design tokens).
- [ ] `.operation--text.is-selected` — lighter selection chrome (no resize frame).
- [ ] `.operation.is-move-mode { cursor: grab; }`

**Tests:**

- [ ] E2E: select text → click Move → drag → assert position changed and no resize handles visible.
- [ ] Unit: snap helper returns snapped rect when within tolerance.

### 6.7 Floating toolbar placement — VERIFIED (Reference vs Akki gap)

Measured live with **"Akki Pathak"** selected on both editors (same Uber receipt).

| Metric | the reference editor | Akki PDF Editor (today) |
|--------|-------|-------------------------|
| Vertical gap (toolbar bottom → text top) | **~15px** | **~12px** (OK) |
| Horizontal offset (toolbar left − text left) | **0px** (left-aligned) | **−276px** (toolbar far left of text) |
| Center alignment delta | **~10px** (toolbar ≈ centered on text) | **−177px** (toolbar not near text) |
| Toolbar width vs text width | 411px vs 390px | 418px vs 218px |

**Reference positioning rules (observed):**

- Toolbar `#text-editable-menu` is **left-aligned with the text block**
  (`menu.style.left === text.style.left`, offset 0px).
- Placed **directly above** with a tight ~15px gap.
- Toolbar repositions on every selection/drag end to follow the element.

**Akki root cause (`FloatingOperationToolbar.tsx`):**

```ts
// Current — centers toolbar on text, then clamps to page edge
left = rect.left + rect.width / 2 - estimatedWidth / 2   // estimatedWidth = 430 for text
top  = rect.top - 48                                      // placement "above"
clampToolbarLeft(left, pageWidth)                         // maxLeft = pageWidth - 560
```

When text sits on the **right side** of the page (e.g. "Akki Pathak" at
`left: 1049px` on a `722px`-wide stage), centering would place the toolbar off-page.
`clampToolbarLeft` snaps it to `left: 162px` — **276px away** from the text.
Visually the toolbar looks detached even though vertical gap is fine.

**Recommended Akki fix:**

1. **Left-align** toolbar with text (`left = rect.left`), matching the reference editor — not
   center-on-text with a hard page clamp.
2. Use **measured toolbar width** (ref/`getBoundingClientRect`) instead of
   `estimatedWidth = 430`.
3. Clamp relative to **both page bounds and text block** so toolbar stays adjacent:
   `clamp(left, 8, min(pageWidth - toolbarWidth - 8, textRight - toolbarWidth))`.
4. Tighten vertical offset: the reference editor ≈ **15px** gap; Akki uses `top - 48` which works
   only because toolbar height (~36px) absorbs the rest — prefer explicit
   `top = rect.top - toolbarHeight - 12`.
5. After drag, **recompute placement** from updated operation rect (the reference editor does this).

> Files to change when implementing: `FloatingOperationToolbar.tsx`
> (`getToolbarPlacement`, `clampToolbarLeft`) and possibly measure toolbar via ref
> instead of hard-coded width estimates.

### 6.8 Out of scope (for this pass)

- The top-right `fa-th-large` grid icon on the reference editor pages — appears unrelated to drag
  guides (guides appear during drag without toggling it). Treat as page-layout tool
  unless further investigation proves otherwise.
- Move-via-dragging-the-Move-button itself — the reference editor uses Move as a **mode toggle**,
  not a drag handle.

---

## 7. Suggested implementation priority for Akki PDF Editor

> **Near-term UX win:** Section 6 (text move + alignment guides) should land with or
> immediately after core text — it replaces the current “always draggable + resize
> handles on text” pattern.

1. **Core text** — add/edit/delete text + font family, size, bold/italic, color, alignment.
   - Include **§6 text move mode** (Move toolbar button, no text resize handles, snap guides).
2. **Shapes** — rectangle, ellipse, line, arrow with border/fill/width.
3. **Annotate** — highlight, underline, strikethrough, freehand draw.
4. **Whiteout** — cover existing content.
5. **Images** — upload, move, resize, rotate, delete.
6. **Sign** — type/draw/upload signature, save & reuse.
7. **Shared controls** — move/duplicate/delete/rotate/align + color pickers (swatch, hex, eyedropper).
8. **Page ops** — zoom, rotate, delete, insert page, navigate.
9. **Links** — external URL / email / phone / internal page.
10. **Forms** — text, textarea, dropdown, radio, checkbox, signature box, tab order, publish.
11. **Find & Replace**, **Undo/Redo**, **Download/Export**.
