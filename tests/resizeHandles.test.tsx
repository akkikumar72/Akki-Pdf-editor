import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResizeHandles } from "../src/components/ResizeHandles";

describe("ResizeHandles", () => {
  it("renders eight handles and fires onResizeStart with stopPropagation", () => {
    const onResizeStart = vi.fn();
    const { container } = render(
      <ResizeHandles
        rect={{ left: 10, top: 20, width: 100, height: 200 }}
        onResizeStart={onResizeStart}
      />,
    );

    const handles = container.querySelectorAll(".resize-handle");
    expect(handles).toHaveLength(8);

    const frame = container.querySelector(".resize-frame") as HTMLElement;
    expect(frame.style.left).toBe("10px");
    expect(frame.style.width).toBe("100px");

    // Fire on every handle to cover the map and handler for each key.
    handles.forEach((handle) => {
      const stopPropagation = vi.fn();
      fireEvent.pointerDown(handle, {});
      // fireEvent does not let us inject stopPropagation directly; verify call below.
      void stopPropagation;
    });

    expect(onResizeStart).toHaveBeenCalledTimes(8);
    expect(onResizeStart.mock.calls.map((c) => c[0])).toEqual([
      "nw",
      "n",
      "ne",
      "e",
      "se",
      "s",
      "sw",
      "w",
    ]);
  });

  it("drops all midpoint handles on a small overlay so it stays visible (corners only)", () => {
    const { container } = render(
      <ResizeHandles
        rect={{ left: 0, top: 0, width: 24, height: 24 }}
        onResizeStart={vi.fn()}
      />,
    );
    const keys = Array.from(container.querySelectorAll(".resize-handle")).map(
      (handle) => handle.getAttribute("data-handle"),
    );
    expect(keys).toEqual(["nw", "ne", "se", "sw"]);
    // Compact frames also push the corner grips fully outside via CSS.
    expect((container.querySelector(".resize-frame") as HTMLElement).classList.contains("is-compact")).toBe(true);
  });

  it("drops only the midpoints of the too-short axis on a flat overlay", () => {
    const { container } = render(
      <ResizeHandles
        rect={{ left: 0, top: 0, width: 200, height: 20 }}
        onResizeStart={vi.fn()}
      />,
    );
    const keys = Array.from(container.querySelectorAll(".resize-handle")).map(
      (handle) => handle.getAttribute("data-handle"),
    );
    // Width has room for n/s midpoints; the 20px height hides e/w.
    expect(keys).toEqual(["nw", "n", "ne", "se", "s", "sw"]);
  });

  it("marks the frame while interacting so CSS can hide the handles", () => {
    const { container, rerender } = render(
      <ResizeHandles
        rect={{ left: 0, top: 0, width: 100, height: 100 }}
        onResizeStart={vi.fn()}
      />,
    );
    const frame = container.querySelector(".resize-frame") as HTMLElement;
    expect(frame.classList.contains("is-interacting")).toBe(false);
    rerender(
      <ResizeHandles
        rect={{ left: 0, top: 0, width: 100, height: 100 }}
        interacting
        onResizeStart={vi.fn()}
      />,
    );
    expect(frame.classList.contains("is-interacting")).toBe(true);
  });

  it("calls stopPropagation on the pointer event", () => {
    const onResizeStart = vi.fn();
    const { container } = render(
      <ResizeHandles
        rect={{ left: 0, top: 0, width: 50, height: 50 }}
        onResizeStart={onResizeStart}
      />,
    );
    const handle = container.querySelector(".resize-handle") as HTMLElement;
    const event = new Event("pointerdown", { bubbles: true });
    const stopPropagation = vi.spyOn(event, "stopPropagation");
    fireEvent(handle, event);
    expect(stopPropagation).toHaveBeenCalled();
    expect(onResizeStart).toHaveBeenCalledWith("nw", expect.anything());
  });
});
