import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-pdf", () => ({
  Document: ({ children }: { children: React.ReactNode }) => <div data-testid="document">{children}</div>,
  Page: ({ pageNumber }: { pageNumber: number }) => (
    <canvas className="react-pdf__Page__canvas" data-page={pageNumber} />
  ),
}));

import { PageRail } from "../../src/components/PageRail";

describe("PageRail", () => {
  it("renders a thumbnail button per page and marks the active page", () => {
    const onSelect = vi.fn();
    render(<PageRail activePage={0} pageCount={3} pdfBytes={new Uint8Array([1, 2, 3])} onSelect={onSelect} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0]).toHaveAttribute("aria-current", "page");
    expect(buttons[1]).not.toHaveAttribute("aria-current");
  });

  it("selects a page on click", () => {
    const onSelect = vi.fn();
    render(<PageRail activePage={1} pageCount={2} pdfBytes={new Uint8Array([9])} onSelect={onSelect} />);
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onSelect).toHaveBeenCalledWith(0);
  });
});
