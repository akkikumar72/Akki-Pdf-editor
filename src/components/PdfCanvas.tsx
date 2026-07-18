import { Document, Page } from "react-pdf";
import { Copy, ImagePlus, Trash2 } from "lucide-react";
import { type MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  DocumentFonts,
  EditOperation,
  EditorTool,
  LoadedPdf,
  PdfPoint,
  PdfRect,
  TextOperation,
  TextItem,
  ViewportRect,
} from "../types/editor";
import {
  createOperationsForTool,
  createSnappedAnnotationOperations,
  describeInlineInput,
  NEW_TEXT_PLACEHOLDER,
} from "../editor/operationFactory";
import { registerEmbeddedFont } from "../engine/fontRegistry";
import { duplicateOperation as cloneOperation, translateOperation } from "../editor/selectionModel";
import {
  createSignatureOperation,
  signaturePayloadFromDraft,
  type SignatureDraft,
} from "../editor/signaturePlacement";
import { CanvasHintBanner } from "./CanvasHintBanner";
import { InlineInputPopover, type PendingInputRequest } from "./InlineInputPopover";
import { LinkPropertiesDialog, type LinkDialogRequest } from "./LinkPropertiesDialog";
import { createLinkOperation } from "../editor/linkTarget";
import { SignatureModal } from "./SignatureModal";
import { SignaturePicker } from "./SignaturePicker";
import { pdfRectToViewport, viewportPointToPdf, viewportRectToPdf } from "../utils/coordinates";
import { sampleTextBackgroundColor, sampleTextColor, sampleTextFontWeight } from "../utils/canvasTextStyleSampling";
import { validateImageFile } from "../utils/fileValidation";
import { createId } from "../utils/ids";
import {
  fitImageIntoBox,
  IMAGE_PLACEMENT_FALLBACK,
  IMAGE_PLACEMENT_MAX,
  loadImageSize,
} from "../utils/imageSizing";
import { deleteSignature, listSignatures, saveSignature, type SavedSignature } from "../utils/storage";
import { findNearbyTextRunForStyle, groupEditableTextRuns } from "../utils/textRunGrouping";
import { annotationRectsForClick, annotationRectsForMarquee } from "../utils/textSelection";
import { viewportRectsOverlap } from "../utils/textMetrics";
import { safeImageSrc } from "../utils/safeImage";
import { FloatingOperationToolbar } from "./FloatingOperationToolbar";
import { OperationOverlay } from "./OperationOverlay";
import { ResizeHandles } from "./ResizeHandles";
import { marqueeRect, useStagePointerGestures } from "./useStagePointerGestures";

type PdfCanvasProps = {
  activeTool: EditorTool;
  document: LoadedPdf;
  documentFonts?: DocumentFonts;
  operations: EditOperation[];
  pageIndex: number;
  pageSize?: { width: number; height: number };
  rotation: number;
  scale: number;
  /** Current Find & Replace match to flag on the page (pink rect), if any. */
  searchHighlight?: { pageIndex: number; rect: PdfRect } | null;
  selectedIds: string[];
  stageRef: MutableRefObject<HTMLDivElement | null>;
  textItems: TextItem[];
  onDocumentLoad?: (proxy: unknown) => void;
  /** Reports how many operations are moving in the live drag (0 when idle), for the "Moving N objects" status. */
  onDraggingChange?: (count: number) => void;
  onNotice?: (message: string) => void;
  onOperationAdd: (operation: EditOperation) => void;
  /** Adds a batch of operations as a single undo entry (text-snapped annotations, group duplicate). */
  onOperationsAdd: (operations: EditOperation[]) => void;
  onOperationRemove: (id: string) => void;
  /** Removes a batch of operations as a single undo entry (multi-select delete). */
  onOperationsRemove: (ids: string[]) => void;
  onOperationSelect: (ids: string[], additive?: boolean) => void;
  /** Commits a completed move of one or more operations as a single undo entry. */
  onOperationsTranslate: (ids: string[], dx: number, dy: number) => void;
  onOperationUpdate: (id: string, patch: Partial<EditOperation>) => void;
};

function isTextAnnotationTool(tool: EditorTool): tool is "highlight" | "strikeout" | "underline" {
  return tool === "highlight" || tool === "strikeout" || tool === "underline";
}

