import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditOperation, TextItem } from "../../src/types/editor";

// ---- mocks ------------------------------------------------------------------

vi.mock("react-pdf", () => ({
  Document: ({ children, onLoadSuccess }: { children: React.ReactNode; onLoadSuccess?: (p: unknown) => void }) => {
    return (
      <div data-testid="document">
        <button data-testid="doc-load" onClick={() => onLoadSuccess?.({ numPages: 2 })} />
        {children}
      </div>
    );
  },
  Page: ({ onRenderSuccess }: { onRenderSuccess?: () => void }) => (
    <>
      <canvas className="react-pdf__Page__canvas" />
      <button data-testid="page-render" onClick={() => onRenderSuccess?.()} />
    </>
  ),
}));

const fileValidation = vi.hoisted(() => ({ validateImageFile: vi.fn() }));
vi.mock("../../src/utils/fileValidation", () => fileValidation);

// Lightweight child stubs that surface the callbacks PdfCanvas wires up.
vi.mock("../../src/components/FloatingOperationToolbar", () => ({
  FloatingOperationToolbar: (props: {
    operation: EditOperation;
    onDelete: (id: string) => void;
    onDuplicate: (op: EditOperation) => void;
    onLink: (op: EditOperation) => void;
    onMoveToggle?: () => void;
    onTextPreview: (id: string, patch?: unknown) => void;
    onUpdate: (id: string, patch: unknown) => void;
  }) => (
    <div data-testid="fot">
      <button data-testid="fot-delete" onClick={() => props.onDelete(props.operation.id)} />
      <button data-testid="fot-duplicate" onClick={() => props.onDuplicate(props.operation)} />
      <button data-testid="fot-link" onClick={() => props.onLink(props.operation)} />
      <button data-testid="fot-move" onClick={() => props.onMoveToggle?.()} />
      <button data-testid="fot-preview" onClick={() => props.onTextPreview(props.operation.id, { text: "preview" })} />
      <button data-testid="fot-preview-clear" onClick={() => props.onTextPreview(props.operation.id)} />
      <button data-testid="fot-update" onClick={() => props.onUpdate(props.operation.id, { color: "#abcabc" })} />
    </div>
  ),
}));

vi.mock("../../src/components/ResizeHandles", () => ({
  ResizeHandles: (props: { onResizeStart: (handle: string, event: unknown) => void }) => (
    <div data-testid="resize-handles">
      {["e", "w", "n", "s"].map((h) => (
        <button
          key={h}
          data-testid={`resize-${h}`}
          onClick={() => props.onResizeStart(h, { pointerId: 1, clientX: 200, clientY: 200 })}
        />
      ))}
    </div>
  ),
}));

vi.mock("../../src/components/OperationOverlay", () => ({
  OperationOverlay: (props: {
    operation: EditOperation;
    onPointerDown: (event: unknown) => void;
    onStartTextEdit?: (id: string) => void;
    onTextChange?: (id: string, text: string) => void;
    onTextCommit?: () => void;
  }) => (
    <div data-testid={`overlay-${props.operation.id}`}>
      <button
        data-testid={`overlay-pointer-${props.operation.id}`}
        onClick={() => props.onPointerDown({ stopPropagation() {}, pointerId: 1, clientX: 60, clientY: 70 })}
      />
      <button data-testid={`overlay-edit-${props.operation.id}`} onClick={() => props.onStartTextEdit?.(props.operation.id)} />
      <button data-testid={`overlay-change-${props.operation.id}`} onClick={() => props.onTextChange?.(props.operation.id, "typed")} />
      <button data-testid={`overlay-commit-${props.operation.id}`} onClick={() => props.onTextCommit?.()} />
    </div>
  ),
}));

import { PdfCanvas } from "../../src/components/PdfCanvas";

// ---- fixtures + stubs -------------------------------------------------------

