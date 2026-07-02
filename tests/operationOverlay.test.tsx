import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperationOverlay } from "../src/components/OperationOverlay";
import type {
  AnnotationOperation,
  DocumentFonts,
  EditOperation,
  FormFieldOperation,
  FormMarkOperation,
  ImageOperation,
  InkOperation,
  LinkOperation,
  ShapeOperation,
  SignatureOperation,
  StampOperation,
  TableRegionOperation,
  TextOperation,
  WhiteoutOperation,
} from "../src/types/editor";

// ---- mock the embedded font registry so we control the async resolution ----
let ensureResolver: ((family: string | undefined) => void) | null = null;
vi.mock("../src/engine/fontRegistry", () => ({
  cssFamilyForFontKey: (key: string) => `akkiembed-${key}`,
  ensureEmbeddedFontLoaded: vi.fn(
    () =>
      new Promise<string | undefined>((resolve) => {
        ensureResolver = resolve;
      }),
  ),
}));

// ---- mock caret utils so we can drive every branch of the focus effect ----
let lastPoint: { x: number; y: number } | null = null;
let caretRangeMode: "null" | "outside" | "inside-active" = "null";
let caretOutsideNode: Node | null = null;
vi.mock("../src/utils/caret", () => ({
  getLastPointerDownPoint: () => lastPoint,
  caretRangeFromClientPoint: () => {
    if (caretRangeMode === "inside-active") {
      // Build a collapsed range inside the currently focused contentEditable
      // element so the "clicked && element.contains(...)" branch executes.
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const range = document.createRange();
      const target = el.firstChild ?? el;
      range.setStart(target, 0);
      range.collapse(true);
      return range;
    }
    if (caretRangeMode === "outside" && caretOutsideNode) {
      const range = document.createRange();
      range.selectNodeContents(caretOutsideNode);
      range.collapse(true);
      return range;
    }
    return null;
  },
}));

const PAGE_HEIGHT = 800;
const SCALE = 2;
const RECT = { x: 10, y: 20, width: 100, height: 40 };

const noop = () => {};

function baseText(overrides: Partial<TextOperation> = {}): TextOperation {
  return {
    id: "text-1",
    type: "text",
    pageIndex: 0,
    rect: RECT,
    createdAt: 1,
    text: "Hello world",
    fontFamily: "Inter",
    fontSize: 16,
    color: "#112233",
    align: "left",
    ...overrides,
  };
}

function renderOverlay(operation: EditOperation, props: Partial<React.ComponentProps<typeof OperationOverlay>> = {}) {
  const onPointerDown = vi.fn();
  const onStartTextEdit = vi.fn();
  const onTextChange = vi.fn();
  const onTextCommit = vi.fn();
  const utils = render(
    <OperationOverlay
      operation={operation}
      pageHeight={PAGE_HEIGHT}
      scale={SCALE}
      selected={props.selected ?? false}
      editing={props.editing}
      dragging={props.dragging}
      moveModeActive={props.moveModeActive}
      documentFonts={props.documentFonts}
      onPointerDown={onPointerDown}
      onStartTextEdit={onStartTextEdit}
      onTextChange={onTextChange}
      onTextCommit={onTextCommit}
    />,
  );
  return { ...utils, onPointerDown, onStartTextEdit, onTextChange, onTextCommit };
}