function isResizableOperation(operation: EditOperation) {
  if (operation.type === "text") return false;
  if (operation.type === "shape") return operation.kind === "rectangle" || operation.kind === "ellipse";
  if (operation.type === "annotation") return operation.kind === "highlight" || operation.kind === "note";
  if (operation.type === "ink" || operation.type === "link") return false;
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

export function PdfCanvas({
  activeTool,
  document,
  documentFonts,
  operations,
  pageIndex,
  pageSize,
  rotation,
  scale,
  searchHighlight,
  selectedIds,
  stageRef,
  textItems,
  onDocumentLoad,
  onDraggingChange,
  onNotice,
  onOperationAdd,
  onOperationsAdd,
  onOperationRemove,
  onOperationsRemove,
  onOperationSelect,
  onOperationsTranslate,
  onOperationUpdate,
}: PdfCanvasProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePoint = useRef<PdfPoint | null>(null);
  const [pendingImage, setPendingImage] = useState<{
    dataUrl: string;
    mimeType: "image/png" | "image/jpeg";
    width: number;
    height: number;
  } | null>(null);
  const [ghostPoint, setGhostPoint] = useState<PdfPoint | null>(null);
  const [signatureRequest, setSignatureRequest] = useState<{
    point: PdfPoint;
    saved: SavedSignature[];
    view: "chooser" | "modal";
  } | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const [moveModeOperationId, setMoveModeOperationId] = useState<string | undefined>();
  const [textPreview, setTextPreview] = useState<{ id: string; patch: Partial<TextOperation> } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | undefined>();
  const [pendingInput, setPendingInput] = useState<PendingInputRequest | null>(null);
  const [pendingLink, setPendingLink] = useState<LinkDialogRequest | null>(null);
  const [isPageRendered, setIsPageRendered] = useState(false);
  const pageWidth = pageSize?.width ?? 612;
  const pageHeight = pageSize?.height ?? 792;
  // The single-op chrome (inline toolbar, resize handles) only applies when
  // exactly one operation is selected; a multi-selection gets group chrome.
  const selectedOperation = selectedIds.length === 1
    ? operations.find((operation) => operation.id === selectedIds[0])
    : undefined;
  const selectedPageOperations = operations.filter((operation) => selectedIds.includes(operation.id));
  const canPickExistingText = isPageRendered && (activeTool === "select" || activeTool === "text");
  const pdfFile = useMemo(() => ({ data: document.bytes.slice() }), [document.bytes]);
  const editableTextRuns = useMemo(() => groupEditableTextRuns(textItems), [textItems]);
  const searchHighlightRect =
    searchHighlight && searchHighlight.pageIndex === pageIndex
      ? pdfRectToViewport(searchHighlight.rect, pageHeight, scale)
      : undefined;
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
    // The popover's anchor is a viewport rect for the page/scale it opened at, so
    // it goes stale the moment any of those change. Same for the signature
    // picker's anchor and the image ghost's viewport position.
    setPendingInput(null);
    setPendingLink(null);
    setSignatureRequest(null);
    setPendingImage(null);
    setGhostPoint(null);
  }, [document.fingerprint, pageIndex, rotation, scale]);

  useEffect(() => {
    setPendingInput(null);
    setPendingLink(null);
    setSignatureRequest(null);
    setPendingImage(null);
    setGhostPoint(null);
  }, [activeTool]);

  useEffect(() => {
    if (!pendingImage) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPendingImage(null);
      setGhostPoint(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [pendingImage]);

  useEffect(() => {
    if (editingTextId && (selectedIds.length !== 1 || selectedIds[0] !== editingTextId)) setEditingTextId(undefined);
  }, [editingTextId, selectedIds]);

  // Sejda-style unused-edit cleanup: whenever a text edit session ends (commit,
  // Escape, click-away, selection change), a freshly placed box that is still
  // empty or still holds the untouched placeholder is discarded — abandoned
  // "Type your text" boxes never pollute the document or the export.
  // Replacements (sourceCoverRect) are exempt: clearing an existing run to
  // empty is the legitimate "delete this text" gesture.
  const previousEditingTextId = useRef<string | undefined>(undefined);
  useEffect(() => {
    const previous = previousEditingTextId.current;
    previousEditingTextId.current = editingTextId;
    if (!previous || previous === editingTextId) return;
    const edited = operations.find((operation) => operation.id === previous);
    if (!edited || edited.type !== "text" || edited.sourceCoverRect) return;
    const text = edited.text.trim();
    if (text === "" || text === NEW_TEXT_PLACEHOLDER) onOperationRemove(edited.id);
  }, [editingTextId, operations, onOperationRemove]);

  useEffect(() => {
    if (editingTextId && editingTextId === moveModeOperationId) setMoveModeOperationId(undefined);
  }, [editingTextId, moveModeOperationId]);

  useEffect(() => {
    if (selectedIds.length === 0) setMoveModeOperationId(undefined);
  }, [selectedIds]);

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

    // The observer watches the whole stage (the text layer node is created
    // asynchronously by react-pdf, so it can't be observed directly from the
    // start), but only text-layer mutations matter. Filtering by target keeps
    // drag/resize frames — which mutate overlay `style` attributes inside the
    // same subtree — from re-running the span scan and its forced reflows.
    // Checking `target.querySelector(...)` (any descendant) instead of the
    // added nodes would match every childList mutation anywhere upstream of
    // the text layer once it exists (overlay mounts/unmounts, toolbar
    // portals, ...), re-triggering the scan far more often than intended.
    const observer = new MutationObserver((mutations) => {
      const touchesTextLayer = mutations.some((mutation) => {
        const target = mutation.target as Element;
        if (target.closest(".react-pdf__Page__textContent")) return true;
        return [...mutation.addedNodes].some(
          (node) =>
            node instanceof Element &&
            (node.matches(".react-pdf__Page__textContent") || node.querySelector(".react-pdf__Page__textContent")),
        );
      });
      if (touchesTextLayer) suppressReplacedTextLayer();
    });
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
    if (selectedIds.length === 0) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (editingTextId) return;
      const active = window.document.activeElement as HTMLElement | null;
      if (active && (active.isContentEditable || /^(input|textarea|select)$/i.test(active.tagName))) return;
      event.preventDefault();
      onOperationsRemove(selectedIds);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIds, editingTextId, onOperationsRemove]);

  useEffect(() => {
    if (!documentFonts) return;
    for (const info of Object.values(documentFonts)) registerEmbeddedFont(info.key, info.bytes);
  }, [documentFonts]);

  const finalizeCreatedOperations = (nextOperations: EditOperation[]) => {
    nextOperations.forEach(onOperationAdd);
    const createdText = nextOperations.find(
      (operation): operation is TextOperation => operation.type === "text",
    );
    if (createdText) {
      onOperationSelect([createdText.id]);
      window.requestAnimationFrame(() => setEditingTextId(createdText.id));
    } else if (nextOperations[0]) {
      // Select the freshly drawn op (shape, whiteout, …) so its inline toolbar
      // and resize handles appear immediately — reference parity for shapes.
      onOperationSelect([nextOperations[0].id]);
    }
  };

  const addAt = async (viewportRect: ViewportRect, sourceTextItem?: TextItem, clickPoint?: { x: number; y: number }) => {
    if (activeTool === "signature") {
      // The signature tool routes through the signature studio: saved
      // signatures get a one-click picker, otherwise the modal opens directly.
      const point = { x: viewportRect.left, y: viewportRect.top };
      let saved: SavedSignature[] = [];
      try {
        saved = await listSignatures();
      } catch {
        saved = [];
      }
      setSignatureRequest({ point, saved, view: saved.length > 0 ? "chooser" : "modal" });
      return;
    }
    if (activeTool === "link") {
      // The link tool routes through the kind-aware properties dialog instead
      // of the generic inline popover.
      const rect = viewportRectToPdf(viewportRect, pageHeight, scale);
      setPendingLink({
        anchor: viewportRect,
        onConfirm: (target) => {
          setPendingLink(null);
          const created = createLinkOperation({ target, pageIndex, rect, enforceMinSize: true });
          /* v8 ignore next -- the dialog only confirms already-sanitized targets, so createLinkOperation never rejects here */
          if (!created) return;
          onOperationAdd(created);
          onOperationSelect([created.id]);
        },
        onCancel: () => setPendingLink(null),
      });
      return;
    }
    // Sejda-style text snapping: with an annotate tool armed, a marquee becomes
    // one annotation per intersected text-run line (clipped to the marquee) and
    // a plain click annotates the whole run under it. No text hit -> fall
    // through to the existing free-rect behavior.
    if (isTextAnnotationTool(activeTool)) {
      const snappedRects = clickPoint
        ? annotationRectsForClick(viewportPointToPdf(clickPoint, pageHeight, scale), editableTextRuns)
        : annotationRectsForMarquee(viewportRectToPdf(viewportRect, pageHeight, scale), editableTextRuns);
      if (snappedRects.length > 0) {
        const created = createSnappedAnnotationOperations(activeTool, pageIndex, snappedRects);
        onOperationsAdd(created);
        onOperationSelect([created[created.length - 1].id]);
        return;
      }
    }
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
    const create = (resolvedFields?: Record<string, string>) =>
      finalizeCreatedOperations(
        createOperationsForTool({
          activeTool,
          viewportRect,
          pageHeight,
          pageIndex,
          scale,
          resolvedFields,
          sourceTextItem,
          inheritStyleFromTextItem,
          sampledBackgroundColor,
          sampledTextColor,
          sampledFontWeight,
        }),
      );

    const inputRequest = describeInlineInput(activeTool, operations);
    if (inputRequest) {
      setPendingInput({
        ...inputRequest,
        anchor: viewportRect,
        onConfirm: (values) => {
          setPendingInput(null);
          create(values);
        },
        onCancel: () => setPendingInput(null),
      });
      return;
    }
    create();
  };

  const addLinkForOperation = (operation: EditOperation) => {
    const existing = operation.type === "link" ? operation : undefined;
    setPendingLink({
      anchor: pdfRectToViewport(operation.rect, pageHeight, scale),
      target: existing?.target,
      onConfirm: (target) => {
        setPendingLink(null);
        if (existing) {
          onOperationUpdate(existing.id, { target } as Partial<EditOperation>);
          return;
        }
        const created = createLinkOperation({ target, pageIndex: operation.pageIndex, rect: operation.rect });
        /* v8 ignore next -- the dialog only confirms already-sanitized targets, so createLinkOperation never rejects here */
        if (!created) return;
        onOperationAdd(created);
      },
      onDelete: existing
        ? () => {
            setPendingLink(null);
            onOperationRemove(existing.id);
          }
        : undefined,
      onCancel: () => setPendingLink(null),
    });
  };

  const previewOperation = (operation: EditOperation): EditOperation => {
    if (operation.type !== "text" || textPreview?.id !== operation.id) return operation;
    return { ...operation, ...textPreview.patch };
  };

  const placeSignature = async (draft: SignatureDraft, point: PdfPoint) => {
    const payload = await signaturePayloadFromDraft(draft);
    const operation = createSignatureOperation({ payload, point, pageIndex, pageHeight, scale });
    onOperationAdd(operation);
    onOperationSelect([operation.id]);
  };

  const onImageToolClick = (point: { x: number; y: number }) => {
    pendingImagePoint.current = point;
    imageInputRef.current?.click();
  };

  const stagePointFromEvent = (event: React.MouseEvent<HTMLDivElement> | React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const { draw, selectDraw, drag, resize, activeGuides, stagePointerHandlers, handleResizeStart, handleOverlayPointerDown } =
    useStagePointerGestures({
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
      clearMoveMode: () => setMoveModeOperationId(undefined),
      onOperationSelect,
      onOperationUpdate,
      onOperationsTranslate,
      onImageToolClick,
      addAt,
    });

  // Feeds the "Moving N objects" status readout while a drag is actually moving.
  useEffect(() => {
    onDraggingChange?.(drag?.liveDelta ? drag.ids.length : 0);
  }, [drag, onDraggingChange]);

  // While an image placement is pending, the ghost follows the pointer and the
  // next stage click commits the operation there; every other stage gesture is
  // suspended so the click can't fall through and create something else.
  const handleStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (pendingImage) {
      setGhostPoint(stagePointFromEvent(event));
      return;
    }
    stagePointerHandlers.onPointerMove(event);
  };

  const handleStageClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (pendingImage) {
      const point = stagePointFromEvent(event);
      const rect = viewportRectToPdf(
        {
          left: point.x - pendingImage.width / 2,
          top: point.y - pendingImage.height / 2,
          width: pendingImage.width,
          height: pendingImage.height,
        },
        pageHeight,
        scale,
      );
      const id = createId("image");
      onOperationAdd({
        id,
        type: "image",
        pageIndex,
        rect,
        dataUrl: pendingImage.dataUrl,
        mimeType: pendingImage.mimeType,
        opacity: 1,
        createdAt: Date.now(),
      });
      onOperationSelect([id]);
      setPendingImage(null);
      setGhostPoint(null);
      return;
    }
    stagePointerHandlers.onClick(event);
  };

  // A drag/resize in progress only updates its own local (undispatched) delta —
  // see useStagePointerGestures — so this overrides the affected operations'
  // rendered positions with that live value instead of the stale committed one.
  // During a group drag every member of drag.ids renders at its live position.
  const gestureOverride = (operation: EditOperation): EditOperation => {
    if (drag?.liveDelta && drag.ids.includes(operation.id)) {
      return translateOperation(operation, drag.liveDelta.dx, drag.liveDelta.dy);
    }
    if (resize?.id === operation.id && resize.liveRect) return { ...operation, rect: resize.liveRect };
    return operation;
  };
  const liveSelectedOperation = selectedOperation ? gestureOverride(selectedOperation) : undefined;

  // Group bounding box (multi-selection): min/max of the live member rects.
  const groupRect = (() => {
    if (selectedPageOperations.length < 2) return undefined;
    const rects = selectedPageOperations.map((operation) =>
      pdfRectToViewport(gestureOverride(operation).rect, pageHeight, scale));
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.left + rect.width));
    const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
    return { left, top, width: right - left, height: bottom - top };
  })();

  // Stable across renders where `operations` hasn't changed (in particular,
  // across every pointermove during one drag/resize gesture, since operations
  // now only changes once at gesture end) so memoized OperationOverlay instances
  // for every *other* operation skip re-rendering during that gesture.
  const handleOverlayPointerDownById = useCallback(
    (id: string, event: React.PointerEvent<HTMLDivElement>) => {
      const target = operations.find((operation) => operation.id === id);
      /* v8 ignore next -- id always comes from an OperationOverlay rendered from this same operations list, so the lookup always resolves */
      if (target) handleOverlayPointerDown(target, event);
    },
    [operations, handleOverlayPointerDown],
  );
  const handleStartTextEdit = useCallback(
    (id: string) => {
      onOperationSelect([id]);
      setEditingTextId(id);
    },
    [onOperationSelect],
  );
  const handleTextChange = useCallback(
    (id: string, text: string) => onOperationUpdate(id, { text } as Partial<EditOperation>),
    [onOperationUpdate],
  );
  const handleTextCommit = useCallback(() => setEditingTextId(undefined), []);

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
          {...stagePointerHandlers}
          onPointerMove={handleStagePointerMove}
          onClick={handleStageClick}
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

          {selectDraw ? <div className="select-marquee" aria-hidden="true" style={marqueeRect(selectDraw)} /> : null}

          {searchHighlightRect ? (
            <div
              className="search-match-highlight"
              aria-hidden="true"
              style={{
                left: searchHighlightRect.left,
                top: searchHighlightRect.top,
                width: searchHighlightRect.width,
                height: searchHighlightRect.height,
              }}
            />
          ) : null}

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
            {selectedOperation && liveSelectedOperation ? (
              <FloatingOperationToolbar
                operation={selectedOperation}
                pageWidth={pageWidth}
                rect={pdfRectToViewport(liveSelectedOperation.rect, pageHeight, scale)}
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
            {selectedOperation && liveSelectedOperation && editingTextId !== selectedOperation.id && isResizableOperation(selectedOperation) ? (
              <ResizeHandles
                rect={pdfRectToViewport(liveSelectedOperation.rect, pageHeight, scale)}
                interacting={Boolean(drag) || Boolean(resize)}
                onResizeStart={(handle, event) => handleResizeStart(handle, event, selectedOperation)}
              />
            ) : null}
            {groupRect ? (
              <>
                <div
                  className="group-selection-outline"
                  aria-hidden="true"
                  style={{
                    left: groupRect.left,
                    top: groupRect.top,
                    width: groupRect.width,
                    height: groupRect.height,
                  }}
                />
                {!drag ? (
                  <div
                    className="group-toolbar"
                    role="toolbar"
                    aria-label={`Selected ${selectedPageOperations.length} objects`}
                    style={{ left: groupRect.left, top: Math.max(8, groupRect.top - 44) }}
                  >
                    <span className="group-toolbar__count">Selected {selectedPageOperations.length} objects</span>
                    <button
                      aria-label="Duplicate selected"
                      title="Duplicate selected"
                      onClick={() => {
                        const duplicates = selectedPageOperations.map(cloneOperation);
                        onOperationsAdd(duplicates);
                        // Keep the whole duplicated group selected (add-many
                        // alone would collapse the selection to the last one).
                        onOperationSelect(duplicates.map((operation) => operation.id));
                      }}
                    >
                      <Copy aria-hidden="true" />
                    </button>
                    <button
                      aria-label="Delete selected"
                      title="Delete selected"
                      onClick={() => onOperationsRemove(selectedIds)}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
            {pendingInput ? (
              <InlineInputPopover request={pendingInput} pageWidth={pageWidth} scale={scale} />
            ) : null}
            {pendingLink ? (
              <LinkPropertiesDialog request={pendingLink} pageCount={document.pageCount} pageWidth={pageWidth} scale={scale} />
            ) : null}
            {operations.map((operation) => (
              <OperationOverlay
                key={operation.id}
                operation={previewOperation(gestureOverride(operation))}
                editing={editingTextId === operation.id}
                documentFonts={documentFonts}
                pageHeight={pageHeight}
                scale={scale}
                selected={selectedIds.includes(operation.id)}
                dragging={Boolean(drag?.ids.includes(operation.id))}
                moveModeActive={moveModeOperationId === operation.id}
                onPointerDown={handleOverlayPointerDownById}
                onStartTextEdit={handleStartTextEdit}
                onTextChange={handleTextChange}
                onTextCommit={handleTextCommit}
              />
            ))}
          </div>

          {pendingImage && ghostPoint ? (
            <div
              className="image-ghost"
              aria-hidden="true"
              style={{
                left: ghostPoint.x - pendingImage.width / 2,
                top: ghostPoint.y - pendingImage.height / 2,
                width: pendingImage.width,
                height: pendingImage.height,
              }}
            >
              {safeImageSrc(pendingImage.dataUrl) ? <img src={safeImageSrc(pendingImage.dataUrl)} alt="" /> : null}
            </div>
          ) : null}

          {signatureRequest?.view === "chooser" ? (
            <SignaturePicker
              anchor={{ left: signatureRequest.point.x, top: signatureRequest.point.y, width: 1, height: 1 }}
              pageWidth={pageWidth}
              scale={scale}
              signatures={signatureRequest.saved}
              onCancel={() => setSignatureRequest(null)}
              onChoose={(saved) => {
                setSignatureRequest(null);
                void placeSignature(saved, signatureRequest.point);
              }}
              onCreateNew={() => setSignatureRequest({ ...signatureRequest, view: "modal" })}
              onDelete={(id) => {
                void deleteSignature(id).catch(() => onNotice?.("Could not delete that saved signature."));
                setSignatureRequest({
                  ...signatureRequest,
                  saved: signatureRequest.saved.filter((signature) => signature.id !== id),
                });
              }}
            />
          ) : null}

          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="visually-hidden"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              const point = pendingImagePoint.current;
              event.currentTarget.value = "";
              pendingImagePoint.current = null;
              if (!file) return;
              void (async () => {
                const validation = await validateImageFile(file);
                if (!validation.ok) {
                  onNotice?.(validation.reason);
                  return;
                }
                try {
                  const dataUrl = await readFileAsDataUrl(file);
                  // Aspect-correct placement: scale the image's natural size into a
                  // max box instead of the old flat 180x120 drop.
                  const natural = await loadImageSize(dataUrl);
                  const size = fitImageIntoBox(
                    natural?.width ?? 0,
                    natural?.height ?? 0,
                    IMAGE_PLACEMENT_MAX.width,
                    IMAGE_PLACEMENT_MAX.height,
                    IMAGE_PLACEMENT_FALLBACK,
                  );
                  setPendingImage({
                    dataUrl,
                    mimeType: file.type === "image/jpeg" ? "image/jpeg" : "image/png",
                    ...size,
                  });
                  // The ghost starts at the click that opened the picker (when there
                  // was one) and follows the pointer from there.
                  setGhostPoint(point);
                } catch {
                  onNotice?.("Could not read that image file.");
                }
              })();
            }}
          />
        </div>
      </div>

      {signatureRequest?.view === "modal" ? (
        <SignatureModal
          onCancel={() => setSignatureRequest(null)}
          onNotice={onNotice}
          onSave={(draft, saveForReuse) => {
            const point = signatureRequest.point;
            setSignatureRequest(null);
            if (saveForReuse) {
              void saveSignature({ id: createId("sig"), createdAt: Date.now(), ...draft }).catch(() =>
                onNotice?.("Could not save the signature for reuse."));
            }
            void placeSignature(draft, point);
          }}
        />
      ) : null}

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
