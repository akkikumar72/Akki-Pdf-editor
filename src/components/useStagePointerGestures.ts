import { useEffect, useRef, useState, type MutableRefObject } from "react";
import type { EditOperation, EditorTool, InkOperation, PdfRect, TextItem, ViewportRect } from "../types/editor";
import { isRegionTool } from "../editor/toolRegistry";
import { translatePoints } from "../editor/selectionModel";
import { clampRect, pdfRectToViewport, viewportRectToPdf } from "../utils/coordinates";
import { collectAlignmentLines, snapViewportRect, type AlignmentLines, type GuideLine } from "../utils/alignmentGuides";
import type { ResizeHandle } from "./ResizeHandles";

type DragState = {
  id: string;
  start: { x: number; y: number };
  origin: { x: number; y: number };
  // Alignment guide candidates never depend on the dragged rect's own position (the
  // moving operation is excluded from the calculation), so they're computed once here
  // at drag start instead of on every pointermove — the prior per-move recompute over
  // every operation and PDF text item on the page was the dominant cause of drag lag.
  alignmentLines: AlignmentLines;
  // Updated locally on every pointermove; only dispatched to the reducer once,
  // at gesture end, so a drag doesn't force a full operations-array rebuild
  // (and re-render of every overlay) on every frame.
  livePatch?: Partial<EditOperation>;
};

type ResizeState = {
  id: string;
  handle: ResizeHandle;
  startPointer: { x: number; y: number };
  startRect: ViewportRect;
  // Same deferred-commit strategy as DragState.livePatch.
  liveRect?: PdfRect;
};

export type DrawState = {
  start: { x: number; y: number };
  current: { x: number; y: number };
};

const MIN_RESIZE_PX = 8;
// Below this drag distance (px) a region-tool press is treated as a plain click
// and falls back to a comfortable default size rather than the tiny drawn area.
const DRAW_CLICK_THRESHOLD_PX = 6;
const DRAW_CLICK_FALLBACK = { width: 160, height: 80 };

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
  /** Called whenever a gesture ends (pointerup/cancel/lost-capture), to clear any UI-level "move mode" toggle. */
  clearMoveMode: () => void;
  onOperationSelect: (id?: string) => void;
  onOperationUpdate: (id: string, patch: Partial<EditOperation>) => void;
  /** Records where to place a new image and opens the file picker; the image tool's placement flow lives in the component. */
  onImageToolClick: (point: { x: number; y: number }) => void;
  /** Creates operation(s) for the active tool at a viewport rect (point click or completed drag-to-draw). */
  addAt: (viewportRect: ViewportRect, sourceTextItem?: TextItem) => void;
};

/**
 * Owns the stage's pointer-gesture state machine: draw-to-create (region tools),
 * drag-to-move (existing overlays), resize-by-handle, and click-vs-drag
 * disambiguation. Every future tool with a custom click/drag/resize behavior has
 * one place to extend instead of five scattered handler bodies on the component.
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
  clearMoveMode,
  onOperationSelect,
  onOperationUpdate,
  onImageToolClick,
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
  const [activeGuides, setActiveGuides] = useState<GuideLine[]>([]);

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

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
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
      // Selection/deselection is handled on pointer down for empty area.
      return;
    }
    if (activeTool === "image") {
      onImageToolClick(pointFromEvent(event, event.currentTarget));
      return;
    }
    // Region tools create on pointer-up via the drag-to-draw marquee.
    if (isRegionTool(activeTool)) return;
    const point = pointFromEvent(event, event.currentTarget);
    addAt({ left: point.x, top: point.y, width: 160, height: 42 });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
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
      // Local-only update: the reducer commit (and the full operations-array
      // rebuild + overlay re-render it triggers) happens once, at gesture end.
      /* v8 ignore next -- this updater only runs while `resize` is non-null (checked above), so `current` is always truthy */
      setResize((current) => (current ? { ...current, liveRect: rect } : current));
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
    // `drag.alignmentLines` was computed once at drag start (see
    // `handleOverlayPointerDown` below) — it never depends on the moving rect's
    // current position, so recomputing it on every move here was pure wasted work.
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
    // Local-only update; committed once at gesture end (see finishGesture).
    /* v8 ignore next -- this updater only runs while `drag` is non-null (checked above), so `current` is always truthy */
    setDrag((current) => (current ? { ...current, livePatch: patch } : current));
  };

  /** Dispatches the accumulated local drag/resize position (if any) to the reducer. */
  const commitLiveGesture = () => {
    if (drag?.livePatch) onOperationUpdate(drag.id, drag.livePatch);
    if (resize?.liveRect) onOperationUpdate(resize.id, { rect: resize.liveRect } as Partial<EditOperation>);
  };

  const finishGesture = () => {
    commitLiveGesture();
    setDraw(null);
    setDrag(null);
    setResize(null);
    setActiveGuides([]);
    clearMoveMode();
  };

  const onPointerUp = () => {
    if (draw) {
      const rect = marqueeRect(draw);
      const dragged = rect.width >= DRAW_CLICK_THRESHOLD_PX || rect.height >= DRAW_CLICK_THRESHOLD_PX;
      const viewportRect = dragged
        ? rect
        : { left: draw.start.x, top: draw.start.y, ...DRAW_CLICK_FALLBACK };
      addAt(viewportRect);
    }
    // A press-and-release with no movement in between is a click, not a
    // completed (no-op) move — resolve it to whatever a plain click on this
    // overlay/tool combination means, instead of leaving the gesture inert.
    if (drag) {
      if (!dragMoved.current) {
        const pressedOperation = operations.find((operation) => operation.id === drag.id);
        if (activeTool === "text" && pressedOperation?.type === "text" && editingTextId !== pressedOperation.id) {
          // Reference-style click-to-edit: only fires when the click didn't drag.
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
    setResize({
      id: operation.id,
      handle,
      startPointer: point,
      startRect: pdfRectToViewport(operation.rect, pageHeight, scale),
    });
  };

  const handleOverlayPointerDown = (operation: EditOperation, event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    onOperationSelect(operation.id);
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
  };

  return {
    draw,
    drag,
    resize,
    activeGuides,
    stagePointerHandlers: {
      onPointerDown,
      onClick,
      onPointerMove,
      onPointerUp,
      onPointerCancel: finishGesture,
      onLostPointerCapture: finishGesture,
    },
    handleResizeStart,
    handleOverlayPointerDown,
  };
}
