import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CanvasHintBanner } from "../src/components/CanvasHintBanner";

describe("CanvasHintBanner", () => {
  it("shows the armed hint when not drawing", () => {
    const { container } = render(<CanvasHintBanner tool="shape" drawing={false} />);
    const banner = container.querySelector(".canvas-hint");
    expect(banner?.textContent).toContain("Add a shape by making an area selection on the page");
    expect(container.querySelector(".canvas-hint__esc")).toBeNull();
  });

  it("shows the drawing hint and an ESC affordance while drawing", () => {
    const { container } = render(<CanvasHintBanner tool="shape" drawing />);
    const banner = container.querySelector(".canvas-hint");
    expect(banner?.textContent).toContain("Click and drag to draw the shape");
    expect(container.querySelector(".canvas-hint__esc")?.textContent).toBe("Press ESC to cancel");
    expect(banner?.getAttribute("data-drawing")).toBe("true");
  });

  it("falls back to the armed copy when a tool has no drawing variant", () => {
    const { container } = render(<CanvasHintBanner tool="image" drawing />);
    expect(container.querySelector(".canvas-hint__message")?.textContent).toBe(
      "Click a location on the page to add image",
    );
  });

  it("shows the off-page hint when the press started outside the page", () => {
    const { container } = render(<CanvasHintBanner tool="shape" drawing offPage />);
    expect(container.querySelector(".canvas-hint__message")?.textContent).toContain(
      "Looks like you clicked outside the page",
    );
  });

  it("renders nothing for a tool without a hint", () => {
    const { container } = render(<CanvasHintBanner tool="select" drawing={false} />);
    expect(container.querySelector(".canvas-hint")).toBeNull();
  });
});
