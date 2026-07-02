import type { EditorTool } from "../types/editor";

/**
 * In-page activation hints, mirroring a reference editor's top-of-page banner copy.
 * `armed` shows the moment a tool is selected; `drawing` (when present)
 * replaces it while the user is mid drag-to-draw. See
 * plans/008-shapes-toolbar-parity.md §B for the source strings.
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
  text: { armed: "Click existing text to edit or click the page to add new text" },
  link: {
    armed: "Add links by making an area selection on the page",
    drawing: "Select a page area to create link",
  },
  whiteout: { armed: "Select page area to whiteout", drawing: "Select page area to whiteout" },

  shape: SHAPE_HINT,
  "shape-ellipse": SHAPE_HINT,
  "shape-line": SHAPE_HINT,
  "shape-arrow": SHAPE_HINT,

  image: { armed: "Click a location on the page to add image" },
  stamp: { armed: "Click a location on the page to add a stamp" },
  signature: { armed: "Click a location on the page to add signature" },

  "annotate-text": { armed: "Click a location on the page to add a note" },
  highlight: { armed: "Drag across text to highlight it, or select an area", drawing: "Click and drag to highlight" },
  strikeout: { armed: "Drag across text to strike it out, or select an area", drawing: "Click and drag to strike out" },
  underline: { armed: "Drag across text to underline it, or select an area", drawing: "Click and drag to underline" },
  draw: { armed: "Click and drag to draw freehand" },
  ink: { armed: "Click and drag to add a freehand stroke" },

  "form-text": { armed: "Make an area selection to place a text field", drawing: "Click and drag to size the field" },
  "form-multiline": { armed: "Make an area selection to place a text area", drawing: "Click and drag to size the field" },
  "form-dropdown": { armed: "Make an area selection to place a dropdown", drawing: "Click and drag to size the field" },
  "form-radio": { armed: "Make an area selection to place a radio choice", drawing: "Click and drag to size the field" },
  "form-signature": { armed: "Make an area selection to reserve a signature box", drawing: "Click and drag to size the box" },

  "mark-check": { armed: "Click an existing checkbox on the page to mark it checked" },

  "table-region": {
    armed: "Make an area selection to mark a table region",
    drawing: "Click and drag to size the table region",
  },
};

export function getToolHint(tool: EditorTool): ToolHint | undefined {
  return TOOL_HINTS[tool];
}
