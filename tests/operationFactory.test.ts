import { describe, expect, it } from "vitest";
import { createOperationsForTool } from "../src/editor/operationFactory";
import type { TextItem } from "../src/types/editor";

const textItem: TextItem = {
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
    });

    expect(operation.type).toBe("text");
    if (operation.type !== "text") throw new Error("Expected text operation");
    expect(operation.text).toBe("Invoice total");
    expect(operation.bold).toBe(true);
    expect(operation.fontSize).toBe(20);
    expect(operation.whiteout).toBe(true);
  });

  it("creates form fields through a prompt boundary", () => {
    const [operation] = createOperationsForTool({
      activeTool: "form-dropdown",
      viewportRect: { left: 100, top: 100, width: 160, height: 32 },
      pageHeight: 792,
      pageIndex: 0,
      scale: 1,
      operations: [],
      prompt: (message) => message === "Field name" ? "status" : "Paid, Pending",
    });

    expect(operation.type).toBe("form-field");
    if (operation.type !== "form-field") throw new Error("Expected form-field operation");
    expect(operation.kind).toBe("dropdown");
    expect(operation.name).toBe("status");
    expect(operation.options).toEqual(["Paid", "Pending"]);
  });
});
