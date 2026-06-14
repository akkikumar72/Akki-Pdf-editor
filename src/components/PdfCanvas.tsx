import { Document, Page } from "react-pdf";
import { ImagePlus } from "lucide-react";
import { type MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import type {
  EditOperation,
  EditorTool,
  LoadedPdf,
  PdfPoint,
  TextOperation,
  TextItem,
  ViewportRect,
} from "../types/editor";
import { createOperationsForTool } from "../editor/operationFactory";
import { duplicateOperation as cloneOperation } from "../editor/selectionModel";
import { pdfRectToViewport, viewportRectToPdf } from "../utils/coordinates";
import { createId } from "../utils/ids";
import { FloatingOperationToolbar } from "./FloatingOperationToolbar";
import { OperationOverlay } from "./OperationOverlay";

type PdfCanvasProps = {
  activeTool: EditorTool;
  document: LoadedPdf;
  operations: EditOperation[];
  pageIndex: number;
  pageSize?: { width: number; height: number };
  rotation: number;
  scale: number;
  selectedId?: string;
  stageRef: MutableRefObject<HTMLDivElement | null>;
  textItems: TextItem[];
  onDocumentLoad?: (proxy: unknown) => void;
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

function sampleTextBackgroundColor(stage: HTMLDivElement | null, viewportRect: ViewportRect) {
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
  const padding = Math.max(2, Math.min(6, Math.min(cssRect.width, cssRect.height) * 0.18));
  const sampleX = Math.max(0, Math.floor((cssRect.left - padding) * ratioX));
  const sampleY = Math.max(0, Math.floor((cssRect.top - padding) * ratioY));
  const sampleRect = {
    x: sampleX,
    y: sampleY,
    width: Math.min(canvas.width - sampleX, Math.ceil((cssRect.width + padding * 2) * ratioX)),
    height: Math.min(canvas.height - sampleY, Math.ceil((cssRect.height + padding * 2) * ratioY)),
  };
  if (sampleRect.width <= 0 || sampleRect.height <= 0) return undefined;

  const image = context.getImageData(sampleRect.x, sampleRect.y, sampleRect.width, sampleRect.height);
  const buckets = new Map<string, { count: number; red: number; green: number; blue: number }>();
  const stride = Math.max(1, Math.floor(Math.min(sampleRect.width, sampleRect.height) / 14));
  for (let y = 0; y < sampleRect.height; y += stride) {
    for (let x = 0; x < sampleRect.width; x += stride) {
      const offset = (y * sampleRect.width + x) * 4;
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

export function PdfCanvas({
  activeTool,
  document,
  operations,
  pageIndex,
  pageSize,
  rotation,
  scale,
  selectedId,
  stageRef,
  textItems,
  onDocumentLoad,
  onOperationAdd,
  onOperationRemove,
  onOperationSelect,
  onOperationUpdate,
}: PdfCanvasProps) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pendingImagePoint = useRef<PdfPoint | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [textPreview, setTextPreview] = useState<{ id: string; patch: Partial<TextOperation> } | null>(null);
  const [isPageRendered, setIsPageRendered] = useState(false);
  const pageWidth = pageSize?.width ?? 612;
  const pageHeight = pageSize?.height ?? 792;
  const selectedOperation = operations.find((operation) => operation.id === selectedId);
  const canPickExistingText = isPageRendered && (activeTool === "select" || activeTool === "text");
  const pdfFile = useMemo(() => ({ data: document.bytes.slice() }), [document.bytes]);

  useEffect(() => {
    setIsPageRendered(false);
  }, [document.fingerprint, pageIndex, rotation, scale]);

  const addAt = async (viewportRect: ViewportRect, sourceTextItem?: TextItem) => {
    const sampledBackgroundColor = sourceTextItem
      ? sampleTextBackgroundColor(stageRef.current, viewportRect)
      : undefined;
    createOperationsForTool({
      activeTool,
      viewportRect,
      pageHeight,
      pageIndex,
      scale,
      operations,
      prompt: window.prompt.bind(window),
      sourceTextItem,
      sampledBackgroundColor,
    }).forEach(onOperationAdd);
  };

  const addLinkForOperation = (operation: EditOperation) => {
    if (operation.type === "link") {
      const href = window.prompt("Link URL", operation.href);
      if (!href) return;
      onOperationUpdate(operation.id, { href } as Partial<EditOperation>);
      return;
    }

    const href = window.prompt("Link URL", "https://");
    if (!href) return;
    onOperationAdd({
      id: createId("link"),
      type: "link",
      pageIndex: operation.pageIndex,
      rect: { ...operation.rect },
      href,
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
          onClick={(event) => {
            if (event.target !== event.currentTarget && !(event.target as HTMLElement).classList.contains("react-pdf__Page__canvas")) {
              return;
            }
            if (activeTool === "select") {
              onOperationSelect(undefined);
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
            if (!drag || !stageRef.current) return;
            const point = pointFromEvent(event, stageRef.current);
            const pdfPoint = viewportRectToPdf({ left: point.x, top: point.y, width: 1, height: 1 }, pageHeight, scale);
            onOperationUpdate(drag.id, {
              rect: {
                x: drag.origin.x + (pdfPoint.x - drag.start.x),
                y: drag.origin.y + (pdfPoint.y - drag.start.y),
                width: operations.find((operation) => operation.id === drag.id)?.rect.width ?? 1,
                height: operations.find((operation) => operation.id === drag.id)?.rect.height ?? 1,
              },
            } as Partial<EditOperation>);
          }}
          onPointerUp={() => setDrag(null)}
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
            {textItems.map((item, index) => {
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

          <div className="operation-layer">
            {selectedOperation ? (
              <FloatingOperationToolbar
                operation={selectedOperation}
                pageWidth={pageWidth}
                rect={pdfRectToViewport(selectedOperation.rect, pageHeight, scale)}
                scale={scale}
                onDelete={onOperationRemove}
                onDuplicate={(operation) => onOperationAdd(cloneOperation(operation))}
                onLink={addLinkForOperation}
                onTextPreview={(id, patch) => setTextPreview(patch ? { id, patch } : null)}
                onUpdate={onOperationUpdate}
              />
            ) : null}
            {operations.map((operation) => (
              <OperationOverlay
                key={operation.id}
                operation={previewOperation(operation)}
                pageHeight={pageHeight}
                scale={scale}
                selected={operation.id === selectedId}
                onPointerDown={(event) => {
                  event.stopPropagation();
                  onOperationSelect(operation.id);
                  const point = pointFromEvent(event, stageRef.current!);
                  const pdfPoint = viewportRectToPdf({ left: point.x, top: point.y, width: 1, height: 1 }, pageHeight, scale);
                  setDrag({ id: operation.id, start: pdfPoint, origin: { x: operation.rect.x, y: operation.rect.y } });
                }}
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
              if (!file || !point) return;
              void readFileAsDataUrl(file).then((dataUrl) => {
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
              });
              event.currentTarget.value = "";
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
