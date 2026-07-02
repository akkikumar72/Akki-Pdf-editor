import { buildDetectedCssFontFamily, resolveFont } from "../engine/fontResolver";
import type {
  AnnotationOperation,
  EditOperation,
  EditorTool,
  PdfRect,
  TextItem,
  TextOperation,
  ViewportRect,
} from "../types/editor";
import { pdfRectToViewport, viewportRectToPdf } from "../utils/coordinates";
import { padReplacementCoverRect } from "../utils/textMetrics";
import { createId } from "../utils/ids";
import type { TextMatch } from "../utils/textSearch";
import { sanitizeUrl } from "../utils/url";
import { toolLabel } from "./toolRegistry";

/** A single text/textarea field to collect through an inline input popover before creating an operation. */
export type InlineInputField = {
  key: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
  multiline?: boolean;
};

/** Describes the inline popover (if any) `activeTool` needs filled in before `createOperationsForTool` can produce an operation. */
export type InlineInputDescriptor = {
  title: string;
  confirmLabel: string;
  fields: InlineInputField[];
};

type CreateOperationInput = {
  activeTool: EditorTool;
  viewportRect: ViewportRect;
  pageHeight: number;
  pageIndex: number;
  scale: number;
  operations: EditOperation[];
  /** Values resolved from the tool's inline input popover (see `describeInlineInput`), keyed by field. */
  resolvedFields?: Record<string, string>;
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
  "form-signature": "signature",
} as const;

/** Square size (PDF pt) for a freshly placed check mark, before the user resizes it. */
const CHECK_MARK_SIZE = 16;

/** Placeholder for a freshly placed text box (reference parity with Sejda's
 *  "Type your text"). The canvas fully selects it on edit start so the first
 *  keystroke replaces it, and discards the box if it is abandoned unchanged. */
export const NEW_TEXT_PLACEHOLDER = "Type your text";

function estimateSingleLineTextWidth(text: string, fontSize: number, fontWeight?: number) {
  const uppercaseCount = [...text].filter((char) => /[A-Z]/.test(char)).length;
  const uppercaseRatio = text.length ? uppercaseCount / text.length : 0;
  const weightFactor = (fontWeight ?? 400) >= 600 ? 1.08 : 1;
  const averageGlyphWidth = uppercaseRatio > 0.65 ? 0.64 : 0.56;
  return text.length * fontSize * averageGlyphWidth * weightFactor;
}

/**
 * Returns the inline popover fields `activeTool` needs before it can create an
 * operation (annotation note, link URL, stamp label, signature text, form field
 * name/options), or `null` when the tool creates immediately with no text input.
 */
export function describeInlineInput(activeTool: EditorTool, operations: EditOperation[]): InlineInputDescriptor | null {
  if (activeTool === "annotate-text") {
    return {
      title: "Annotation note",
      confirmLabel: "Add note",
      fields: [{ key: "text", label: "Note", defaultValue: "Note" }],
    };
  }
  if (activeTool === "link") {
    return {
      title: "Add link",
      confirmLabel: "Add link",
      fields: [{ key: "href", label: "Link URL", defaultValue: "https://" }],
    };
  }
  if (activeTool === "stamp") {
    return {
      title: "Add stamp",
      confirmLabel: "Add stamp",
      fields: [{ key: "label", label: "Stamp label", defaultValue: "APPROVED" }],
    };
  }
  if (activeTool === "signature") {
    return {
      title: "Add signature",
      confirmLabel: "Add signature",
      fields: [{ key: "value", label: "Signature text", defaultValue: "Akki Pathak" }],
    };
  }
  if (activeTool in FORM_KIND_BY_TOOL) {
    const index = operations.filter((operation) => operation.type === "form-field").length + 1;
    const nameField: InlineInputField = {
      key: "name",
      label: "Field name",
      defaultValue: `${toolLabel(activeTool).replace(/\s+/g, "_").toLowerCase()}_${index}`,
    };
    return {
      title: "Add form field",
      confirmLabel: "Add field",
      fields:
        activeTool === "form-dropdown"
          ? [nameField, { key: "options", label: "Dropdown options", defaultValue: "Option 1, Option 2", placeholder: "Comma-separated" }]
          : [nameField],
    };
  }
  return null;
}

/**
 * Builds a replacement `text` operation (whiteout mask + editable overlay) for an
 * existing PDF text item whose content becomes `replacedText`. Reuses the
 * factory's sourceTextItem branch so the mask/baseline/font math stays in one
 * place; `scale: 1` makes the viewport round-trip lossless. Off-canvas callers
 * (e.g. the Find & Replace dialog) have no style sampling, so the mask falls
 * back to white and the item's detected font drives the styling.
 */
