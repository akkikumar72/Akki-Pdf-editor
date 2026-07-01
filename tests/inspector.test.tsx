import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Inspector } from "../src/components/Inspector";
import type { EditOperation, TextItem, TextOperation } from "../src/types/editor";

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

function renderInspector(operation?: EditOperation, opts: Partial<{ operationCount: number; pageTextItems: TextItem[] }> = {}) {
  const onExport = vi.fn();
  const onUpdate = vi.fn();
  render(
    <Inspector
      operation={operation}
      operationCount={opts.operationCount ?? 2}
      pageTextItems={opts.pageTextItems ?? []}
      onExport={onExport}
      onUpdate={onUpdate}
    />,
  );
  return { onExport, onUpdate };
}

describe("Inspector", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the empty state when no operation is selected", () => {
    renderInspector(undefined);
    expect(screen.getByText("No selection")).toBeInTheDocument();
    expect(screen.getByText(/Select an overlay/)).toBeInTheDocument();
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
      const { onUpdate } = renderInspector(baseText());

      // Summary: "text" with replaced dash, and page number.
      expect(screen.getByText("text")).toBeInTheDocument();
      expect(screen.getByText("Page 1")).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Bye" } });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { text: "Bye" });

      fireEvent.change(screen.getByLabelText("Font"), { target: { value: "Arial" } });
      expect(onUpdate).toHaveBeenCalledWith("op-1", {
        fontFamily: "Arial",
        cssFontFamily: undefined,
        detectedFontName: undefined,
        embeddedFontKey: undefined,
      });

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

    it("clamps out-of-range font sizes", () => {
      const { onUpdate } = renderInspector(baseText({ fontSize: 14 }));
      const size = screen.getByLabelText("Size");
      // Below min clamps to 6.
      fireEvent.change(size, { target: { value: "1" } });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { fontSize: 6 });
      // Above max clamps to 96.
      fireEvent.change(size, { target: { value: "500" } });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { fontSize: 96 });
      // A mid-range value passes through unclamped.
      fireEvent.change(size, { target: { value: "30" } });
      expect(onUpdate).toHaveBeenCalledWith("op-1", { fontSize: 30 });
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

    it("shows the detected-font helper text when a detected name exists", () => {
      renderInspector(baseText({ embeddedFontKey: undefined, detectedFontName: "Helvetica" }));
      expect(screen.getByText(/Detected Helvetica/)).toBeInTheDocument();
    });

    it("shows the detected-font helper text via cssFontFamily only", () => {
      renderInspector(baseText({ embeddedFontKey: undefined, detectedFontName: undefined, cssFontFamily: "Georgia" }));
      expect(screen.getByText(/Detected Georgia/)).toBeInTheDocument();
    });

    it("shows the fallback helper text when no font info exists", () => {
      renderInspector(baseText({ embeddedFontKey: undefined, detectedFontName: undefined, cssFontFamily: undefined, fontFamily: "Inter" }));
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

  describe("form-field checkbox operation", () => {
    function checkbox(overrides: Partial<EditOperation> = {}): EditOperation {
      return {
        id: "cb-1",
        type: "form-field",
        kind: "checkbox",
        pageIndex: 0,
        rect,
        createdAt: 1,
        name: "Agree",
        checked: false,
        ...overrides,
      } as EditOperation;
    }

    it("renders an unchecked toggle and fires an update on click", () => {
      const { onUpdate } = renderInspector(checkbox({ checked: false }));
      const toggle = screen.getByLabelText("Checked") as HTMLInputElement;
      expect(toggle.checked).toBe(false);
      fireEvent.click(toggle);
      expect(onUpdate).toHaveBeenCalledWith("cb-1", { checked: true });
    });

    it("reflects an already-checked state", () => {
      renderInspector(checkbox({ checked: true }));
      expect((screen.getByLabelText("Checked") as HTMLInputElement).checked).toBe(true);
    });

    it("does not render the checked toggle for a non-checkbox form field", () => {
      renderInspector(checkbox({ kind: "text" }));
      expect(screen.queryByLabelText("Checked")).not.toBeInTheDocument();
    });
  });

  describe("link operation", () => {
    it("renders the URL field, fires onChange, and sanitizes a safe URL on blur", () => {
      const link: EditOperation = {
        id: "l1",
        type: "link",
        pageIndex: 0,
        rect,
        createdAt: 1,
        href: "example.com",
      };
      const { onUpdate } = renderInspector(link);
      const url = screen.getByLabelText("URL");
      fireEvent.change(url, { target: { value: "https://safe.test/path" } });
      expect(onUpdate).toHaveBeenCalledWith("l1", { href: "https://safe.test/path" });

      fireEvent.blur(url, { target: { value: "https://safe.test/path" } });
      expect(onUpdate).toHaveBeenCalledWith("l1", { href: "https://safe.test/path" });
    });

    it("clears the field on blur for an unsafe URL", () => {
      const link: EditOperation = {
        id: "l2",
        type: "link",
        pageIndex: 0,
        rect,
        createdAt: 1,
        href: "javascript:alert(1)",
      };
      const { onUpdate } = renderInspector(link);
      fireEvent.blur(screen.getByLabelText("URL"), { target: { value: "javascript:alert(1)" } });
      expect(onUpdate).toHaveBeenCalledWith("l2", { href: "" });
    });
  });

  it("renders a non-special operation type without type-specific controls", () => {
    // table-region has no opacity, shape, link, or text branch.
    const op: EditOperation = {
      id: "t1",
      type: "table-region",
      pageIndex: 4,
      rect,
      createdAt: 1,
      label: "Table A",
    };
    renderInspector(op);
    expect(screen.getByText("table region")).toBeInTheDocument();
    expect(screen.getByText("Page 5")).toBeInTheDocument();
    expect(screen.queryByLabelText("Opacity")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("URL")).not.toBeInTheDocument();
  });
});
