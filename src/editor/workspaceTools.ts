import { TOOL_BY_ID } from "./toolRegistry";
import type { EditorTool } from "../types/editor";

export const WORKSPACE_TOOL_SECTIONS: { label: string; tools: EditorTool[] }[] = [
  { label: "Edit document", tools: ["select", "text", "image", "link", "whiteout", "crop", "redact", "redact-area"] },
  {
    label: "Annotate & draw",
    tools: [
      "highlight",
      "freehand-highlight",
      "underline",
      "strikeout",
      "annotate-text",
      "callout",
      "draw",
      "ink",
      "erase",
    ],
  },
  { label: "Shapes", tools: ["shape", "shape-ellipse", "shape-line", "shape-arrow"] },
  { label: "Sign & stamp", tools: ["signature", "stamp", "mark-check", "mark-cross"] },
  {
    label: "Form fields",
    tools: [
      "form-text",
      "form-multiline",
      "form-checkbox",
      "form-radio",
      "form-dropdown",
      "form-listbox",
      "form-signature",
      "form-date",
      "form-button",
    ],
  },
];

export function workspaceToolLabel(id: EditorTool) {
  if (id === "freehand-highlight") return "Marker";
  if (id === "highlight") return "Highlight text";
  if (id === "image") return "Image";
  return TOOL_BY_ID[id].label;
}
