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
import { isRegionTool } from "../editor/toolRegistry";
import { registerEmbeddedFont } from "../engine/fontRegistry";
import { duplicateOperation as cloneOperation, translatePoints } from "../editor/selectionModel";
import { CanvasHintBanner } from "./CanvasHintBanner";
import { clampRect, pdfRectToViewport, viewportRectToPdf } from "../utils/coordinates";
import { collectAlignmentLines, snapViewportRect, type AlignmentLines, type GuideLine } from "../utils/alignmentGuides";
import { sampleTextBackgroundColor, sampleTextColor, sampleTextFontWeight } from "../utils/canvasTextStyleSampling";
import { validateImageFile } from "../utils/fileValidation";
import { createId } from "../utils/ids";
import { findNearbyTextRunForStyle, groupEditableTextRuns } from "../utils/textRunGrouping";
import { sanitizeUrl } from "../utils/url";
import { viewportRectsOverlap } from "../utils/textMetrics";
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
  // Alignment guide candidates never depend on the dragged rect's own position (the
  // moving operation is excluded from the calculation), so they're computed once here
  // at drag start instead of on every pointermove — the prior per-move recompute over
  // every operation and PDF text item on the page was the dominant cause of drag lag.
  alignmentLines: AlignmentLines;
};

type ResizeState = {
  id: string;
  handle: ResizeHandle;
  startPointer: { x: number; y: number };
  startRect: ViewportRect;
};

const MIN_RESIZE_PX = 8;
// Below this drag distance (px) a region-tool press is treated as a plain click
// and falls back to a comfortable default size rather than the tiny drawn area.
const DRAW_CLICK_THRESHOLD_PX = 6;
const DRAW_CLICK_FALLBACK = { width: 160, height: 80 };

type DrawState = {
  start: { x: number; y: number };
  current: { x: number; y: number };
};

function marqueeRect(draw: DrawState) {
  return {
    left: Math.min(draw.start.x, draw.current.x),
    top: Math.min(draw.start.y, draw.current.y),
    width: Math.abs(draw.current.x - draw.start.x),
    height: Math.abs(draw.current.y - draw.start.y),
  };
}

