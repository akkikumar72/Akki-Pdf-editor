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

import type { EditOperation, EditorTool } from "../src/types/editor";

type Prompt = (message: string, defaultValue?: string) => string | null;

const baseInput = {
  viewportRect: { left: 100, top: 100, width: 10, height: 10 },
  pageHeight: 792,
  pageIndex: 0,
  scale: 1,
  operations: [] as EditOperation[],
  prompt: (() => null) as Prompt,
};

function make(tool: EditorTool, overrides: Partial<typeof baseInput> & { prompt?: Prompt } = {}) {
  return createOperationsForTool({ activeTool: tool, ...baseInput, ...overrides });
}

describe("operation factory — every tool branch", () => {
  it("creates a whiteout with minimum size", () => {
    const [op] = make("whiteout");
    expect(op.type).toBe("whiteout");
    expect(op.rect.width).toBe(120);
    expect(op.rect.height).toBe(34);
  });

  it("creates a highlight annotation", () => {
    const [op] = make("highlight");
    expect(op).toMatchObject({ type: "annotation", kind: "highlight", opacity: 0.36 });
  });

  it("creates strikeout and underline annotations", () => {
    expect(make("strikeout")[0]).toMatchObject({ type: "annotation", kind: "strikeout" });
    expect(make("underline")[0]).toMatchObject({ type: "annotation", kind: "underline" });
  });

  it("creates a note annotation through a prompt and bails when cancelled", () => {
    expect(make("annotate-text", { prompt: () => "Hi" })[0]).toMatchObject({ type: "annotation", kind: "note", text: "Hi" });
    expect(make("annotate-text", { prompt: () => null })).toEqual([]);
  });

  it("creates each shape kind", () => {
    expect(make("shape")[0]).toMatchObject({ type: "shape", kind: "rectangle" });
    expect(make("shape-ellipse")[0]).toMatchObject({ type: "shape", kind: "ellipse" });
    expect(make("shape-line")[0]).toMatchObject({ type: "shape", kind: "line" });
    expect(make("shape-arrow")[0]).toMatchObject({ type: "shape", kind: "arrow" });
  });

  it("creates ink and draw strokes with distinct styling", () => {
    const ink = make("ink")[0];
    const draw = make("draw")[0];
    expect(ink).toMatchObject({ type: "ink", variant: "ink", stroke: "#111827", strokeWidth: 2 });
    expect(draw).toMatchObject({ type: "ink", variant: "draw", stroke: "#2563eb", strokeWidth: 2.4 });
    if (ink.type === "ink") expect(ink.points).toHaveLength(4);
  });

  it("creates a link only for a safe URL", () => {
    expect(make("link", { prompt: () => "example.com" })[0]).toMatchObject({ type: "link", href: "https://example.com/" });
    expect(make("link", { prompt: () => null })).toEqual([]); // cancelled
    expect(make("link", { prompt: () => "javascript:alert(1)" })).toEqual([]); // unsafe -> dropped
  });

  it("creates a stamp and bails when cancelled", () => {
    expect(make("stamp", { prompt: () => "PAID" })[0]).toMatchObject({ type: "stamp", label: "PAID" });
    expect(make("stamp", { prompt: () => null })).toEqual([]);
  });

  it("creates a typed signature and bails when cancelled", () => {
    expect(make("signature", { prompt: () => "Akki" })[0]).toMatchObject({ type: "signature", mode: "typed", value: "Akki" });
    expect(make("signature", { prompt: () => null })).toEqual([]);
  });

  it("creates each form-field kind", () => {
    expect(make("form-text", { prompt: () => "name" })[0]).toMatchObject({ type: "form-field", kind: "text" });
    expect(make("form-multiline", { prompt: () => "notes" })[0]).toMatchObject({ type: "form-field", kind: "multiline", rect: expect.objectContaining({ height: 76 }) });
    expect(make("form-radio", { prompt: () => "r" })[0]).toMatchObject({ type: "form-field", kind: "radio", checked: false });
    expect(make("form-checkbox", { prompt: () => "c" })[0]).toMatchObject({ type: "form-field", kind: "checkbox", checked: false });
    expect(make("form-signature", { prompt: () => "s" })[0]).toMatchObject({ type: "form-field", kind: "signature", value: "Signature" });
  });

  it("uses the default field name when the prompt returns the placeholder and bails on cancel", () => {
    const [op] = make("form-text", { prompt: (message, def) => (message === "Field name" ? def ?? null : null) });
    expect(op).toMatchObject({ type: "form-field", kind: "text" });
    if (op.type === "form-field") expect(op.name).toMatch(/text_field_1/);
    expect(make("form-text", { prompt: () => null })).toEqual([]);
  });

  it("falls back to an empty dropdown option list when the options prompt is cancelled", () => {
    const [op] = make("form-dropdown", {
      prompt: (message) => (message === "Field name" ? "status" : null),
    });
    if (op.type !== "form-field") throw new Error("expected form-field");
    expect(op.options).toEqual([]);
  });

  it("numbers form fields and table regions from existing operations", () => {
    const existing: EditOperation[] = [
      { id: "f1", type: "form-field", kind: "text", pageIndex: 0, rect: { x: 0, y: 0, width: 1, height: 1 }, name: "a", createdAt: 1 },
      { id: "tr1", type: "table-region", pageIndex: 0, rect: { x: 0, y: 0, width: 1, height: 1 }, label: "Table 1", createdAt: 1 },
    ];
    const [field] = make("form-text", { operations: existing, prompt: (m, d) => (m === "Field name" ? d ?? null : null) });
    if (field.type === "form-field") expect(field.name).toMatch(/_2$/);
    const [table] = make("table-region", { operations: existing });
    if (table.type === "table-region") expect(table.label).toBe("Table 2");
  });

  it("creates a table region", () => {
    const [op] = make("table-region");
    expect(op).toMatchObject({ type: "table-region", label: "Table 1" });
    expect(op.rect.width).toBe(240);
    expect(op.rect.height).toBe(120);
  });

  it("returns nothing for tools handled elsewhere (image/select)", () => {
    expect(make("image")).toEqual([]);
    expect(make("select")).toEqual([]);
  });

  it("honours a reliable embedded font name over the sampled rendered weight", () => {
    const [op] = createOperationsForTool({
      ...baseInput,
      activeTool: "select",
      sourceTextItem: {
        str: "TOTAL",
        pageIndex: 0,
        rect: { x: 10, y: 700, width: 60, height: 16 },
        fontName: "Roboto-Light",
        fontWeight: 300,
        fontSize: 16,
      },
      sampledFontWeight: 800,
      sampledTextColor: "#000000",
    });
    if (op.type !== "text") throw new Error("expected text");
    // reliable name -> detected weight wins, sampled 800 is ignored
    expect(op.fontWeight).toBe(300);
    expect(op.bold).toBe(false);
  });

  it("derives weight from styleTextItem.sampledFontWeight when fontWeight is absent", () => {
    const [op] = createOperationsForTool({
      ...baseInput,
      activeTool: "select",
      sourceTextItem: {
        str: "hi",
        pageIndex: 0,
        rect: { x: 10, y: 700, width: 40, height: 16 },
        fontName: "Inter",
        sampledFontWeight: 700,
        fontSize: 14,
      },
    });
    if (op.type !== "text") throw new Error("expected text");
    expect(op.fontWeight).toBe(700);
    expect(op.bold).toBe(true);
  });

  it("marks italic replacement text", () => {
    const [op] = createOperationsForTool({
      ...baseInput,
      activeTool: "select",
      sourceTextItem: {
        str: "x",
        pageIndex: 0,
        rect: { x: 10, y: 700, width: 40, height: 16 },
        fontName: "Inter-Italic",
        italic: true,
        fontSize: 14,
      },
    });
    if (op.type !== "text") throw new Error("expected text");
    expect(op.italic).toBe(true);
    expect(op.fontStyle).toBe("italic");
  });

  it("uses the sampled weight alone when no detected weight exists", () => {
    const [op] = createOperationsForTool({
      ...baseInput,
      activeTool: "select",
      sourceTextItem: {
        str: "hi",
        pageIndex: 0,
        rect: { x: 10, y: 700, width: 40, height: 16 },
        fontName: "g_d0_f2", // unreliable id, no fontWeight/sampledFontWeight on the item
        fontSize: 14,
      },
      sampledFontWeight: 800, // >= 600 -> Math.max(detected ?? 0, 800)
    });
    if (op.type !== "text") throw new Error("expected text");
    expect(op.fontWeight).toBe(800);
    expect(op.bold).toBe(true);
  });

  it("handles an empty replacement string and a sub-600 sampled weight", () => {
    const [op] = createOperationsForTool({
      ...baseInput,
      activeTool: "select",
      sourceTextItem: {
        str: "", // empty -> uppercaseRatio falls back to 0
        pageIndex: 0,
        rect: { x: 10, y: 700, width: 40, height: 16 },
        fontName: "g_d0_f1", // unreliable id
        fontSize: 14,
      },
      sampledFontWeight: 500, // present but < 600 -> detected weight branch
    });
    if (op.type !== "text") throw new Error("expected text");
    expect(op.text).toBe("");
    expect(op.fontWeight).toBeUndefined();
  });

  it("estimates an all-caps replacement width with a heavier glyph ratio", () => {
    const [op] = createOperationsForTool({
      ...baseInput,
      activeTool: "select",
      sourceTextItem: {
        str: "WIDEUPPERCASE",
        pageIndex: 0,
        rect: { x: 10, y: 700, width: 5, height: 16 },
        fontName: "Arial-Bold",
        fontWeight: 700,
        fontSize: 20,
      },
    });
    if (op.type !== "text") throw new Error("expected text");
    // estimate exceeds the tiny source rect width
    expect(op.rect.width).toBeGreaterThan(20);
  });
});
