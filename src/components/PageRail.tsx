import { Document, Page } from "react-pdf";
import { useMemo } from "react";

type PageRailProps = {
  activePage: number;
  pageCount: number;
  pdfBytes: Uint8Array;
  onSelect: (page: number) => void;
};

export function PageRail({ activePage, pageCount, pdfBytes, onSelect }: PageRailProps) {
  const pdfFile = useMemo(() => ({ data: pdfBytes.slice() }), [pdfBytes]);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between px-1 text-muted-foreground text-xs uppercase tracking-wide">
        <span>Pages</span>
        <strong className="text-foreground">{pageCount}</strong>
      </div>
      <Document
        file={pdfFile}
        loading={<p className="px-1 text-muted-foreground text-xs">Loading pages</p>}
        className="flex flex-col gap-2"
      >
        {Array.from({ length: pageCount }, (_, index) => {
          const isActive = activePage === index;
          return (
            <button
              key={index}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => onSelect(index)}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border p-2 transition-colors hover:bg-accent/60 ${
                isActive ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background"
              }`}
            >
              <span className="overflow-hidden rounded-sm border bg-white shadow-xs">
                <Page
                  pageNumber={index + 1}
                  width={108}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                />
              </span>
              <span className={`text-xs ${isActive ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                {index + 1}
              </span>
            </button>
          );
        })}
      </Document>
    </div>
  );
}
