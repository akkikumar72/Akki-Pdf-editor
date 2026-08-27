import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { EditOperation, EditOperationPatch, EditorTool, InkOperation, PdfPoint, PdfRect, TextItem, ViewportRect } from "../types/editor";
import { strokeIntersectsEraser } from "../editor/strokeEraser";
import { isRegionTool } from "../editor/toolRegistry";
import { StrokeSampler } from "../editor/strokeSampling";
import { clampRect, pdfPointToViewport, pdfRectToViewport, viewportRectToPdf } from "../utils/coordinates";
import { collectAlignmentLines, snapViewportRect, type AlignmentLines, type GuideLine } from "../utils/alignmentGuides";
import { viewportRectsOverlap } from "../utils/textMetrics";
import type { ResizeHandle } from "./ResizeHandles";

export type DragState = {
  /** Every operation moving in this gesture (the pressed op plus, for a group drag, the rest of the selection). */
  ids: string[];
  /** The op the pointer went down on; snapping and clamping are computed against its rect. */
  primaryId: string;
  /** Whether the pressed operation was already selected before pointer-down.
   *  A no-move second click on selected text enters inline editing. */
  wasSelected: boolean;
  start: { x: number; y: number };
  origins: Record<string, { x: number; y: number }>;
  // Alignment guide candidates never depend on the dragged rects' own positions (the
  // moving operations are excluded from the calculation), so they're computed once here
  // at drag start instead of on every pointermove — the prior per-move recompute over
  // every operation and PDF text item on the page was the dominant cause of drag lag.
  alignmentLines: AlignmentLines;
  // Updated locally on every pointermove; only dispatched to the reducer once,
  // at gesture end (as a single `translate`), so a drag doesn't force a full
  // operations-array rebuild (and re-render of every overlay) on every frame.
  liveDelta?: { dx: number; dy: number };
};

type ResizeState = {
  id: string;
  handle: ResizeHandle;
  startPointer: { x: number; y: number };
  startRect: ViewportRect;
  linearGeometry?: {
    rect: PdfRect;
    start: PdfPoint;
    end: PdfPoint;
  };
  // Same deferred-commit strategy as DragState.liveDelta.
  liveRect?: PdfRect;
  liveEndpoints?: { start: PdfPoint; end: PdfPoint };
};

export type DrawState = {
  start: { x: number; y: number };
  current: { x: number; y: number };
};

export type InkDrawState = {
  points: PdfPoint[];
};

export type EraseDrawState = {
  current: { x: number; y: number };
  points: PdfPoint[];
  hitIds: string[];
};

const MIN_RESIZE_PX = 8;
// Below this drag distance (px) a region-tool press is treated as a plain click
// and falls back to a comfortable default size rather than the tiny drawn area.
const DRAW_CLICK_THRESHOLD_PX = 6;
const DRAW_CLICK_FALLBACK = { width: 160, height: 80 };
const INK_POINT_MIN_DISTANCE_PX = 2;
const ERASER_RADIUS_PX = 12;
const OVERLAY_DRAG_THRESHOLD_PX = 4;

function isInkTool(tool: EditorTool): tool is "ink" | "draw" | "freehand-highlight" {
  return tool === "ink" || tool === "draw" || tool === "freehand-highlight";
}

function operationsHitByEraser(
  eraserPoints: readonly PdfPoint[],
  operations: EditOperation[],
  pageIndex: number,
  pageHeight: number,
  scale: number,
) {
  return operations
    .filter((operation): operation is InkOperation => operation.type === "ink" && operation.pageIndex === pageIndex && !operation.locked)
    .filter((operation) =>
      strokeIntersectsEraser(
        operation.points.map((point) => pdfPointToViewport(point, pageHeight, scale)),
        eraserPoints,
        { strokeWidth: operation.strokeWidth * scale, eraserRadius: ERASER_RADIUS_PX },
      ))
    .map((operation) => operation.id);
}

export function marqueeRect(draw: DrawState) {
  return {
    left: Math.min(draw.start.x, draw.current.x),
    top: Math.min(draw.start.y, draw.current.y),
    width: Math.abs(draw.current.x - draw.start.x),
    height: Math.abs(draw.current.y - draw.start.y),
  };
}

