import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Inspector } from "../src/components/Inspector";
import { describeFallback } from "../src/engine/fontResolver";
import { fontFamilyPatch } from "../src/components/fontFamilyPatch";
import type {
  AnnotationOperation,
  EditOperation,
  FormFieldOperation,
  InkOperation,
  LinkOperation,
  RedactionOperation,
  TextItem,
  TextOperation,
} from "../src/types/editor";

// Inspector reads live font preview from context; stub state + dispatch so
// tests can assert without mounting TextPreviewProvider.
const { textPreviewDispatchMock, textPreviewState } = vi.hoisted(() => ({
  textPreviewDispatchMock: vi.fn(),
  textPreviewState: { current: null as { id: string; patch: Record<string, unknown> } | null },
}));
vi.mock("../src/state/textPreviewContext", () => ({
  useTextPreviewDispatch: () => textPreviewDispatchMock,
  useTextPreview: () => textPreviewState.current,
}));

vi.mock("react-select", async () => {
  const { reactSelectStub } = await import("./helpers/reactSelectStub");
  return reactSelectStub();
});

const rect = { x: 10, y: 20, width: 100, height: 40 };

function baseText(overrides: Partial<TextOperation> = {}): TextOperation {
  return {
    id: "op-1",
    type: "text",
    pageIndex: 0,
    rect,
    createdAt: 1,
    text: "Hello",
    fontFamily: "Inter",
    fontSize: 14.6,
    color: "#112233",
    align: "left",
    whiteout: false,
    opacity: 1,
    ...overrides,
  };
}

function renderInspector(
  operation?: EditOperation,
  opts: Partial<{
    onClose: () => void;
    operationCount: number;
    pageCount: number;
    pageTextItems: TextItem[];
    selectedCount: number;
  }> = {},
) {
  const onDuplicateSelected = vi.fn();
  const onExport = vi.fn();
  const onRemoveSelected = vi.fn();
  const onUpdate = vi.fn();
  const view = render(
    <Inspector
      operation={operation}
      operationCount={opts.operationCount ?? 2}
      pageCount={opts.pageCount}
      pageTextItems={opts.pageTextItems ?? []}
      selectedCount={opts.selectedCount ?? (operation ? 1 : 0)}
      onDuplicateSelected={onDuplicateSelected}
      onClose={opts.onClose}
      onExport={onExport}
      onRemoveSelected={onRemoveSelected}
      onUpdate={onUpdate}
    />,
  );
  return { ...view, onDuplicateSelected, onExport, onRemoveSelected, onTextPreview: textPreviewDispatchMock, onUpdate };
}

