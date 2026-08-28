# Akkivo Editor Workbench Requirements

**Reviewed:** 2026-08-28

## Purpose

This document defines Akkivo's toolbar, contextual controls, editing modes,
document operations, export behavior, known constraints, and production
acceptance criteria. Requirements follow Akkivo's local-first product model and
validated application behavior.

## Product interaction model

1. The primary toolbar selects a mode or performs an immediate action.
2. The secondary toolbar exposes only controls relevant to the active tool or
   current selection.
3. Page gestures are predictable:
   - Click to place text, marks, stamps, images, and form controls.
   - Drag to create regions, shapes, callouts, links, and freehand strokes.
   - Select source text before entering inline edit mode.
4. Selection always has visible bounds and appropriate handles.
5. Apply, Done, Cancel, and Escape provide explicit commit or exit boundaries.
6. Undo and Redo cover both overlay edits and document-level changes.
7. Page navigation remains available while editing.

## Capability requirements

| Capability           | Akkivo behavior                                                                                                                                     | Contextual controls                                                               | Status                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------- |
| Crop                 | Draw an eight-handle crop region, then apply it to the current page or all pages. Crop mutates PDF page boxes and participates in document history. | Current page, all pages, Cancel                                                   | Implemented                                 |
| Undo and Redo        | Move backward or forward through overlay and document edits without interfering with native text-input history.                                     | Main toolbar buttons and platform keyboard shortcuts                              | Implemented                                 |
| Add Text             | Click to place a selected placeholder and replace it with typed content. Abandoned placeholders are discarded.                                      | Font, size, weight, italic, color, alignment, link, move, duplicate, delete, Done | Implemented                                 |
| Edit Text            | First click selects a detected source run. A second stationary click enters inline editing while preserving recoverable typography and color.       | Font, size, weight, italic, color, delete, Done                                   | Implemented with source-PDF limits          |
| Signature            | Create typed, drawn, or uploaded signatures and reuse saved signatures.                                                                             | Type, Draw, Upload, color, font, Undo, Cancel, Done                               | Implemented                                 |
| Redact Text          | Snap a visual redaction to intersected text runs.                                                                                                   | Fill, outline, opacity, overlay text                                              | Implemented as visual coverage              |
| Redact Area          | Drag a free redaction rectangle.                                                                                                                    | Fill, outline, opacity, overlay text                                              | Implemented as visual coverage              |
| Whiteout             | Drag an opaque white rectangle that covers page content without claiming secure removal.                                                            | Selection, move, resize, duplicate, delete                                        | Implemented as visual coverage              |
| Draw                 | Capture and preview pointer paths, including tap-to-dot behavior, as one undoable operation per stroke.                                             | Color, opacity, thickness                                                         | Implemented                                 |
| Freehand Highlight   | Draw a broad translucent marker through the optimized stroke pipeline.                                                                              | Color, opacity, thickness                                                         | Implemented                                 |
| Erase                | Show a circular cursor and split intersected, unlocked ink or highlight paths without damaging unrelated operations.                                | Cursor and fixed radius                                                           | Implemented, adjustable radius planned      |
| Text Marks           | Snap highlights, strikeouts, and underlines to source text runs or use a drawn region.                                                              | Color, opacity, note, duplicate, delete                                           | Implemented                                 |
| Line and Shapes      | Drag lines, arrows, rectangles, and ellipses. Endpoint and resize handles match the selected geometry.                                              | Stroke, fill, width, opacity, note, duplicate, delete                             | Implemented                                 |
| Check Mark and Cross | Place a check on an existing checkbox or insert a cross immediately at page center.                                                                 | Color, size, move, duplicate, delete                                              | Implemented                                 |
| Image                | Choose an image, place it as a movable and resizable overlay, and export it into the PDF.                                                           | Move, resize, duplicate, delete                                                   | Implemented                                 |
| Callout              | Insert a text box with a leader line and draggable anchor and elbow.                                                                                | Text, font, color, stroke, leader geometry                                        | Implemented, direct rich-text entry planned |
| Stamp                | Insert a labeled stamp with optional date formatting.                                                                                               | Label, date style, color, opacity                                                 | Implemented                                 |
| Note                 | Place a text note annotation and keep its note content editable through Properties.                                                                 | Text, color, opacity, duplicate, delete                                           | Implemented                                 |
| Link                 | Draw or edit a link targeting a web URL, email address, phone number, or internal page. All targets pass through URL sanitization.                  | Target kind, target value, delete, close                                          | Implemented                                 |
| Forms                | Place interactive text, multiline, dropdown, option-list, checkbox, radio, button, date, and signature-placeholder fields.                          | Value, default, options, required, appearance, behavior                           | Implemented with known signature limits     |
| Page and View        | Insert or delete pages, remove selected operations, zoom, rotate the view, and rotate a page permanently.                                           | Compact utility controls                                                          | Implemented                                 |

## Toolbar and layout requirements

- The document bar contains the Akkivo identity, filename, search, Apply, and
  Export.
- High-frequency tools remain visible in the editing strip. Related variants use
  compact split menus.
- The contextual toolbar occupies a stable secondary row or stays adjacent to
  the selected object without covering document content.
- Properties is a contextual selection action that opens the advanced drawer.
- Advanced properties live in a closed-by-default drawer so the canvas retains
  its working width.
- Menus expose selected and expanded states, dismiss on Escape and outside click,
  and remain usable at narrow widths.

## Known constraints and product decisions

- Source-text replacement depends on recoverable PDF metadata. Mixed-style
  blocks, affine transforms, vertical text, Type3 fonts, and missing subset
  glyphs may require a fallback.
- Redaction currently covers content visually. It must never be presented as
  irreversible sanitization until exported bytes are proven unrecoverable.
- Signature form controls are text placeholders, not cryptographic signature
  fields.
- Eraser thickness is fixed.
- Callout text is edited through Properties instead of opening a rich-text
  editor immediately after placement.
- Viewer-specific JavaScript can be disabled by a PDF reader even when the field
  itself remains visible.

## Planned improvements

1. Build a verified secure-redaction pipeline that removes underlying content.
2. Add a genuine PDF signature field with clear signing semantics.
3. Add adjustable eraser thickness and direct callout rich-text entry.
4. Consolidate shared color, opacity, border, font, alignment, note, duplicate,
   and delete controls into reusable contextual-toolbar primitives.
5. Expand browser coverage for activation, creation, selection, cancellation,
   history, session restore, and exported results.

## Production acceptance checks

- Every toolbar action has visible idle, hover, pressed, focus, disabled, and
  selected states.
- Every mode can exit with Escape without losing unrelated edits.
- Pointer tools preview during movement and create exactly one history entry per
  completed gesture.
- Text editing preserves source positioning, wrapping, font fallback, and visual
  masking across zoom levels and export.
- Destructive actions have a clear scope and an undo path.
- Contextual controls remain accessible at narrow viewport widths.
- Controls have stable accessible names, keyboard focus order, and menu-expanded
  state.
- A saved and reopened PDF preserves visible edits, targets, form metadata, crop
  boxes, and annotation geometry.
- Exported documents are checked in multiple independent desktop and browser PDF
  readers before cross-reader fidelity is considered complete.