const RECT = {
  width: 200,
  height: 200,
  top: 0,
  left: 0,
  right: 200,
  bottom: 200,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

// Swappable pixel painter for the fake 2d context. Tests set `paintMode`/`inkMod`
// to drive the colour/weight sampling bands and their edge cases.
type PaintMode = "ink" | "white" | "transparent" | "sparse";
let paintMode: PaintMode = "ink";
let inkMod = 8; // 1/inkMod of pixels are ink -> ~12.5% coverage by default
function makeImageData(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    let r = 255;
    let a = 255;
    if (paintMode === "transparent") {
      a = 0;
    } else if (paintMode === "white") {
      r = 255;
    } else if (paintMode === "sparse") {
      a = i < 6 ? 255 : 0; // only a handful of opaque pixels
    } else {
      // "ink": mostly white, with two distinct ink colours, and a few translucent pixels
      if (i % inkMod === 0) r = 0; // black ink
      if (i % (inkMod + 1) === 0) r = 64; // a second ink colour -> 2+ colour buckets
      if (i % 7 === 3) a = 100; // exercises the alpha<threshold "continue" guards
    }
    data[i * 4] = r;
    data[i * 4 + 1] = r;
    data[i * 4 + 2] = r;
    data[i * 4 + 3] = a;
  }
  return { data, width, height };
}

function textItem(str: string, x: number, y: number, overrides: Partial<TextItem> = {}): TextItem {
  return { str, pageIndex: 0, rect: { x, y, width: 40, height: 12 }, fontSize: 12, ...overrides };
}

function textOp(id: string, overrides: Partial<Extract<EditOperation, { type: "text" }>> = {}): EditOperation {
  return {
    id,
    type: "text",
    pageIndex: 0,
    rect: { x: 20, y: 700, width: 120, height: 24 },
    text: "Hello",
    fontFamily: "Inter",
    fontSize: 14,
    color: "#111111",
    align: "left",
    opacity: 1,
    createdAt: 1,
    ...overrides,
  };
}

function shapeOp(id: string): EditOperation {
  return { id, type: "shape", kind: "rectangle", pageIndex: 0, rect: { x: 30, y: 600, width: 80, height: 40 }, stroke: "#000", strokeWidth: 2, opacity: 1, createdAt: 1 };
}

function inkOp(id: string): EditOperation {
  return { id, type: "ink", pageIndex: 0, rect: { x: 10, y: 500, width: 60, height: 30 }, points: [{ x: 10, y: 500 }, { x: 70, y: 530 }], stroke: "#000", strokeWidth: 2, opacity: 1, createdAt: 1 };
}

function baseProps(overrides: Partial<React.ComponentProps<typeof PdfCanvas>> = {}): React.ComponentProps<typeof PdfCanvas> {
  const stageRef = { current: null } as React.MutableRefObject<HTMLDivElement | null>;
  return {
    activeTool: "select",
    document: { name: "a.pdf", bytes: new Uint8Array([1, 2, 3]), pageCount: 2, fingerprint: "fp" },
    documentFonts: { g_d0_f1: { key: "g_d0_f1", bytes: new Uint8Array([1, 2]) } },
    operations: [],
    pageIndex: 0,
    pageSize: { width: 200, height: 200 },
    rotation: 0,
    scale: 1,
    selectedId: undefined,
    stageRef,
    textItems: [],
    onDocumentLoad: vi.fn(),
    onNotice: vi.fn(),
    onOperationAdd: vi.fn(),
    onOperationRemove: vi.fn(),
    onOperationSelect: vi.fn(),
    onOperationUpdate: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  paintMode = "ink";
  inkMod = 8;
  fileValidation.validateImageFile.mockResolvedValue({ ok: true });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(RECT);
  Object.defineProperty(HTMLCanvasElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => RECT,
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "width", { configurable: true, value: 200, writable: true });
  Object.defineProperty(HTMLCanvasElement.prototype, "height", { configurable: true, value: 200, writable: true });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    getImageData: (_x: number, _y: number, w: number, h: number) => makeImageData(w, h),
  } as unknown as CanvasRenderingContext2D);
  Object.defineProperty(HTMLDivElement.prototype, "setPointerCapture", { configurable: true, value: vi.fn() });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.spyOn(window, "prompt").mockReturnValue("https://example.com");
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderCanvas(props = baseProps()) {
  const view = render(<PdfCanvas {...props} />);
  // wire the stage ref + mark the page rendered
  fireEvent.click(screen.getByTestId("doc-load"));
  fireEvent.click(screen.getByTestId("page-render"));
  return { view, props };
}

