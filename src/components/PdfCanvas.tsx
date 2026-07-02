import { Document, Page } from "react-pdf";
import { ImagePlus } from "lucide-react";
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
import { createOperationsForTool, describeInlineInput, NEW_TEXT_PLACEHOLDER } from "../editor/operationFactory";
import { registerEmbeddedFont } from "../engine/fontRegistry";
import { duplicateOperation as cloneOperation } from "../editor/selectionModel";
import { CanvasHintBanner } from "./CanvasHintBanner";
import { InlineInputPopover, type PendingInputRequest } from "./InlineInputPopover";
import { pdfRectToViewport, viewportRectToPdf } from "../utils/coordinates";
import { sampleTextBackgroundColor, sampleTextColor, sampleTextFontWeight } from "../utils/canvasTextStyleSampling";
import { validateImageFile } from "../utils/fileValidation";
import { createId } from "../utils/ids";
import { findNearbyTextRunForStyle, groupEditableTextRuns } from "../utils/textRunGrouping";
import { sanitizeUrl } from "../utils/url";
import { viewportRectsOverlap } from "../utils/textMetrics";
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
  const [hintVisible, setHintVisible] = useState(false);
  const [moveModeOperationId, setMoveModeOperationId] = useState<string | undefined>();
  const [textPreview, setTextPreview] = useState<{ id: string; patch: Partial<TextOperation> } | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | undefined>();
  const [pendingInput, setPendingInput] = useState<PendingInputRequest | null>(null);
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
    // The popover's anchor is a viewport rect for the page/scale it opened at, so
    // it goes stale the moment any of those change.
    setPendingInput(null);
  }, [document.fingerprint, pageIndex, rotation, scale]);

  useEffect(() => {
    setPendingInput(null);
  }, [activeTool]);

  useEffect(() => {
    if (editingTextId && selectedId !== editingTextId) setEditingTextId(undefined);
  }, [editingTextId, selectedId]);

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
    if (!documentFonts) return;
    for (const info of Object.values(documentFonts)) registerEmbeddedFont(info.key, info.bytes);
  }, [documentFonts]);

  const finalizeCreatedOperations = (nextOperations: EditOperation[]) => {
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
    const create = (resolvedFields?: Record<string, string>) =>
      finalizeCreatedOperations(
        createOperationsForTool({
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
    const isExistingLink = operation.type === "link";
    const defaultHref = operation.type === "link" ? operation.href : "https://";
    setPendingInput({
      title: isExistingLink ? "Edit link" : "Add link",
      confirmLabel: isExistingLink ? "Save link" : "Add link",
      fields: [{ key: "href", label: "Link URL", defaultValue: defaultHref }],
      anchor: pdfRectToViewport(operation.rect, pageHeight, scale),
      onConfirm: (values) => {
        setPendingInput(null);
        const href = values.href?.trim();
        if (!href) return;
        const safeHref = sanitizeUrl(href);
        if (!safeHref) {
          onNotice?.("Link not added: only http, https, and mailto URLs are allowed.");
          return;
        }
        if (isExistingLink) {
          onOperationUpdate(operation.id, { href: safeHref } as Partial<EditOperation>);
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
      },
      onCancel: () => setPendingInput(null),
    });
  };

  const previewOperation = (operation: EditOperation): EditOperation => {
    if (operation.type !== "text" || textPreview?.id !== operation.id) return operation;
    return { ...operation, ...textPreview.patch };
  };

  const onImageToolClick = (point: { x: number; y: number }) => {
    pendingImagePoint.current = point;
    imageInputRef.current?.click();
  };

  const { draw, drag, resize, activeGuides, stagePointerHandlers, handleResizeStart, handleOverlayPointerDown } =
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
      clearMoveMode: () => setMoveModeOperationId(undefined),
      onOperationSelect,
      onOperationUpdate,
      onImageToolClick,
      addAt,
    });

  // A drag/resize in progress only updates its own local (undispatched) rect —
  // see useStagePointerGestures — so this overrides the affected operation's
  // rendered position with that live value instead of the stale committed one.
  const gestureOverride = (operation: EditOperation): EditOperation => {
    if (drag?.id === operation.id && drag.livePatch) return { ...operation, ...drag.livePatch } as EditOperation;
    if (resize?.id === operation.id && resize.liveRect) return { ...operation, rect: resize.liveRect };
    return operation;
  };
  const liveSelectedOperation = selectedOperation ? gestureOverride(selectedOperation) : undefined;

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
      onOperationSelect(id);
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
            {pendingInput ? (
              <InlineInputPopover request={pendingInput} pageWidth={pageWidth} scale={scale} />
            ) : null}
            {operations.map((operation) => (
              <OperationOverlay
                key={operation.id}
                operation={previewOperation(gestureOverride(operation))}
                editing={editingTextId === operation.id}
                documentFonts={documentFonts}
                pageHeight={pageHeight}
                scale={scale}
                selected={operation.id === selectedId}
                dragging={drag?.id === operation.id}
                moveModeActive={moveModeOperationId === operation.id}
                onPointerDown={handleOverlayPointerDownById}
                onStartTextEdit={handleStartTextEdit}
                onTextChange={handleTextChange}
                onTextCommit={handleTextCommit}
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
