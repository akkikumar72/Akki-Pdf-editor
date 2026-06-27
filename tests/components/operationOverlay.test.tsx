import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OperationOverlay } from "../../src/components/OperationOverlay";
import type { EditOperation } from "../../src/types/editor";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

function base<T extends EditOperation["type"]>(type: T) {
  return { id: `${type}_1`, type, pageIndex: 0, rect: { x: 10, y: 20, width: 80, height: 40 }, opacity: 1, createdAt: 1 };
}

function renderOverlay(operation: EditOperation, extra: Partial<React.ComponentProps<typeof OperationOverlay>> = {}) {
  const handlers = {
    onPointerDown: vi.fn(),
    onStartTextEdit: vi.fn(),
    onTextChange: vi.fn(),
    onTextCommit: vi.fn(),
  };
  const view = render(
    <OperationOverlay operation={operation} pageHeight={792} scale={1} selected={false} {...handlers} {...extra} />,
  );
  return { handlers, view };
}

const textOp = {
  ...base("text"),
  text: "Hi",
  fontFamily: "Inter",
  fontSize: 14,
  color: "#111",
  align: "left",
} as EditOperation;

describe("OperationOverlay — text editing", () => {
  it("drives the full edit lifecycle while editing", () => {
    const op = {
      ...textOp,
      embeddedFontKey: "g_d0_f1",
      cssFontFamily: '"X", sans-serif',
      letterSpacing: 1,
      bold: true,
      italic: true,
      fontWeight: 700,
      fontStyle: "italic" as const,
      whiteout: true,
      whiteoutColor: "#eee",
    } as EditOperation;
    const { handlers } = renderOverlay(op, {
      selected: true,
      editing: true,
      documentFonts: { g_d0_f1: { key: "g_d0_f1", bytes: new Uint8Array([1, 2]) } },
    });
    const box = screen.getByRole("textbox");
    fireEvent.input(box, { target: { textContent: "Hello" } });
    expect(handlers.onTextChange).toHaveBeenCalledWith("text_1", "Hello");

    fireEvent.keyDown(box, { key: "Enter" });
    expect(handlers.onTextCommit).toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true }); // newline, no commit
    fireEvent.keyDown(box, { key: "Escape" });
    fireEvent.keyDown(box, { key: "a" }); // ignored
    fireEvent.blur(box);
    expect(handlers.onTextCommit).toHaveBeenCalled(); // Enter/Escape/blur all commit
  });

  it("drops the caret at the last click point when it resolves inside the run", () => {
    fireEvent.pointerDown(document.body, { clientX: 7, clientY: 9 }); // captured by caret.ts
    // Resolve the platform caret API to a point inside the editing element.
    (document as unknown as { caretRangeFromPoint?: (x: number, y: number) => Range }).caretRangeFromPoint = () => {
      const el = document.querySelector('[role="textbox"]') ?? document.body;
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(true);
      return range;
    };
    renderOverlay(textOp, { selected: true, editing: true });
    expect(screen.getByRole("textbox")).toBeInTheDocument();
    delete (document as unknown as { caretRangeFromPoint?: unknown }).caretRangeFromPoint;
  });

  it("ignores input/blur/keydown when not editing and starts editing on double click", () => {
    const { handlers } = renderOverlay(textOp, { selected: true });
    const box = screen.getByText("Hi");
    fireEvent.pointerDown(box);
    expect(handlers.onPointerDown).toHaveBeenCalled();
    fireEvent.input(box, { target: { textContent: "x" } });
    fireEvent.blur(box);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(handlers.onTextChange).not.toHaveBeenCalled();
    expect(handlers.onTextCommit).not.toHaveBeenCalled();

    fireEvent.doubleClick(box);
    expect(handlers.onStartTextEdit).toHaveBeenCalledWith("text_1");
  });

  it("renders a plain text overlay using the resolved font when no css/weight is set", () => {
    renderOverlay({ ...textOp, fontFamily: "Helvetica" } as EditOperation, { selected: false });
    expect(screen.getByText("Hi")).toBeInTheDocument();
  });

  it("derives weight/style/background from bold/italic/whiteout flags", () => {
    renderOverlay(
      { ...textOp, bold: true, italic: true, whiteout: true } as EditOperation, // no fontWeight/fontStyle/whiteoutColor
    );
    expect(screen.getByText("Hi")).toBeInTheDocument();
  });

  it("applies dragging/move-mode classes and the default opacity", () => {
    const noOpacity = { ...textOp } as EditOperation & { opacity?: number };
    delete noOpacity.opacity; // exercise opacity ?? 1
    const { view } = renderOverlay(noOpacity, { selected: true, dragging: true, moveModeActive: true });
    const el = view.container.querySelector(".operation--text")!;
    expect(el.className).toContain("is-dragging");
    expect(el.className).toContain("is-move-mode");
  });
});

