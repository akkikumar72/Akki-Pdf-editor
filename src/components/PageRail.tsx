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
    <div className="page-rail__inner">
      <div className="panel-heading">
        <span>Pages</span>
        <strong>{pageCount}</strong>
      </div>
      <Document file={pdfFile} loading={<p className="muted">Loading pages</p>}>
        {Array.from({ length: pageCount }, (_, index) => (
          <button
            key={index}
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
        ))}
      </Document>
    </div>
  );
}
