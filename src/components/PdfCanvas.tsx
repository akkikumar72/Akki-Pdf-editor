import { Document, Page } from "react-pdf";
import { ImagePlus } from "lucide-react";
import { type MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import type {
  DocumentFonts,
  EditOperation,
  EditorTool,
  InkOperation,
  LoadedPdf,
  PdfPoint,
  PdfRect,
  TextOperation,
  TextItem,
  ViewportRect,
} from "../types/editor";
import { createOperationsForTool } from "../editor/operationFactory";
import { registerEmbeddedFont } from "../engine/fontRegistry";
import { duplicateOperation as cloneOperation, translatePoints } from "../editor/selectionModel";
import { clampRect, pdfRectToViewport, viewportRectToPdf } from "../utils/coordinates";
import { collectAlignmentLines, snapViewportRect, type GuideLine } from "../utils/alignmentGuides";
import { validateImageFile } from "../utils/fileValidation";
import { createId } from "../utils/ids";
import { sanitizeUrl } from "../utils/url";
import { FloatingOperationToolbar } from "./FloatingOperationToolbar";
import { OperationOverlay } from "./OperationOverlay";
import { ResizeHandles, type ResizeHandle } from "./ResizeHandles";

type PdfCanvasProps = {
  activeTool: EditorTool;
  document: LoadedPdf;
  documentFonts?: DocumentFonts;
  operations: EditOperation[];
  pageIndex: number;
  pageSize?: { width: number; height: number };
  rotation: number;
  scale: number;
  selectedId?: string;
  stageRef: MutableRefObject<HTMLDivElement | null>;
  textItems: TextItem[];
  onDocumentLoad?: (proxy: unknown) => void;
  onNotice?: (message: string) => void;
  onOperationAdd: (operation: EditOperation) => void;
  onOperationRemove: (id: string) => void;
  onOperationSelect: (id?: string) => void;
  onOperationUpdate: (id: string, patch: Partial<EditOperation>) => void;
};

type DragState = {
  id: string;
  start: PdfPoint;
  origin: PdfPoint;
};

type ResizeState = {
  id: string;
  handle: ResizeHandle;
  startPointer: { x: number; y: number };
  startRect: ViewportRect;
};

const MIN_RESIZE_PX = 8;

function isResizableOperation(operation: EditOperation) {
  if (operation.type === "text") return false;
  if (operation.type === "shape") return operation.kind === "rectangle" || operation.kind === "ellipse";
  if (operation.type === "annotation") return operation.kind === "highlight" || operation.kind === "note";
  if (operation.type === "ink" || operation.type === "link" || operation.type === "form-mark") return false;
  return true;
}

function canDragOperation(operation: EditOperation, editingTextId?: string) {
  if (operation.type === "text" && editingTextId === operation.id) return false;
  return true;
}

function rectsOverlapSignificantly(a: PdfRect, b: PdfRect) {
  const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const overlapArea = overlapX * overlapY;
  const smaller = Math.max(1, Math.min(a.width * a.height, b.width * b.height));
  return overlapArea / smaller >= 0.5;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

function pointFromEvent(event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>, target: HTMLElement) {
  const bounds = target.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

function toHex(value: number) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
}

function rgbToHex(red: number, green: number, blue: number) {
  return `#${toHex(red)}${toHex(green)}${toHex(blue)}`;
}

type CanvasSample = {
  context: CanvasRenderingContext2D;
  rect: { x: number; y: number; width: number; height: number };
};

function hexToRgb(color?: string) {
  const match = color?.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) return undefined;
  return {
    red: Number.parseInt(match[1], 16),
    green: Number.parseInt(match[2], 16),
    blue: Number.parseInt(match[3], 16),
  };
}

function colorDistance(a: { red: number; green: number; blue: number }, b: { red: number; green: number; blue: number }) {
  return Math.hypot(a.red - b.red, a.green - b.green, a.blue - b.blue);
}

function getCanvasSample(stage: HTMLDivElement | null, viewportRect: ViewportRect, padding = 0): CanvasSample | undefined {
  if (!stage) return undefined;
  const canvas = stage?.querySelector(".react-pdf__Page__canvas");
  if (!(canvas instanceof HTMLCanvasElement)) return undefined;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return undefined;

  const stageBounds = stage.getBoundingClientRect();
  const canvasBounds = canvas.getBoundingClientRect();
  const ratioX = canvas.width / Math.max(1, canvasBounds.width);
  const ratioY = canvas.height / Math.max(1, canvasBounds.height);
  const cssRect = {
    left: viewportRect.left + stageBounds.left - canvasBounds.left,
    top: viewportRect.top + stageBounds.top - canvasBounds.top,
    width: viewportRect.width,
    height: viewportRect.height,
  };
  const sampleX = Math.max(0, Math.floor((cssRect.left - padding) * ratioX));
  const sampleY = Math.max(0, Math.floor((cssRect.top - padding) * ratioY));
  const sampleRect = {
    x: sampleX,
    y: sampleY,
    width: Math.min(canvas.width - sampleX, Math.ceil((cssRect.width + padding * 2) * ratioX)),
    height: Math.min(canvas.height - sampleY, Math.ceil((cssRect.height + padding * 2) * ratioY)),
  };
  if (sampleRect.width <= 0 || sampleRect.height <= 0) return undefined;
  return { context, rect: sampleRect };
}

function sampleTextBackgroundColor(stage: HTMLDivElement | null, viewportRect: ViewportRect) {
  const padding = Math.max(2, Math.min(6, Math.min(viewportRect.width, viewportRect.height) * 0.18));
  const sample = getCanvasSample(stage, viewportRect, padding);
  if (!sample) return undefined;

  const image = sample.context.getImageData(sample.rect.x, sample.rect.y, sample.rect.width, sample.rect.height);
  const buckets = new Map<string, { count: number; red: number; green: number; blue: number }>();
  const stride = Math.max(1, Math.floor(Math.min(sample.rect.width, sample.rect.height) / 14));
  for (let y = 0; y < sample.rect.height; y += stride) {
    for (let x = 0; x < sample.rect.width; x += stride) {
      const offset = (y * sample.rect.width + x) * 4;
      const alpha = image.data[offset + 3];
      if (alpha < 250) continue;
      const red = image.data[offset];
      const green = image.data[offset + 1];
      const blue = image.data[offset + 2];
      const key = `${Math.round(red / 12)},${Math.round(green / 12)},${Math.round(blue / 12)}`;
      const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
      bucket.count += 1;
      bucket.red += red;
      bucket.green += green;
      bucket.blue += blue;
      buckets.set(key, bucket);
    }
  }

  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant) return undefined;
  return rgbToHex(dominant.red / dominant.count, dominant.green / dominant.count, dominant.blue / dominant.count);
}

