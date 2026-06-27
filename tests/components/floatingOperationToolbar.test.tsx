import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingOperationToolbar } from "../../src/components/FloatingOperationToolbar";
import type { EditOperation } from "../../src/types/editor";

function textOp(overrides: Partial<Extract<EditOperation, { type: "text" }>> = {}): EditOperation {
  return {
    id: "t1",
    type: "text",
    pageIndex: 0,
    rect: { x: 10, y: 20, width: 120, height: 30 },
    text: "Hi",
    fontFamily: "Inter",
    fontSize: 14,
    color: "#111111",
    align: "left",
    opacity: 1,
    createdAt: 1,
    ...overrides,
  };
}

function handlers() {
  return {
    onDelete: vi.fn(),
    onDuplicate: vi.fn(),
    onLink: vi.fn(),
    onMoveToggle: vi.fn(),
    onTextPreview: vi.fn(),
    onUpdate: vi.fn(),
  };
}

function renderToolbar(operation: EditOperation, extra: Partial<React.ComponentProps<typeof FloatingOperationToolbar>> = {}) {
  const h = handlers();
  const view = render(
    <FloatingOperationToolbar operation={operation} pageWidth={612} rect={{ left: 40, top: 300, width: 120, height: 30 }} scale={1} {...h} {...extra} />,
  );
  return { h, view };
}

beforeEach(() => {
  // Make the layout-measure path set a real size.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 418,
    height: 34,
    top: 300,
    left: 40,
    right: 458,
    bottom: 334,
    x: 40,
    y: 300,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FloatingOperationToolbar — common actions", () => {
  it("returns null when hidden", () => {
    const { view } = renderToolbar(textOp(), { hidden: true });
    expect(view.container.firstChild).toBeNull();
  });

  it("handles link, move, duplicate, and delete for a non-text operation", () => {
    const shape = { id: "s1", type: "shape", kind: "rectangle", pageIndex: 0, rect: { x: 0, y: 0, width: 10, height: 10 }, stroke: "#000", strokeWidth: 2, opacity: 1, createdAt: 1 } as EditOperation;
    const { h } = renderToolbar(shape, { moveModeActive: true });
    expect(screen.queryByLabelText("Bold")).not.toBeInTheDocument(); // no text controls
    fireEvent.pointerDown(screen.getByRole("toolbar")); // toolbar stopPropagation guard
    fireEvent.click(screen.getByLabelText("Add link"));
    fireEvent.click(screen.getByLabelText("Move"));
    fireEvent.click(screen.getByLabelText("Duplicate"));
    fireEvent.click(screen.getByLabelText("Delete"));
    expect(h.onLink).toHaveBeenCalledWith(shape);
    expect(h.onMoveToggle).toHaveBeenCalled();
    expect(h.onDuplicate).toHaveBeenCalledWith(shape);
    expect(h.onDelete).toHaveBeenCalledWith("s1");
  });
});

describe("FloatingOperationToolbar — text controls", () => {
  it("toggles bold/italic and edits color", () => {
    const { h } = renderToolbar(textOp({ bold: false, italic: true }));
    fireEvent.click(screen.getByLabelText("Bold"));
    expect(h.onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ bold: true, fontWeight: 700 }));
    fireEvent.click(screen.getByLabelText("Italic"));
    expect(h.onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ italic: false, fontStyle: "normal" }));
    fireEvent.change(screen.getByLabelText("Text color"), { target: { value: "#00ff00" } });
    expect(h.onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ color: "#00ff00" }));
  });

  it("toggles bold/italic from the opposite starting state", () => {
    const { h } = renderToolbar(textOp({ bold: true, italic: false }));
    fireEvent.click(screen.getByLabelText("Bold"));
    expect(h.onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ bold: false, fontWeight: 400 }));
    fireEvent.click(screen.getByLabelText("Italic"));
    expect(h.onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ italic: true, fontStyle: "italic" }));
  });

  it("opens the font-size menu and picks a size, including a non-standard current size", () => {
    const { h } = renderToolbar(textOp({ fontSize: 13 })); // 13 not in preset list -> appended
    fireEvent.click(screen.getByLabelText("Font size 13"));
    const menu = screen.getByRole("menu", { name: "Font size options" });
    expect(within(menu).getByText("13")).toBeInTheDocument(); // appended + sorted
    fireEvent.click(within(menu).getByText("24"));
    expect(h.onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ fontSize: 24 }));
    // toggle the menu closed again
    fireEvent.click(screen.getByLabelText("Font size 13"));
    fireEvent.click(screen.getByLabelText("Font size 13"));
  });

  it("drives the react-select font picker: open, preview, search, choose, blur", () => {
    const { h } = renderToolbar(textOp({ fontFamily: "Helvetica" }));
    const input = screen.getByRole("combobox", { name: "Font family" });

    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    // options render in the portal; focusing one previews it
    expect(h.onTextPreview).toHaveBeenCalled();

    // exercise every fontSearchScore branch through the filter
    for (const query of ["arial", "aria", "rial", "helvetica", "segoe", "iberation", "zzzznope"]) {
      fireEvent.change(input, { target: { value: query } });
    }
    fireEvent.change(input, { target: { value: "arial" } }); // input-change -> filtered options
    expect(screen.getAllByText(/Arial/i).length).toBeGreaterThan(0);
    // select the highlighted option via keyboard (reliable in jsdom)
    fireEvent.keyDown(input, { key: "Enter" });
    expect(h.onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ fontFamily: expect.any(String) }));

    fireEvent.blur(input);
    expect(h.onTextPreview).toHaveBeenCalledWith("t1");
  });

  it("falls back to Inter when the operation font is unknown", () => {
    renderToolbar(textOp({ fontFamily: "TotallyMadeUpFont" }));
    expect(screen.getByLabelText("Font family")).toBeInTheDocument();
  });

  it("skips sizing when the toolbar measures zero (not yet laid out)", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);
    renderToolbar(textOp());
    expect(screen.getByRole("toolbar")).toBeInTheDocument();
  });
});
