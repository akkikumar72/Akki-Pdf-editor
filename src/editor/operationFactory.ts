import { buildDetectedCssFontFamily, resolveFont } from "../engine/fontResolver";
import type { EditOperation, EditorTool, TextItem, ViewportRect } from "../types/editor";
import { viewportRectToPdf } from "../utils/coordinates";
import { createId } from "../utils/ids";
import { toolLabel } from "./toolRegistry";

type Prompt = (message: string, defaultValue?: string) => string | null;

type CreateOperationInput = {
  activeTool: EditorTool;
  viewportRect: ViewportRect;
  pageHeight: number;
  pageIndex: number;
  scale: number;
  operations: EditOperation[];
  prompt: Prompt;
  sourceTextItem?: TextItem;
};

const DEFAULT_COLORS = {
  ink: "#111827",
  highlight: "#ffe066",
  link: "#2563eb",
  whiteout: "#ffffff",
  signature: "#111827",
};

const FORM_KIND_BY_TOOL = {
  "form-text": "text",
  "form-multiline": "multiline",
  "form-dropdown": "dropdown",
  "form-radio": "radio",
  "form-checkbox": "checkbox",
  "form-signature": "signature",
} as const;

export function createOperationsForTool({
  activeTool,
  viewportRect,
  pageHeight,
  pageIndex,
  scale,
  operations,
  prompt,
  sourceTextItem,
}: CreateOperationInput): EditOperation[] {
  const rect = viewportRectToPdf(viewportRect, pageHeight, scale);
  const now = Date.now();

  if (activeTool === "text" || sourceTextItem) {
    const sourceFontDescriptor = [sourceTextItem?.cssFontFamily, sourceTextItem?.fontName].filter(Boolean).join(" ");
    const fontChoice = resolveFont(sourceFontDescriptor);
    const fontWeight = sourceTextItem?.fontWeight;
    const italic = Boolean(sourceTextItem?.italic);
    const fontSize = Math.max(1, Math.round(sourceTextItem?.fontSize ?? 14));
    return [{
      id: createId("text"),
      type: "text",
      pageIndex,
      rect: sourceTextItem
        ? { ...rect, width: Math.max(rect.width, 16), height: Math.max(rect.height, fontSize) }
        : { ...rect, width: Math.max(rect.width, 130), height: Math.max(rect.height, 28) },
      text: sourceTextItem?.str ?? "New text",
      fontFamily: sourceTextItem ? fontChoice.label : resolveFont().label,
      cssFontFamily: sourceTextItem ? buildDetectedCssFontFamily(sourceTextItem.cssFontFamily, sourceTextItem.fontName) : undefined,
      detectedFontName: sourceTextItem?.fontName,
      fontSize,
      color: "#111827",
      bold: sourceTextItem ? (fontWeight ?? 400) >= 600 : undefined,
      italic: sourceTextItem ? italic : undefined,
      fontWeight: sourceTextItem ? fontWeight : undefined,
      fontStyle: sourceTextItem ? (italic ? "italic" : "normal") : undefined,
      align: "left",
      whiteout: Boolean(sourceTextItem),
      opacity: 1,
      createdAt: now,
    }];
  }

  if (activeTool === "whiteout") {
    return [{
      id: createId("whiteout"),
      type: "whiteout",
      pageIndex,
      rect: { ...rect, width: Math.max(rect.width, 120), height: Math.max(rect.height, 34) },
      color: DEFAULT_COLORS.whiteout,
      opacity: 1,
      createdAt: now,
    }];
  }

  if (activeTool === "highlight") {
    return [{
      id: createId("annotation"),
      type: "annotation",
      kind: "highlight",
      pageIndex,
      rect: { ...rect, width: Math.max(rect.width, 150), height: Math.max(rect.height, 22) },
      color: DEFAULT_COLORS.highlight,
      opacity: 0.36,
      createdAt: now,
    }];
  }

  if (activeTool === "strikeout" || activeTool === "underline") {
    return [{
      id: createId("annotation"),
      type: "annotation",
      kind: activeTool,
      pageIndex,
      rect: { ...rect, width: Math.max(rect.width, 150), height: Math.max(rect.height, 18) },
      color: "#ef4444",
      opacity: 1,
      createdAt: now,
    }];
  }

  if (activeTool === "annotate-text") {
    const text = prompt("Annotation note", "Note");
    if (!text) return [];
    return [{
      id: createId("annotation"),
      type: "annotation",
      kind: "note",
      pageIndex,
      rect: { ...rect, width: Math.max(rect.width, 160), height: Math.max(rect.height, 42) },
      color: "#2563eb",
      text,
      opacity: 1,
      createdAt: now,
    }];
  }

  if (activeTool === "shape" || activeTool === "shape-ellipse" || activeTool === "shape-line" || activeTool === "shape-arrow") {
    return [{
      id: createId("shape"),
      type: "shape",
      kind: activeTool === "shape-ellipse" ? "ellipse" : activeTool === "shape-line" ? "line" : activeTool === "shape-arrow" ? "arrow" : "rectangle",
      pageIndex,
      rect: { ...rect, width: Math.max(rect.width, 140), height: Math.max(rect.height, 70) },
      stroke: "#111827",
      fill: "transparent",
      strokeWidth: 1.5,
      opacity: 1,
      createdAt: now,
    }];
  }

  if (activeTool === "ink" || activeTool === "draw") {
    return [{
      id: createId("ink"),
      type: "ink",
      pageIndex,
      rect: { ...rect, width: 120, height: 48 },
      points: [
        { x: rect.x, y: rect.y + 10 },
        { x: rect.x + 28, y: rect.y + 26 },
        { x: rect.x + 70, y: rect.y + 16 },
        { x: rect.x + 120, y: rect.y + 32 },
      ],
      stroke: activeTool === "draw" ? "#2563eb" : DEFAULT_COLORS.ink,
      strokeWidth: activeTool === "draw" ? 2.4 : 2,
      variant: activeTool,
      opacity: 1,
      createdAt: now,
    }];
  }

  if (activeTool === "link") {
    const href = prompt("Link URL", "https://");
    if (!href) return [];
    return [{
      id: createId("link"),
      type: "link",
      pageIndex,
      rect: { ...rect, width: Math.max(rect.width, 160), height: Math.max(rect.height, 28) },
      href,
      opacity: 1,
      createdAt: now,
    }];
  }

  if (activeTool === "stamp") {
    const label = prompt("Stamp label", "APPROVED");
    if (!label) return [];
    return [{
      id: createId("stamp"),
      type: "stamp",
      pageIndex,
      rect: { ...rect, width: Math.max(rect.width, 130), height: Math.max(rect.height, 46) },
      label,
      color: "#b91c1c",
      borderColor: "#b91c1c",
      opacity: 0.9,
      createdAt: now,
    }];
  }

  if (activeTool === "signature") {
    const value = prompt("Signature text", "Akki Pathak");
    if (!value) return [];
    return [{
      id: createId("signature"),
      type: "signature",
      mode: "typed",
      pageIndex,
      rect: { ...rect, width: Math.max(rect.width, 180), height: Math.max(rect.height, 54) },
      value,
      color: DEFAULT_COLORS.signature,
      fontFamily: "EB Garamond",
      opacity: 1,
      createdAt: now,
    }];
  }

  if (activeTool in FORM_KIND_BY_TOOL) {
    const index = operations.filter((operation) => operation.type === "form-field").length + 1;
    const name = prompt("Field name", `${toolLabel(activeTool).replace(/\s+/g, "_").toLowerCase()}_${index}`);
    if (!name) return [];
    const options = activeTool === "form-dropdown"
      ? (prompt("Dropdown options", "Option 1, Option 2") ?? "").split(",").map((option) => option.trim()).filter(Boolean)
      : undefined;
    return [{
      id: createId("form"),
      type: "form-field",
      kind: FORM_KIND_BY_TOOL[activeTool as keyof typeof FORM_KIND_BY_TOOL],
      pageIndex,
      rect: { ...rect, width: Math.max(rect.width, 160), height: Math.max(rect.height, activeTool === "form-multiline" ? 76 : 30) },
      name,
      value: activeTool === "form-signature" ? "Signature" : undefined,
      options,
      checked: activeTool === "form-checkbox" || activeTool === "form-radio" ? false : undefined,
      opacity: 1,
      createdAt: now,
    }];
  }

  if (activeTool === "table-region") {
    return [{
      id: createId("table"),
      type: "table-region",
      pageIndex,
      rect: { ...rect, width: Math.max(rect.width, 240), height: Math.max(rect.height, 120) },
      label: `Table ${operations.filter((operation) => operation.type === "table-region").length + 1}`,
      opacity: 1,
      createdAt: now,
    }];
  }

  return [];
}