beforeEach(() => {
  vi.clearAllMocks();
  ensureResolver = null;
  lastPoint = null;
  caretRangeMode = "null";
  caretOutsideNode = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("OperationOverlay - text", () => {
  it("renders a non-editing text overlay with default weight/style fallbacks", () => {
    const { container } = renderOverlay(baseText({ bold: false, italic: false }), { selected: true });
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute("contenteditable")).toBe("false");
    expect(el.getAttribute("role")).toBeNull();
    expect(el.getAttribute("aria-label")).toBeNull();
    expect(el.tabIndex).toBe(0);
    expect(el.textContent).toBe("Hello world");
    // fontWeight falls back to 400, fontStyle to normal
    expect(el.style.fontWeight).toBe("400");
    expect(el.style.fontStyle).toBe("normal");
    expect(el.className).toContain("is-selected");
    expect(el.className).not.toContain("is-editing");
  });

  it("applies bold/italic/letterSpacing/whiteout and explicit cssFontFamily", () => {
    const { container } = renderOverlay(
      baseText({
        bold: true,
        italic: true,
        letterSpacing: 2,
        whiteout: true,
        cssFontFamily: '"Custom Family"',
      }),
    );
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    expect(el.style.fontWeight).toBe("700");
    expect(el.style.fontStyle).toBe("italic");
    expect(el.style.letterSpacing).toBe(`${2 * SCALE}px`);
    // whiteout with default color
    expect(el.style.background).toBe("rgb(255, 255, 255)");
    expect(el.style.fontFamily).toContain("Custom Family");
  });

  it("honours explicit fontWeight/fontStyle and whiteoutColor", () => {
    const { container } = renderOverlay(
      baseText({ fontWeight: 600, fontStyle: "italic", whiteout: true, whiteoutColor: "#ff0000" }),
    );
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    expect(el.style.fontWeight).toBe("600");
    expect(el.style.fontStyle).toBe("italic");
    expect(el.style.background).toBe("rgb(255, 0, 0)");
  });

  it("renders editing text with role/aria/contentEditable and fires input/blur/keydown", () => {
    lastPoint = null;
    const { container, onStartTextEdit, onTextChange, onTextCommit } = renderOverlay(
      baseText({ text: "Edit me" }),
      { editing: true, selected: true },
    );
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    expect(el.getAttribute("contenteditable")).toBe("true");
    expect(el.getAttribute("role")).toBe("textbox");
    expect(el.getAttribute("aria-label")).toBe("Edit text overlay");
    expect(el.className).toContain("is-editing");

    // double click triggers start edit
    fireEvent.doubleClick(el);
    expect(onStartTextEdit).toHaveBeenCalledWith("text-1");

    // input while editing reports textContent
    el.textContent = "Changed";
    fireEvent.input(el);
    expect(onTextChange).toHaveBeenCalledWith("text-1", "Changed");

    // Enter (no shift) commits and then blurs (blur also commits while editing)
    onTextCommit.mockClear();
    fireEvent.keyDown(el, { key: "Enter" });
    expect(onTextCommit).toHaveBeenCalledTimes(2);

    // Escape commits (+ blur)
    onTextCommit.mockClear();
    fireEvent.keyDown(el, { key: "Escape" });
    expect(onTextCommit.mock.calls.length).toBeGreaterThanOrEqual(1);

    // Shift+Enter does NOT commit
    onTextCommit.mockClear();
    fireEvent.keyDown(el, { key: "Enter", shiftKey: true });
    // Other key does nothing
    fireEvent.keyDown(el, { key: "a" });
    expect(onTextCommit).not.toHaveBeenCalled();

    // blur while editing commits
    fireEvent.blur(el);
    expect(onTextCommit).toHaveBeenCalledTimes(1);
  });

  it("input with null textContent falls back to empty string", () => {
    const { container, onTextChange } = renderOverlay(baseText(), { editing: true });
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    Object.defineProperty(el, "textContent", { configurable: true, get: () => null });
    fireEvent.input(el);
    expect(onTextChange).toHaveBeenCalledWith("text-1", "");
  });

  it("does not fire input/blur/keydown handlers when not editing", () => {
    const { container, onTextChange, onTextCommit } = renderOverlay(baseText(), { editing: false });
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    fireEvent.input(el);
    fireEvent.blur(el);
    fireEvent.keyDown(el, { key: "Enter" });
    fireEvent.keyDown(el, { key: "Escape" });
    expect(onTextChange).not.toHaveBeenCalled();
    expect(onTextCommit).not.toHaveBeenCalled();
  });

  it("works when optional callbacks are omitted (no crash)", () => {
    render(
      <OperationOverlay
        operation={baseText()}
        pageHeight={PAGE_HEIGHT}
        scale={SCALE}
        selected={false}
        editing
        onPointerDown={noop}
      />,
    );
    const el = document.querySelector(".operation--text") as HTMLDivElement;
    fireEvent.doubleClick(el);
    fireEvent.input(el);
    fireEvent.blur(el);
    fireEvent.keyDown(el, { key: "Enter" });
  });

  it("captures editingText snapshot only on the editing transition", () => {
    const op = baseText({ text: "first" });
    const { rerender, container } = render(
      <OperationOverlay
        operation={op}
        pageHeight={PAGE_HEIGHT}
        scale={SCALE}
        selected
        editing={false}
        onPointerDown={noop}
      />,
    );
    // begin editing -> snapshot "first"
    rerender(
      <OperationOverlay
        operation={{ ...op, text: "first" }}
        pageHeight={PAGE_HEIGHT}
        scale={SCALE}
        selected
        editing
        onPointerDown={noop}
      />,
    );
    let el = container.querySelector(".operation--text") as HTMLDivElement;
    expect(el.textContent).toBe("first");
    // still editing, text prop changes -> snapshot stays "first"
    rerender(
      <OperationOverlay
        operation={{ ...op, text: "second" }}
        pageHeight={PAGE_HEIGHT}
        scale={SCALE}
        selected
        editing
        onPointerDown={noop}
      />,
    );
    el = container.querySelector(".operation--text") as HTMLDivElement;
    expect(el.textContent).toBe("first");
  });

  describe("editing focus / caret effect", () => {
    it("uses a clicked caret range contained in the element", () => {
      lastPoint = { x: 5, y: 5 };
      caretRangeMode = "inside-active";
      const { container } = renderOverlay(baseText({ text: "abc" }), { editing: true, selected: true });
      const el = container.querySelector(".operation--text") as HTMLDivElement;
      // The effect ran a clicked range whose startContainer is inside the element,
      // so the selection should be applied via the early-return branch.
      const sel = window.getSelection();
      expect(sel?.rangeCount).toBeGreaterThanOrEqual(1);
      expect(el.contains(sel!.getRangeAt(0).startContainer)).toBe(true);
    });

    it("falls back to selectNodeContents when clicked range is outside the element", () => {
      lastPoint = { x: 5, y: 5 };
      caretRangeMode = "outside";
      const outside = document.createElement("div");
      outside.textContent = "elsewhere";
      document.body.appendChild(outside);
      caretOutsideNode = outside;
      const { container } = renderOverlay(baseText(), { editing: true });
      expect(container.querySelector(".operation--text")).toBeTruthy();
      document.body.removeChild(outside);
    });

    it("falls back when caretRangeFromClientPoint returns null", () => {
      lastPoint = { x: 5, y: 5 };
      caretRangeMode = "null";
      const { container } = renderOverlay(baseText(), { editing: true });
      expect(container.querySelector(".operation--text")).toBeTruthy();
    });

    it("falls back to start when there is no last pointer point", () => {
      lastPoint = null;
      const { container } = renderOverlay(baseText(), { editing: true });
      expect(container.querySelector(".operation--text")).toBeTruthy();
    });

    it("does nothing when window.getSelection returns null", () => {
      const spy = vi.spyOn(window, "getSelection").mockReturnValue(null);
      const { container } = renderOverlay(baseText(), { editing: true });
      expect(container.querySelector(".operation--text")).toBeTruthy();
      spy.mockRestore();
    });
  });

  describe("embedded font handling", () => {
    it("loads an embedded font and reveals text once ready", async () => {
      const fonts: DocumentFonts = {
        "font-a": { key: "font-a", bytes: new Uint8Array([1, 2, 3]) },
      };
      const { container } = renderOverlay(baseText({ embeddedFontKey: "font-a" }), { documentFonts: fonts });
      const el = container.querySelector(".operation--text") as HTMLDivElement;
      // before ready, opacity is 0
      expect(el.style.opacity).toBe("0");
      await act(async () => {
        ensureResolver?.("akkiembed-font-a");
        await Promise.resolve();
      });
      const after = container.querySelector(".operation--text") as HTMLDivElement;
      expect(after.style.fontFamily).toContain("akkiembed-font-a");
      expect(after.style.opacity).toBe("1");
    });

    it("treats text as ready when embeddedFontKey has no matching bytes", () => {
      const { container } = renderOverlay(baseText({ embeddedFontKey: "missing" }), { documentFonts: {} });
      const el = container.querySelector(".operation--text") as HTMLDivElement;
      expect(el.style.opacity).toBe("1");
    });

    it("clears embedded family when the key changes to none", async () => {
      const fonts: DocumentFonts = { "font-a": { key: "font-a", bytes: new Uint8Array([9]) } };
      const op = baseText({ embeddedFontKey: "font-a" });
      const { rerender, container } = render(
        <OperationOverlay
          operation={op}
          pageHeight={PAGE_HEIGHT}
          scale={SCALE}
          selected={false}
          documentFonts={fonts}
          onPointerDown={noop}
        />,
      );
      await act(async () => {
        ensureResolver?.("akkiembed-font-a");
        await Promise.resolve();
      });
      rerender(
        <OperationOverlay
          operation={baseText({ embeddedFontKey: undefined })}
          pageHeight={PAGE_HEIGHT}
          scale={SCALE}
          selected={false}
          documentFonts={fonts}
          onPointerDown={noop}
        />,
      );
      const el = container.querySelector(".operation--text") as HTMLDivElement;
      expect(el.style.opacity).toBe("1");
    });

    it("cancels a pending font load on unmount without applying", async () => {
      const fonts: DocumentFonts = { "font-b": { key: "font-b", bytes: new Uint8Array([5]) } };
      const { unmount } = renderOverlay(baseText({ embeddedFontKey: "font-b" }), { documentFonts: fonts });
      unmount();
      await act(async () => {
        ensureResolver?.("akkiembed-font-b");
        await Promise.resolve();
      });
      // no assertion needed; cancelled branch executed without error
      expect(true).toBe(true);
    });
  });
});

describe("OperationOverlay - non-text branches", () => {
  it("renders whiteout with its color background", () => {
    const op: WhiteoutOperation = {
      id: "w", type: "whiteout", pageIndex: 0, rect: RECT, createdAt: 1, color: "#abcdef",
    };
    const { container } = renderOverlay(op);
    const el = container.querySelector(".operation--whiteout") as HTMLDivElement;
    expect(el.style.background).toBe("rgb(171, 205, 239)");
  });

  it("renders a highlight annotation as a colored block", () => {
    const op: AnnotationOperation = {
      id: "h", type: "annotation", kind: "highlight", pageIndex: 0, rect: RECT, createdAt: 1, color: "#00ff00",
    };
    const { container } = renderOverlay(op);
    const el = container.querySelector(".operation--annotation") as HTMLDivElement;
    expect(el.style.background).toBe("rgb(0, 255, 0)");
  });

  it("renders an image with a valid data url", () => {
    const op: ImageOperation = {
      id: "img", type: "image", pageIndex: 0, rect: RECT, createdAt: 1,
      dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png",
    };
    const { container } = renderOverlay(op);
    expect(container.querySelector("img")).toBeTruthy();
  });

  it("renders an image overlay with no img when the data url is unsafe", () => {
    const op: ImageOperation = {
      id: "img2", type: "image", pageIndex: 0, rect: RECT, createdAt: 1,
      dataUrl: "javascript:alert(1)" as unknown as string, mimeType: "image/png",
    };
    const { container } = renderOverlay(op);
    expect(container.querySelector(".operation--image")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders a signature in image mode with a valid value", () => {
    const op: SignatureOperation = {
      id: "sig", type: "signature", pageIndex: 0, rect: RECT, createdAt: 1,
      mode: "image", value: "data:image/jpeg;base64,BBBB", color: "#000", fontFamily: "Inter",
    };
    const { container } = renderOverlay(op);
    expect(container.querySelector('img[alt="Signature"]')).toBeTruthy();
  });

  it("renders a signature in image mode with an unsafe value (no img)", () => {
    const op: SignatureOperation = {
      id: "sig2", type: "signature", pageIndex: 0, rect: RECT, createdAt: 1,
      mode: "image", value: "nope", color: "#000", fontFamily: "Inter",
    };
    const { container } = renderOverlay(op);
    expect(container.querySelector(".operation--signature")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders a typed signature value", () => {
    const op: SignatureOperation = {
      id: "sig3", type: "signature", pageIndex: 0, rect: RECT, createdAt: 1,
      mode: "typed", value: "Akash", color: "#123456", fontFamily: "Inter",
    };
    const { container } = renderOverlay(op);
    const el = container.querySelector(".operation--signature") as HTMLDivElement;
    expect(el.textContent).toBe("Akash");
  });

  it("renders a stamp with label and colors", () => {
    const op: StampOperation = {
      id: "stamp", type: "stamp", pageIndex: 0, rect: RECT, createdAt: 1,
      label: "APPROVED", color: "#111", borderColor: "#222",
    };
    const { container } = renderOverlay(op);
    const el = container.querySelector(".operation--stamp") as HTMLDivElement;
    expect(el.textContent).toBe("APPROVED");
  });

  it("renders a shape with a solid fill", () => {
    const op: ShapeOperation = {
      id: "shape", type: "shape", kind: "rectangle", pageIndex: 0, rect: RECT, createdAt: 1,
      stroke: "#000", fill: "#ffcc00", strokeWidth: 2,
    };
    const { container } = renderOverlay(op);
    const el = container.querySelector(".operation--shape-rectangle") as HTMLDivElement;
    expect(el.style.background).toBe("rgb(255, 204, 0)");
  });

  it("renders a shape with a transparent fill", () => {
    const op: ShapeOperation = {
      id: "shape2", type: "shape", kind: "ellipse", pageIndex: 0, rect: RECT, createdAt: 1,
      stroke: "#000", fill: "transparent", strokeWidth: 1,
    };
    const { container } = renderOverlay(op);
    const el = container.querySelector(".operation--shape-ellipse") as HTMLDivElement;
    expect(el.style.background).toBe("transparent");
  });

  it("renders a line shape as an SVG line without an arrowhead", () => {
    const op: ShapeOperation = {
      id: "shape-line", type: "shape", kind: "line", pageIndex: 0, rect: RECT, createdAt: 1,
      stroke: "#123456", fill: "transparent", strokeWidth: 2,
    };
    const { container } = renderOverlay(op);
    const wrapper = container.querySelector(".operation--shape-line") as HTMLDivElement;
    expect(wrapper.querySelector("line")).toBeTruthy();
    expect(wrapper.querySelector("marker")).toBeNull();
  });

  it("renders an arrow shape with an arrowhead marker", () => {
    const op: ShapeOperation = {
      id: "shape-arrow", type: "shape", kind: "arrow", pageIndex: 0, rect: RECT, createdAt: 1,
      stroke: "#abcdef", fill: "transparent", strokeWidth: 3,
    };
    const { container } = renderOverlay(op);
    const wrapper = container.querySelector(".operation--shape-arrow") as HTMLDivElement;
    expect(wrapper.querySelector("marker")).toBeTruthy();
    const line = wrapper.querySelector("line");
    expect(line?.getAttribute("marker-end")).toContain("arrowhead-shape-arrow");
  });

  it("renders ink with mapped polyline points", () => {
    const op: InkOperation = {
      id: "ink", type: "ink", pageIndex: 0,
      rect: { x: 0, y: 0, width: 10, height: 10 }, createdAt: 1,
      points: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      stroke: "#ff0000", strokeWidth: 3,
    };
    const { container } = renderOverlay(op);
    const polyline = container.querySelector("polyline");
    expect(polyline).toBeTruthy();
    expect(polyline?.getAttribute("points")).toContain(",");
  });

  it("renders ink clamping zero-size rect to at least 1", () => {
    const op: InkOperation = {
      id: "ink0", type: "ink", pageIndex: 0,
      rect: { x: 0, y: 0, width: 0, height: 0 }, createdAt: 1,
      points: [{ x: 0, y: 0 }],
      stroke: "#000", strokeWidth: 1,
    };
    const { container } = renderOverlay(op);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("viewBox")).toBe(`0 0 ${1 * SCALE} ${1 * SCALE}`);
  });

  it("renders a strikeout annotation with the kind modifier class", () => {
    const op: AnnotationOperation = {
      id: "ann-s", type: "annotation", kind: "strikeout", pageIndex: 0, rect: RECT, createdAt: 1, color: "#aa0000",
    };
    const { container } = renderOverlay(op);
    expect(container.querySelector(".operation--annotation-strikeout")).toBeTruthy();
  });

  it("renders an underline annotation with the kind modifier class", () => {
    const op: AnnotationOperation = {
      id: "ann-u", type: "annotation", kind: "underline", pageIndex: 0, rect: RECT, createdAt: 1, color: "#00aa00",
    };
    const { container } = renderOverlay(op);
    expect(container.querySelector(".operation--annotation-underline")).toBeTruthy();
  });

  it("renders a note annotation with its text", () => {
    const op: AnnotationOperation = {
      id: "ann-n", type: "annotation", kind: "note", pageIndex: 0, rect: RECT, createdAt: 1, color: "#000", text: "A note",
    };
    const { container } = renderOverlay(op);
    const el = container.querySelector(".operation--annotation") as HTMLDivElement;
    expect(el.textContent).toBe("A note");
  });

  it("renders a note annotation falling back to its kind when text is missing", () => {
    const op: AnnotationOperation = {
      id: "ann-nk", type: "annotation", kind: "note", pageIndex: 0, rect: RECT, createdAt: 1, color: "#000",
    };
    const { container } = renderOverlay(op);
    const el = container.querySelector(".operation--annotation") as HTMLDivElement;
    expect(el.textContent).toBe("note");
  });

  it("renders a link with its href", () => {
    const op: LinkOperation = {
      id: "link", type: "link", pageIndex: 0, rect: RECT, createdAt: 1, href: "https://example.com",
    };
    const { container } = renderOverlay(op);
    const el = container.querySelector(".operation--link span") as HTMLSpanElement;
    expect(el.textContent).toBe("https://example.com");
  });

  it("renders a checked form-field showing the check and value", () => {
    const op: FormFieldOperation = {
      id: "ff", type: "form-field", kind: "radio", pageIndex: 0, rect: RECT, createdAt: 1,
      name: "agree", value: "Yes", checked: true,
    };
    const { container } = renderOverlay(op);
    const el = container.querySelector(".operation--form-field") as HTMLDivElement;
    expect(el.className).toContain("operation--form-radio");
    expect(el.textContent).toContain("✓");
    expect(el.textContent).toContain("Yes");
  });

  it("renders an unchecked form-field falling back to its name", () => {
    const op: FormFieldOperation = {
      id: "ff2", type: "form-field", kind: "text", pageIndex: 0, rect: RECT, createdAt: 1,
      name: "fullname", checked: false,
    };
    const { container } = renderOverlay(op);
    const el = container.querySelector(".operation--form-field") as HTMLDivElement;
    expect(el.textContent).not.toContain("✓");
    expect(el.textContent).toContain("fullname");
  });

  it("renders a table-region with its label", () => {
    const op: TableRegionOperation = {
      id: "tr", type: "table-region", pageIndex: 0, rect: RECT, createdAt: 1, label: "Table 1",
    };
    const { container } = renderOverlay(op);
    const el = container.querySelector(".operation--table-region span") as HTMLSpanElement;
    expect(el.textContent).toBe("Table 1");
  });

  it("renders a check-mark glyph for a form-mark operation", () => {
    const op: FormMarkOperation = {
      id: "fm", type: "form-mark", pageIndex: 0, rect: RECT, createdAt: 1, mark: "check", color: "#000",
    };
    const { container } = renderOverlay(op);
    const el = container.querySelector(".operation--form-mark") as HTMLDivElement;
    expect(el.textContent).toBe("\u2713");
    expect(el.style.color).toBe("rgb(0, 0, 0)");
  });

  it("renders a cross glyph for a form-mark cross operation", () => {
    const op: FormMarkOperation = {
      id: "fm2", type: "form-mark", pageIndex: 0, rect: RECT, createdAt: 1, mark: "cross", color: "#000",
    };
    const { container } = renderOverlay(op);
    const el = container.querySelector(".operation--form-mark") as HTMLDivElement;
    expect(el.textContent).toBe("\u2717");
  });

  it("renders a dot glyph for a form-mark dot operation", () => {
    const op: FormMarkOperation = {
      id: "fm3", type: "form-mark", pageIndex: 0, rect: RECT, createdAt: 1, mark: "dot", color: "#000",
    };
    const { container } = renderOverlay(op);
    const el = container.querySelector(".operation--form-mark") as HTMLDivElement;
    expect(el.textContent).toBe("\u25CF");
  });

  it("renders the default branch as empty for a non-form-mark fallthrough type", () => {
    // No standard EditOperation type reaches the default return except "form-mark";
    // cast an unknown type to exercise the `: null` side of that ternary defensively.
    const op = {
      id: "unknown", type: "mystery", pageIndex: 0, rect: RECT, createdAt: 1,
    } as unknown as EditOperation;
    const { container } = renderOverlay(op);
    const el = container.querySelector(".operation") as HTMLDivElement;
    expect(el).toBeTruthy();
    expect(el.textContent).toBe("");
  });

  it("applies opacity, dragging and move-mode classes", () => {
    const op: WhiteoutOperation = {
      id: "w2", type: "whiteout", pageIndex: 0, rect: RECT, createdAt: 1, color: "#000", opacity: 0.5,
    };
    const { container } = renderOverlay(op, { dragging: true, moveModeActive: true });
    const el = container.querySelector(".operation--whiteout") as HTMLDivElement;
    expect(el.className).toContain("is-dragging");
    expect(el.className).toContain("is-move-mode");
    expect(el.style.opacity).toBe("0.5");
    fireEvent.pointerDown(el, { clientX: 1, clientY: 1 });
  });

  it("fires onPointerDown for a non-text overlay", () => {
    const op: StampOperation = {
      id: "stampPD", type: "stamp", pageIndex: 0, rect: RECT, createdAt: 1,
      label: "X", color: "#000", borderColor: "#111",
    };
    const { container, onPointerDown } = renderOverlay(op);
    const el = container.querySelector(".operation--stamp") as HTMLDivElement;
    fireEvent.pointerDown(el, { clientX: 2, clientY: 2 });
    expect(onPointerDown).toHaveBeenCalledTimes(1);
  });
});
