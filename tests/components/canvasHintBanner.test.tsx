import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CanvasHintBanner } from "../../src/components/CanvasHintBanner";

describe("CanvasHintBanner", () => {
  it("renders nothing for a tool with no hint", () => {
    const { container } = render(<CanvasHintBanner tool="select" />);
    expect(container.firstChild).toBeNull();
  });

  it("shows the armed hint with no ESC affordance by default", () => {
    render(<CanvasHintBanner tool="shape" />);
    expect(screen.getByRole("status")).toHaveTextContent("Add a shape by making an area selection on the page");
    expect(screen.queryByText(/Press ESC/)).not.toBeInTheDocument();
  });

  it("switches to the drawing copy and shows ESC while drawing", () => {
    render(<CanvasHintBanner tool="shape" drawing />);
    expect(screen.getByRole("status")).toHaveTextContent("Click and drag to draw the shape");
    expect(screen.getByText("Press ESC to cancel")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveAttribute("data-drawing", "true");
  });

  it("falls back to the armed copy while drawing a tool with no drawing variant", () => {
    render(<CanvasHintBanner tool="image" drawing />);
    expect(screen.getByRole("status")).toHaveTextContent("Click a location on the page to add image");
    expect(screen.getByText("Press ESC to cancel")).toBeInTheDocument();
  });

  it("shows the off-page guidance when offPage is set", () => {
    render(<CanvasHintBanner tool="text" offPage />);
    expect(screen.getByRole("status")).toHaveTextContent(/clicked outside the page/);
  });
});