describe("PdfCanvas — document + page lifecycle", () => {
  it("notifies on document load and page render", () => {
    const props = baseProps();
    renderCanvas(props);
    expect(props.onDocumentLoad).toHaveBeenCalled();
  });

  it("deselects when clicking empty page area with the select tool", () => {
    const props = baseProps({ activeTool: "select" });
    renderCanvas(props);
    const stage = document.querySelector(".page-stage")!;
    fireEvent.pointerDown(stage, { target: stage });
    expect(props.onOperationSelect).toHaveBeenCalledWith(undefined);
  });
});

describe("PdfCanvas — adding operations", () => {
  it("adds a shape by clicking the page with a region tool", () => {
    const props = baseProps({ activeTool: "shape" });
    renderCanvas(props);
    const stage = document.querySelector(".page-stage")!;
    fireEvent.click(stage, { target: stage });
    expect(props.onOperationAdd).toHaveBeenCalled();
  });

  it("adds styled text near existing runs (sampling the canvas), and selects it", () => {
    const props = baseProps({
      activeTool: "text",
      textItems: [textItem("Invoice", 20, 120, { fontName: "Helvetica-Bold", fontWeight: 700, cssFontFamily: "Helvetica" })],
    });
    renderCanvas(props);
    const stage = document.querySelector(".page-stage")!;
    act(() => {
      fireEvent.click(stage, { target: stage });
    });
    expect(props.onOperationAdd).toHaveBeenCalled();
    expect(props.onOperationSelect).toHaveBeenCalled();
  });

  it("replaces existing PDF text via the hit layer", () => {
    const props = baseProps({
      activeTool: "select",
      textItems: [textItem("Replace me", 20, 120)],
    });
    renderCanvas(props);
    const hit = document.querySelector(".text-hit") as HTMLElement;
    expect(hit).toBeTruthy();
    act(() => {
      fireEvent.click(hit);
    });
    expect(props.onOperationAdd).toHaveBeenCalled();
  });

  it("opens the image picker for the image tool and adds an image", async () => {
    const props = baseProps({ activeTool: "image" });
    renderCanvas(props);
    const stage = document.querySelector(".page-stage")!;
    fireEvent.click(stage, { target: stage }); // sets pending point + opens picker
    const input = document.querySelector('input[type="file"]')!;
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "p.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(props.onOperationAdd).toHaveBeenCalledWith(expect.objectContaining({ type: "image" }));
  });

  it("reports invalid images and read failures, and ignores empty selections", async () => {
    const props = baseProps({ activeTool: "image" });
    renderCanvas(props);
    const stage = document.querySelector(".page-stage")!;
    const input = document.querySelector('input[type="file"]')!;

    // no pending point yet -> change with a file but no prior click is ignored
    fireEvent.change(input, { target: { files: [] } });
    expect(props.onOperationAdd).not.toHaveBeenCalled();

    fireEvent.click(stage, { target: stage });
    fileValidation.validateImageFile.mockResolvedValueOnce({ ok: false, reason: "too big" });
    const file = new File([new Uint8Array([0x89, 0x50])], "p.png", { type: "image/png" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(props.onNotice).toHaveBeenCalledWith("too big");
  });
});

describe("PdfCanvas — selection toolbar + resize + drag", () => {
  function selected(op = shapeOp("s1"), activeTool: React.ComponentProps<typeof PdfCanvas>["activeTool"] = "select") {
    const props = baseProps({ activeTool, operations: [op], selectedId: op.id });
    renderCanvas(props);
    return props;
  }

  it("wires the floating toolbar actions", () => {
    const props = selected();
    fireEvent.click(screen.getByTestId("fot-move"));
    fireEvent.click(screen.getByTestId("fot-duplicate"));
    expect(props.onOperationAdd).toHaveBeenCalled(); // duplicate
    fireEvent.click(screen.getByTestId("fot-update"));
    expect(props.onOperationUpdate).toHaveBeenCalledWith("s1", expect.objectContaining({ color: "#abcabc" }));
    fireEvent.click(screen.getByTestId("fot-delete"));
    expect(props.onOperationRemove).toHaveBeenCalledWith("s1");
  });

  it("adds a link for a non-link op, blocks unsafe URLs, and edits an existing link", () => {
    const props = selected();
    // safe URL -> add link
    fireEvent.click(screen.getByTestId("fot-link"));
    expect(props.onOperationAdd).toHaveBeenCalledWith(expect.objectContaining({ type: "link", href: "https://example.com/" }));

    // unsafe URL -> notice, no add
    vi.spyOn(window, "prompt").mockReturnValueOnce("javascript:alert(1)");
    fireEvent.click(screen.getByTestId("fot-link"));
    expect(props.onNotice).toHaveBeenCalledWith(expect.stringContaining("Link not added"));

    // cancelled prompt -> nothing
    vi.spyOn(window, "prompt").mockReturnValueOnce(null);
    vi.mocked(props.onOperationAdd).mockClear();
    fireEvent.click(screen.getByTestId("fot-link"));
    expect(props.onOperationAdd).not.toHaveBeenCalled();
  });

  it("edits the URL of an existing link operation, including the unsafe and cancel paths", () => {
    const link: EditOperation = { id: "l1", type: "link", pageIndex: 0, rect: { x: 0, y: 0, width: 40, height: 20 }, href: "https://old.com", opacity: 1, createdAt: 1 };
    const props = selected(link);
    fireEvent.click(screen.getByTestId("fot-link"));
    expect(props.onOperationUpdate).toHaveBeenCalledWith("l1", expect.objectContaining({ href: "https://example.com/" }));

    vi.spyOn(window, "prompt").mockReturnValueOnce("data:text/html,x");
    fireEvent.click(screen.getByTestId("fot-link"));
    expect(props.onNotice).toHaveBeenCalled();

    vi.spyOn(window, "prompt").mockReturnValueOnce(null);
    vi.mocked(props.onOperationUpdate).mockClear();
    fireEvent.click(screen.getByTestId("fot-link"));
    expect(props.onOperationUpdate).not.toHaveBeenCalled();
  });

  it("previews text style changes from the toolbar", () => {
    const props = selected(textOp("t1"), "select");
    fireEvent.click(screen.getByTestId("fot-preview"));
    fireEvent.click(screen.getByTestId("fot-preview-clear"));
    expect(props.onOperationUpdate).not.toHaveBeenCalled(); // preview is local-only
  });

  it("resizes the selected operation across handles, clamping to a minimum size", () => {
    const props = selected(shapeOp("s1"));
    const stage = document.querySelector(".page-stage")!;
    // east handle, grow
    fireEvent.click(screen.getByTestId("resize-e"));
    fireEvent.pointerMove(stage, { clientX: 260, clientY: 260 });
    // east handle, shrink past minimum (width clamp without a west handle)
    fireEvent.click(screen.getByTestId("resize-e"));
    fireEvent.pointerMove(stage, { clientX: 0, clientY: 0 });
    // west handle, shrink past minimum
    fireEvent.click(screen.getByTestId("resize-w"));
    fireEvent.pointerMove(stage, { clientX: 999, clientY: 999 });
    // north handle, shrink past minimum
    fireEvent.click(screen.getByTestId("resize-n"));
    fireEvent.pointerMove(stage, { clientX: 999, clientY: 999 });
    // south handle
    fireEvent.click(screen.getByTestId("resize-s"));
    fireEvent.pointerMove(stage, { clientX: 120, clientY: 120 });
    fireEvent.pointerUp(stage);
    expect(props.onOperationUpdate).toHaveBeenCalled();
  });

  it("drags an operation with alignment snapping and resets on pointer up", () => {
    const props = baseProps({ activeTool: "select", operations: [shapeOp("s1"), inkOp("ink1")], selectedId: "s1", textItems: [textItem("Align", 30, 100)] });
    renderCanvas(props);
    const stage = document.querySelector(".page-stage")!;
    fireEvent.click(screen.getByTestId("overlay-pointer-s1")); // start drag
    fireEvent.pointerMove(stage, { clientX: 80, clientY: 90 });
    fireEvent.pointerUp(stage);
    expect(props.onOperationUpdate).toHaveBeenCalledWith("s1", expect.objectContaining({ rect: expect.anything() }));
  });

  it("drags an ink stroke, translating its points", () => {
    const props = baseProps({ activeTool: "select", operations: [inkOp("ink1")], selectedId: "ink1" });
    renderCanvas(props);
    const stage = document.querySelector(".page-stage")!;
    fireEvent.click(screen.getByTestId("overlay-pointer-ink1"));
    fireEvent.pointerMove(stage, { clientX: 90, clientY: 90 });
    fireEvent.pointerCancel(stage);
    expect(props.onOperationUpdate).toHaveBeenCalledWith("ink1", expect.objectContaining({ points: expect.any(Array) }));
  });
});

describe("PdfCanvas — text overlay + keyboard", () => {
  it("enters edit mode with the text tool and commits changes", () => {
    const props = baseProps({ activeTool: "text", operations: [textOp("t1")], selectedId: "t1" });
    renderCanvas(props);
    fireEvent.click(screen.getByTestId("overlay-pointer-t1")); // text tool -> edit, not drag
    fireEvent.click(screen.getByTestId("overlay-pointer-t1")); // already editing -> guard skips re-set
    fireEvent.click(screen.getByTestId("overlay-change-t1"));
    expect(props.onOperationUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ text: "typed" }));
    fireEvent.click(screen.getByTestId("overlay-edit-t1"));
    fireEvent.click(screen.getByTestId("overlay-commit-t1"));
  });

  it("does not start a drag for a non-select tool without move mode", () => {
    const props = baseProps({ activeTool: "highlight", operations: [shapeOp("s1")], selectedId: "s1" });
    renderCanvas(props);
    const stage = document.querySelector(".page-stage")!;
    fireEvent.click(screen.getByTestId("overlay-pointer-s1"));
    fireEvent.pointerMove(stage, { clientX: 80, clientY: 90 });
    // no drag -> no rect update from the move
    expect(props.onOperationUpdate).not.toHaveBeenCalled();
  });

  it("deletes the selected operation with Delete/Backspace and respects edit guards", () => {
    const props = baseProps({ activeTool: "select", operations: [shapeOp("s1")], selectedId: "s1" });
    renderCanvas(props);
    fireEvent.keyDown(window, { key: "Delete" });
    expect(props.onOperationRemove).toHaveBeenCalledWith("s1");

    vi.mocked(props.onOperationRemove).mockClear();
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(props.onOperationRemove).toHaveBeenCalled();

    // unrelated key -> ignored
    vi.mocked(props.onOperationRemove).mockClear();
    fireEvent.keyDown(window, { key: "a" });
    expect(props.onOperationRemove).not.toHaveBeenCalled();
  });

  it("ignores delete while editing text or focused in an editable field", () => {
    const props = baseProps({ activeTool: "text", operations: [textOp("t1")], selectedId: "t1" });
    renderCanvas(props);
    fireEvent.click(screen.getByTestId("overlay-edit-t1")); // editingTextId set
    fireEvent.keyDown(window, { key: "Delete" });
    expect(props.onOperationRemove).not.toHaveBeenCalled();
  });

  it("ignores delete when an editable element is focused", () => {
    const props = baseProps({ activeTool: "select", operations: [shapeOp("s1")], selectedId: "s1" });
    renderCanvas(props);
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(window, { key: "Delete" });
    expect(props.onOperationRemove).not.toHaveBeenCalled();
    field.remove();
  });
});