function canDragOperation(operation: EditOperation, editingTextId?: string) {
  if (operation.type === "text" && editingTextId === operation.id) return false;
  return true;
}

function pointFromEvent(event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>, target: HTMLElement) {
  const bounds = target.getBoundingClientRect();
  return {
    x: event.clientX - bounds.left,
    y: event.clientY - bounds.top,
  };
}

function resizePointWithinRect(point: PdfPoint, source: PdfRect, target: PdfRect): PdfPoint {
  // Operation rectangles are created with positive dimensions and every resize
  // is clamped to MIN_RESIZE_PX, so these affine ratios have non-zero divisors.
  const xRatio = (point.x - source.x) / source.width;
  const yRatio = (point.y - source.y) / source.height;
  return {
    x: target.x + xRatio * target.width,
    y: target.y + yRatio * target.height,
  };
}

type UseStagePointerGesturesArgs = {
  activeTool: EditorTool;
  operations: EditOperation[];
  textItems: TextItem[];
  stageRef: MutableRefObject<HTMLDivElement | null>;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  scale: number;
  editingTextId: string | undefined;
  setEditingTextId: (id: string | undefined) => void;
  /** Current selection; a press on an already-selected overlay starts a group drag of all of them. */
  selectedIds: string[];
  /** Called whenever a gesture ends (pointerup/cancel/lost-capture), to clear any UI-level "move mode" toggle. */
  clearMoveMode: () => void;
  onOperationSelect: (ids: string[], additive?: boolean) => void;
  onOperationUpdate: (id: string, patch: EditOperationPatch) => void;
  /** Commits a completed move of one or more operations as a single undo entry. */
  onOperationsTranslate: (ids: string[], dx: number, dy: number) => void;
  /** Records where to place a new image and opens the file picker; the image tool's placement flow lives in the component. */
  onImageToolClick: (point: { x: number; y: number }) => void;
  /** Commits a sampled freehand pointer path as one undoable ink operation. */
  onInkCommit: (points: PdfPoint[]) => void;
  /** Splits every added ink stroke touched by the eraser path as one undoable action. */
  onEraseCommit: (points: PdfPoint[]) => void;
  /** Leaves a crop selection active so the canvas can offer current/all page actions. */
  onCropSelect: (rect: ViewportRect) => void;
  /**
   * Creates operation(s) for the active tool at a viewport rect (point click or
   * completed drag-to-draw). `clickPoint` is set when a region-tool press
   * resolved to a plain click, so tools that snap to text can target the run
   * under the press instead of the fallback-sized rect.
   */
  addAt: (
    viewportRect: ViewportRect,
    sourceTextItem?: TextItem,
    clickPoint?: { x: number; y: number },
    lineGesture?: DrawState,
  ) => void;
};

/**
 * Owns the stage's pointer-gesture state machine: draw-to-create (region tools),
 * marquee-select (Select tool on empty area), drag-to-move (existing overlays,
 * including group drags of a multi-selection), resize-by-handle, and
 * click-vs-drag disambiguation. Every future tool with a custom click/drag/resize
 * behavior has one place to extend instead of five scattered handler bodies on
 * the component.
 */
