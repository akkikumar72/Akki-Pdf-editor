import { describe, expect, it } from "vitest";
import {
  createOperationsForTool,
  createReplacementOperation,
  createSnappedAnnotationOperations,
  createTextItemReplacementOperation,
  describeInlineInput,
} from "../src/editor/operationFactory";
import type { EditOperation, TextItem } from "../src/types/editor";
import type { TextMatch } from "../src/utils/textSearch";
import { padReplacementCoverRect } from "../src/utils/textMetrics";

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
    expect(operation.sourceCoverRect).toEqual(padReplacementCoverRect({ x: 72, y: 700, width: 110, height: 20 }, 20));
  });

  it("does not set a source cover rect for plain new text", () => {
    const [operation] = createOperationsForTool({
      activeTool: "text",
      viewportRect: { left: 100, top: 100, width: 120, height: 22 },
      pageHeight: 792,
      pageIndex: 0,
      scale: 1,
      operations: [],
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
      inheritStyleFromTextItem: {
        ...textItem,
        fontName: "g_d1_f1",
        cssFontFamily: "sans-serif",
      },
      sampledTextColor: "#ffffff",
    });

    expect(operation.type).toBe("text");
    if (operation.type !== "text") throw new Error("Expected text operation");
    expect(operation.text).toBe("Type your text");
    expect(operation.fontFamily).toBe("Helvetica");
    expect(operation.cssFontFamily?.startsWith('"g_d1_f1", sans-serif')).toBe(true);
    expect(operation.color).toBe("#ffffff");
    expect(operation.whiteout).toBe(false);
    expect(operation.whiteoutColor).toBeUndefined();
  });

  it("createTextItemReplacementOperation masks the whole item and carries the new text", () => {
    const operation = createTextItemReplacementOperation(textItem, "Grand total", 792);
    expect(operation.type).toBe("text");
    expect(operation.text).toBe("Grand total");
    expect(operation.pageIndex).toBe(0);
    expect(operation.whiteout).toBe(true);
    expect(operation.whiteoutColor).toBe("#ffffff");
    expect(operation.fontSize).toBe(20);
    expect(operation.sourceCoverRect).toEqual(padReplacementCoverRect(textItem.rect, 20));
  });

  it("createReplacementOperation substitutes only the matched occurrence within the item text", () => {
    const match: TextMatch = {
      pageIndex: 0,
      item: textItem,
      startIndex: 8,
      endIndex: 13,
      rect: { x: 139, y: 700, width: 43, height: 20 },
    };
    const operation = createReplacementOperation(match, "amount", 792);
    expect(operation.text).toBe("Invoice amount");
    expect(operation.whiteout).toBe(true);
  });

  it("createSnappedAnnotationOperations keeps rects verbatim and styles per tool", () => {
    const rects = [
      { x: 10, y: 700, width: 80, height: 12 },
      { x: 10, y: 680, width: 60, height: 12 },
    ];
    const highlights = createSnappedAnnotationOperations("highlight", 1, rects);
    expect(highlights).toHaveLength(2);
    expect(highlights[0]).toMatchObject({
      type: "annotation",
      kind: "highlight",
      pageIndex: 1,
      rect: rects[0],
      color: "#ffe066",
      opacity: 0.36,
    });

    const [strikeout] = createSnappedAnnotationOperations("strikeout", 0, [rects[0]]);
    expect(strikeout).toMatchObject({ kind: "strikeout", color: "#ef4444", opacity: 1 });

    const [underline] = createSnappedAnnotationOperations("underline", 0, [rects[1]]);
    expect(underline).toMatchObject({ kind: "underline", color: "#ef4444", opacity: 1, rect: rects[1] });
  });

  it("creates form fields through resolved inline input fields", () => {
    const [operation] = createOperationsForTool({
      activeTool: "form-dropdown",
      viewportRect: { left: 100, top: 100, width: 160, height: 32 },
      pageHeight: 792,
      pageIndex: 0,
      scale: 1,
      operations: [],
      resolvedFields: { name: "status", options: "Paid, Pending" },
    });

    expect(operation.type).toBe("form-field");
    if (operation.type !== "form-field") throw new Error("Expected form-field operation");
    expect(operation.kind).toBe("dropdown");
    expect(operation.name).toBe("status");
    expect(operation.options).toEqual(["Paid", "Pending"]);
  });

  const baseInput = {
    viewportRect: { left: 50, top: 50, width: 10, height: 10 },
    pageHeight: 792,
    pageIndex: 2,
    scale: 1,
    operations: [] as EditOperation[],
  };

  it("uses a reliable embedded font name and keeps detected weight without sampling", () => {
    const [operation] = createOperationsForTool({
      ...baseInput,
      activeTool: "select",
      sourceTextItem: {
        str: "Body copy",
        pageIndex: 0,
        rect: { x: 10, y: 10, width: 200, height: 16 },
        fontName: "UberMove-Regular",
        cssFontFamily: "UberMove",
        fontSize: 12,
        fontWeight: 400,
        italic: true,
      },
      sampledFontWeight: 800,
    });
    if (operation.type !== "text") throw new Error("Expected text operation");
    // Reliable font name -> detected weight wins, sampled weight ignored.
    expect(operation.fontWeight).toBe(400);
    expect(operation.bold).toBe(false);
    expect(operation.italic).toBe(true);
    expect(operation.fontStyle).toBe("italic");
  });

  it("falls back to detected weight when generic font name has no strong sample", () => {
    const [operation] = createOperationsForTool({
      ...baseInput,
      activeTool: "select",
      sourceTextItem: {
        str: "ALL CAPS HEADING TEXT",
        pageIndex: 0,
        rect: { x: 10, y: 10, width: 50, height: 16 },
        fontName: "g_d0_f4",
        cssFontFamily: "sans-serif",
        sampledFontWeight: 500,
      },
      sampledFontWeight: 500,
    });
    if (operation.type !== "text") throw new Error("Expected text operation");
    // sampledFontWeight < 600 -> detectedFontWeight (sampledFontWeight on item, 500)
    expect(operation.fontWeight).toBe(500);
    expect(operation.bold).toBe(false);
  });

  it("defaults font size, weight, and color when no style item is present", () => {
    const [operation] = createOperationsForTool({
      ...baseInput,
      activeTool: "text",
    });
    if (operation.type !== "text") throw new Error("Expected text operation");
    expect(operation.text).toBe("Type your text");
    expect(operation.fontSize).toBe(14);
    expect(operation.color).toBe("#111827");
    expect(operation.bold).toBeUndefined();
    expect(operation.italic).toBeUndefined();
    expect(operation.fontWeight).toBeUndefined();
    expect(operation.fontStyle).toBeUndefined();
    expect(operation.cssFontFamily).toBeUndefined();
    expect(operation.rect.width).toBeGreaterThanOrEqual(130);
    // Height must track the font's own line height (not a flat constant unrelated to
    // fontSize) so the caret lands at the click point instead of visibly below it.
    expect(operation.rect.height).toBeCloseTo(operation.fontSize * 1.15, 5);
    // Reference parity (Sejda): the box is centered vertically ON the click point
    // (PDF-space click Y = pageHeight - viewportRect.top, here 792 - 50), so the
    // text originates at the cursor instead of hanging below it.
    const boxCenterY = operation.rect.y + operation.rect.height / 2;
    expect(boxCenterY).toBeCloseTo(792 - 50, 5);
  });

  it("clamps to the sampled weight when no detected weight exists (generic font)", () => {
    const [operation] = createOperationsForTool({
      ...baseInput,
      activeTool: "select",
      sourceTextItem: {
        str: "Sampled bold",
        pageIndex: 0,
        rect: { x: 10, y: 10, width: 80, height: 16 },
        fontName: "g_d0_f4",
        cssFontFamily: "sans-serif",
        fontSize: 12,
        // no fontWeight, no sampledFontWeight on the item -> detectedFontWeight undefined
      },
      sampledFontWeight: 700,
    });
    if (operation.type !== "text") throw new Error("Expected text operation");
    // Math.max(detectedFontWeight ?? 0, 700) -> 700
    expect(operation.fontWeight).toBe(700);
    expect(operation.bold).toBe(true);
  });

  it("handles an empty-string replacement with no resolvable weight", () => {
    const [operation] = createOperationsForTool({
      ...baseInput,
      activeTool: "select",
      sourceTextItem: {
        str: "",
        pageIndex: 0,
        rect: { x: 10, y: 10, width: 80, height: 16 },
        fontName: "g_d0_f4",
        cssFontFamily: "sans-serif",
        fontSize: 12,
        // no detected weight and no strong sample -> fontWeight stays undefined
      },
    });
    if (operation.type !== "text") throw new Error("Expected text operation");
    expect(operation.text).toBe("");
    // fontWeight undefined -> bold falls back through (fontWeight ?? 400) >= 600
    expect(operation.fontWeight).toBeUndefined();
    expect(operation.bold).toBe(false);
  });

  it("creates a whiteout rectangle", () => {
    const [operation] = createOperationsForTool({ ...baseInput, activeTool: "whiteout" });
    expect(operation.type).toBe("whiteout");
    expect(operation.rect.width).toBe(120);
    expect(operation.rect.height).toBe(34);
  });

  it("creates a highlight annotation", () => {
    const [operation] = createOperationsForTool({ ...baseInput, activeTool: "highlight" });
    if (operation.type !== "annotation") throw new Error("Expected annotation");
    expect(operation.kind).toBe("highlight");
    expect(operation.opacity).toBe(0.36);
  });

  it("creates strikeout and underline annotations", () => {
    const [strike] = createOperationsForTool({ ...baseInput, activeTool: "strikeout" });
    const [underline] = createOperationsForTool({ ...baseInput, activeTool: "underline" });
    if (strike.type !== "annotation" || underline.type !== "annotation") {
      throw new Error("Expected annotations");
    }
    expect(strike.kind).toBe("strikeout");
    expect(underline.kind).toBe("underline");
  });

  it("creates a note annotation when a note is resolved, and bails when empty", () => {
    const [note] = createOperationsForTool({
      ...baseInput,
      activeTool: "annotate-text",
      resolvedFields: { text: "Check this" },
    });
    if (note.type !== "annotation") throw new Error("Expected annotation");
    expect(note.kind).toBe("note");
    expect(note.text).toBe("Check this");

    expect(
      createOperationsForTool({ ...baseInput, activeTool: "annotate-text" }),
    ).toEqual([]);
  });

  it("creates every shape variant", () => {
    const kinds = (["shape", "shape-ellipse", "shape-line", "shape-arrow"] as const).map((tool) => {
      const [operation] = createOperationsForTool({ ...baseInput, activeTool: tool });
      if (operation.type !== "shape") throw new Error("Expected shape");
      return operation.kind;
    });
    expect(kinds).toEqual(["rectangle", "ellipse", "line", "arrow"]);
  });

  it("creates ink and draw strokes with variant-specific styling", () => {
    const [ink] = createOperationsForTool({ ...baseInput, activeTool: "ink" });
    const [draw] = createOperationsForTool({ ...baseInput, activeTool: "draw" });
    if (ink.type !== "ink" || draw.type !== "ink") throw new Error("Expected ink");
    expect(ink.stroke).toBe("#111827");
    expect(ink.strokeWidth).toBe(2);
    expect(ink.variant).toBe("ink");
    expect(draw.stroke).toBe("#2563eb");
    expect(draw.strokeWidth).toBe(2.4);
    expect(draw.variant).toBe("draw");
    expect(ink.points).toHaveLength(4);
  });

  it("creates a link, and bails for empty or unsafe URLs", () => {
    const [link] = createOperationsForTool({
      ...baseInput,
      activeTool: "link",
      resolvedFields: { href: "https://example.com" },
    });
    if (link.type !== "link") throw new Error("Expected link");
    expect(link.href).toContain("example.com");

    expect(createOperationsForTool({ ...baseInput, activeTool: "link" })).toEqual([]);
    expect(
      createOperationsForTool({ ...baseInput, activeTool: "link", resolvedFields: { href: "javascript:alert(1)" } }),
    ).toEqual([]);
  });

  it("creates a stamp when labelled, and bails when the label is empty", () => {
    const [stamp] = createOperationsForTool({ ...baseInput, activeTool: "stamp", resolvedFields: { label: "PAID" } });
    if (stamp.type !== "stamp") throw new Error("Expected stamp");
    expect(stamp.label).toBe("PAID");
    expect(stamp.subline).toBeUndefined();
    expect(stamp.rect.height).toBe(46);
    expect(createOperationsForTool({ ...baseInput, activeTool: "stamp" })).toEqual([]);
  });

  it("computes the stamp subline from author and date style", () => {
    const both = createOperationsForTool({
      ...baseInput,
      activeTool: "stamp",
      resolvedFields: { label: "Approved", author: "Akki", dateStyle: "mdy" },
    })[0];
    if (both.type !== "stamp") throw new Error("Expected stamp");
    expect(both.subline).toMatch(/^By Akki at [A-Z][a-z]{2} \d{1,2}, \d{4}$/);
    // A subline makes the default box taller so both lines fit.
    expect(both.rect.height).toBe(58);

    const authorOnly = createOperationsForTool({
      ...baseInput,
      activeTool: "stamp",
      resolvedFields: { label: "Approved", author: "Akki", dateStyle: "none" },
    })[0];
    if (authorOnly.type !== "stamp") throw new Error("Expected stamp");
    expect(authorOnly.subline).toBe("By Akki");

    const dateOnly = createOperationsForTool({
      ...baseInput,
      activeTool: "stamp",
      resolvedFields: { label: "Approved", dateStyle: "dmy" },
    })[0];
    if (dateOnly.type !== "stamp") throw new Error("Expected stamp");
    expect(dateOnly.subline).toMatch(/^\d{1,2} [A-Z][a-z]{2}, \d{4}$/);

    const neither = createOperationsForTool({
      ...baseInput,
      activeTool: "stamp",
      resolvedFields: { label: "Approved" },
    })[0];
    if (neither.type !== "stamp") throw new Error("Expected stamp");
    expect(neither.subline).toBeUndefined();
  });

  it("no longer creates signatures through the generic factory (studio flow owns them)", () => {
    expect(createOperationsForTool({ ...baseInput, activeTool: "signature", resolvedFields: { value: "Akki" } })).toEqual([]);
    expect(createOperationsForTool({ ...baseInput, activeTool: "signature" })).toEqual([]);
  });

  it("creates the non-dropdown form kinds", () => {
    const text = createOperationsForTool({ ...baseInput, activeTool: "form-text", resolvedFields: { name: "name" } })[0];
    if (text.type !== "form-field") throw new Error("Expected form-field");
    expect(text.kind).toBe("text");
    expect(text.options).toBeUndefined();
    expect(text.checked).toBeUndefined();
    expect(text.value).toBeUndefined();

    const multiline = createOperationsForTool({
      ...baseInput,
      activeTool: "form-multiline",
      resolvedFields: { name: "notes" },
    })[0];
    if (multiline.type !== "form-field") throw new Error("Expected form-field");
    expect(multiline.kind).toBe("multiline");
    expect(multiline.rect.height).toBe(76);

    const radio = createOperationsForTool({ ...baseInput, activeTool: "form-radio", resolvedFields: { name: "r" } })[0];
    if (radio.type !== "form-field") throw new Error("Expected form-field");
    expect(radio.checked).toBe(false);

    const signature = createOperationsForTool({
      ...baseInput,
      activeTool: "form-signature",
      resolvedFields: { name: "sign" },
    })[0];
    if (signature.type !== "form-field") throw new Error("Expected form-field");
    expect(signature.kind).toBe("signature");
    expect(signature.value).toBe("Signature");
  });

  it("creates a check mark centered on the click point, not top-left anchored", () => {
    const [mark] = createOperationsForTool({ ...baseInput, activeTool: "mark-check" });
    if (mark.type !== "form-mark") throw new Error("Expected form-mark");
    expect(mark.mark).toBe("check");
    // baseInput's viewportRect click is left:50,top:50 against pageHeight 792 at
    // scale 1, so the click's PDF-space point is (50, 742) — the mark must be
    // centered there (a 16pt square), not anchored with that point as its corner.
    expect(mark.rect).toEqual({ x: 42, y: 734, width: 16, height: 16 });
    expect(mark.opacity).toBe(1);
  });

  it("bails when the form field name is empty", () => {
    expect(
      createOperationsForTool({ ...baseInput, activeTool: "form-text" }),
    ).toEqual([]);
  });

  it("defaults dropdown options to empty when the options field is empty", () => {
    const [operation] = createOperationsForTool({
      ...baseInput,
      activeTool: "form-dropdown",
      resolvedFields: { name: "choice" },
    });
    if (operation.type !== "form-field") throw new Error("Expected form-field");
    expect(operation.options).toEqual([]);
  });

  it("creates a table region with an incrementing label", () => {
    const [first] = createOperationsForTool({ ...baseInput, activeTool: "table-region" });
    if (first.type !== "table-region") throw new Error("Expected table-region");
    expect(first.label).toBe("Table 1");

    const [second] = createOperationsForTool({
      ...baseInput,
      activeTool: "table-region",
      operations: [first],
    });
    if (second.type !== "table-region") throw new Error("Expected table-region");
    expect(second.label).toBe("Table 2");
  });

  it("returns an empty list for unhandled tools", () => {
    expect(createOperationsForTool({ ...baseInput, activeTool: "image" })).toEqual([]);
    expect(createOperationsForTool({ ...baseInput, activeTool: "totally-unknown" as never })).toEqual([]);
  });
});

