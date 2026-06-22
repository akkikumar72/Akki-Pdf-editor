import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PageRail } from "../src/components/PageRail";

// react-pdf relies on the PDF.js worker / canvas which jsdom cannot run, so stub it
// to plain elements. The rail's page-operation wiring is what we exercise here.
vi.mock("react-pdf", () => ({
  Document: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Page: ({ pageNumber }: { pageNumber: number }) => <div data-testid={`page-${pageNumber}`} />,
}));

const baseProps = {
  activePage: 0,
  pageCount: 3,
  pdfBytes: new Uint8Array([1, 2, 3]),
};

describe("PageRail page operations", () => {
  it("invokes per-page handlers with the page index", () => {
    const onInsertPage = vi.fn();
    const onDeletePage = vi.fn();
    const onDuplicatePage = vi.fn();
    const onExtractPage = vi.fn();
    render(
      <PageRail
        {...baseProps}
        onSelect={vi.fn()}
        onInsertPage={onInsertPage}
        onDeletePage={onDeletePage}
        onDuplicatePage={onDuplicatePage}
        onExtractPage={onExtractPage}
      />,
    );

    fireEvent.click(screen.getByLabelText("Insert blank page after page 2"));
    fireEvent.click(screen.getByLabelText("Duplicate page 3"));
    fireEvent.click(screen.getByLabelText("Extract page 1"));
    fireEvent.click(screen.getByLabelText("Delete page 2"));

    expect(onInsertPage).toHaveBeenCalledWith(1);
    expect(onDuplicatePage).toHaveBeenCalledWith(2);
    expect(onExtractPage).toHaveBeenCalledWith(0);
    expect(onDeletePage).toHaveBeenCalledWith(1);
  });

  it("disables move-up on the first page and move-down on the last", () => {
    render(<PageRail {...baseProps} onSelect={vi.fn()} onMovePageUp={vi.fn()} onMovePageDown={vi.fn()} />);
    expect(screen.getByLabelText("Move page 1 up")).toBeDisabled();
    expect(screen.getByLabelText("Move page 3 down")).toBeDisabled();
    expect(screen.getByLabelText("Move page 2 up")).not.toBeDisabled();
  });

  it("disables delete when only one page remains", () => {
    render(<PageRail {...baseProps} pageCount={1} onSelect={vi.fn()} onDeletePage={vi.fn()} />);
    expect(screen.getByLabelText("Delete page 1")).toBeDisabled();
  });

  it("reorders via drag and drop", () => {
    const onMovePage = vi.fn();
    render(<PageRail {...baseProps} onSelect={vi.fn()} onMovePage={onMovePage} />);
    fireEvent.dragStart(screen.getByTestId("page-rail-item-0"));
    fireEvent.dragOver(screen.getByTestId("page-rail-item-2"));
    fireEvent.drop(screen.getByTestId("page-rail-item-2"));
    expect(onMovePage).toHaveBeenCalledWith(0, 2);
  });

  it("passes a selected merge file with the append index", () => {
    const onMergePdf = vi.fn();
    render(<PageRail {...baseProps} onSelect={vi.fn()} onMergePdf={onMergePdf} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([1])], "merge.pdf", { type: "application/pdf" });
    fireEvent.change(input, { target: { files: [file] } });
    expect(onMergePdf).toHaveBeenCalledWith(file, 3);
  });
});