export function useStagePointerGestures({
  activeTool,
  operations,
  textItems,
  stageRef,
  pageIndex,
  pageWidth,
  pageHeight,
  scale,
  editingTextId,
  setEditingTextId,
  selectedIds,
  clearMoveMode,
  onOperationSelect,
  onOperationUpdate,
  onOperationsTranslate,
  onImageToolClick,
  onInkCommit,
  onEraseCommit,
  onCropSelect,
  addAt,
}: UseStagePointerGesturesArgs) {
  // Tracks whether the in-progress drag/resize actually moved the pointer. Used two
  // ways: (1) a plain click (press + release with no movement) resolves to a
  // tool-specific action (e.g. entering text edit) instead of a no-op move;
  // (2) the stage's onClick guards against the native `click` a real browser fires
  // right after `pointerup`, even when that pointerup ended an actual drag/resize —
  // without it, a completed drag would fall through to "click on empty canvas" and
  // place a stray new operation at the release point.
  const dragMoved = useRef(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [draw, setDraw] = useState<DrawState | null>(null);
  const [inkDraw, setInkDraw] = useState<InkDrawState | null>(null);
  const [eraseDraw, setEraseDraw] = useState<EraseDrawState | null>(null);
  const [selectDraw, setSelectDraw] = useState<DrawState | null>(null);
  const [activeGuides, setActiveGuides] = useState<GuideLine[]>([]);
  const inkSampler = useRef<StrokeSampler | null>(null);
  const eraserSampler = useRef<StrokeSampler | null>(null);
  const inkPreviewFrame = useRef<number | null>(null);

  const cancelInkPreviewFrame = () => {
    if (inkPreviewFrame.current === null) return;
    window.cancelAnimationFrame(inkPreviewFrame.current);
    inkPreviewFrame.current = null;
  };

  const scheduleInkPreview = (sampler: StrokeSampler) => {
    if (inkPreviewFrame.current !== null) return;
    // A few test/browser shims invoke rAF synchronously. The sentinel keeps the
    // callback from being overwritten with a stale frame id in that case.
    inkPreviewFrame.current = -1;
    const frame = window.requestAnimationFrame(() => {
      inkPreviewFrame.current = null;
      // Clone once per display frame. Pointer events can arrive much faster than
      // paint, so this avoids rebuilding the full SVG points string per event.
      setInkDraw({ points: sampler.points.map((point) => ({ ...point })) });
    });
    if (inkPreviewFrame.current !== null) inkPreviewFrame.current = frame;
  };

  useEffect(() => () => cancelInkPreviewFrame(), []);

  useEffect(() => {
    if (!draw && !inkDraw && !eraseDraw && !selectDraw && !drag && !resize) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (drag || resize) dragMoved.current = true;
      setDraw(null);
      cancelInkPreviewFrame();
      inkSampler.current = null;
      eraserSampler.current = null;
      setInkDraw(null);
      setEraseDraw(null);
      setSelectDraw(null);
      setDrag(null);
      setResize(null);
      setActiveGuides([]);
      if (drag || resize) clearMoveMode();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [draw, inkDraw, eraseDraw, selectDraw, drag, resize, clearMoveMode]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    // Selection changes only apply when pressing empty page area, so selecting
    // an overlay never gets cleared by a follow-up click (keeps its toolbar
    // persistent).
    const target = event.target as HTMLElement;
    const isEmptyArea = target === event.currentTarget || target.classList.contains("react-pdf__Page__canvas");
    if (!isEmptyArea) return;
    /* v8 ignore next -- pointerdown fires only inside the mounted stage, so stageRef.current is always populated */
    if (!stageRef.current) return;
    if (activeTool === "select") {
      // Rubber-band selection: a drag selects every intersected operation on
      // pointerup; a no-drag click still deselects (resolved on pointerup).
      stageRef.current.setPointerCapture(event.pointerId);
      const point = pointFromEvent(event, event.currentTarget);
      setSelectDraw({ start: point, current: point });
      return;
    }
    if (isInkTool(activeTool)) {
      onOperationSelect([]);
      stageRef.current.setPointerCapture(event.pointerId);
      const point = pointFromEvent(event, event.currentTarget);
      dragMoved.current = false;
      inkSampler.current = new StrokeSampler(point, { minDistance: INK_POINT_MIN_DISTANCE_PX });
      setInkDraw({ points: inkSampler.current.points });
      return;
    }
    if (activeTool === "erase") {
      onOperationSelect([]);
      stageRef.current.setPointerCapture(event.pointerId);
      const point = pointFromEvent(event, event.currentTarget);
      dragMoved.current = false;
      eraserSampler.current = new StrokeSampler(point, { minDistance: INK_POINT_MIN_DISTANCE_PX });
      setEraseDraw({
        current: point,
        points: eraserSampler.current.points,
        hitIds: operationsHitByEraser([point], operations, pageIndex, pageHeight, scale),
      });
      return;
    }
    if (activeTool === "crop") {
      onOperationSelect([]);
      stageRef.current.setPointerCapture(event.pointerId);
      const point = pointFromEvent(event, event.currentTarget);
      dragMoved.current = false;
      setDraw({ start: point, current: point });
      return;
    }
    // Region tools (shapes, whiteout, links, forms, …) draw via an area
    // selection: press → drag → release. Start the marquee here.
    if (!isRegionTool(activeTool)) return;
    onOperationSelect([]);
    stageRef.current.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event, event.currentTarget);
    setDraw({ start: point, current: point });
  };

  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
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
      // Selection/deselection is handled by the marquee gesture on pointer up.
      return;
    }
    if (activeTool === "image") {
      onImageToolClick(pointFromEvent(event, event.currentTarget));
      return;
    }
    if (isInkTool(activeTool) || activeTool === "erase" || activeTool === "crop") return;
    // Region tools create on pointer-up via the drag-to-draw marquee.
    if (isRegionTool(activeTool)) return;
    const point = pointFromEvent(event, event.currentTarget);
    addAt({ left: point.x, top: point.y, width: 160, height: 42 });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (eraseDraw) {
      /* v8 ignore next -- pointermove during erasing always has the mounted stage ref */
      if (!stageRef.current) return;
      const point = pointFromEvent(event, stageRef.current);
      const sampler = eraserSampler.current;
      const previous = eraseDraw.current;
      if (!sampler?.add(point)) return;
      const hits = operationsHitByEraser([previous, point], operations, pageIndex, pageHeight, scale);
      const hitIds = [...new Set([...eraseDraw.hitIds, ...hits])];
      dragMoved.current = true;
      setEraseDraw({ current: point, points: sampler.points, hitIds });
      return;
    }
    if (inkDraw) {
      /* v8 ignore next -- pointermove during an ink stroke always has the mounted stage ref */
      if (!stageRef.current) return;
      const point = pointFromEvent(event, stageRef.current);
      const sampler = inkSampler.current;
      if (sampler?.add(point)) {
        dragMoved.current = true;
        scheduleInkPreview(sampler);
      }
      return;
    }
    if (selectDraw) {
      /* v8 ignore next -- pointermove during a select marquee always has the mounted stage ref */
      if (!stageRef.current) return;
      const point = pointFromEvent(event, stageRef.current);
      setSelectDraw({ start: selectDraw.start, current: point });
      return;
    }
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
        // West-handle clamp re-anchors the east edge so the box never jumps.
        if (resize.handle.includes("w")) left = resize.startRect.left + resize.startRect.width - MIN_RESIZE_PX;
        width = MIN_RESIZE_PX;
      }
      if (height < MIN_RESIZE_PX) {
        // North-handle clamp re-anchors the south edge so the box never jumps.
        if (resize.handle.includes("n")) top = resize.startRect.top + resize.startRect.height - MIN_RESIZE_PX;
        height = MIN_RESIZE_PX;
      }
      // Clamp only the edge being dragged. Passing an oversized rectangle to
      // clampRect relocates the whole box, which makes the opposite edge jump
      // when a handle crosses a page boundary.
      const viewportPageWidth = pageWidth * scale;
      const viewportPageHeight = pageHeight * scale;
      if (resize.handle.includes("w")) {
        const right = left + width;
        left = Math.max(0, left);
        width = right - left;
      }
      if (resize.handle.includes("e")) {
        width = Math.min(width, viewportPageWidth - left);
      }
      if (resize.handle.includes("n")) {
        const bottom = top + height;
        top = Math.max(0, top);
        height = bottom - top;
      }
      if (resize.handle.includes("s")) {
        height = Math.min(height, viewportPageHeight - top);
      }
      const rect = clampRect(viewportRectToPdf({ left, top, width, height }, pageHeight, scale), pageWidth, pageHeight);
      const liveEndpoints = resize.linearGeometry
        ? {
            start: resizePointWithinRect(resize.linearGeometry.start, resize.linearGeometry.rect, rect),
            end: resizePointWithinRect(resize.linearGeometry.end, resize.linearGeometry.rect, rect),
          }
        : undefined;
      // Local-only update: the reducer commit (and the full operations-array
      // rebuild + overlay re-render it triggers) happens once, at gesture end.
      /* v8 ignore next -- this updater only runs while `resize` is non-null (checked above), so `current` is always truthy */
      setResize((current) => (current ? { ...current, liveRect: rect, liveEndpoints } : current));
      return;
    }
    if (!drag || !stageRef.current) return;
    const point = pointFromEvent(event, stageRef.current);
    const pdfPoint = viewportRectToPdf({ left: point.x, top: point.y, width: 1, height: 1 }, pageHeight, scale);
    if (!dragMoved.current) {
      // Normal press jitter still counts as the second Edit Text click. Avoid
      // moving or snapping the overlay until the pointer clears this slop.
      const deltaXPx = (pdfPoint.x - drag.start.x) * scale;
      const deltaYPx = (pdfPoint.y - drag.start.y) * scale;
      if (Math.hypot(deltaXPx, deltaYPx) < OVERLAY_DRAG_THRESHOLD_PX) return;
      dragMoved.current = true;
    }
    const primary = operations.find((operation) => operation.id === drag.primaryId);
    if (!primary) return;

    const primaryOrigin = drag.origins[drag.primaryId];
    const nextPdfRect = clampRect(
      {
        x: primaryOrigin.x + (pdfPoint.x - drag.start.x),
        y: primaryOrigin.y + (pdfPoint.y - drag.start.y),
        width: primary.rect.width,
        height: primary.rect.height,
      },
      pageWidth,
      pageHeight,
    );
    let viewportRect = pdfRectToViewport(nextPdfRect, pageHeight, scale);
    // `drag.alignmentLines` was computed once at drag start (see
    // `handleOverlayPointerDown` below) — it never depends on the moving rects'
    // current positions, so recomputing it on every move here was pure wasted work.
    const snapped = snapViewportRect(viewportRect, drag.alignmentLines);
    viewportRect = snapped.rect;
    setActiveGuides(snapped.guides);
    const rect = clampRect(viewportRectToPdf(viewportRect, pageHeight, scale), pageWidth, pageHeight);
    // Clamp one shared delta against every member so the group remains in
    // lockstep without allowing a non-primary member to leave the page.
    let minDx = Number.NEGATIVE_INFINITY;
    let maxDx = Number.POSITIVE_INFINITY;
    let minDy = Number.NEGATIVE_INFINITY;
    let maxDy = Number.POSITIVE_INFINITY;
    for (const id of drag.ids) {
      const member = operations.find((operation) => operation.id === id);
      const origin = drag.origins[id];
      if (!member || !origin) continue;
      minDx = Math.max(minDx, -origin.x);
      maxDx = Math.min(maxDx, pageWidth - member.rect.width - origin.x);
      minDy = Math.max(minDy, -origin.y);
      maxDy = Math.min(maxDy, pageHeight - member.rect.height - origin.y);
    }
    const requestedDx = rect.x - primaryOrigin.x;
    const requestedDy = rect.y - primaryOrigin.y;
    const liveDelta = {
      dx: Math.max(minDx, Math.min(requestedDx, maxDx)),
      dy: Math.max(minDy, Math.min(requestedDy, maxDy)),
    };
    // Local-only update; committed once at gesture end (see finishGesture).
    /* v8 ignore next -- this updater only runs while `drag` is non-null (checked above), so `current` is always truthy */
    setDrag((current) => (current ? { ...current, liveDelta } : current));
  };

  /** Dispatches the accumulated local drag/resize position (if any) to the reducer. */
  const commitLiveGesture = () => {
    if (drag?.liveDelta) onOperationsTranslate(drag.ids, drag.liveDelta.dx, drag.liveDelta.dy);
    if (resize?.liveRect) onOperationUpdate(resize.id, { rect: resize.liveRect, ...resize.liveEndpoints });
  };

  const finishGesture = () => {
    commitLiveGesture();
    setDraw(null);
    cancelInkPreviewFrame();
    inkSampler.current = null;
    eraserSampler.current = null;
    setInkDraw(null);
    setEraseDraw(null);
    setSelectDraw(null);
    setDrag(null);
    setResize(null);
    setActiveGuides([]);
    clearMoveMode();
  };

  /**
   * `pointercancel` means the browser aborted the gesture (OS touch takeover,
   * stylus dropout) — the accumulated move/resize must be discarded, never
   * committed. The `lostpointercapture` that follows finds no active gesture
   * and no-ops.
   */
  const discardGesture = () => {
    setDraw(null);
    cancelInkPreviewFrame();
    inkSampler.current = null;
    eraserSampler.current = null;
    setInkDraw(null);
    setEraseDraw(null);
    setSelectDraw(null);
    setDrag(null);
    setResize(null);
    setActiveGuides([]);
    clearMoveMode();
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (eraseDraw) {
      const point = pointFromEvent(event, event.currentTarget);
      // eraseDraw and its sampler are created and cleared in the same state-machine transitions.
      const points = eraserSampler.current!.finish(point);
      onEraseCommit(points);
      dragMoved.current = true;
    }
    if (inkDraw) {
      const point = pointFromEvent(event, event.currentTarget);
      // inkDraw and its sampler are created and cleared in the same state-machine transitions.
      const points = inkSampler.current!.finish(point);
      cancelInkPreviewFrame();
      onInkCommit(points);
      dragMoved.current = true;
    }
    if (selectDraw) {
      const rect = marqueeRect(selectDraw);
      const dragged = rect.width >= DRAW_CLICK_THRESHOLD_PX || rect.height >= DRAW_CLICK_THRESHOLD_PX;
      if (!dragged) {
        // A no-drag click on empty page area still deselects.
        onOperationSelect([]);
      } else {
        const hitIds = operations
          .filter((operation) => viewportRectsOverlap(pdfRectToViewport(operation.rect, pageHeight, scale), rect))
          .map((operation) => operation.id);
        if (event.shiftKey || event.metaKey) {
          // Union with the existing selection: additive `select` toggles, so
          // only feed it the ids that aren't selected yet.
          onOperationSelect(hitIds.filter((id) => !selectedIds.includes(id)), true);
        } else {
          onOperationSelect(hitIds);
        }
      }
    }
    if (draw) {
      const rect = marqueeRect(draw);
      const dragged = rect.width >= DRAW_CLICK_THRESHOLD_PX || rect.height >= DRAW_CLICK_THRESHOLD_PX;
      const viewportRect = dragged
        ? rect
        : { left: draw.start.x, top: draw.start.y, ...DRAW_CLICK_FALLBACK };
      if (activeTool === "crop") {
        if (dragged) onCropSelect(viewportRect);
      } else {
        addAt(viewportRect, undefined, dragged ? undefined : draw.start, dragged ? draw : undefined);
      }
    }
    // A press-and-release with no movement in between is a click, not a
    // completed (no-op) move — resolve it to whatever a plain click on this
    // overlay/tool combination means, instead of leaving the gesture inert.
    if (drag) {
      if (!dragMoved.current) {
        const pressedOperation = operations.find((operation) => operation.id === drag.primaryId);
        if (
          pressedOperation?.type === "text" &&
          editingTextId !== pressedOperation.id &&
          (activeTool === "text" || (activeTool === "select" && drag.wasSelected))
        ) {
          // FormaDoc-style select-then-edit: the first click selects, while a
          // no-move second click on that selected run starts text entry.
          setEditingTextId(pressedOperation.id);
        }
      }
      // Consume the synthetic click that follows this pointerup. Pointer
      // capture retargets it to the stage, so a press that started on an
      // overlay would otherwise read as "click on empty canvas" and place
      // a stray NEW operation at the release point (with the Text tool this
      // dropped a second placeholder box on top of the one being edited).
      dragMoved.current = true;
    }
    finishGesture();
  };

  const handleResizeStart = (handle: ResizeHandle, event: React.PointerEvent<HTMLElement>, operation: EditOperation) => {
    /* v8 ignore next -- onResizeStart only fires from handles rendered inside the mounted stage, so stageRef.current is always populated */
    if (!stageRef.current) return;
    try {
      stageRef.current.setPointerCapture(event.pointerId);
    } catch {
      // setPointerCapture can throw for non-active pointer ids; capture is an enhancement, not required.
    }
    const point = pointFromEvent(event, stageRef.current);
    dragMoved.current = false;
    const linearGeometry = operation.type === "shape" && (operation.kind === "line" || operation.kind === "arrow")
      ? {
          rect: operation.rect,
          start: operation.start ?? { x: operation.rect.x, y: operation.rect.y },
          end: operation.end ?? {
            x: operation.rect.x + operation.rect.width,
            y: operation.rect.y + operation.rect.height,
          },
        }
      : undefined;
    setResize({
      id: operation.id,
      handle,
      startPointer: point,
      startRect: pdfRectToViewport(operation.rect, pageHeight, scale),
      linearGeometry,
    });
  };

  const handleOverlayPointerDown = (operation: EditOperation, event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (activeTool === "erase") {
      /* v8 ignore next -- overlays only render inside the mounted stage */
      if (!stageRef.current) return;
      stageRef.current.setPointerCapture(event.pointerId);
      const point = pointFromEvent(event, stageRef.current);
      dragMoved.current = false;
      eraserSampler.current = new StrokeSampler(point, { minDistance: INK_POINT_MIN_DISTANCE_PX });
      setEraseDraw({
        current: point,
        points: eraserSampler.current.points,
        hitIds: operationsHitByEraser([point], operations, pageIndex, pageHeight, scale),
      });
      return;
    }
    // Shift/Cmd-click toggles the pressed overlay in and out of the selection
    // set (Sejda-style multi-select) and never starts a drag.
    if (event.shiftKey || event.metaKey) {
      onOperationSelect([operation.id], true);
      return;
    }
    // Pressing an already-selected member keeps the selection and drags the
    // whole group; pressing anything else replaces the selection first.
    const isGroupDrag = selectedIds.includes(operation.id);
    if (!isGroupDrag) onOperationSelect([operation.id]);
    // A drag can start regardless of which tool is active or which overlay
    // type this is — moving an existing element must never depend on the
    // active tool. Whether this gesture turns out to be a plain click (e.g.
    // "enter text edit") or an actual move is decided at pointerup based on
    // whether the pointer moved (see dragMoved / onPointerUp).
    if (!canDragOperation(operation, editingTextId)) return;
    /* v8 ignore next -- this handler only fires for overlays rendered inside the mounted stage, so stageRef.current is always populated */
    if (!stageRef.current) return;
    stageRef.current.setPointerCapture(event.pointerId);
    const point = pointFromEvent(event, stageRef.current);
    const pdfPoint = viewportRectToPdf({ left: point.x, top: point.y, width: 1, height: 1 }, pageHeight, scale);
    // Group members must exist on this page; stale selection ids (e.g. ops on
    // another page) are left behind.
    const memberIds = isGroupDrag ? selectedIds : [operation.id];
    const origins: Record<string, { x: number; y: number }> = {};
    const ids: string[] = [];
    for (const id of memberIds) {
      const member = id === operation.id ? operation : operations.find((candidate) => candidate.id === id);
      if (!member) continue;
      ids.push(id);
      origins[id] = { x: member.rect.x, y: member.rect.y };
    }
    const alignmentLines = collectAlignmentLines({
      movingIds: ids,
      operations,
      textItems,
      pageIndex,
      pageWidth,
      pageHeight,
      scale,
    });
    dragMoved.current = false;
    setDrag({ ids, primaryId: operation.id, wasSelected: isGroupDrag, start: pdfPoint, origins, alignmentLines });
  };

  return {
    draw,
    inkDraw,
    eraseDraw,
    selectDraw,
    drag,
    resize,
    activeGuides,
    stagePointerHandlers: {
      onPointerDown,
      onClick,
      onPointerMove,
      onPointerUp,
      onPointerCancel: discardGesture,
      onLostPointerCapture: finishGesture,
    },
    handleResizeStart,
    handleOverlayPointerDown,
  };
}
