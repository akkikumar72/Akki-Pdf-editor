# Sejda PDF Editor — Toolbar Feature Inventory

Reference: https://www.sejda.com/pdf-editor

This document lists every toolbar action, dropdown, and sub-option observed in the
Sejda online PDF editor. It is meant as an implementation checklist for adding the
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

This is the single most important part for implementation. Every tool in Sejda
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

## 6. Suggested implementation priority for Akki PDF Editor

1. **Core text** — add/edit/delete text + font family, size, bold/italic, color, alignment.
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
