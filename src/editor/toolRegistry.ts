import {
  CalendarDays,
  Check,
  CircleDot,
  Crop,
  Eraser,
  FileSignature,
  FormInput,
  Highlighter,
  Image,
  Link,
  List,
  ListChecks,
  MessageSquareText,
  MousePointerClick,
  MousePointer2,
  PenLine,
  RectangleHorizontal,
  ScanText,
  Shapes,
  Signature,
  SquareCheckBig,
  Stamp,
  Strikethrough,
  Type,
  Underline,
  X,
} from "lucide-react";
import type { EditorTool } from "../types/editor";

export type ToolPlacement = "select" | "point" | "region" | "file" | "prompt" | "ink" | "crop" | "erase";

export type ToolDefinition = {
  id: EditorTool;
  label: string;
  icon: typeof MousePointer2;
  placement: ToolPlacement;
  group: "core" | "forms" | "media" | "annotate" | "shapes";
  description: string;
};

export type ToolGroup = {
  id: string;
  label: string;
  primary: EditorTool;
  tools: ToolDefinition[];
};

const TOOL_DEFINITIONS: ToolDefinition[] = [
  { id: "select", label: "Edit text", icon: MousePointer2, placement: "select", group: "core", description: "Click detected text once to select it, then click again to edit it." },
  { id: "crop", label: "Crop", icon: Crop, placement: "crop", group: "core", description: "Choose a page area, then crop the current page or every page." },
  { id: "text", label: "Text", icon: Type, placement: "point", group: "core", description: "Add a new text box without changing existing PDF text." },
  { id: "link", label: "Links", icon: Link, placement: "region", group: "core", description: "Draw a link region or attach a URL to selected content." },
  { id: "whiteout", label: "Whiteout", icon: Eraser, placement: "region", group: "core", description: "Cover page content with an opaque white rectangle." },
  { id: "redact", label: "Redact text", icon: ScanText, placement: "region", group: "core", description: "Cover text with a visual redaction. Source PDF content remains extractable." },
  { id: "redact-area", label: "Redact area", icon: ScanText, placement: "region", group: "core", description: "Draw a visual redaction cover. Source PDF content remains extractable." },
  { id: "erase", label: "Erase", icon: Eraser, placement: "erase", group: "core", description: "Brush across added ink to remove only the touched stroke portions." },

  { id: "form-text", label: "Text field", icon: FormInput, placement: "region", group: "forms", description: "Add a single-line fillable text field." },
  { id: "form-multiline", label: "Multiline", icon: MessageSquareText, placement: "region", group: "forms", description: "Add a multiline fillable text area." },
  { id: "form-dropdown", label: "Dropdown", icon: ListChecks, placement: "region", group: "forms", description: "Add a dropdown field with local options." },
  { id: "form-listbox", label: "List box", icon: List, placement: "region", group: "forms", description: "Add a scrollable list with one or more selected values." },
  { id: "form-radio", label: "Radio", icon: CircleDot, placement: "region", group: "forms", description: "Add a radio choice marker." },
  { id: "form-checkbox", label: "Checkbox", icon: SquareCheckBig, placement: "region", group: "forms", description: "Add an interactive checkbox." },
  { id: "form-button", label: "Button", icon: MousePointerClick, placement: "region", group: "forms", description: "Add an interactive reset or print button." },
  { id: "form-date", label: "Date", icon: CalendarDays, placement: "region", group: "forms", description: "Add a date field with a clear display format." },
  { id: "mark-check", label: "Check mark", icon: Check, placement: "point", group: "forms", description: "Click an existing checkbox on the page to mark it checked." },
  { id: "mark-cross", label: "Cross", icon: X, placement: "point", group: "forms", description: "Insert a cross immediately at the page center." },
  { id: "form-signature", label: "Signature box", icon: FileSignature, placement: "region", group: "forms", description: "Reserve a signature box." },

  { id: "image", label: "New image", icon: Image, placement: "file", group: "media", description: "Place a local PNG or JPEG on the page." },
  { id: "stamp", label: "Stamp", icon: Stamp, placement: "point", group: "media", description: "Add a reusable approval/date-style stamp." },
  { id: "signature", label: "Signature", icon: Signature, placement: "prompt", group: "media", description: "Create or place a typed/drawn/image signature." },

  { id: "annotate-text", label: "Note", icon: MessageSquareText, placement: "point", group: "annotate", description: "Add a text note annotation." },
  { id: "callout", label: "Callout", icon: MessageSquareText, placement: "region", group: "annotate", description: "Draw a text box with a leader pointing to page content." },
  { id: "strikeout", label: "Strike out", icon: Strikethrough, placement: "region", group: "annotate", description: "Strike through selected text or a drawn region." },
  { id: "highlight", label: "Highlight", icon: Highlighter, placement: "region", group: "annotate", description: "Highlight text or an area." },
  { id: "freehand-highlight", label: "Highlight", icon: Highlighter, placement: "ink", group: "annotate", description: "Drag a broad translucent marker across the page." },
  { id: "underline", label: "Underline", icon: Underline, placement: "region", group: "annotate", description: "Underline selected text or a drawn region." },
  { id: "draw", label: "Draw", icon: PenLine, placement: "ink", group: "annotate", description: "Draw freehand ink." },
  { id: "ink", label: "Ink", icon: PenLine, placement: "ink", group: "annotate", description: "Add a freehand signature-like stroke." },

  { id: "shape", label: "Rectangle", icon: RectangleHorizontal, placement: "region", group: "shapes", description: "Draw a rectangle." },
  { id: "shape-ellipse", label: "Ellipse", icon: CircleDot, placement: "region", group: "shapes", description: "Draw an ellipse." },
  { id: "shape-line", label: "Line", icon: PenLine, placement: "region", group: "shapes", description: "Draw a line." },
  { id: "shape-arrow", label: "Arrow", icon: Shapes, placement: "region", group: "shapes", description: "Draw an arrow." },
];