function sampleTextColor(stage: HTMLDivElement | null, viewportRect: ViewportRect, sampledBackgroundColor?: string) {
  const background = hexToRgb(sampledBackgroundColor);
  if (!background) return undefined;
  const sample = getCanvasSample(stage, viewportRect, 1);
  if (!sample) return undefined;

  const image = sample.context.getImageData(sample.rect.x, sample.rect.y, sample.rect.width, sample.rect.height);
  const buckets = new Map<string, { count: number; red: number; green: number; blue: number }>();
  const stride = Math.max(1, Math.floor(Math.min(sample.rect.width, sample.rect.height) / 28));

  for (let y = 0; y < sample.rect.height; y += stride) {
    for (let x = 0; x < sample.rect.width; x += stride) {
      const offset = (y * sample.rect.width + x) * 4;
      const alpha = image.data[offset + 3];
      if (alpha < 220) continue;
      const pixel = {
        red: image.data[offset],
        green: image.data[offset + 1],
        blue: image.data[offset + 2],
      };
      const distance = colorDistance(pixel, background);
      if (distance < 42) continue;
      const key = `${Math.round(pixel.red / 16)},${Math.round(pixel.green / 16)},${Math.round(pixel.blue / 16)}`;
      const bucket = buckets.get(key) ?? { count: 0, red: 0, green: 0, blue: 0 };
      bucket.count += 1;
      bucket.red += pixel.red;
      bucket.green += pixel.green;
      bucket.blue += pixel.blue;
      buckets.set(key, bucket);
    }
  }

  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant || dominant.count < 3) return undefined;
  return rgbToHex(dominant.red / dominant.count, dominant.green / dominant.count, dominant.blue / dominant.count);
}