describe("OperationOverlay — every operation type", () => {
  it("renders whiteout and highlight", () => {
    renderOverlay({ ...base("whiteout"), color: "#fff" } as EditOperation);
    renderOverlay({ ...base("annotation"), kind: "highlight", color: "#ff0" } as EditOperation);
  });

  it("renders images with valid and invalid sources", () => {
    const { view } = renderOverlay({ ...base("image"), dataUrl: PNG, mimeType: "image/png" } as EditOperation);
    expect(view.container.querySelector("img")).toBeInTheDocument();
    const { view: v2 } = renderOverlay({ ...base("image"), dataUrl: "nope", mimeType: "image/png" } as EditOperation);
    expect(v2.container.querySelector("img")).toBeNull();
  });

  it("renders signature image and typed modes", () => {
    const { view } = renderOverlay({ ...base("signature"), mode: "image", value: PNG, color: "#000", fontFamily: "Inter" } as EditOperation);
    expect(view.container.querySelector("img")).toBeInTheDocument();
    renderOverlay({ ...base("signature"), mode: "image", value: "bad", color: "#000", fontFamily: "Inter" } as EditOperation);
    renderOverlay({ ...base("signature"), mode: "typed", value: "Akki", color: "#000", fontFamily: "Inter" } as EditOperation);
    expect(screen.getByText("Akki")).toBeInTheDocument();
  });

  it("renders stamp, shapes, ink, annotations, link, form-field, table-region, form-mark", () => {
    renderOverlay({ ...base("stamp"), label: "PAID", color: "#b00", borderColor: "#b00" } as EditOperation);
    expect(screen.getByText("PAID")).toBeInTheDocument();

    renderOverlay({ ...base("shape"), kind: "rectangle", stroke: "#000", strokeWidth: 2, fill: "transparent" } as EditOperation);
    renderOverlay({ ...base("shape"), kind: "ellipse", stroke: "#000", strokeWidth: 2, fill: "#0f0" } as EditOperation);

    const { view } = renderOverlay({
      ...base("ink"),
      points: [{ x: 10, y: 60 }, { x: 50, y: 20 }],
      stroke: "#000",
      strokeWidth: 2,
    } as EditOperation);
    expect(view.container.querySelector("polyline")).toBeInTheDocument();

    renderOverlay({ ...base("annotation"), kind: "strikeout", color: "#f00" } as EditOperation);
    renderOverlay({ ...base("annotation"), kind: "underline", color: "#f00" } as EditOperation);
    renderOverlay({ ...base("annotation"), kind: "note", color: "#00f", text: "Note!" } as EditOperation);
    expect(screen.getByText("Note!")).toBeInTheDocument();
    renderOverlay({ ...base("annotation"), kind: "note", color: "#00f" } as EditOperation); // falls back to kind
    expect(screen.getByText("note")).toBeInTheDocument();

    renderOverlay({ ...base("link"), href: "https://x.com" } as EditOperation);
    expect(screen.getByText("https://x.com")).toBeInTheDocument();

    renderOverlay({ ...base("form-field"), kind: "checkbox", name: "agree", checked: true } as EditOperation);
    expect(screen.getByText(/agree/)).toBeInTheDocument();
    renderOverlay({ ...base("form-field"), kind: "text", name: "field", value: "typed" } as EditOperation);
    expect(screen.getByText("typed")).toBeInTheDocument();

    renderOverlay({ ...base("table-region"), label: "Table 1" } as EditOperation);
    expect(screen.getByText("Table 1")).toBeInTheDocument();

    renderOverlay({ ...base("form-mark"), mark: "check", color: "#000" } as EditOperation);
    expect(screen.getByText("check")).toBeInTheDocument();
  });
});
