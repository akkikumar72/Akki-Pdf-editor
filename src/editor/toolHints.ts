import type { EditorTool } from "../types/editor";

/**
 * In-page activation hints, mirroring a reference editor's top-of-page banner copy.
 * `armed` shows the moment a tool is selected; `drawing` (when present)
 * replaces it while the user is mid drag-to-draw.
 */
export type ToolHint = {
  armed: string;
  drawing?: string;
};

const SHAPE_HINT: ToolHint = {
  armed: "Add a shape by making an area selection on the page",
  drawing: "Click and drag to draw the shape",
};

const TOOL_HINTS: Partial<Record<EditorTool, ToolHint>> = {
  crop: {
    armed: "Drag a crop area on the page",
    drawing: "Choose the page area to keep",
  },
  text: { armed: "Click the page to add new text" },
  link: {
    armed: "Add links by making an area selection on the page",
    drawing: "Select a page area to create link",
  },
  whiteout: { armed: "Select page area to whiteout", drawing: "Select page area to whiteout" },
  redact: { armed: "Drag across text to add a visual redaction cover", drawing: "Select text to cover" },
  "redact-area": { armed: "Select the page area for a visual redaction cover", drawing: "Select the page area to redact visually" },
  erase: { armed: "Brush across added ink to erase touched stroke portions", drawing: "Erasing added ink" },

  shape: SHAPE_HINT,
  "shape-ellipse": SHAPE_HINT,
  "shape-line": SHAPE_HINT,
  "shape-arrow": SHAPE_HINT,

  image: { armed: "Click a location on the page to add image" },
  stamp: { armed: "Click a location on the page to add a stamp" },
  signature: { armed: "Click a location on the page to add signature" },

  "annotate-text": { armed: "Click a location on the page to add a note" },
  callout: { armed: "Drag a callout box near the content it should point to", drawing: "Click and drag to size the callout" },
  highlight: { armed: "Drag across text to highlight it, or select an area", drawing: "Click and drag to highlight" },
  "freehand-highlight": { armed: "Click and drag to highlight freehand", drawing: "Highlighting freehand" },
  strikeout: { armed: "Drag across text to strike it out, or select an area", drawing: "Click and drag to strike out" },
  underline: { armed: "Drag across text to underline it, or select an area", drawing: "Click and drag to underline" },
  draw: { armed: "Click and drag to draw freehand", drawing: "Drawing freehand" },
  ink: { armed: "Click and drag to add a freehand stroke", drawing: "Drawing freehand stroke" },

  "form-text": { armed: "Make an area selection to place a text field", drawing: "Click and drag to size the field" },
  "form-multiline": {
    armed: "Make an area selection to place a text area",
    drawing: "Click and drag to size the field",
  },
  "form-dropdown": { armed: "Make an area selection to place a dropdown", drawing: "Click and drag to size the field" },
  "form-listbox": { armed: "Make an area selection to place a list box", drawing: "Click and drag to size the field" },
  "form-radio": {
    armed: "Make an area selection to place a radio choice",
    drawing: "Click and drag to size the field",
  },
  "form-checkbox": { armed: "Make an area selection to place a checkbox", drawing: "Click and drag to size the field" },
  "form-button": { armed: "Make an area selection to place a button", drawing: "Click and drag to size the button" },
  "form-date": { armed: "Make an area selection to place a date field", drawing: "Click and drag to size the field" },
  "form-signature": {
    armed: "Make an area selection to reserve a signature box",
    drawing: "Click and drag to size the box",
  },

  "mark-check": { armed: "Click an existing checkbox on the page to mark it checked" },
  "mark-cross": { armed: "Insert a cross at the page center" },
};

export function getToolHint(tool: EditorTool): ToolHint | undefined {
  return TOOL_HINTS[tool];
}
