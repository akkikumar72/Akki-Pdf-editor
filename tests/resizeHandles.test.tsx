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
