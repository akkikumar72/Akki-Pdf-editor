import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-pdf", () => ({
  Document: ({ children }: any) => <div>{children}</div>,
  Page: (_props: any) => <div data-testid="pdf-page" />,
  pdfjs: { GlobalWorkerOptions: {} },
}));

import { PageRail } from "../src/components/PageRail";

describe("PageRail", () => {
  it("renders thumbnails, marks the active page, and fires onSelect", () => {
    const onSelect = vi.fn();
    render(
      <PageRail
        activePage={1}
        pageCount={3}
        pdfBytes={new Uint8Array([1, 2, 3])}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText("Pages")).toBeInTheDocument();
    expect(document.querySelector(".panel-heading strong")?.textContent).toBe("3");

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(3);

    // active page (index 1) has aria-current="page", others do not (covers ternary)
    expect(buttons[1]).toHaveAttribute("aria-current", "page");
    expect(buttons[0]).not.toHaveAttribute("aria-current");
    expect(buttons[2]).not.toHaveAttribute("aria-current");

    expect(screen.getAllByTestId("pdf-page")).toHaveLength(3);

    fireEvent.click(buttons[2]);
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