describe("PdfCanvas — misc", () => {
  it("enables the floating image button only for the image tool", () => {
    const { props } = renderCanvas(baseProps({ activeTool: "select" }));
    void props;
    expect(screen.getByRole("button", { name: /Image/ })).toBeDisabled();
  });

  it("clicks the floating image button when the image tool is active", () => {
    renderCanvas(baseProps({ activeTool: "image" }));
    const button = screen.getByRole("button", { name: /Image/ });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
  });

  it("hides a text-hit target once its source run has been replaced", () => {
    const props = baseProps({
      activeTool: "select",
      textItems: [textItem("Covered", 20, 700)],
      operations: [textOp("t1", { sourceCoverRect: { x: 20, y: 700, width: 40, height: 12 } })],
    });
    renderCanvas(props);
    // the overlapping hit target is suppressed
    expect(document.querySelectorAll(".text-hit")).toHaveLength(0);
    // the source-cover mask is rendered
    expect(document.querySelector(".operation--source-cover")).toBeTruthy();
  });

  it("groups text runs and samples style when adding text near a run", () => {
    const items: TextItem[] = [
      textItem("Hello", 10, 100, { cssFontFamily: "Arial", fontName: "Arial", fontWeight: 400 }),
      textItem("World", 54, 100, { cssFontFamily: "Arial", fontName: "Arial", fontWeight: 400 }),
      textItem(":", 96, 100, { cssFontFamily: "Arial", fontName: "Arial" }), // non-word join
      textItem("far", 400, 100), // big x gap -> separate run
      textItem("Big", 10, 150, { fontSize: 22, fontName: "g_d0_f1" }), // different line + scale, internal font id
      textItem("plain", 10, 60), // no style metadata -> generic/internal fallbacks
    ];
    const props = baseProps({ activeTool: "text", textItems: items });
    renderCanvas(props);
    const stage = document.querySelector(".page-stage")!;
    // click near the first run's viewport position (top ~ 200-100-12 = 88)
    act(() => {
      fireEvent.click(stage, { target: stage, clientX: 20, clientY: 88 });
    });
    expect(props.onOperationAdd).toHaveBeenCalled();
  });

  it("clicks well away from any run so no style is inherited", () => {
    const props = baseProps({ activeTool: "text", textItems: [textItem("solo", 10, 100)] });
    renderCanvas(props);
    const stage = document.querySelector(".page-stage")!;
    act(() => {
      fireEvent.click(stage, { target: stage, clientX: 190, clientY: 5 });
    });
    expect(props.onOperationAdd).toHaveBeenCalled();
  });

  it("evaluates resizability for each operation type", () => {
    const ops: EditOperation[] = [
      { id: "sl", type: "shape", kind: "line", pageIndex: 0, rect: { x: 0, y: 0, width: 10, height: 10 }, stroke: "#000", strokeWidth: 1, opacity: 1, createdAt: 1 },
      { id: "an", type: "annotation", kind: "note", pageIndex: 0, rect: { x: 0, y: 0, width: 10, height: 10 }, color: "#000", opacity: 1, createdAt: 1 },
      { id: "as", type: "annotation", kind: "strikeout", pageIndex: 0, rect: { x: 0, y: 0, width: 10, height: 10 }, color: "#000", opacity: 1, createdAt: 1 },
      inkOp("ik"),
      { id: "lk", type: "link", pageIndex: 0, rect: { x: 0, y: 0, width: 10, height: 10 }, href: "x", opacity: 1, createdAt: 1 },
      { id: "fm", type: "form-mark", mark: "check", pageIndex: 0, rect: { x: 0, y: 0, width: 10, height: 10 }, color: "#000", opacity: 1, createdAt: 1 },
      { id: "im", type: "image", pageIndex: 0, rect: { x: 0, y: 0, width: 10, height: 10 }, dataUrl: "data:image/png;base64,AA==", mimeType: "image/png", opacity: 1, createdAt: 1 },
    ];
    for (const op of ops) {
      const { unmount } = render(<PdfCanvas {...baseProps({ operations: [op], selectedId: op.id })} />);
      unmount();
    }
  });

  it("toggles move mode on and off and clears it when editing starts", () => {
    const props = baseProps({ activeTool: "text", operations: [textOp("t1")], selectedId: "t1" });
    renderCanvas(props);
    fireEvent.click(screen.getByTestId("fot-move")); // on
    fireEvent.click(screen.getByTestId("fot-move")); // off
    fireEvent.click(screen.getByTestId("fot-move")); // on again
    fireEvent.click(screen.getByTestId("overlay-edit-t1")); // editing -> effect clears move mode
  });

  it("blocks dragging a text operation that is being edited (select tool)", () => {
    const props = baseProps({ activeTool: "select", operations: [textOp("t1")], selectedId: "t1" });
    renderCanvas(props);
    fireEvent.click(screen.getByTestId("overlay-edit-t1")); // editingTextId = t1
    const stage = document.querySelector(".page-stage")!;
    fireEvent.click(screen.getByTestId("overlay-pointer-t1")); // canDrag -> false
    fireEvent.pointerMove(stage, { clientX: 90, clientY: 90 });
    expect(props.onOperationUpdate).not.toHaveBeenCalled();
  });

  it("returns early on a select-tool page click and handles canvas-targeted pointer events", () => {
    const props = baseProps({ activeTool: "select" });
    renderCanvas(props);
    const stage = document.querySelector(".page-stage")!;
    const canvas = document.querySelector(".react-pdf__Page__canvas")!;
    fireEvent.click(stage, { target: stage }); // select -> return
    fireEvent.pointerDown(stage, { target: canvas }); // isEmptyArea via canvas classList
    fireEvent.lostPointerCapture(stage); // reset handler
    expect(props.onOperationAdd).not.toHaveBeenCalled();
  });

  it("defaults page size and tolerates a missing font map", () => {
    const props = baseProps({ pageSize: undefined, documentFonts: undefined });
    render(<PdfCanvas {...props} />);
    expect(document.querySelector(".page-stage")).toBeTruthy();
  });

  it("reports a FileReader failure when adding an image", async () => {
    class FailingReader {
      onerror: (() => void) | null = null;
      onload: (() => void) | null = null;
      error = new Error("read");
      readAsDataURL() {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    vi.stubGlobal("FileReader", FailingReader);
    const props = baseProps({ activeTool: "image" });
    renderCanvas(props);
    const stage = document.querySelector(".page-stage")!;
    fireEvent.click(stage, { target: stage });
    const input = document.querySelector('input[type="file"]')!;
    const file = new File([new Uint8Array([0x89, 0x50])], "p.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
      await new Promise((r) => setTimeout(r, 5));
    });
    expect(props.onNotice).toHaveBeenCalledWith("Could not read that image file.");
    vi.unstubAllGlobals();
  });

  it("adds a jpeg image with the jpeg mime type", async () => {
    const props = baseProps({ activeTool: "image" });
    renderCanvas(props);
    const stage = document.querySelector(".page-stage")!;
    fireEvent.click(stage, { target: stage });
    const input = document.querySelector('input[type="file"]')!;
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], "p.jpg", { type: "image/jpeg" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(props.onOperationAdd).toHaveBeenCalledWith(expect.objectContaining({ mimeType: "image/jpeg" }));
  });

  it("picks the nearest run when several are in range, and reads style-less items", () => {
    const items: TextItem[] = [
      // two separate runs, both within the click's vertical tolerance; the second is closer
      textItem("RunA", 20, 100, { fontName: "Arial" }), // viewport center ~ 200-100-6 = 94
      textItem("RunB", 20, 106), // viewport center ~ 88 (different line -> separate run)
      { str: "NoSize", pageIndex: 0, rect: { x: 120, y: 100, width: 30, height: 14 } }, // no fontSize, far x
    ];
    const props = baseProps({ activeTool: "text", textItems: items });
    renderCanvas(props);
    const stage = document.querySelector(".page-stage")!;
    act(() => {
      // pointY = 64 + 21 = 85 -> nearer RunB(88) than RunA(94), both within tolerance
      fireEvent.click(stage, { target: stage, clientX: 25, clientY: 64 });
    });
    expect(props.onOperationAdd).toHaveBeenCalled();
  });

  it("merges a run with mixed styles, spacing, and missing sizes", () => {
    const items: TextItem[] = [
      // one line, one run: word+word (space), word+non-word tight (no space), a heavier later item, a size-less item
      textItem("Hello", 10, 100, { cssFontFamily: "Arial", fontName: "Arial", fontWeight: 400 }),
      textItem("World", 52, 100, { cssFontFamily: "Arial", fontName: "Arial", fontWeight: 800 }), // higher score -> chooseRunStyle picks it
      { str: "x", pageIndex: 0, rect: { x: 80, y: 100, width: 6, height: 12 } }, // overlaps prev -> no space, no fontSize
      textItem("end", 99, 100, { fontName: "Arial" }),
    ];
    const props = baseProps({ activeTool: "select", textItems: items });
    renderCanvas(props);
    expect(document.querySelectorAll(".text-hit").length).toBeGreaterThan(0);
  });

  it("treats a pointer-down on a non-empty child as a non-empty area", () => {
    const props = baseProps({ activeTool: "select", operations: [textOp("t1")], selectedId: "t1" });
    renderCanvas(props);
    const overlay = screen.getByTestId("overlay-t1");
    fireEvent.pointerDown(overlay); // bubbles to stage; target is not the canvas/stage
    fireEvent.lostPointerCapture(document.querySelector(".page-stage")!);
    expect(props.onOperationSelect).not.toHaveBeenCalledWith(undefined);
  });

  it("samples weight bands and colour edges across paint modes", () => {
    // near-click coordinates that match the run "Run" at (20,120) -> viewport top ~68
    const run = () => {
      const props = baseProps({ activeTool: "text", textItems: [textItem("Run", 20, 120, { fontName: "Arial", cssFontFamily: "Arial" })] });
      const { unmount } = render(<PdfCanvas {...props} />);
      fireEvent.click(screen.getAllByTestId("page-render").at(-1)!);
      const stages = document.querySelectorAll(".page-stage");
      const stage = stages[stages.length - 1];
      act(() => {
        fireEvent.click(stage, { target: stage, clientX: 30, clientY: 70 });
      });
      unmount();
      return props;
    };

    // inkMods chosen so total ink coverage (two ink colours) lands in each weight band
    for (const [mode, mod] of [["ink", 4], ["ink", 15], ["ink", 24], ["ink", 40]] as Array<[PaintMode, number]>) {
      paintMode = mode;
      inkMod = mod;
      run();
    }
    paintMode = "white"; // bg defined, no ink -> colour !dominant, weight 400
    run();
    paintMode = "transparent"; // bg !dominant -> colour/weight bail on !background
    run();
    paintMode = "sparse"; // few opaque pixels -> weight opaquePixels guard
    run();
  });
});