export const TOOL_BY_ID = Object.fromEntries(TOOL_DEFINITIONS.map((tool) => [tool.id, tool])) as Record<EditorTool, ToolDefinition>;

export const TOOL_GROUPS: ToolGroup[] = [
  { id: "crop", label: "Crop", primary: "crop", tools: [TOOL_BY_ID.crop] },
  { id: "select", label: "Edit text", primary: "select", tools: [TOOL_BY_ID.select] },
  { id: "text", label: "Text", primary: "text", tools: [TOOL_BY_ID.text] },
  { id: "sign", label: "Signature", primary: "signature", tools: [TOOL_BY_ID.signature] },
  {
    id: "redact",
    label: "Redact",
    primary: "redact",
    tools: ["redact", "redact-area", "whiteout"].map((id) => TOOL_BY_ID[id as EditorTool]),
  },
  { id: "draw", label: "Draw", primary: "draw", tools: [TOOL_BY_ID.draw, TOOL_BY_ID.ink] },
  { id: "marker", label: "Highlight", primary: "freehand-highlight", tools: [TOOL_BY_ID["freehand-highlight"]] },
  { id: "erase", label: "Erase", primary: "erase", tools: [TOOL_BY_ID.erase] },
  {
    id: "highlight-text",
    label: "Highlight text",
    primary: "highlight",
    tools: ["highlight", "strikeout", "underline"].map((id) => TOOL_BY_ID[id as EditorTool]),
  },
  {
    id: "line",
    label: "Line",
    primary: "shape-line",
    tools: ["shape-line", "shape-arrow", "shape", "shape-ellipse"].map((id) => TOOL_BY_ID[id as EditorTool]),
  },
  { id: "check", label: "Check", primary: "mark-check", tools: [TOOL_BY_ID["mark-check"]] },
  { id: "cross", label: "Cross", primary: "mark-cross", tools: [TOOL_BY_ID["mark-cross"]] },
  { id: "image", label: "Image", primary: "image", tools: [TOOL_BY_ID.image] },
  { id: "callout", label: "Callout", primary: "callout", tools: [TOOL_BY_ID.callout] },
  { id: "stamp", label: "Stamp", primary: "stamp", tools: [TOOL_BY_ID.stamp] },
  { id: "note", label: "Note", primary: "annotate-text", tools: [TOOL_BY_ID["annotate-text"]] },
  { id: "links", label: "Links", primary: "link", tools: [TOOL_BY_ID.link] },
  {
    id: "forms",
    label: "Forms",
    primary: "form-text",
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
    ].map((id) => TOOL_BY_ID[id as EditorTool]),
  },
];

export function toolLabel(tool: EditorTool) {
  return TOOL_BY_ID[tool]?.label ?? tool;
}

export function isRegionTool(tool: EditorTool) {
  return TOOL_BY_ID[tool]?.placement === "region";
}
