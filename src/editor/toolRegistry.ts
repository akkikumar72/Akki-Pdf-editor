import {
  Check,
  CircleDot,
  Eraser,
  FileSignature,
  FormInput,
  Highlighter,
  Image,
  Link,
  ListChecks,
  MessageSquareText,
  MousePointer2,
  PenLine,
  RectangleHorizontal,
  Shapes,
  Signature,
  Stamp,
  Strikethrough,
  Table2,
  Type,
  Underline,
} from "lucide-react";
import type { EditorTool } from "../types/editor";

export type ToolPlacement = "select" | "point" | "region" | "file" | "prompt" | "ink";

export type ToolDefinition = {
  id: EditorTool;
  label: string;
  icon: typeof MousePointer2;
  placement: ToolPlacement;
  group: "core" | "forms" | "media" | "annotate" | "shapes" | "export";
  description: string;
};

export type ToolGroup = {
  id: string;
  label: string;
  primary: EditorTool;
  tools: ToolDefinition[];
};

const TOOL_DEFINITIONS: ToolDefinition[] = [
  { id: "select", label: "Select", icon: MousePointer2, placement: "select", group: "core", description: "Select, move, edit, or replace existing PDF text." },
  { id: "text", label: "Text", icon: Type, placement: "point", group: "core", description: "Add text or click existing text to replace it." },
  { id: "link", label: "Links", icon: Link, placement: "region", group: "core", description: "Draw a link region or attach a URL to selected content." },
  { id: "whiteout", label: "Whiteout", icon: Eraser, placement: "region", group: "core", description: "Cover page content with an opaque white rectangle." },

  { id: "form-text", label: "Text field", icon: FormInput, placement: "region", group: "forms", description: "Add a single-line fillable text field." },
  { id: "form-multiline", label: "Multiline", icon: MessageSquareText, placement: "region", group: "forms", description: "Add a multiline fillable text area." },
  { id: "form-dropdown", label: "Dropdown", icon: ListChecks, placement: "region", group: "forms", description: "Add a dropdown field with local options." },
  { id: "form-radio", label: "Radio", icon: CircleDot, placement: "region", group: "forms", description: "Add a radio choice marker." },
  { id: "mark-check", label: "Check mark", icon: Check, placement: "point", group: "forms", description: "Click an existing checkbox on the page to mark it checked." },
  { id: "form-signature", label: "Signature box", icon: FileSignature, placement: "region", group: "forms", description: "Reserve a signature box." },

  { id: "image", label: "New image", icon: Image, placement: "file", group: "media", description: "Place a local PNG or JPEG on the page." },
  { id: "stamp", label: "Stamp", icon: Stamp, placement: "point", group: "media", description: "Add a reusable approval/date-style stamp." },
  { id: "signature", label: "Signature", icon: Signature, placement: "prompt", group: "media", description: "Create or place a typed/drawn/image signature." },

  { id: "annotate-text", label: "Note", icon: MessageSquareText, placement: "point", group: "annotate", description: "Add a text note annotation." },
  { id: "strikeout", label: "Strike out", icon: Strikethrough, placement: "region", group: "annotate", description: "Strike through selected text or a drawn region." },
  { id: "highlight", label: "Highlight", icon: Highlighter, placement: "region", group: "annotate", description: "Highlight text or an area." },
  { id: "underline", label: "Underline", icon: Underline, placement: "region", group: "annotate", description: "Underline selected text or a drawn region." },
  { id: "draw", label: "Draw", icon: PenLine, placement: "ink", group: "annotate", description: "Draw freehand ink." },
  { id: "ink", label: "Ink", icon: PenLine, placement: "ink", group: "annotate", description: "Add a freehand signature-like stroke." },

  { id: "shape", label: "Rectangle", icon: RectangleHorizontal, placement: "region", group: "shapes", description: "Draw a rectangle." },
  { id: "shape-ellipse", label: "Ellipse", icon: CircleDot, placement: "region", group: "shapes", description: "Draw an ellipse." },
  { id: "shape-line", label: "Line", icon: PenLine, placement: "region", group: "shapes", description: "Draw a line." },
  { id: "shape-arrow", label: "Arrow", icon: Shapes, placement: "region", group: "shapes", description: "Draw an arrow." },
  { id: "table-region", label: "Table", icon: Table2, placement: "region", group: "export", description: "Mark a table extraction region." },
];

export const TOOL_BY_ID = Object.fromEntries(TOOL_DEFINITIONS.map((tool) => [tool.id, tool])) as Record<EditorTool, ToolDefinition>;

export const TOOL_GROUPS: ToolGroup[] = [
  { id: "select", label: "Select", primary: "select", tools: [TOOL_BY_ID.select] },
  { id: "text", label: "Text", primary: "text", tools: [TOOL_BY_ID.text] },
  { id: "links", label: "Links", primary: "link", tools: [TOOL_BY_ID.link] },
  {
    id: "forms",
    label: "Forms",
    primary: "form-text",
    tools: ["form-text", "form-multiline", "form-dropdown", "form-radio", "mark-check", "form-signature"].map((id) => TOOL_BY_ID[id as EditorTool]),
  },
  {
    id: "images",
    label: "Images",
    primary: "image",
    tools: [TOOL_BY_ID.image, TOOL_BY_ID.stamp],
  },
  { id: "sign", label: "Sign", primary: "signature", tools: [TOOL_BY_ID.signature] },
  { id: "whiteout", label: "Whiteout", primary: "whiteout", tools: [TOOL_BY_ID.whiteout] },
  {
    id: "annotate",
    label: "Annotate",
    primary: "highlight",
    tools: ["annotate-text", "strikeout", "highlight", "underline", "draw", "ink"].map((id) => TOOL_BY_ID[id as EditorTool]),
  },
  {
    id: "shapes",
    label: "Shapes",
    primary: "shape",
    tools: ["shape", "shape-ellipse", "shape-line", "shape-arrow"].map((id) => TOOL_BY_ID[id as EditorTool]),
  },
  { id: "table", label: "Table", primary: "table-region", tools: [TOOL_BY_ID["table-region"]] },
];

export function toolLabel(tool: EditorTool) {
  return TOOL_BY_ID[tool]?.label ?? tool;
}

export function isRegionTool(tool: EditorTool) {
  return TOOL_BY_ID[tool]?.placement === "region";
}