function sampleTextFontWeight(stage: HTMLDivElement | null, viewportRect: ViewportRect, sampledBackgroundColor?: string) {
  const background = hexToRgb(sampledBackgroundColor);
  if (!background) return undefined;
  const sample = getCanvasSample(stage, viewportRect, 1);
  if (!sample) return undefined;

  const image = sample.context.getImageData(sample.rect.x, sample.rect.y, sample.rect.width, sample.rect.height);
  let inkPixels = 0;
  let opaquePixels = 0;
  const stride = Math.max(1, Math.floor(Math.min(sample.rect.width, sample.rect.height) / 36));

  for (let y = 0; y < sample.rect.height; y += stride) {
    for (let x = 0; x < sample.rect.width; x += stride) {
      const offset = (y * sample.rect.width + x) * 4;
      const alpha = image.data[offset + 3];
      if (alpha < 220) continue;
      opaquePixels += 1;
      const pixel = {
        red: image.data[offset],
        green: image.data[offset + 1],
        blue: image.data[offset + 2],
      };
      if (colorDistance(pixel, background) >= 42) inkPixels += 1;
    }
  }

  if (opaquePixels < 24) return undefined;
  const inkCoverage = inkPixels / opaquePixels;
  if (inkCoverage >= 0.16) return 700;
  if (inkCoverage >= 0.105) return 600;
  if (inkCoverage >= 0.07) return 500;
  return 400;
}