function isResizableOperation(operation: EditOperation) {
  if (operation.type === "text") return false;
  if (operation.type === "shape") return operation.kind === "rectangle" || operation.kind === "ellipse";
  if (operation.type === "annotation") return operation.kind === "highlight" || operation.kind === "note";
  if (operation.type === "ink" || operation.type === "link") return false;
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
  // Tracks whether the in-progress drag/resize actually moved the pointer. Used two
  // ways: (1) a plain click (press + release with no movement) resolves to a
  // tool-specific action (toggle a checkbox, enter text edit) instead of a no-op move;
  // (2) the stage's onClick guards against the native `click` a real browser fires
  // right after `pointerup`, even when that pointerup ended an actual drag/resize —
  // without it, a completed drag would fall through to "click on empty canvas" and
  // place a stray new operation at the release point.
  const dragMoved = useRef(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [draw, setDraw] = useState<DrawState | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
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
    const stage = stageRef.current;
    if (!stage || !isPageRendered) return;

    const coverViewportRects = replacedSourceRects.map((coverRect) =>
      pdfRectToViewport(coverRect, pageHeight, scale),
    );

    const suppressReplacedTextLayer = () => {
      const textLayer = stage.querySelector(".react-pdf__Page__textContent");
      if (!textLayer || coverViewportRects.length === 0) {
        textLayer?.querySelectorAll("span[data-akki-suppressed]").forEach((span) => {
          span.removeAttribute("data-akki-suppressed");
          (span as HTMLElement).style.visibility = "";
        });
        return;
      }

      const stageBounds = stage.getBoundingClientRect();
      textLayer.querySelectorAll("span").forEach((span) => {
        const spanBounds = span.getBoundingClientRect();
        const spanRect = {
          left: spanBounds.left - stageBounds.left,
          top: spanBounds.top - stageBounds.top,
          width: spanBounds.width,
          height: spanBounds.height,
        };
        const hidden = coverViewportRects.some((coverRect) => viewportRectsOverlap(spanRect, coverRect));
        const isSuppressed = span.getAttribute("data-akki-suppressed") === "true";
        // Only write when the state actually changes — otherwise our own
        // `style` mutations re-trigger the observer and add needless layout work.
        if (hidden && !isSuppressed) {
          span.setAttribute("data-akki-suppressed", "true");
          (span as HTMLElement).style.visibility = "hidden";
        } else if (!hidden && isSuppressed) {
          span.removeAttribute("data-akki-suppressed");
          (span as HTMLElement).style.visibility = "";
        }
      });
    };

    suppressReplacedTextLayer();
    // Nothing to keep suppressed: skip the observer entirely (the call above
    // already cleared any stale suppression) so idle pages do no extra work.
    if (coverViewportRects.length === 0) return;

    const observer = new MutationObserver(suppressReplacedTextLayer);
    observer.observe(stage, { childList: true, subtree: true, attributes: true, attributeFilter: ["style"] });

    return () => {
      observer.disconnect();
      stage.querySelectorAll("span[data-akki-suppressed]").forEach((span) => {
        span.removeAttribute("data-akki-suppressed");
        (span as HTMLElement).style.visibility = "";
      });
    };
  }, [isPageRendered, replacedSourceRects, pageHeight, scale, stageRef]);

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
    if (!draw) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDraw(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [draw]);

  // Surface the in-page hint when a tool is armed (or a draw starts/ends) and
  // auto-dismiss it after a few seconds so it doesn't linger over the page.
  useEffect(() => {
    if (activeTool === "select") {
      setHintVisible(false);
      return;
    }
    setHintVisible(true);
    const timer = window.setTimeout(() => setHintVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, [activeTool, draw]);

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
    } else if (nextOperations[0]) {
      // Select the freshly drawn op (shape, whiteout, …) so its inline toolbar
      // and resize handles appear immediately — reference parity for shapes.
      onOperationSelect(nextOperations[0].id);
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
          className={`page-stage ${activeTool === "text" ? "is-text-tool" : ""}`}
          style={{
            width: pageWidth * scale,
            minHeight: pageHeight * scale,
          }}
          onPointerDown={(event) => {
            // Deselect only when pressing empty page area, so selecting an overlay
            // never gets cleared by a follow-up click (keeps its toolbar persistent).
            const target = event.target as HTMLElement;
            const isEmptyArea = target === event.currentTarget || target.classList.contains("react-pdf__Page__canvas");
            if (!isEmptyArea) return;
            if (activeTool === "select") {
              onOperationSelect(undefined);
              return;
            }
            // Region tools (shapes, whiteout, links, forms, …) draw via an area
            // selection: press → drag → release. Start the marquee here.
            if (!isRegionTool(activeTool)) return;
            /* v8 ignore next -- pointerdown fires only inside the mounted stage, so stageRef.current is always populated */
            if (!stageRef.current) return;
            onOperationSelect(undefined);
            stageRef.current.setPointerCapture(event.pointerId);
            const point = pointFromEvent(event, event.currentTarget);
            setDraw({ start: point, current: point });
          }}
          onClick={(event) => {
            // A real browser fires a native `click` right after `pointerup`, even when
            // that pointerup ended an actual drag (mousedown -> move -> mouseup over a
            // different spot still counts as a "click" at the release point). Without
            // this guard, a completed drag on an overlay would fall through to "click
            // on empty canvas" and place a stray new operation at the release point.
            if (dragMoved.current) {
              dragMoved.current = false;
              return;
            }
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
            // Region tools create on pointer-up via the drag-to-draw marquee.
            if (isRegionTool(activeTool)) return;
            const point = pointFromEvent(event, event.currentTarget);
            void addAt({ left: point.x, top: point.y, width: 160, height: 42 });
          }}
          onPointerMove={(event) => {
            if (draw) {
              /* v8 ignore next -- pointermove during a draw always has the mounted stage ref */
              if (!stageRef.current) return;
              const point = pointFromEvent(event, stageRef.current);
              setDraw({ start: draw.start, current: point });
              return;
            }
            if (resize && stageRef.current) {
              // Reuses the same drag-vs-click flag as overlay dragging: a real browser
              // fires a native `click` right after this resize's `pointerup`, and the
              // stage's onClick would otherwise treat it as "click on empty canvas".
              dragMoved.current = true;
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
                /* v8 ignore next -- west-handle min-clamp branch; the opposite-axis handle combination is exercised by the e2e resize suite */
                if (resize.handle.includes("w")) left = resize.startRect.left + resize.startRect.width - MIN_RESIZE_PX;
                width = MIN_RESIZE_PX;
              }
              if (height < MIN_RESIZE_PX) {
                /* v8 ignore next -- north-handle min-clamp branch; the opposite-axis handle combination is exercised by the e2e resize suite */
                if (resize.handle.includes("n")) top = resize.startRect.top + resize.startRect.height - MIN_RESIZE_PX;
                height = MIN_RESIZE_PX;
              }
              const rect = clampRect(viewportRectToPdf({ left, top, width, height }, pageHeight, scale), pageWidth, pageHeight);
              onOperationUpdate(resize.id, { rect } as Partial<EditOperation>);
              return;
            }
            if (!drag || !stageRef.current) return;
            dragMoved.current = true;
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
            // `drag.alignmentLines` was computed once at drag start (see the overlay's
            // onPointerDown) — it never depends on the moving rect's current position,
            // so recomputing it on every move here was pure wasted work.
            const snapped = snapViewportRect(viewportRect, drag.alignmentLines);
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
            if (draw) {
              const rect = marqueeRect(draw);
              const dragged = rect.width >= DRAW_CLICK_THRESHOLD_PX || rect.height >= DRAW_CLICK_THRESHOLD_PX;
              const viewportRect = dragged
                ? rect
                : { left: draw.start.x, top: draw.start.y, ...DRAW_CLICK_FALLBACK };
              setDraw(null);
              void addAt(viewportRect);
            }
            // A press-and-release with no movement in between is a click, not a
            // completed (no-op) move — resolve it to whatever a plain click on this
            // overlay/tool combination means, instead of leaving the gesture inert.
            if (drag && !dragMoved.current) {
              const pressedOperation = operations.find((operation) => operation.id === drag.id);
              if (activeTool === "text" && pressedOperation?.type === "text" && editingTextId !== pressedOperation.id) {
                // Reference-style click-to-edit: only fires when the click didn't drag.
                setEditingTextId(pressedOperation.id);
              }
            }
            setDrag(null);
            setResize(null);
            setActiveGuides([]);
            setMoveModeOperationId(undefined);
          }}
          onPointerCancel={() => {
            setDraw(null);
            setDrag(null);
            setResize(null);
            setActiveGuides([]);
            setMoveModeOperationId(undefined);
          }}
          onLostPointerCapture={() => {
            setDraw(null);
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

          <div className={`text-hit-layer ${canPickExistingText ? "is-active" : ""}`} aria-hidden={canPickExistingText ? undefined : true}>
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

          <div className="guides-layer" aria-hidden="true">
            {activeGuides.map((guide, index) => (
              <div
                key={`${guide.orientation}-${guide.position}-${index}`}
                className={`guide guide--${guide.orientation}${guide.snapped ? " is-snapped" : ""}`}
                style={guide.orientation === "horizontal" ? { top: guide.position } : { left: guide.position }}
              />
            ))}
          </div>

          {draw ? <div className="draw-marquee" aria-hidden="true" style={marqueeRect(draw)} /> : null}

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
                  /* v8 ignore next -- onResizeStart only fires from handles rendered inside the mounted stage, so stageRef.current is always populated */
                  if (!stageRef.current) return;
                  try {
                    stageRef.current.setPointerCapture(event.pointerId);
                  } catch {
                    // setPointerCapture can throw for non-active pointer ids; capture is an enhancement, not required.
                  }
                  const point = pointFromEvent(event, stageRef.current);
                  dragMoved.current = false;
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
                  // A drag can start regardless of which tool is active or which overlay
                  // type this is — moving an existing element must never depend on the
                  // active tool. Whether this gesture turns out to be a plain click (e.g.
                  // "enter text edit", "toggle checkbox") or an actual move is decided at
                  // pointerup based on whether the pointer moved (see dragMoved / onPointerUp).
                  if (!canDragOperation(operation, editingTextId)) return;
                  /* v8 ignore next -- this handler only fires for overlays rendered inside the mounted stage, so stageRef.current is always populated */
                  if (!stageRef.current) return;
                  stageRef.current.setPointerCapture(event.pointerId);
                  const point = pointFromEvent(event, stageRef.current);
                  const pdfPoint = viewportRectToPdf({ left: point.x, top: point.y, width: 1, height: 1 }, pageHeight, scale);
                  const alignmentLines = collectAlignmentLines({
                    movingId: operation.id,
                    operations,
                    textItems,
                    pageIndex,
                    pageWidth,
                    pageHeight,
                    scale,
                  });
                  dragMoved.current = false;
                  setDrag({ id: operation.id, start: pdfPoint, origin: { x: operation.rect.x, y: operation.rect.y }, alignmentLines });
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

      {activeTool !== "select" && !editingTextId && !drag && !resize && (hintVisible || draw) ? (
        <CanvasHintBanner tool={activeTool} drawing={Boolean(draw)} />
      ) : null}

      <button className="floating-image" disabled={activeTool !== "image"} onClick={() => imageInputRef.current?.click()}>
        <ImagePlus aria-hidden="true" />
        Image
      </button>
    </div>
  );
}
