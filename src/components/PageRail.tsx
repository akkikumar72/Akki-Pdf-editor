import { Document, Page } from "react-pdf";
import { useMemo, useRef, useState } from "react";

type PageRailProps = {
  activePage: number;
  pageCount: number;
  pdfBytes: Uint8Array;
  disabled?: boolean;
  onSelect: (page: number) => void;
  onInsertPage?: (index: number) => void;
  onDeletePage?: (index: number) => void;
  onDuplicatePage?: (index: number) => void;
  onMovePageUp?: (index: number) => void;
  onMovePageDown?: (index: number) => void;
  onMovePage?: (from: number, to: number) => void;
  onExtractPage?: (index: number) => void;
  onMergePdf?: (file: File, atIndex: number) => void;
};

export function PageRail({
  activePage,
  pageCount,
  pdfBytes,
  disabled = false,
  onSelect,
  onInsertPage,
  onDeletePage,
  onDuplicatePage,
  onMovePageUp,
  onMovePageDown,
  onMovePage,
  onExtractPage,
  onMergePdf,
}: PageRailProps) {
  const pdfFile = useMemo(() => ({ data: pdfBytes.slice() }), [pdfBytes]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const mergeInputRef = useRef<HTMLInputElement>(null);

  const canDrag = Boolean(onMovePage);

  return (
    <div className="page-rail__inner">
      <div className="panel-heading">
        <span>Pages</span>
        <strong>{pageCount}</strong>
      </div>
      <Document file={pdfFile} loading={<p className="muted">Loading pages</p>}>
        {Array.from({ length: pageCount }, (_, index) => (
          <div
            key={index}
            data-testid={`page-rail-item-${index}`}
            className={`page-rail__item${dropIndex === index ? " page-rail__item--drop" : ""}`}
            draggable={canDrag && !disabled}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(event) => {
              if (dragIndex === null) return;
              event.preventDefault();
              setDropIndex(index);
            }}
            onDragLeave={() => setDropIndex((value) => (value === index ? null : value))}
            onDrop={(event) => {
              event.preventDefault();
              if (dragIndex !== null && dragIndex !== index) onMovePage?.(dragIndex, index);
              setDragIndex(null);
              setDropIndex(null);
            }}
            onDragEnd={() => {
              setDragIndex(null);
              setDropIndex(null);
            }}
          >
            <button
              type="button"
              className="thumbnail-button"
              aria-current={activePage === index ? "page" : undefined}
              onClick={() => onSelect(index)}
            >
              <Page
                pageNumber={index + 1}
                width={108}
                renderAnnotationLayer={false}
                renderTextLayer={false}
              />
              <span>{index + 1}</span>
            </button>
            <div className="page-rail__actions" role="group" aria-label={`Page ${index + 1} actions`}>
              <button
                type="button"
                title="Insert blank page after"
                aria-label={`Insert blank page after page ${index + 1}`}
                disabled={disabled || !onInsertPage}
                onClick={() => onInsertPage?.(index)}
              >
                +
              </button>
              <button
                type="button"
                title="Duplicate page"
                aria-label={`Duplicate page ${index + 1}`}
                disabled={disabled || !onDuplicatePage}
                onClick={() => onDuplicatePage?.(index)}
              >
                ⧉
              </button>
              <button
                type="button"
                title="Move page up"
                aria-label={`Move page ${index + 1} up`}
                disabled={disabled || !onMovePageUp || index === 0}
                onClick={() => onMovePageUp?.(index)}
              >
                ↑
              </button>
              <button
                type="button"
                title="Move page down"
                aria-label={`Move page ${index + 1} down`}
                disabled={disabled || !onMovePageDown || index === pageCount - 1}
                onClick={() => onMovePageDown?.(index)}
              >
                ↓
              </button>
              <button
                type="button"
                title="Extract page as new PDF"
                aria-label={`Extract page ${index + 1}`}
                disabled={disabled || !onExtractPage}
                onClick={() => onExtractPage?.(index)}
              >
                ⤓
              </button>
              <button
                type="button"
                title="Delete page"
                aria-label={`Delete page ${index + 1}`}
                disabled={disabled || !onDeletePage || pageCount <= 1}
                onClick={() => onDeletePage?.(index)}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </Document>
      {onMergePdf ? (
        <div className="page-rail__footer">
          <input
            ref={mergeInputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onMergePdf(file, pageCount);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            className="page-rail__merge"
            disabled={disabled}
            onClick={() => mergeInputRef.current?.click()}
          >
            Merge PDF…
          </button>
        </div>
      ) : null}
    </div>
  );
}
