import { describe, expect, it } from "vitest";
import { createOperationsForTool } from "../src/editor/operationFactory";
import type { TextItem } from "../src/types/editor";

const textItem: TextItem = {
  id: "0:0",
  str: "Invoice total",
  pageIndex: 0,
  rect: { x: 72, y: 700, width: 110, height: 20 },
  fontName: "Helvetica-Bold",
  cssFontFamily: "Helvetica",
  fontSize: 20,
  fontWeight: 700,
};

describe("operation factory", () => {
  it("creates replacement text overlays with detected style metadata", () => {
    const [operation] = createOperationsForTool({
      activeTool: "select",
      viewportRect: { left: 72, top: 72, width: 110, height: 20 },
      pageHeight: 792,
      pageIndex: 0,
      scale: 1,
      operations: [],
      prompt: () => null,
      sourceTextItem: textItem,
      sampledBackgroundColor: "#d7ecff",
      sampledTextColor: "#f8fafc",
    });

    expect(operation.type).toBe("text");
    if (operation.type !== "text") throw new Error("Expected text operation");
    expect(operation.text).toBe("Invoice total");
    expect(operation.bold).toBe(true);
    expect(operation.fontSize).toBe(20);
    expect(operation.color).toBe("#f8fafc");
    expect(operation.whiteout).toBe(true);
    expect(operation.whiteoutColor).toBe("#d7ecff");
    expect(operation.sourceCoverRect).toEqual({ x: 72, y: 700, width: 110, height: 20 });
    expect(operation.sourceRunId).toBe("0:0");
  });

  it("does not set a source cover rect for plain new text", () => {
    const [operation] = createOperationsForTool({
      activeTool: "text",
      viewportRect: { left: 100, top: 100, width: 120, height: 22 },
      pageHeight: 792,
      pageIndex: 0,
      scale: 1,
      operations: [],
      prompt: () => null,
    });

    expect(operation.type).toBe("text");
    if (operation.type !== "text") throw new Error("Expected text operation");
    expect(operation.sourceCoverRect).toBeUndefined();
  });

  it("uses sampled rendered weight when PDF font metadata is generic", () => {
    const [operation] = createOperationsForTool({
      activeTool: "select",
      viewportRect: { left: 72, top: 72, width: 110, height: 20 },
      pageHeight: 792,
      pageIndex: 0,
      scale: 1,
      operations: [],
      prompt: () => null,
      sourceTextItem: {
        ...textItem,
        fontName: "g_d1_f1",
        cssFontFamily: "sans-serif",
        fontWeight: 400,
      },
      sampledBackgroundColor: "#ffffff",
      sampledTextColor: "#111827",
      sampledFontWeight: 700,
    });

    expect(operation.type).toBe("text");
    if (operation.type !== "text") throw new Error("Expected text operation");
    expect(operation.fontFamily).toBe("Helvetica");
    expect(operation.bold).toBe(true);
    expect(operation.fontWeight).toBe(700);
  });

  it("inherits nearby PDF text style for new text without covering the source line", () => {
    const [operation] = createOperationsForTool({
      activeTool: "text",
      viewportRect: { left: 210, top: 72, width: 120, height: 22 },
      pageHeight: 792,
      pageIndex: 0,
      scale: 1,
      operations: [],
      prompt: () => null,
      inheritStyleFromTextItem: {
        ...textItem,
        fontName: "g_d1_f1",
        cssFontFamily: "sans-serif",
      },
      sampledTextColor: "#ffffff",
    });

    expect(operation.type).toBe("text");
    if (operation.type !== "text") throw new Error("Expected text operation");
    expect(operation.text).toBe("New text");
    expect(operation.fontFamily).toBe("Helvetica");
    expect(operation.cssFontFamily?.startsWith('"g_d1_f1", sans-serif')).toBe(true);
    expect(operation.color).toBe("#ffffff");
    expect(operation.whiteout).toBe(false);
    expect(operation.whiteoutColor).toBeUndefined();
  });

  it("creates form fields through a prompt boundary", () => {
    const [operation] = createOperationsForTool({
      activeTool: "form-dropdown",
      viewportRect: { left: 100, top: 100, width: 160, height: 32 },
      pageHeight: 792,
      pageIndex: 0,
      scale: 1,
      operations: [],
      prompt: (message) => (message === "Field name" ? "status" : "Paid, Pending"),
    });

    expect(operation.type).toBe("form-field");
    if (operation.type !== "form-field") throw new Error("Expected form-field operation");
    expect(operation.kind).toBe("dropdown");
    expect(operation.name).toBe("status");
    expect(operation.options).toEqual(["Paid", "Pending"]);
  });
});