export function createTextItemReplacementOperation(item: TextItem, replacedText: string, pageHeight: number): TextOperation {
  const [operation] = createOperationsForTool({
    activeTool: "text",
    viewportRect: pdfRectToViewport(item.rect, pageHeight, 1),
    pageHeight,
    pageIndex: item.pageIndex,
    scale: 1,
    operations: [],
    sourceTextItem: { ...item, str: replacedText },
  });
  return operation as TextOperation;
}

/** Replacement operation for a single find match: the whole item's text with just that occurrence substituted. */
export function createReplacementOperation(match: TextMatch, replacement: string, pageHeight: number): TextOperation {
  const replacedText =
    match.item.str.slice(0, match.startIndex) + replacement + match.item.str.slice(match.endIndex);
  return createTextItemReplacementOperation(match.item, replacedText, pageHeight);
}

/**
 * Annotation operations for text-snapped rects (one per intersected run line).
 * Unlike the marquee branches in `createOperationsForTool`, these use the rects
 * verbatim — snapped line rects must not be inflated to tool minimum sizes.
 */
export function createSnappedAnnotationOperations(
  tool: "highlight" | "strikeout" | "underline",
  pageIndex: number,
  rects: PdfRect[],
): AnnotationOperation[] {
  const now = Date.now();
  return rects.map((rect) => ({
    id: createId("annotation"),
    type: "annotation",
    kind: tool,
    pageIndex,
    rect,
    color: tool === "highlight" ? DEFAULT_COLORS.highlight : "#ef4444",
    opacity: tool === "highlight" ? 0.36 : 1,
    createdAt: now,
  }));
}

export function createOperationsForTool({
  activeTool,
  viewportRect,
  pageHeight,
  pageIndex,
  scale,
  operations,
  resolvedFields,
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
    const text = sourceTextItem?.str ?? NEW_TEXT_PLACEHOLDER;
    const replacementWidth = isReplacement
      ? Math.max(rect.width, estimateSingleLineTextWidth(text, fontSize, fontWeight))
      : Math.max(rect.width, 130);
    const coverRect = isReplacement ? padReplacementCoverRect(rect, fontSize) : undefined;
    // A brand-new (non-replacement) box has no glyphs to hug yet, so size it to the
    // font's own line height instead of an arbitrary flat constant. `textBaselineTopPaddingPx`
    // pushes glyphs down by (boxHeight - 1.1*fontSize); a box far taller than one line
    // (e.g. the old flat 28px against a 40pt font, or 28px dwarfing a 14pt line inside a
    // 42px click box) visibly drops the caret below the click point.
    const newTextHeight = Math.max(fontSize * 1.15, 16);
    // The incoming viewport rect anchors its TOP edge at the click, which would
    // render the whole line below the cursor. Reference parity (Sejda measured
    // live): the new box is centered vertically ON the click point, so the text
    // originates where the cursor is. The click's PDF-space Y is the rect's top
    // edge (rect.y + rect.height, since PDF rects anchor bottom-left).
    const clickPdfY = rect.y + rect.height;
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
          : {
              ...rect,
              width: Math.max(rect.width, 130),
              height: newTextHeight,
              y: clickPdfY - newTextHeight / 2,
            },
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
    const text = resolvedFields?.text?.trim();
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
    const href = resolvedFields?.href?.trim();
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
    const label = resolvedFields?.label?.trim();
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
    const value = resolvedFields?.value?.trim();
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

  if (activeTool === "mark-check") {
    // Center the mark on the actual click point rather than anchoring its top-left
    // there — an existing printed checkbox is usually small, so centering on the
    // click makes it much easier to land the mark inside it. `rect.x` is exactly the
    // click's PDF-space X (unaffected by the placeholder box's width); `rect.y +
    // rect.height` is the click's PDF-space Y (unaffected by the placeholder height).
    const clickX = rect.x;
    const clickY = rect.y + rect.height;
    return [
      {
        id: createId("mark"),
        type: "form-mark",
        mark: "check",
        pageIndex,
        rect: {
          x: clickX - CHECK_MARK_SIZE / 2,
          y: clickY - CHECK_MARK_SIZE / 2,
          width: CHECK_MARK_SIZE,
          height: CHECK_MARK_SIZE,
        },
        color: DEFAULT_COLORS.ink,
        opacity: 1,
        createdAt: now,
      },
    ];
  }

  if (activeTool in FORM_KIND_BY_TOOL) {
    const name = resolvedFields?.name?.trim();
    if (!name) return [];
    const options =
      activeTool === "form-dropdown"
        ? (resolvedFields?.options ?? "")
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
        checked: activeTool === "form-radio" ? false : undefined,
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