describe("describeInlineInput", () => {
  it("describes popovers for annotate-text, link, and stamp", () => {
    expect(describeInlineInput("annotate-text", [])).toEqual({
      title: "Annotation note",
      confirmLabel: "Add note",
      fields: [{ key: "text", label: "Note", defaultValue: "Note" }],
    });
    expect(describeInlineInput("link", [])).toEqual({
      title: "Add link",
      confirmLabel: "Add link",
      fields: [{ key: "href", label: "Link URL", defaultValue: "https://" }],
    });
    const stamp = describeInlineInput("stamp", []);
    expect(stamp?.title).toBe("Add stamp");
    expect(stamp?.fields.map((field) => field.key)).toEqual(["label", "author", "dateStyle"]);
    expect(stamp?.fields[0].defaultValue).toBe("Approved");
    expect(stamp?.fields[2].options?.map((option) => option.value)).toEqual([
      "none",
      "mdy",
      "time-mdy",
      "dmy",
      "time-dmy",
    ]);
  });

  it("returns null for the signature tool (handled by the signature studio modal)", () => {
    expect(describeInlineInput("signature", [])).toBeNull();
  });

  it("describes a single field for non-dropdown form tools, with an incrementing default name", () => {
    const first = describeInlineInput("form-text", []);
    expect(first?.fields).toEqual([{ key: "name", label: "Field name", defaultValue: "text_field_1" }]);

    const existing = createOperationsForTool({
      viewportRect: { left: 50, top: 50, width: 10, height: 10 },
      pageHeight: 792,
      pageIndex: 0,
      scale: 1,
      operations: [],
      activeTool: "form-text",
      resolvedFields: { name: "first" },
    });
    const second = describeInlineInput("form-text", existing);
    // index = existing form fields (1) + 1 = 2
    expect(second?.fields).toEqual([{ key: "name", label: "Field name", defaultValue: "text_field_2" }]);
  });

  it("describes two fields (name + options) for the dropdown form tool", () => {
    const descriptor = describeInlineInput("form-dropdown", []);
    expect(descriptor?.fields).toEqual([
      { key: "name", label: "Field name", defaultValue: "dropdown_1" },
      { key: "options", label: "Dropdown options", defaultValue: "Option 1, Option 2", placeholder: "Comma-separated" },
    ]);
  });

  it("returns null for tools that create immediately with no text input", () => {
    for (const tool of ["select", "text", "whiteout", "highlight", "shape", "ink", "mark-check", "image", "table-region"] as const) {
      expect(describeInlineInput(tool, [])).toBeNull();
    }
  });
});
