import { buildDetectedCssFontFamily, resolveFont } from "../engine/fontResolver";
import type { EditOperation, EditorTool, TextItem, ViewportRect } from "../types/editor";
import { viewportRectToPdf } from "../utils/coordinates";
import { padReplacementCoverRect } from "../utils/textMetrics";
import { createId } from "../utils/ids";
import { sanitizeUrl } from "../utils/url";
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
  inheritStyleFromTextItem?: TextItem;
  sampledBackgroundColor?: string;
  sampledTextColor?: string;
  sampledFontWeight?: number;
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

function estimateSingleLineTextWidth(text: string, fontSize: number, fontWeight?: number) {
  const uppercaseCount = [...text].filter((char) => /[A-Z]/.test(char)).length;
  const uppercaseRatio = text.length ? uppercaseCount / text.length : 0;
  const weightFactor = (fontWeight ?? 400) >= 600 ? 1.08 : 1;
  const averageGlyphWidth = uppercaseRatio > 0.65 ? 0.64 : 0.56;
  return text.length * fontSize * averageGlyphWidth * weightFactor;
}

export function createOperationsForTool({
  activeTool,
  viewportRect,
  pageHeight,
  pageIndex,
  scale,
  operations,
  prompt,
  sourceTextItem,
  inheritStyleFromTextItem,
  sampledBackgroundColor,
  sampledTextColor,
  sampledFontWeight,
}: CreateOperationInput): EditOperation[] {
  const rect = viewportRectToPdf(viewportRect, pageHeight, scale);
  const now = Date.now();
  const styleTextItem = sourceTextItem ?? inheritStyleFromTextItem;
  const isReplacement = Boolean(sourceTextItem);

  if (activeTool === "text" || sourceTextItem) {
    const sourceFontDescriptor = [styleTextItem?.cssFontFamily, styleTextItem?.fontName].filter(Boolean).join(" ");
    const fontChoice = resolveFont(sourceFontDescriptor);
    const detectedFontWeight = styleTextItem?.fontWeight ?? styleTextItem?.sampledFontWeight;
    // When we recovered the real embedded font name (e.g. "UberMove-Bold"), its weight is
    // authoritative; the canvas ink-coverage heuristic only fills in when the PDF exposes a
    // meaningless subset id (g_d0_f4) and would otherwise false-bold small/anti-aliased text.
    const hasReliableFontName = Boolean(styleTextItem?.fontName && !/^g_d\d+_f\d+$/i.test(styleTextItem.fontName));
    const fontWeight = hasReliableFontName
      ? detectedFontWeight
      : sampledFontWeight && sampledFontWeight >= 600
        ? Math.max(detectedFontWeight ?? 0, sampledFontWeight)
        : detectedFontWeight;
    const italic = Boolean(styleTextItem?.italic);
    const fontSize = Math.max(1, Math.round(styleTextItem?.fontSize ?? 14));
    const text = sourceTextItem?.str ?? "New text";
    const replacementWidth = isReplacement
      ? Math.max(rect.width, estimateSingleLineTextWidth(text, fontSize, fontWeight))
      : Math.max(rect.width, 130);
    const coverRect = isReplacement ? padReplacementCoverRect(rect, fontSize) : undefined;
    return [
      {
        id: createId("text"),
        type: "text",
        pageIndex,
        rect: isReplacement
          ? {
              /* v8 ignore start -- coverRect is always defined when isReplacement is true (padReplacementCoverRect never returns undefined), so the rect fallbacks are unreachable */
              ...(coverRect ?? rect),
              width: Math.max(coverRect?.width ?? rect.width, replacementWidth, 16),
              height: Math.max(coverRect?.height ?? rect.height, fontSize),
              /* v8 ignore stop */
            }
          : { ...rect, width: Math.max(rect.width, 130), height: Math.max(rect.height, 28) },
        text,
        fontFamily: styleTextItem ? fontChoice.label : resolveFont().label,
        cssFontFamily: styleTextItem
          ? buildDetectedCssFontFamily(styleTextItem.cssFontFamily, styleTextItem.fontName)
          : undefined,
        detectedFontName: styleTextItem?.fontName,
        embeddedFontKey: styleTextItem?.fontKey,
        fontSize,
        color: styleTextItem ? (sampledTextColor ?? DEFAULT_COLORS.ink) : DEFAULT_COLORS.ink,
        bold: styleTextItem ? (fontWeight ?? 400) >= 600 : undefined,
        italic: styleTextItem ? italic : undefined,
        fontWeight: styleTextItem ? fontWeight : undefined,
        fontStyle: styleTextItem ? (italic ? "italic" : "normal") : undefined,
        align: "left",
        whiteout: isReplacement,
        whiteoutColor: isReplacement ? (sampledBackgroundColor ?? DEFAULT_COLORS.whiteout) : undefined,
        sourceCoverRect: coverRect
          ? { ...coverRect, width: Math.max(coverRect.width, 16), height: Math.max(coverRect.height, fontSize) }
          : undefined,
        opacity: 1,
        createdAt: now,
      },
    ];
  }

  if (activeTool === "whiteout") {
    return [
      {
        id: createId("whiteout"),
        type: "whiteout",
        pageIndex,
        rect: { ...rect, width: Math.max(rect.width, 120), height: Math.max(rect.height, 34) },
        color: DEFAULT_COLORS.whiteout,
        opacity: 1,
        createdAt: now,
      },
    ];
  }

  if (activeTool === "highlight") {
    return [
      {
        id: createId("annotation"),
        type: "annotation",
        kind: "highlight",
        pageIndex,
        rect: { ...rect, width: Math.max(rect.width, 150), height: Math.max(rect.height, 22) },
        color: DEFAULT_COLORS.highlight,
        opacity: 0.36,
        createdAt: now,
      },
    ];
  }

  if (activeTool === "strikeout" || activeTool === "underline") {
    return [
      {
        id: createId("annotation"),
        type: "annotation",
        kind: activeTool,
        pageIndex,
        rect: { ...rect, width: Math.max(rect.width, 150), height: Math.max(rect.height, 18) },
        color: "#ef4444",
        opacity: 1,
        createdAt: now,
      },
    ];
  }

  if (activeTool === "annotate-text") {
    const text = prompt("Annotation note", "Note");
    if (!text) return [];
    return [
      {
        id: createId("annotation"),
        type: "annotation",
        kind: "note",
        pageIndex,
        rect: { ...rect, width: Math.max(rect.width, 160), height: Math.max(rect.height, 42) },
        color: "#2563eb",
        text,
        opacity: 1,
        createdAt: now,
      },
    ];
  }

  if (
    activeTool === "shape" ||
    activeTool === "shape-ellipse" ||
    activeTool === "shape-line" ||
    activeTool === "shape-arrow"
  ) {
    const kind =
      activeTool === "shape-ellipse"
        ? "ellipse"
        : activeTool === "shape-line"
          ? "line"
          : activeTool === "shape-arrow"
            ? "arrow"
            : "rectangle";
    const isLinear = kind === "line" || kind === "arrow";
    // Respect the drawn area-selection. Linear shapes may be drawn nearly
    // flat, so they get a much smaller minimum than boxed shapes.
    const minSize = isLinear ? 8 : 12;
    return [
      {
        id: createId("shape"),
        type: "shape",
        kind,
        pageIndex,
        rect: { ...rect, width: Math.max(rect.width, minSize), height: Math.max(rect.height, minSize) },
        stroke: "#ef4444",
        fill: "transparent",
        strokeWidth: 2,
        opacity: 1,
        createdAt: now,
      },
    ];
  }

  if (activeTool === "ink" || activeTool === "draw") {
    return [
      {
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
      },
    ];
  }

  if (activeTool === "link") {
    const href = prompt("Link URL", "https://");
    if (!href) return [];
    const safeHref = sanitizeUrl(href);
    if (!safeHref) return [];
    return [
      {
        id: createId("link"),
        type: "link",
        pageIndex,
        rect: { ...rect, width: Math.max(rect.width, 160), height: Math.max(rect.height, 28) },
        href: safeHref,
        opacity: 1,
        createdAt: now,
      },
    ];
  }

  if (activeTool === "stamp") {
    const label = prompt("Stamp label", "APPROVED");
    if (!label) return [];
    return [
      {
        id: createId("stamp"),
        type: "stamp",
        pageIndex,
        rect: { ...rect, width: Math.max(rect.width, 130), height: Math.max(rect.height, 46) },
        label,
        color: "#b91c1c",
        borderColor: "#b91c1c",
        opacity: 0.9,
        createdAt: now,
      },
    ];
  }

  if (activeTool === "signature") {
    const value = prompt("Signature text", "Akki Pathak");
    if (!value) return [];
    return [
      {
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
      },
    ];
  }

  if (activeTool in FORM_KIND_BY_TOOL) {
    const index = operations.filter((operation) => operation.type === "form-field").length + 1;
    const name = prompt("Field name", `${toolLabel(activeTool).replace(/\s+/g, "_").toLowerCase()}_${index}`);
    if (!name) return [];
    const options =
      activeTool === "form-dropdown"
        ? (prompt("Dropdown options", "Option 1, Option 2") ?? "")
            .split(",")
            .map((option) => option.trim())
            .filter(Boolean)
        : undefined;
    return [
      {
        id: createId("form"),
        type: "form-field",
        kind: FORM_KIND_BY_TOOL[activeTool as keyof typeof FORM_KIND_BY_TOOL],
        pageIndex,
        rect: {
          ...rect,
          width: Math.max(rect.width, 160),
          height: Math.max(rect.height, activeTool === "form-multiline" ? 76 : 30),
        },
        name,
        value: activeTool === "form-signature" ? "Signature" : undefined,
        options,
        checked: activeTool === "form-checkbox" || activeTool === "form-radio" ? false : undefined,
        opacity: 1,
        createdAt: now,
      },
    ];
  }

  if (activeTool === "table-region") {
    return [
      {
        id: createId("table"),
        type: "table-region",
        pageIndex,
        rect: { ...rect, width: Math.max(rect.width, 240), height: Math.max(rect.height, 120) },
        label: `Table ${operations.filter((operation) => operation.type === "table-region").length + 1}`,
        opacity: 1,
        createdAt: now,
      },
    ];
  }

  return [];
}