function isGenericCssFontFamily(name?: string) {
  return /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i.test((name ?? "").replace(/^["']|["']$/g, "").trim());
}

function isInternalPdfFontName(name?: string) {
  return /^g_d\d+_f\d+$/i.test((name ?? "").trim());
}

function sameTextLine(a: TextItem, b: TextItem) {
  const aMidY = a.rect.y + a.rect.height / 2;
  const bMidY = b.rect.y + b.rect.height / 2;
  const fontSize = Math.max(1, Math.min(a.fontSize ?? a.rect.height, b.fontSize ?? b.rect.height));
  return Math.abs(aMidY - bMidY) <= Math.max(2, fontSize * 0.42);
}

function styleSpecificityScore(item: TextItem) {
  const weightScore = item.fontWeight ?? 400;
  const familyScore =
    item.cssFontFamily && !isGenericCssFontFamily(item.cssFontFamily)
      ? 90
      : item.fontName && !isInternalPdfFontName(item.fontName)
        ? 70
        : 0;
  const sizeScore = Math.round(item.fontSize ?? item.rect.height);
  return weightScore * 10 + familyScore + sizeScore;
}

function chooseRunStyleItem(items: TextItem[]) {
  return items.reduce((best, item) => (
    styleSpecificityScore(item) > styleSpecificityScore(best) ? item : best
  ), items[0]);
}

function mergeTextRun(items: TextItem[]): TextItem {
  const sorted = [...items].sort((a, b) => a.rect.x - b.rect.x);
  const styleItem = chooseRunStyleItem(sorted);
  const x = Math.min(...sorted.map((item) => item.rect.x));
  const y = Math.min(...sorted.map((item) => item.rect.y));
  const right = Math.max(...sorted.map((item) => item.rect.x + item.rect.width));
  const top = Math.max(...sorted.map((item) => item.rect.y + item.rect.height));
  const text = sorted.reduce((value, item, index) => {
    if (index === 0) return item.str;
    const previous = sorted[index - 1];
    const gap = item.rect.x - (previous.rect.x + previous.rect.width);
    const fontSize = previous.fontSize ?? previous.rect.height;
    const shouldSpace = /\w$/.test(previous.str) && /^\w/.test(item.str)
      ? gap > -Math.max(1, fontSize * 0.08)
      : gap > Math.max(1.5, fontSize * 0.15);
    const space = shouldSpace ? " " : "";
    return `${value}${space}${item.str}`;
  }, "");

  return {
    ...styleItem,
    str: text,
    rect: {
      x,
      y,
      width: right - x,
      height: top - y,
    },
  };
}

function groupEditableTextRuns(items: TextItem[]) {
  const sorted = [...items].sort((a, b) => {
    const lineDelta = (b.rect.y + b.rect.height / 2) - (a.rect.y + a.rect.height / 2);
    return Math.abs(lineDelta) > 2 ? lineDelta : a.rect.x - b.rect.x;
  });
  const runs: TextItem[] = [];
  let current: TextItem[] = [];

  for (const item of sorted) {
    const previous = current[current.length - 1];
    const fontSize = item.fontSize ?? item.rect.height;
    const previousFontSize = previous?.fontSize ?? previous?.rect.height ?? fontSize;
    const gap = previous ? item.rect.x - (previous.rect.x + previous.rect.width) : 0;
    const sameLine = previous ? sameTextLine(previous, item) : true;
    const sameScale = Math.abs(fontSize - previousFontSize) <= Math.max(1.5, Math.min(fontSize, previousFontSize) * 0.18);
    const closeEnough = !previous || gap <= Math.max(10, Math.min(fontSize, previousFontSize) * 1.35);

    if (!previous || (sameLine && sameScale && closeEnough)) {
      current.push(item);
      continue;
    }

    runs.push(mergeTextRun(current));
    current = [item];
  }

  if (current.length) runs.push(mergeTextRun(current));
  return runs;
}

function findNearbyTextRunForStyle(pointRect: ViewportRect, textRuns: TextItem[], pageHeight: number, scale: number) {
  const pointX = pointRect.left + pointRect.width / 2;
  const pointY = pointRect.top + pointRect.height / 2;
  let best: { item: TextItem; score: number } | undefined;

  for (const item of textRuns) {
    const rect = pdfRectToViewport(item.rect, pageHeight, scale);
    const lineCenterY = rect.top + rect.height / 2;
    const yDistance = Math.abs(pointY - lineCenterY);
    const lineTolerance = Math.max(12, rect.height * 1.5);
    if (yDistance > lineTolerance) continue;

    const xDistance = pointX < rect.left
      ? rect.left - pointX
      : pointX > rect.left + rect.width
        ? pointX - (rect.left + rect.width)
        : 0;
    if (xDistance > Math.max(180, rect.height * 18)) continue;

    const score = yDistance * 4 + xDistance;
    if (!best || score < best.score) best = { item, score };
  }

  return best?.item;
}

export function PdfCanvas({
  activeTool,
  document,
  documentFonts,
  operations,
  pageIndex,
  pageSize,
  rotation,
  scale,
  selectedId,
  stageRef,
  textItems,
  onDocumentLoad,
  onNotice,
  onOperationAdd,
  onOperationRemove,
  onOperationSelect,
  onOperationUpdate,
}: PdfCanvasProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePoint = useRef<PdfPoint | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [activeGuides, setActiveGuides] = useState<GuideLine[]>([]);
  const [moveModeOperationId, setMoveModeOperationId] = useState<string | undefined>();
  const [textPreview, setTextPreview] = useState<{ id: string; patch: Partial<TextOperation> } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | undefined>();
  const [isPageRendered, setIsPageRendered] = useState(false);
  const pageWidth = pageSize?.width ?? 612;
  const pageHeight = pageSize?.height ?? 792;
  const selectedOperation = operations.find((operation) => operation.id === selectedId);
  const canPickExistingText = isPageRendered && (activeTool === "select" || activeTool === "text");
  const pdfFile = useMemo(() => ({ data: document.bytes.slice() }), [document.bytes]);
  const editableTextRuns = useMemo(() => groupEditableTextRuns(textItems), [textItems]);
  const replacedSourceRects = useMemo(
    () =>
      operations
        .filter((operation): operation is TextOperation =>
          operation.type === "text" && operation.pageIndex === pageIndex && Boolean(operation.sourceCoverRect))
        .map((operation) => operation.sourceCoverRect!),
    [operations, pageIndex],
  );

  useEffect(() => {
    setIsPageRendered(false);
    setEditingTextId(undefined);
  }, [document.fingerprint, pageIndex, rotation, scale]);

  useEffect(() => {
    if (editingTextId && selectedId !== editingTextId) setEditingTextId(undefined);
  }, [editingTextId, selectedId]);

  useEffect(() => {
    if (editingTextId && editingTextId === moveModeOperationId) setMoveModeOperationId(undefined);
  }, [editingTextId, moveModeOperationId]);

  useEffect(() => {
    if (!selectedId) setMoveModeOperationId(undefined);
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (editingTextId) return;
      const active = window.document.activeElement as HTMLElement | null;
      if (active && (active.isContentEditable || /^(input|textarea|select)$/i.test(active.tagName))) return;
      event.preventDefault();
      onOperationRemove(selectedId);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, editingTextId, onOperationRemove]);

  useEffect(() => {
    if (!documentFonts) return;
    for (const info of Object.values(documentFonts)) registerEmbeddedFont(info.key, info.bytes);
  }, [documentFonts]);

  const addAt = async (viewportRect: ViewportRect, sourceTextItem?: TextItem) => {
    const inheritStyleFromTextItem = sourceTextItem
      ? undefined
      : activeTool === "text"
        ? findNearbyTextRunForStyle(viewportRect, editableTextRuns, pageHeight, scale)
        : undefined;
    const styleSampleRect = sourceTextItem
      ? viewportRect
      : inheritStyleFromTextItem
        ? pdfRectToViewport(inheritStyleFromTextItem.rect, pageHeight, scale)
        : undefined;
    const sampledBackgroundColor = styleSampleRect
      ? sampleTextBackgroundColor(stageRef.current, styleSampleRect)
      : undefined;
    const sampledTextColor = styleSampleRect
      ? sampleTextColor(stageRef.current, styleSampleRect, sampledBackgroundColor)
      : undefined;
    const sampledFontWeight = styleSampleRect
      ? sampleTextFontWeight(stageRef.current, styleSampleRect, sampledBackgroundColor)
      : undefined;
    const nextOperations = createOperationsForTool({
      activeTool,
      viewportRect,
      pageHeight,
      pageIndex,
      scale,
      operations,
      prompt: window.prompt.bind(window),
      sourceTextItem,
      inheritStyleFromTextItem,
      sampledBackgroundColor,
      sampledTextColor,
      sampledFontWeight,
    });
    nextOperations.forEach(onOperationAdd);
    const createdText = nextOperations.find(
      (operation): operation is TextOperation => operation.type === "text",
    );
    if (createdText) {
      onOperationSelect(createdText.id);
      window.requestAnimationFrame(() => setEditingTextId(createdText.id));
    }
  };

  const addLinkForOperation = (operation: EditOperation) => {
    if (operation.type === "link") {
      const href = window.prompt("Link URL", operation.href);
      if (!href) return;
      const safeHref = sanitizeUrl(href);
      if (!safeHref) {
        onNotice?.("Link not added: only http, https, and mailto URLs are allowed.");
        return;
      }
      onOperationUpdate(operation.id, { href: safeHref } as Partial<EditOperation>);
      return;
    }

    const href = window.prompt("Link URL", "https://");
    if (!href) return;
    const safeHref = sanitizeUrl(href);
    if (!safeHref) {
      onNotice?.("Link not added: only http, https, and mailto URLs are allowed.");
      return;
    }
    onOperationAdd({
      id: createId("link"),
      type: "link",
      pageIndex: operation.pageIndex,
      rect: { ...operation.rect },
      href: safeHref,
      opacity: 1,
      createdAt: Date.now(),
    });
  };

  const previewOperation = (operation: EditOperation): EditOperation => {
    if (operation.type !== "text" || textPreview?.id !== operation.id) return operation;
    return { ...operation, ...textPreview.patch };
  };

  return (
    <div className="canvas-workbench">
      <div className="canvas-workbench__topline">
        <span>{document.name}</span>
        <strong>Page {pageIndex + 1}</strong>
        <span>Overlay-first edits · original bytes preserved until export</span>
      </div>

      <div className="document-scroll">
        <div
          ref={stageRef}
          className="page-stage"
          style={{
            width: pageWidth * scale,
            minHeight: pageHeight * scale,
          }}
          onPointerDown={(event) => {
            // Deselect only when pressing empty page area, so selecting an overlay
            // never gets cleared by a follow-up click (keeps its toolbar persistent).
            const target = event.target as HTMLElement;
            const isEmptyArea = target === event.currentTarget || target.classList.contains("react-pdf__Page__canvas");
            if (isEmptyArea && activeTool === "select") {
              onOperationSelect(undefined);
            }
          }}
          onClick={(event) => {
            if (event.target !== event.currentTarget && !(event.target as HTMLElement).classList.contains("react-pdf__Page__canvas")) {
              return;
            }
            if (activeTool === "select") {
              // Selection/deselection is handled on pointer down for empty area.
              return;
            }
            if (activeTool === "image") {
              pendingImagePoint.current = pointFromEvent(event, event.currentTarget);
              imageInputRef.current?.click();
              return;
            }
            const point = pointFromEvent(event, event.currentTarget);
            void addAt({ left: point.x, top: point.y, width: 160, height: 42 });
          }}
          onPointerMove={(event) => {
            if (resize && stageRef.current) {
              const point = pointFromEvent(event, stageRef.current);
              const dx = point.x - resize.startPointer.x;
              const dy = point.y - resize.startPointer.y;
              let { left, top, width, height } = resize.startRect;
              if (resize.handle.includes("e")) width = resize.startRect.width + dx;
              if (resize.handle.includes("s")) height = resize.startRect.height + dy;
              if (resize.handle.includes("w")) {
                left = resize.startRect.left + dx;
                width = resize.startRect.width - dx;
              }
              if (resize.handle.includes("n")) {
                top = resize.startRect.top + dy;
                height = resize.startRect.height - dy;
              }
              if (width < MIN_RESIZE_PX) {
                if (resize.handle.includes("w")) left = resize.startRect.left + resize.startRect.width - MIN_RESIZE_PX;
                width = MIN_RESIZE_PX;
              }
              if (height < MIN_RESIZE_PX) {
                if (resize.handle.includes("n")) top = resize.startRect.top + resize.startRect.height - MIN_RESIZE_PX;
                height = MIN_RESIZE_PX;
              }
              const rect = clampRect(viewportRectToPdf({ left, top, width, height }, pageHeight, scale), pageWidth, pageHeight);
              onOperationUpdate(resize.id, { rect } as Partial<EditOperation>);
              return;
            }
            if (!drag || !stageRef.current) return;
            const point = pointFromEvent(event, stageRef.current);
            const pdfPoint = viewportRectToPdf({ left: point.x, top: point.y, width: 1, height: 1 }, pageHeight, scale);
            const dragged = operations.find((operation) => operation.id === drag.id);
            if (!dragged) return;

            const nextPdfRect = clampRect(
              {
                x: drag.origin.x + (pdfPoint.x - drag.start.x),
                y: drag.origin.y + (pdfPoint.y - drag.start.y),
                width: dragged.rect.width,
                height: dragged.rect.height,
              },
              pageWidth,
              pageHeight,
            );
            let viewportRect = pdfRectToViewport(nextPdfRect, pageHeight, scale);
            const alignmentLines = collectAlignmentLines({
              movingId: drag.id,
              operations,
              textItems,
              pageIndex,
              pageWidth,
              pageHeight,
              scale,
            });
            const snapped = snapViewportRect(viewportRect, alignmentLines);
            viewportRect = snapped.rect;
            setActiveGuides(snapped.guides);
            const rect = clampRect(viewportRectToPdf(viewportRect, pageHeight, scale), pageWidth, pageHeight);
            const patch: Partial<EditOperation> = { rect };
            if (dragged.type === "ink") {
              // Ink renders/exports from absolute `points`, so a moved stroke must
              // translate every point by the same delta the rect moved (shared helper).
              (patch as Partial<InkOperation>).points = translatePoints(
                dragged.points,
                rect.x - dragged.rect.x,
                rect.y - dragged.rect.y,
              );
            }
            onOperationUpdate(drag.id, patch);
          }}
          onPointerUp={() => {
            setDrag(null);
            setResize(null);
            setActiveGuides([]);
            setMoveModeOperationId(undefined);
          }}
          onPointerCancel={() => {
            setDrag(null);
            setResize(null);
            setActiveGuides([]);
            setMoveModeOperationId(undefined);
          }}
          onLostPointerCapture={() => {
            setDrag(null);
            setResize(null);
            setActiveGuides([]);
            setMoveModeOperationId(undefined);
          }}
        >
          <Document
            file={pdfFile}
            loading={<div className="pdf-loading">Rendering PDF...</div>}
            onLoadSuccess={onDocumentLoad}
          >
            <Page
              pageNumber={pageIndex + 1}
              scale={scale}
              rotate={rotation}
              renderAnnotationLayer
              renderTextLayer
              onRenderSuccess={() => setIsPageRendered(true)}
            />
          </Document>

          <div className={`text-hit-layer ${canPickExistingText ? "is-active" : ""}`} aria-hidden={canPickExistingText ? undefined : true} data-export-ignore="">
            {editableTextRuns.map((item, index) => {
              // Hide the hit target once this PDF run has been replaced, so the user
              // can't stack a second replacement (which would create duplicate text).
              if (replacedSourceRects.some((coverRect) => rectsOverlapSignificantly(coverRect, item.rect))) {
                return null;
              }
              const rect = pdfRectToViewport(item.rect, pageHeight, scale);
              return (
                <button
                  key={`${item.str}-${index}`}
                  className="text-hit"
                  style={{
                    left: rect.left,
                    top: rect.top,
                    width: Math.max(rect.width, 16),
                    height: Math.max(rect.height, 12),
                  }}
                  title={`Replace: ${item.str}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    void addAt({ left: rect.left, top: rect.top, width: Math.max(rect.width, 16), height: Math.max(rect.height, 12) }, item);
                  }}
                />
              );
            })}
          </div>

          <div className="guides-layer" aria-hidden="true" data-export-ignore="">
            {activeGuides.map((guide, index) => (
              <div
                key={`${guide.orientation}-${guide.position}-${index}`}
                className={`guide guide--${guide.orientation}${guide.snapped ? " is-snapped" : ""}`}
                style={guide.orientation === "horizontal" ? { top: guide.position } : { left: guide.position }}
              />
            ))}
          </div>

          <div className="operation-layer">
            {operations.map((operation) => {
              if (operation.type !== "text" || !operation.sourceCoverRect) return null;
              const coverRect = pdfRectToViewport(operation.sourceCoverRect, pageHeight, scale);
              return (
                <div
                  key={`source-cover-${operation.id}`}
                  className="operation operation--source-cover"
                  aria-hidden="true"
                  style={{
                    left: coverRect.left,
                    top: coverRect.top,
                    width: coverRect.width,
                    height: coverRect.height,
                    background: operation.whiteoutColor ?? "#fff",
                  }}
                />
              );
            })}
            {selectedOperation ? (
              <FloatingOperationToolbar
                operation={selectedOperation}
                pageWidth={pageWidth}
                rect={pdfRectToViewport(selectedOperation.rect, pageHeight, scale)}
                scale={scale}
                hidden={Boolean(drag)}
                moveModeActive={moveModeOperationId === selectedOperation.id}
                onDelete={onOperationRemove}
                onDuplicate={(operation) => onOperationAdd(cloneOperation(operation))}
                onLink={addLinkForOperation}
                onMoveToggle={() =>
                  setMoveModeOperationId((current) => (current === selectedOperation.id ? undefined : selectedOperation.id))}
                onTextPreview={(id, patch) => setTextPreview(patch ? { id, patch } : null)}
                onUpdate={onOperationUpdate}
              />
            ) : null}
            {selectedOperation && editingTextId !== selectedOperation.id && isResizableOperation(selectedOperation) ? (
              <ResizeHandles
                rect={pdfRectToViewport(selectedOperation.rect, pageHeight, scale)}
                onResizeStart={(handle, event) => {
                  if (!stageRef.current) return;
                  try {
                    stageRef.current.setPointerCapture(event.pointerId);
                  } catch {
                    // setPointerCapture can throw for non-active pointer ids; capture is an enhancement, not required.
                  }
                  const point = pointFromEvent(event, stageRef.current);
                  setResize({
                    id: selectedOperation.id,
                    handle,
                    startPointer: point,
                    startRect: pdfRectToViewport(selectedOperation.rect, pageHeight, scale),
                  });
                }}
              />
            ) : null}
            {operations.map((operation) => (
              <OperationOverlay
                key={operation.id}
                operation={previewOperation(operation)}
                editing={editingTextId === operation.id}
                documentFonts={documentFonts}
                pageHeight={pageHeight}
                scale={scale}
                selected={operation.id === selectedId}
                dragging={drag?.id === operation.id}
                moveModeActive={moveModeOperationId === operation.id}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onOperationSelect(operation.id);
                  // With the Text tool active, clicking a text overlay edits it in place
                  // (Sejda-style) rather than starting a move-drag.
                  if (activeTool === "text" && operation.type === "text") {
                    if (editingTextId !== operation.id) setEditingTextId(operation.id);
                    return;
                  }
                  // Move-drag is only available in Select tool or when move mode is explicitly on.
                  if (activeTool !== "select" && moveModeOperationId !== operation.id) return;
                  if (!canDragOperation(operation, editingTextId)) return;
                  if (!stageRef.current) return;
                  stageRef.current.setPointerCapture(event.pointerId);
                  const point = pointFromEvent(event, stageRef.current);
                  const pdfPoint = viewportRectToPdf({ left: point.x, top: point.y, width: 1, height: 1 }, pageHeight, scale);
                  setDrag({ id: operation.id, start: pdfPoint, origin: { x: operation.rect.x, y: operation.rect.y } });
                }}
                onStartTextEdit={(id) => {
                  onOperationSelect(id);
                  setEditingTextId(id);
                }}
                onTextChange={(id, text) => onOperationUpdate(id, { text } as Partial<EditOperation>)}
                onTextCommit={() => setEditingTextId(undefined)}
              />
            ))}
          </div>

          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              const point = pendingImagePoint.current;
              event.currentTarget.value = "";
              if (!file || !point) return;
              void (async () => {
                const validation = await validateImageFile(file);
                if (!validation.ok) {
                  onNotice?.(validation.reason);
                  pendingImagePoint.current = null;
                  return;
                }
                try {
                  const dataUrl = await readFileAsDataUrl(file);
                  const rect = viewportRectToPdf({ left: point.x, top: point.y, width: 180, height: 120 }, pageHeight, scale);
                  onOperationAdd({
                    id: createId("image"),
                    type: "image",
                    pageIndex,
                    rect,
                    dataUrl,
                    mimeType: file.type === "image/jpeg" ? "image/jpeg" : "image/png",
                    opacity: 1,
                    createdAt: Date.now(),
                  });
                } catch {
                  onNotice?.("Could not read that image file.");
                } finally {
                  pendingImagePoint.current = null;
                }
              })();
            }}
          />
        </div>
      </div>

      <button className="floating-image" disabled={activeTool !== "image"} onClick={() => imageInputRef.current?.click()}>
        <ImagePlus aria-hidden="true" />
        Image
      </button>
    </div>
  );
}