describe("Inspector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    textPreviewState.current = null;
  });

  it("renders the empty state when no operation is selected", () => {
    renderInspector(undefined);
    expect(screen.getByText("No selection")).toBeInTheDocument();
    expect(screen.getByText(/Select an overlay/)).toBeInTheDocument();
  });

  it("renders the optional close control and fires onClose", () => {
    const onClose = vi.fn();
    renderInspector(undefined, { onClose });
    fireEvent.click(screen.getByRole("button", { name: "Close properties" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  describe("multi-selection", () => {
    it("shows the Selected N objects summary instead of per-field editors", () => {
      renderInspector(baseText(), { selectedCount: 3 });
      expect(screen.getByText("Selected 3 objects")).toBeInTheDocument();
      // Per-field editors for the first op are suppressed.
      expect(screen.queryByLabelText("Text")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Font")).not.toBeInTheDocument();
    });

    it("fires the group duplicate and delete actions", () => {
      const { onDuplicateSelected, onRemoveSelected } = renderInspector(baseText(), { selectedCount: 2 });
      fireEvent.click(screen.getByRole("button", { name: /Duplicate all/ }));
      expect(onDuplicateSelected).toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: /Delete all/ }));
      expect(onRemoveSelected).toHaveBeenCalled();
    });

    it("keeps the single-op editor when exactly one operation is selected", () => {
      renderInspector(baseText(), { selectedCount: 1 });
      expect(screen.getByLabelText("Text")).toBeInTheDocument();
      expect(screen.queryByText(/Selected \d+ objects/)).not.toBeInTheDocument();
    });
  });

  it("renders export buttons and fires every export format", () => {
    const { onExport } = renderInspector(undefined);
    fireEvent.click(screen.getByRole("button", { name: /PDF/ }));
    fireEvent.click(screen.getByRole("button", { name: /TXT/ }));
    fireEvent.click(screen.getByRole("button", { name: /CSV/ }));
    fireEvent.click(screen.getByRole("button", { name: /XLSX/ }));
    expect(onExport.mock.calls.map((c) => c[0])).toEqual(["pdf", "txt", "csv", "xlsx"]);
  });

  it("renders the page text sample, slicing to 18 items", () => {
    const items: TextItem[] = Array.from({ length: 20 }, (_, i) => ({
      str: `item-${i}`,
      pageIndex: 0,
      rect,
    }));
    renderInspector(undefined, { pageTextItems: items });
    expect(screen.getByText("item-0")).toBeInTheDocument();
    expect(screen.getByText("item-17")).toBeInTheDocument();
    expect(screen.queryByText("item-18")).not.toBeInTheDocument();
    // Count badge shows full length.
    expect(screen.getByText("20")).toBeInTheDocument();
  });

  describe("text operation", () => {
    it("renders fields and fires text/font/size/color/align/whiteout updates", () => {
      const { onUpdate, onTextPreview } = renderInspector(baseText());

      // Summary: "text" with replaced dash, and page number.
      expect(screen.getByText("text")).toBeInTheDocument();
      expect(screen.getByText("Page 1")).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Bye" } });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { text: "Bye" });

      // FontFamilySelect (same control as the inline tooltip) commits + live-previews.
      expect(onTextPreview).toHaveBeenCalled();
      fireEvent.click(screen.getByTestId("inspector-font-change"));
      expect(onUpdate).toHaveBeenCalledWith("op-1", {
        fontFamily: "Arial",
        cssFontFamily: undefined,
        detectedFontName: undefined,
        embeddedFontKey: undefined,
      });
      fireEvent.click(screen.getByTestId("inspector-font-blur"));
      expect(onTextPreview).toHaveBeenCalledWith("op-1", undefined);

      // Size rounds the displayed value.
      const size = screen.getByLabelText("Size") as HTMLInputElement;
      expect(size.value).toBe("15");
      fireEvent.change(size, { target: { value: "40" } });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { fontSize: 40 });

      // Color picker (first color input is in field-grid).
      fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#abcdef" } });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { color: "#abcdef" });

      // Alignment buttons.
      const seg = screen.getByLabelText("Text alignment");
      const buttons = within(seg).getAllByRole("button");
      expect(buttons).toHaveLength(3);
      buttons.forEach((b) => fireEvent.click(b));
      expect(onUpdate).toHaveBeenCalledWith("op-1", { align: "left" });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { align: "center" });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { align: "right" });

      // Whiteout checkbox toggles on.
      fireEvent.click(screen.getByLabelText("Whiteout behind text"));
      expect(onUpdate).toHaveBeenCalledWith("op-1", { whiteout: true });
    });

    it("passes font size changes through unclamped while typing, and clamps only on blur", () => {
      const { onUpdate } = renderInspector(baseText({ fontSize: 14 }));
      const size = screen.getByLabelText("Size");
      // Clamping on every keystroke would round-trip an out-of-range intermediate
      // value (e.g. "2" while typing "24") through the controlled `value`, corrupting
      // the next digit typed — so `onChange` only rounds, never clamps.
      fireEvent.change(size, { target: { value: "2" } });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { fontSize: 2 });
      fireEvent.change(size, { target: { value: "500" } });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { fontSize: 500 });
      // A mid-range value passes through unclamped either way.
      fireEvent.change(size, { target: { value: "30" } });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { fontSize: 30 });
      // Clamping happens once editing finishes.
      fireEvent.blur(size, { target: { value: "1" } });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { fontSize: 6 });
      fireEvent.blur(size, { target: { value: "500" } });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { fontSize: 96 });
    });

    it("clamps to the minimum on blur when the field is emptied", () => {
      const { onUpdate } = renderInspector(baseText({ fontSize: 14 }));
      const size = screen.getByLabelText("Size");
      fireEvent.blur(size, { target: { value: "" } });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { fontSize: 6 });
    });

    it("shows the whiteout background color control when whiteout is on", () => {
      const { onUpdate } = renderInspector(baseText({ whiteout: true, whiteoutColor: undefined }));
      const bg = screen.getByLabelText("Background") as HTMLInputElement;
      // Falls back to #ffffff when whiteoutColor is undefined.
      expect(bg.value).toBe("#ffffff");
      fireEvent.change(bg, { target: { value: "#ff0000" } });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { whiteoutColor: "#ff0000" });
    });

    it("uses the provided whiteoutColor when present", () => {
      renderInspector(baseText({ whiteout: true, whiteoutColor: "#00ff00" }));
      expect((screen.getByLabelText("Background") as HTMLInputElement).value).toBe("#00ff00");
    });

    it("shows the embedded-font helper text when embeddedFontKey is set with detected name", () => {
      renderInspector(baseText({ embeddedFontKey: "k1", detectedFontName: "Calibri" }));
      expect(screen.getByText("Matched the original embedded font (Calibri)")).toBeInTheDocument();
    });

    it("shows the embedded-font helper text without detected name", () => {
      renderInspector(baseText({ embeddedFontKey: "k1", detectedFontName: undefined }));
      expect(screen.getByText("Matched the original embedded font")).toBeInTheDocument();
    });

    it("follows a live catalog preview in the font helper while embedded key is still committed", () => {
      const operation = baseText({ embeddedFontKey: "k1", detectedFontName: "Calibri", fontFamily: "Arial" });
      textPreviewState.current = { id: "op-1", patch: fontFamilyPatch("Courier") };
      renderInspector(operation);
      expect(screen.queryByText(/Matched the original embedded font/)).not.toBeInTheDocument();
      expect(screen.getByText(describeFallback("Courier"))).toBeInTheDocument();
    });

    it("shows the detected-font helper text when a detected name exists", () => {
      renderInspector(baseText({ embeddedFontKey: undefined, detectedFontName: "Helvetica" }));
      expect(screen.getByText(/Detected Helvetica/)).toBeInTheDocument();
    });

    it("shows the detected-font helper text via cssFontFamily only", () => {
      renderInspector(baseText({ embeddedFontKey: undefined, detectedFontName: undefined, cssFontFamily: "Georgia" }));
      expect(screen.getByText(/Detected Georgia/)).toBeInTheDocument();
    });

    it("shows the fallback helper text when no font info exists", () => {
      renderInspector(
        baseText({
          embeddedFontKey: undefined,
          detectedFontName: undefined,
          cssFontFamily: undefined,
          fontFamily: "Inter",
        }),
      );
      expect(screen.getByText("Exact editor font")).toBeInTheDocument();
    });

    it("renders the opacity slider for an operation carrying opacity", () => {
      const { onUpdate } = renderInspector(baseText({ opacity: 0.5 }));
      const slider = screen.getByLabelText("Opacity") as HTMLInputElement;
      expect(slider.value).toBe("0.5");
      fireEvent.change(slider, { target: { value: "0.75" } });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { opacity: 0.75 });
    });

    it("defaults the opacity slider to 1 when opacity is undefined", () => {
      renderInspector(baseText({ opacity: undefined }));
      expect((screen.getByLabelText("Opacity") as HTMLInputElement).value).toBe("1");
    });
  });

  describe("shape operation", () => {
    it("renders stroke controls and fires updates", () => {
      const shape: EditOperation = {
        id: "s1",
        type: "shape",
        pageIndex: 1,
        rect,
        createdAt: 1,
        kind: "rectangle",
        stroke: "#000000",
        strokeWidth: 2,
        opacity: 0.8,
      };
      const { onUpdate } = renderInspector(shape);
      expect(screen.getByText("shape")).toBeInTheDocument();
      expect(screen.getByText("Page 2")).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Stroke"), { target: { value: "#123456" } });
      expect(onUpdate).toHaveBeenCalledWith("s1", { stroke: "#123456" });

      fireEvent.change(screen.getByLabelText("Stroke width"), { target: { value: "5" } });
      expect(onUpdate).toHaveBeenCalledWith("s1", { strokeWidth: 5 });
    });
  });

  describe("form-mark operation", () => {
    function mark(overrides: Partial<EditOperation> = {}): EditOperation {
      return {
        id: "fm-1",
        type: "form-mark",
        mark: "check",
        pageIndex: 0,
        rect,
        createdAt: 1,
        color: "#111827",
        ...overrides,
      } as EditOperation;
    }

    it("renders a mark-style segmented control and fires an update when switching styles", () => {
      const { onUpdate } = renderInspector(mark({ mark: "check" }));
      const seg = screen.getByLabelText("Mark style");
      const buttons = within(seg).getAllByRole("button");
      expect(buttons).toHaveLength(3);
      buttons.forEach((b) => fireEvent.click(b));
      expect(onUpdate).toHaveBeenCalledWith("fm-1", { mark: "check" });
      expect(onUpdate).toHaveBeenCalledWith("fm-1", { mark: "cross" });
      expect(onUpdate).toHaveBeenCalledWith("fm-1", { mark: "dot" });
    });

    it("renders a color picker and fires an update on change", () => {
      const { onUpdate } = renderInspector(mark({ color: "#111827" }));
      const color = screen.getByLabelText("Color") as HTMLInputElement;
      expect(color.value).toBe("#111827");
      fireEvent.change(color, { target: { value: "#ff0000" } });
      expect(onUpdate).toHaveBeenCalledWith("fm-1", { color: "#ff0000" });
    });
  });

  describe("stamp operation", () => {
    function stamp(overrides: Partial<EditOperation> = {}): EditOperation {
      return {
        id: "st-1",
        type: "stamp",
        pageIndex: 0,
        rect,
        createdAt: 1,
        label: "Approved",
        color: "#b91c1c",
        borderColor: "#b91c1c",
        ...overrides,
      } as EditOperation;
    }

    it("edits the subject, detail line, and color (border follows color)", () => {
      const { onUpdate } = renderInspector(stamp({ subline: "By Akki at Feb 3, 2025" }));
      fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "REVIEWED" } });
      expect(onUpdate).toHaveBeenCalledWith("st-1", { label: "REVIEWED" });

      fireEvent.change(screen.getByLabelText("Detail line"), { target: { value: "By Someone" } });
      expect(onUpdate).toHaveBeenCalledWith("st-1", { subline: "By Someone" });

      fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#2b5329" } });
      expect(onUpdate).toHaveBeenCalledWith("st-1", { color: "#2b5329", borderColor: "#2b5329" });
    });

    it("clears the subline when the detail line is emptied", () => {
      const { onUpdate } = renderInspector(stamp({ subline: "By Akki" }));
      fireEvent.change(screen.getByLabelText("Detail line"), { target: { value: "" } });
      expect(onUpdate).toHaveBeenCalledWith("st-1", { subline: undefined });
    });

    it("shows an empty detail line when the stamp has no subline", () => {
      renderInspector(stamp({ subline: undefined }));
      expect((screen.getByLabelText("Detail line") as HTMLInputElement).value).toBe("");
    });
  });

  describe("signature operation", () => {
    it("offers a color control for a typed signature", () => {
      const typed: EditOperation = {
        id: "sig-1",
        type: "signature",
        mode: "typed",
        pageIndex: 0,
        rect,
        createdAt: 1,
        value: "Akki",
        color: "#333333",
        fontFamily: "Caveat",
      };
      const { onUpdate } = renderInspector(typed);
      fireEvent.change(screen.getByLabelText("Color"), { target: { value: "#0000ff" } });
      expect(onUpdate).toHaveBeenCalledWith("sig-1", { color: "#0000ff" });
    });

    it("hides the color control for an image signature (baked-in ink)", () => {
      const image: EditOperation = {
        id: "sig-2",
        type: "signature",
        mode: "image",
        pageIndex: 0,
        rect,
        createdAt: 1,
        value: "data:image/png;base64,AAAA",
        color: "#333333",
        fontFamily: "Caveat",
      };
      renderInspector(image);
      expect(screen.queryByLabelText("Color")).not.toBeInTheDocument();
    });
  });

  describe("link operation", () => {
    function linkOp(target: LinkOperation["target"], id = "l1"): EditOperation {
      return { id, type: "link", pageIndex: 0, rect, createdAt: 1, target };
    }

    it("renders the URL field, fires onChange, and sanitizes a safe URL on blur", () => {
      const { onUpdate } = renderInspector(linkOp({ kind: "url", href: "https://example.com" }));
      const url = screen.getByLabelText("URL");
      fireEvent.change(url, { target: { value: "https://safe.test/path" } });
      expect(onUpdate).toHaveBeenCalledWith("l1", { target: { kind: "url", href: "https://safe.test/path" } });

      fireEvent.blur(url, { target: { value: "https://safe.test/path" } });
      expect(onUpdate).toHaveBeenCalledWith("l1", { target: { kind: "url", href: "https://safe.test/path" } });
    });

    it("clears the field on blur for an unsafe URL", () => {
      const { onUpdate } = renderInspector(linkOp({ kind: "url", href: "javascript:alert(1)" }, "l2"));
      fireEvent.blur(screen.getByLabelText("URL"), { target: { value: "javascript:alert(1)" } });
      expect(onUpdate).toHaveBeenCalledWith("l2", { target: { kind: "url", href: "" } });
    });

    it("switches the link kind, defaulting page targets to page 1 and href kinds to empty", () => {
      const { onUpdate } = renderInspector(linkOp({ kind: "url", href: "https://example.com" }));
      const kind = screen.getByLabelText("Link type");
      fireEvent.change(kind, { target: { value: "page" } });
      expect(onUpdate).toHaveBeenCalledWith("l1", { target: { kind: "page", pageIndex: 0 } });
      fireEvent.change(kind, { target: { value: "email" } });
      expect(onUpdate).toHaveBeenCalledWith("l1", { target: { kind: "email", href: "" } });
    });

    it("edits an email target and normalizes to mailto on blur, clearing invalid addresses", () => {
      const { onUpdate } = renderInspector(linkOp({ kind: "email", href: "mailto:old@example.com" }, "l3"));
      const email = screen.getByLabelText("Email");
      expect(email).toHaveValue("old@example.com");
      fireEvent.change(email, { target: { value: "new@example.com" } });
      expect(onUpdate).toHaveBeenCalledWith("l3", { target: { kind: "email", href: "new@example.com" } });
      fireEvent.blur(email, { target: { value: "new@example.com" } });
      expect(onUpdate).toHaveBeenCalledWith("l3", { target: { kind: "email", href: "mailto:new@example.com" } });
      fireEvent.blur(email, { target: { value: "not-an-email" } });
      expect(onUpdate).toHaveBeenCalledWith("l3", { target: { kind: "email", href: "" } });
    });

    it("edits a phone target and normalizes to tel on blur, clearing invalid numbers", () => {
      const { onUpdate } = renderInspector(linkOp({ kind: "phone", href: "tel:+123456789" }, "l4"));
      const phone = screen.getByLabelText("Phone");
      expect(phone).toHaveValue("+123456789");
      fireEvent.change(phone, { target: { value: "+1 (555) 000-1234" } });
      expect(onUpdate).toHaveBeenCalledWith("l4", { target: { kind: "phone", href: "+1 (555) 000-1234" } });
      fireEvent.blur(phone, { target: { value: "+1 (555) 000-1234" } });
      expect(onUpdate).toHaveBeenCalledWith("l4", { target: { kind: "phone", href: "tel:+15550001234" } });
      fireEvent.blur(phone, { target: { value: "abc" } });
      expect(onUpdate).toHaveBeenCalledWith("l4", { target: { kind: "phone", href: "" } });
    });

    it("edits a page target clamped to the document's page count", () => {
      const { onUpdate } = renderInspector(linkOp({ kind: "page", pageIndex: 1 }, "l5"), { pageCount: 3 });
      const page = screen.getByLabelText("Page");
      expect(page).toHaveValue(2);
      fireEvent.change(page, { target: { value: "3" } });
      expect(onUpdate).toHaveBeenCalledWith("l5", { target: { kind: "page", pageIndex: 2 } });
      fireEvent.change(page, { target: { value: "9" } });
      expect(onUpdate).toHaveBeenCalledWith("l5", { target: { kind: "page", pageIndex: 2 } });
      fireEvent.change(page, { target: { value: "" } });
      expect(onUpdate).toHaveBeenCalledWith("l5", { target: { kind: "page", pageIndex: 0 } });
    });
  });

  describe("ink operations", () => {
    function ink(overrides: Partial<InkOperation> = {}): InkOperation {
      return {
        id: "ink-1",
        type: "ink",
        pageIndex: 0,
        rect,
        createdAt: 1,
        points: [
          { x: 10, y: 20 },
          { x: 40, y: 30 },
        ],
        stroke: "#111827",
        strokeWidth: 3,
        variant: "draw",
        ...overrides,
      };
    }

    it("edits stroke color, width, and opacity even when opacity was previously unset", () => {
      const { onUpdate } = renderInspector(ink());
      expect(screen.getByText("ink")).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Stroke color"), { target: { value: "#22aa44" } });
      expect(onUpdate).toHaveBeenCalledWith("ink-1", { stroke: "#22aa44" });

      fireEvent.change(screen.getByLabelText("Stroke width"), { target: { value: "18" } });
      expect(onUpdate).toHaveBeenCalledWith("ink-1", { strokeWidth: 18 });

      const opacity = screen.getByLabelText("Opacity") as HTMLInputElement;
      expect(opacity.value).toBe("1");
      fireEvent.change(opacity, { target: { value: "0.65" } });
      expect(onUpdate).toHaveBeenCalledWith("ink-1", { opacity: 0.65 });
    });

    it("explains the blend behavior for a freehand highlighter", () => {
      renderInspector(ink({ variant: "freehand-highlight", strokeWidth: 30, opacity: 0.35 }));
      expect(screen.getByText(/Marker strokes blend with the page/)).toBeInTheDocument();
      expect(screen.getByLabelText("Stroke width")).toHaveValue(30);
      expect(screen.getByLabelText("Opacity")).toHaveValue("0.35");
    });
  });

  describe("redaction operation", () => {
    function redaction(overrides: Partial<RedactionOperation> = {}): RedactionOperation {
      return {
        id: "redact-1",
        type: "redaction",
        mode: "area",
        pageIndex: 0,
        rect,
        createdAt: 1,
        fillColor: "#111111",
        borderColor: "#550000",
        borderWidth: 1,
        overlayText: "REDACTED",
        opacity: 0.9,
        ...overrides,
      };
    }

    it("edits redaction appearance and clearly states the sanitization boundary", () => {
      const { onUpdate } = renderInspector(redaction());
      expect(screen.getByRole("note")).toHaveTextContent("Visual covering is not content sanitization");

      fireEvent.change(screen.getByLabelText("Fill color"), { target: { value: "#222222" } });
      expect(onUpdate).toHaveBeenCalledWith("redact-1", { fillColor: "#222222" });
      fireEvent.change(screen.getByLabelText("Border color"), { target: { value: "#ff0000" } });
      expect(onUpdate).toHaveBeenCalledWith("redact-1", { borderColor: "#ff0000" });
      fireEvent.change(screen.getByLabelText("Border width"), { target: { value: "4" } });
      expect(onUpdate).toHaveBeenCalledWith("redact-1", { borderWidth: 4 });
      fireEvent.change(screen.getByLabelText("Overlay text"), { target: { value: "PRIVATE" } });
      expect(onUpdate).toHaveBeenCalledWith("redact-1", { overlayText: "PRIVATE" });
      fireEvent.change(screen.getByLabelText("Overlay text"), { target: { value: "" } });
      expect(onUpdate).toHaveBeenCalledWith("redact-1", { overlayText: undefined });
      fireEvent.change(screen.getByLabelText("Opacity"), { target: { value: "0.5" } });
      expect(onUpdate).toHaveBeenCalledWith("redact-1", { opacity: 0.5 });
    });

    it("falls back to the fill color for an unset border", () => {
      renderInspector(redaction({ borderColor: undefined, overlayText: undefined }));
      expect(screen.getByLabelText("Border color")).toHaveValue("#111111");
      expect(screen.getByLabelText("Overlay text")).toHaveValue("");
      expect(screen.getByLabelText("Border width")).toHaveValue(1);
    });

    it("defaults an omitted border width to zero", () => {
      renderInspector(redaction({ borderWidth: undefined }));
      expect(screen.getByLabelText("Border width")).toHaveValue(0);
    });
  });

  describe("callout operation", () => {
    function callout(overrides: Partial<AnnotationOperation> = {}): AnnotationOperation {
      return {
        id: "callout-1",
        type: "annotation",
        kind: "callout",
        pageIndex: 1,
        rect,
        createdAt: 1,
        color: "#6a7763",
        text: "Review this total",
        fillColor: "#fff8e7",
        textColor: "#17211a",
        fontSize: 12,
        strokeWidth: 2,
        anchor: { x: 2, y: 8 },
        ...overrides,
      };
    }

    it("edits callout copy, line, fill, text, font size, width, and opacity", () => {
      const { onUpdate } = renderInspector(callout());
      fireEvent.change(screen.getByLabelText("Callout text"), { target: { value: "Updated note" } });
      expect(onUpdate).toHaveBeenCalledWith("callout-1", { text: "Updated note" });
      fireEvent.change(screen.getByLabelText("Line color"), { target: { value: "#123456" } });
      expect(onUpdate).toHaveBeenCalledWith("callout-1", { color: "#123456" });
      fireEvent.change(screen.getByLabelText("Fill color"), { target: { value: "#ffff00" } });
      expect(onUpdate).toHaveBeenCalledWith("callout-1", { fillColor: "#ffff00" });
      fireEvent.change(screen.getByLabelText("Text color"), { target: { value: "#0000ff" } });
      expect(onUpdate).toHaveBeenCalledWith("callout-1", { textColor: "#0000ff" });
      fireEvent.change(screen.getByLabelText("Font size"), { target: { value: "16" } });
      expect(onUpdate).toHaveBeenCalledWith("callout-1", { fontSize: 16 });
      fireEvent.change(screen.getByLabelText("Line width"), { target: { value: "3.5" } });
      expect(onUpdate).toHaveBeenCalledWith("callout-1", { strokeWidth: 3.5 });
      fireEvent.change(screen.getByLabelText("Opacity"), { target: { value: "0.7" } });
      expect(onUpdate).toHaveBeenCalledWith("callout-1", { opacity: 0.7 });
    });

    it("shows usable defaults for sparse callout annotations", () => {
      renderInspector(callout({
        text: undefined,
        fillColor: undefined,
        textColor: undefined,
        fontSize: undefined,
        strokeWidth: undefined,
      }));

      expect(screen.getByLabelText("Callout text")).toHaveValue("");
      expect(screen.getByLabelText("Fill color")).toHaveValue("#ffffff");
      expect(screen.getByLabelText("Text color")).toHaveValue("#17211a");
      expect(screen.getByLabelText("Font size")).toHaveValue(12);
      expect(screen.getByLabelText("Line width")).toHaveValue(2);
    });
  });

  describe("form-field operation", () => {
    function formField(
      kind: FormFieldOperation["kind"],
      overrides: Partial<FormFieldOperation> = {},
    ): FormFieldOperation {
      return {
        id: `form-${kind}`,
        type: "form-field",
        kind,
        pageIndex: 0,
        rect,
        createdAt: 1,
        name: `${kind}-field`,
        fillColor: "#ffffff",
        borderColor: "#6a7763",
        borderWidth: 1,
        borderStyle: "solid",
        fontFamily: "Helvetica",
        fontSize: 12,
        textColor: "#17211a",
        align: "left",
        rotation: 0,
        ...overrides,
      };
    }

    it("edits common text-field metadata and the complete appearance set", () => {
      const { onUpdate } = renderInspector(
        formField("text", {
          value: "Akash",
          defaultValue: "Guest",
          tooltip: "Your full name",
        }),
      );

      expect(screen.getAllByLabelText("Field type")[0]).toHaveValue("text");
      expect(screen.getAllByLabelText("Field type")[0].querySelectorAll("option")).toHaveLength(9);
      fireEvent.change(screen.getByLabelText("Field type"), { target: { value: "multiline" } });
      expect(onUpdate).toHaveBeenCalledWith("form-text", { kind: "multiline" });
      fireEvent.change(screen.getByLabelText("Field name"), { target: { value: "customer-name" } });
      expect(onUpdate).toHaveBeenCalledWith("form-text", { name: "customer-name" });
      fireEvent.change(screen.getByLabelText("Value"), { target: { value: "Ada" } });
      expect(onUpdate).toHaveBeenCalledWith("form-text", { value: "Ada" });
      fireEvent.change(screen.getByLabelText("Default value"), { target: { value: "Anonymous" } });
      expect(onUpdate).toHaveBeenCalledWith("form-text", { defaultValue: "Anonymous" });
      fireEvent.change(screen.getByLabelText("Tooltip"), { target: { value: "Legal name" } });
      expect(onUpdate).toHaveBeenCalledWith("form-text", { tooltip: "Legal name" });
      fireEvent.click(screen.getByLabelText("Required"));
      expect(onUpdate).toHaveBeenCalledWith("form-text", { required: true });
      fireEvent.click(screen.getByLabelText("Read only"));
      expect(onUpdate).toHaveBeenCalledWith("form-text", { readOnly: true });

      fireEvent.change(screen.getByLabelText("Fill color"), { target: { value: "#eeeeee" } });
      expect(onUpdate).toHaveBeenCalledWith("form-text", { fillColor: "#eeeeee" });
      fireEvent.change(screen.getByLabelText("Border color"), { target: { value: "#334455" } });
      expect(onUpdate).toHaveBeenCalledWith("form-text", { borderColor: "#334455" });
      fireEvent.change(screen.getByLabelText("Text color"), { target: { value: "#445566" } });
      expect(onUpdate).toHaveBeenCalledWith("form-text", { textColor: "#445566" });
      fireEvent.change(screen.getByLabelText("Font family"), { target: { value: "Courier" } });
      expect(onUpdate).toHaveBeenCalledWith("form-text", { fontFamily: "Courier" });
      fireEvent.change(screen.getByLabelText("Font size"), { target: { value: "18" } });
      expect(onUpdate).toHaveBeenCalledWith("form-text", { fontSize: 18 });
      fireEvent.change(screen.getByLabelText("Border width"), { target: { value: "2.5" } });
      expect(onUpdate).toHaveBeenCalledWith("form-text", { borderWidth: 2.5 });
      fireEvent.change(screen.getByLabelText("Border style"), { target: { value: "dashed" } });
      expect(onUpdate).toHaveBeenCalledWith("form-text", { borderStyle: "dashed" });
      fireEvent.click(screen.getByRole("button", { name: "Align center" }));
      expect(onUpdate).toHaveBeenCalledWith("form-text", { align: "center" });
      fireEvent.change(screen.getByLabelText("Rotation"), { target: { value: "90" } });
      expect(onUpdate).toHaveBeenCalledWith("form-text", { rotation: 90 });
    });

    it("renders safe defaults for a sparse text field and validates numeric appearance input", () => {
      const { onUpdate } = renderInspector(formField("text", {
        value: undefined,
        defaultValue: undefined,
        tooltip: undefined,
        required: undefined,
        readOnly: undefined,
        fillColor: undefined,
        borderColor: undefined,
        borderWidth: undefined,
        borderStyle: undefined,
        fontFamily: undefined,
        fontSize: undefined,
        textColor: undefined,
        align: undefined,
        rotation: undefined,
      }));

      expect(screen.getByLabelText("Value")).toHaveValue("");
      expect(screen.getByLabelText("Default value")).toHaveValue("");
      expect(screen.getByLabelText("Tooltip")).toHaveValue("");
      expect(screen.getByLabelText("Required")).not.toBeChecked();
      expect(screen.getByLabelText("Read only")).not.toBeChecked();
      expect(screen.getByLabelText("Fill color")).toHaveValue("#ffffff");
      expect(screen.getByLabelText("Border color")).toHaveValue("#64748b");
      expect(screen.getByLabelText("Text color")).toHaveValue("#111827");
      expect(screen.getByLabelText("Font family")).toHaveValue("Inter");
      expect(screen.getByLabelText("Font size")).toHaveValue(12);
      expect(screen.getByLabelText("Border width")).toHaveValue(1);
      expect(screen.getByLabelText("Border style")).toHaveValue("solid");
      expect(screen.getByRole("button", { name: "Align left" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByLabelText("Rotation")).toHaveValue("0");

      const fontSize = screen.getByLabelText("Font size");
      fireEvent.change(fontSize, { target: { value: "0" } });
      expect(onUpdate).not.toHaveBeenCalled();
      fireEvent.blur(fontSize, { target: { value: "-1" } });
      expect(onUpdate).toHaveBeenCalledWith("form-text", { fontSize: 12 });
      onUpdate.mockClear();
      fireEvent.blur(fontSize, { target: { value: "16" } });
      expect(onUpdate).not.toHaveBeenCalled();
    });

    it("uses a textarea for multiline values", () => {
      const { onUpdate } = renderInspector(formField("multiline", { value: "Line one" }));
      expect(screen.getByLabelText("Value").tagName).toBe("TEXTAREA");
      fireEvent.change(screen.getByLabelText("Value"), { target: { value: "Line one\nLine two" } });
      expect(onUpdate).toHaveBeenCalledWith("form-multiline", { value: "Line one\nLine two" });
    });

    it("renders an empty multiline field when no value has been supplied", () => {
      renderInspector(formField("multiline", { value: undefined }));
      expect(screen.getByLabelText("Value")).toHaveValue("");
    });

    it("edits dropdown options without swallowing a trailing line and normalizes them on blur", () => {
      const { onUpdate } = renderInspector(
        formField("dropdown", {
          options: ["Alpha", "Beta"],
          selectedValues: ["Beta"],
        }),
      );
      const options = screen.getByLabelText("Options");
      fireEvent.change(options, { target: { value: "Alpha\nBeta\nBeta\n Gamma\n" } });
      expect(onUpdate).toHaveBeenCalledWith("form-dropdown", {
        options: ["Alpha", "Beta", "Beta", " Gamma", ""],
      });
      fireEvent.blur(options, { target: { value: "Alpha\nBeta\nBeta\n Gamma\n" } });
      expect(onUpdate).toHaveBeenCalledWith("form-dropdown", {
        options: ["Alpha", "Beta", "Gamma"],
        selectedValues: ["Beta"],
        value: "Beta",
        defaultValue: undefined,
      });
      fireEvent.change(screen.getByLabelText("Selected choice"), { target: { value: "Alpha" } });
      expect(onUpdate).toHaveBeenCalledWith("form-dropdown", { selectedValues: ["Alpha"], value: "Alpha" });
      fireEvent.change(screen.getByLabelText("Default choice"), { target: { value: "Beta" } });
      expect(onUpdate).toHaveBeenCalledWith("form-dropdown", { defaultValue: "Beta" });
      fireEvent.click(screen.getByLabelText("Allow custom text"));
      expect(onUpdate).toHaveBeenCalledWith("form-dropdown", { allowCustomText: true });
    });

    it("edits a custom dropdown value when free text is enabled", () => {
      const { onUpdate } = renderInspector(
        formField("dropdown", {
          options: ["Alpha", "Beta"],
          allowCustomText: true,
          value: "Other",
          selectedValues: ["Other"],
        }),
      );
      fireEvent.change(screen.getByLabelText("Custom value"), { target: { value: "Bespoke" } });
      expect(onUpdate).toHaveBeenCalledWith("form-dropdown", {
        value: "Bespoke",
        selectedValues: ["Bespoke"],
      });
      fireEvent.change(screen.getByLabelText("Custom value"), { target: { value: "" } });
      expect(onUpdate).toHaveBeenCalledWith("form-dropdown", {
        value: "",
        selectedValues: [],
      });
    });

    it("preserves custom and retained default choices while normalizing options", () => {
      const custom = renderInspector(formField("dropdown", {
        options: ["Alpha"],
        allowCustomText: true,
        value: "Other",
        selectedValues: ["Other"],
        defaultValue: "Other",
      }));
      fireEvent.blur(screen.getByLabelText("Options"), { target: { value: "Alpha" } });
      expect(custom.onUpdate).toHaveBeenCalledWith("form-dropdown", {
        options: ["Alpha"],
        selectedValues: ["Other"],
        value: "Other",
        defaultValue: "Other",
      });
      custom.unmount();

      const retained = renderInspector(formField("dropdown", {
        options: ["Alpha", "Beta"],
        selectedValues: ["Beta"],
        defaultValue: "Beta",
      }));
      fireEvent.blur(screen.getByLabelText("Options"), { target: { value: "Alpha\nBeta" } });
      expect(retained.onUpdate).toHaveBeenCalledWith("form-dropdown", {
        options: ["Alpha", "Beta"],
        selectedValues: ["Beta"],
        value: "Beta",
        defaultValue: "Beta",
      });
    });

    it("renders empty choice defaults and clears an optional default", () => {
      const { onUpdate } = renderInspector(formField("dropdown", {
        options: undefined,
        selectedValues: undefined,
        value: undefined,
        defaultValue: undefined,
        allowCustomText: undefined,
      }));
      expect(screen.getByLabelText("Options")).toHaveValue("");
      expect(screen.getByLabelText("Selected choice")).toHaveValue("");
      expect(screen.getByLabelText("Default choice")).toHaveValue("");
      expect(screen.getByLabelText("Allow custom text")).not.toBeChecked();
      fireEvent.change(screen.getByLabelText("Default choice"), { target: { value: "" } });
      expect(onUpdate).toHaveBeenCalledWith("form-dropdown", { defaultValue: undefined });
    });

    it("clears custom choice state when custom text is disabled", () => {
      const { onUpdate } = renderInspector(
        formField("dropdown", {
          options: ["Alpha", "Beta"],
          allowCustomText: true,
          value: "Other",
          selectedValues: ["Other"],
          defaultValue: "Other",
        }),
      );
      fireEvent.click(screen.getByLabelText("Allow custom text"));
      expect(onUpdate).toHaveBeenCalledWith("form-dropdown", {
        allowCustomText: false,
        selectedValues: [],
        value: "",
        defaultValue: undefined,
      });
    });

    it("retains a valid default while disabling an otherwise empty custom dropdown", () => {
      const { onUpdate } = renderInspector(formField("dropdown", {
        options: ["Alpha", "Beta"],
        allowCustomText: true,
        value: undefined,
        selectedValues: [],
        defaultValue: "Beta",
      }));
      expect(screen.getByLabelText("Custom value")).toHaveValue("");

      fireEvent.click(screen.getByLabelText("Allow custom text"));

      expect(onUpdate).toHaveBeenCalledWith("form-dropdown", {
        allowCustomText: false,
        selectedValues: [],
        value: "",
        defaultValue: "Beta",
      });
    });

    it("clears selections and defaults removed from the option set", () => {
      const { onUpdate } = renderInspector(
        formField("dropdown", {
          options: ["Alpha", "Beta"],
          value: "Beta",
          selectedValues: ["Beta"],
          defaultValue: "Beta",
        }),
      );
      const options = screen.getByLabelText("Options");
      fireEvent.blur(options, { target: { value: "Alpha" } });
      expect(onUpdate).toHaveBeenCalledWith("form-dropdown", {
        options: ["Alpha"],
        selectedValues: [],
        value: "",
        defaultValue: undefined,
      });
    });

    it("supports multiple selected values for a list box", () => {
      const { onUpdate } = renderInspector(
        formField("listbox", {
          options: ["Alpha", "Beta", "Gamma"],
          selectedValues: ["Alpha", "Beta"],
          multiSelect: true,
        }),
      );
      const choices = screen.getByLabelText("Selected choices") as HTMLSelectElement;
      const choiceOptions = within(choices).getAllByRole("option") as HTMLOptionElement[];
      choiceOptions[0].selected = true;
      choiceOptions[1].selected = true;
      fireEvent.change(choices);
      expect(onUpdate).toHaveBeenCalledWith("form-listbox", {
        selectedValues: ["Alpha", "Beta"],
        value: "Alpha",
      });
      choiceOptions.forEach((option) => { option.selected = false; });
      fireEvent.change(choices);
      expect(onUpdate).toHaveBeenCalledWith("form-listbox", {
        selectedValues: [],
        value: "",
      });
      fireEvent.click(screen.getByLabelText("Allow multiple selections"));
      expect(onUpdate).toHaveBeenCalledWith("form-listbox", {
        multiSelect: false,
        selectedValues: ["Alpha"],
        value: "Alpha",
      });
    });

    it("enables multiple selection and safely disables it without a selected value", () => {
      const disabled = renderInspector(formField("listbox", {
        options: ["Alpha"],
        selectedValues: undefined,
        multiSelect: undefined,
      }));
      fireEvent.click(screen.getByLabelText("Allow multiple selections"));
      expect(disabled.onUpdate).toHaveBeenCalledWith("form-listbox", { multiSelect: true });
      disabled.unmount();

      const enabled = renderInspector(formField("listbox", {
        options: ["Alpha"],
        selectedValues: [],
        multiSelect: true,
      }));
      fireEvent.click(screen.getByLabelText("Allow multiple selections"));
      expect(enabled.onUpdate).toHaveBeenCalledWith("form-listbox", {
        multiSelect: false,
        selectedValues: [],
        value: "",
      });
    });

    it("shows checkbox state and export value without radio-only group metadata", () => {
      const { onUpdate } = renderInspector(formField("checkbox", { exportValue: "Approved" }));
      expect(screen.queryByLabelText("Group name")).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Export value"), { target: { value: "Accepted" } });
      expect(onUpdate).toHaveBeenCalledWith("form-checkbox", { exportValue: "Accepted" });
      fireEvent.click(screen.getByLabelText("Checked"));
      expect(onUpdate).toHaveBeenCalledWith("form-checkbox", { checked: true });
    });

    it("exposes radio group metadata and checked state", () => {
      const { onUpdate } = renderInspector(formField("radio", { groupName: "shipping", checked: true }));
      fireEvent.change(screen.getByLabelText("Group name"), { target: { value: "delivery" } });
      expect(onUpdate).toHaveBeenCalledWith("form-radio", { groupName: "delivery" });
      fireEvent.click(screen.getByLabelText("Selected"));
      expect(onUpdate).toHaveBeenCalledWith("form-radio", { checked: false });
    });

    it("shows safe defaults for sparse checkbox and radio metadata", () => {
      const checkbox = renderInspector(formField("checkbox", { exportValue: undefined, checked: undefined }));
      expect(screen.getByLabelText("Export value")).toHaveValue("Yes");
      expect(screen.getByLabelText("Checked")).not.toBeChecked();
      checkbox.unmount();

      renderInspector(formField("radio", { groupName: undefined, exportValue: undefined, checked: undefined }));
      expect(screen.getByLabelText("Group name")).toHaveValue("");
      expect(screen.getByLabelText("Export value")).toHaveValue("Yes");
      expect(screen.getByLabelText("Selected")).not.toBeChecked();
    });

    it("shows only button-specific behavior controls", () => {
      const { onUpdate } = renderInspector(formField("button", { buttonLabel: "Reset", buttonAction: "reset" }));
      expect(screen.queryByLabelText("Required")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Read only")).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText("Button label"), { target: { value: "Print" } });
      expect(onUpdate).toHaveBeenCalledWith("form-button", { buttonLabel: "Print" });
      fireEvent.change(screen.getByLabelText("Button action"), { target: { value: "print" } });
      expect(onUpdate).toHaveBeenCalledWith("form-button", { buttonAction: "print" });
    });

    it("derives legacy button labels and exposes the print-action notice", () => {
      const legacy = renderInspector(formField("button", {
        buttonLabel: undefined,
        value: "Legacy caption",
        buttonAction: undefined,
      }));
      expect(screen.getByLabelText("Button label")).toHaveValue("Legacy caption");
      expect(screen.getByLabelText("Button action")).toHaveValue("none");
      legacy.unmount();

      const fallback = renderInspector(formField("button", {
        buttonLabel: undefined,
        value: undefined,
        buttonAction: "print",
      }));
      expect(screen.getByLabelText("Button label")).toHaveValue("Button");
      expect(screen.getByText(/Some PDF viewers block print actions/)).toBeInTheDocument();
      fallback.unmount();
    });

    it("edits date value, default, and display format", () => {
      const { onUpdate } = renderInspector(
        formField("date", {
          value: "2026-08-27",
          defaultValue: "2026-08-01",
          dateFormat: "yyyy-MM-dd",
        }),
      );
      expect(screen.getByLabelText("Value")).toHaveAttribute("inputmode", "numeric");
      expect(screen.getByLabelText("Value")).toHaveAttribute("placeholder", "yyyy-MM-dd");
      fireEvent.change(screen.getByLabelText("Value"), { target: { value: "2026-09-01" } });
      expect(onUpdate).toHaveBeenCalledWith("form-date", { value: "2026-09-01" });
      fireEvent.change(screen.getByLabelText("Default value"), { target: { value: "2026-09-02" } });
      expect(onUpdate).toHaveBeenCalledWith("form-date", { defaultValue: "2026-09-02" });
      fireEvent.change(screen.getByLabelText("Date format"), { target: { value: "dd/MM/yyyy" } });
      expect(onUpdate).toHaveBeenCalledWith("form-date", {
        dateFormat: "dd/MM/yyyy",
        value: "27/08/2026",
        defaultValue: "01/08/2026",
      });
      expect(screen.getByText(/Automatic date formatting depends/)).toBeInTheDocument();
    });

    it("uses the default date format when optional date metadata is absent", () => {
      const { onUpdate } = renderInspector(formField("date", {
        value: undefined,
        defaultValue: undefined,
        dateFormat: undefined,
      }));
      expect(screen.getByLabelText("Value")).toHaveAttribute("placeholder", "yyyy-MM-dd");
      expect(screen.getByLabelText("Default value")).toHaveAttribute("placeholder", "yyyy-MM-dd");
      expect(screen.getByLabelText("Date format")).toHaveValue("yyyy-MM-dd");
      fireEvent.change(screen.getByLabelText("Date format"), { target: { value: "MM/dd/yyyy" } });
      expect(onUpdate).toHaveBeenCalledWith("form-date", {
        dateFormat: "MM/dd/yyyy",
        value: undefined,
        defaultValue: undefined,
      });
    });

    it("clears invalid date values when changing formats", () => {
      const { onUpdate } = renderInspector(
        formField("date", {
          value: "not-a-date",
          defaultValue: "2026-02-31",
          dateFormat: "yyyy-MM-dd",
        }),
      );
      fireEvent.change(screen.getByLabelText("Date format"), { target: { value: "MM/dd/yyyy" } });
      expect(onUpdate).toHaveBeenCalledWith("form-date", {
        dateFormat: "MM/dd/yyyy",
        value: undefined,
        defaultValue: undefined,
      });
    });

    it("does not write an invalid font size while the numeric input is cleared", () => {
      const { onUpdate } = renderInspector(formField("text", { fontSize: 18 }));
      const fontSize = screen.getByLabelText("Font size");
      fireEvent.change(fontSize, { target: { value: "" } });
      expect(onUpdate).not.toHaveBeenCalled();
      fireEvent.blur(fontSize, { target: { value: "" } });
      expect(onUpdate).toHaveBeenCalledWith("form-text", {
        fontSize: 12,
      });
    });

    it("discloses the signature placeholder export and hides unsupported field opacity", () => {
      renderInspector(formField("signature", { opacity: 0.5 }));
      expect(screen.getByRole("note")).toHaveTextContent("interactive text placeholders");
      expect(screen.queryByLabelText("Opacity")).not.toBeInTheDocument();
    });
  });

  it("renders page context for an ink operation", () => {
    const op: EditOperation = {
      id: "t1",
      type: "ink",
      pageIndex: 4,
      rect,
      createdAt: 1,
      points: [],
      stroke: "#000000",
      strokeWidth: 2,
    };
    renderInspector(op);
    expect(screen.getByText("ink")).toBeInTheDocument();
    expect(screen.getByText("Page 5")).toBeInTheDocument();
  });
});
