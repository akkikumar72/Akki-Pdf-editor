import { BlendMode, LineCapStyle, type PDFFont, type PDFPage } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { writeAnnotation, writeInk, writeRedaction, writeShape, writeText, type WriterContext } from "../src/engine/operationWriters";
import type { AnnotationOperation, InkOperation, RedactionOperation, ShapeOperation, TextOperation } from "../src/types/editor";

describe("operationWriters", () => {
  const redaction = (overlayText: string): RedactionOperation => ({
    id: "redaction-1",
    type: "redaction",
    mode: "area",
    pageIndex: 0,
    rect: { x: 40, y: 700, width: 120, height: 24 },
    fillColor: "#111111",
    overlayText,
    createdAt: 1,
  });

  it("uses cleaned overlay text consistently when exporting a redaction", async () => {
    const drawText = vi.fn();
    const page = { drawRectangle: vi.fn(), drawText } as unknown as PDFPage;
    const font = { widthOfTextAtSize: vi.fn(() => 60) } as unknown as PDFFont;
    const context: WriterContext = {
      getFont: async () => font,
      getReusedFont: async () => null,
      embeddedCovers: () => false,
    };

    await writeRedaction(page, redaction("Review\tthis\b"), context);

    expect(font.widthOfTextAtSize).toHaveBeenCalledWith("Review    this", expect.any(Number));
    expect(drawText).toHaveBeenCalledWith("Review    this", expect.any(Object));
  });

  it("keeps the redaction mask but skips overlay text that cleans to empty", async () => {
    const drawRectangle = vi.fn();
    const drawText = vi.fn();
    const getFont = vi.fn(async () => ({ widthOfTextAtSize: vi.fn() }) as unknown as PDFFont);
    const page = { drawRectangle, drawText } as unknown as PDFPage;
    const context: WriterContext = {
      getFont,
      getReusedFont: async () => null,
      embeddedCovers: () => false,
    };

    await writeRedaction(page, redaction("\b"), context);

    expect(drawRectangle).toHaveBeenCalledOnce();
    expect(getFont).not.toHaveBeenCalled();
    expect(drawText).not.toHaveBeenCalled();
  });

  it("exports a redaction without resolving a font when no overlay text is set", async () => {
    const drawRectangle = vi.fn();
    const getFont = vi.fn();
    const page = { drawRectangle, drawText: vi.fn() } as unknown as PDFPage;
    const context: WriterContext = {
      getFont,
      getReusedFont: async () => null,
      embeddedCovers: () => false,
    };

    await writeRedaction(page, redaction("   "), context);

    expect(drawRectangle).toHaveBeenCalledOnce();
    expect(getFont).not.toHaveBeenCalled();
  });

  it("keeps narrow single-line text unwrapped so export matches the canvas", async () => {
    const drawText = vi.fn();
    const page = { drawText } as unknown as PDFPage;
    const font = { widthOfTextAtSize: vi.fn(() => 240) } as unknown as PDFFont;
    const context: WriterContext = {
      getFont: async () => font,
      getReusedFont: async () => null,
      embeddedCovers: () => false,
    };
    const operation: TextOperation = {
      id: "text-1",
      type: "text",
      pageIndex: 0,
      rect: { x: 40, y: 700, width: 32, height: 14 },
      text: "This stays on one line",
      fontFamily: "Helvetica",
      fontSize: 12,
      color: "#111827",
      align: "left",
      opacity: 1,
      createdAt: 1,
    };

    await writeText(page, operation, 1, context);

    expect(drawText).toHaveBeenCalledOnce();
    const options = drawText.mock.calls[0][1] as Record<string, unknown>;
    expect(options).not.toHaveProperty("maxWidth");
    expect(options.lineHeight).toBe(12);
  });

  it("exports directed arrows with both arrowhead sides at the drag end", () => {
    const drawLine = vi.fn();
    const page = { drawLine } as unknown as PDFPage;
    const operation: ShapeOperation = {
      id: "arrow-1",
      type: "shape",
      kind: "arrow",
      pageIndex: 0,
      rect: { x: 10, y: 20, width: 100, height: 50 },
      start: { x: 110, y: 70 },
      end: { x: 10, y: 20 },
      stroke: "#111827",
      strokeWidth: 2,
      createdAt: 1,
    };

    writeShape(page, operation, 0.8);

    expect(drawLine).toHaveBeenCalledTimes(3);
    expect(drawLine.mock.calls[0][0]).toMatchObject({
      start: operation.start,
      end: operation.end,
      opacity: 0.8,
      lineCap: LineCapStyle.Round,
    });
    expect(drawLine.mock.calls[1][0]).toMatchObject({
      start: operation.end,
      opacity: 0.8,
      lineCap: LineCapStyle.Round,
    });
    expect(drawLine.mock.calls[2][0]).toMatchObject({
      start: operation.end,
      opacity: 0.8,
      lineCap: LineCapStyle.Round,
    });
  });

  it("exports a minimal callout with default leader and appearance values", async () => {
    const drawLine = vi.fn();
    const drawText = vi.fn();
    const page = {
      drawLine,
      drawText,
      drawEllipse: vi.fn(),
      drawRectangle: vi.fn(),
    } as unknown as PDFPage;
    const context: WriterContext = {
      getFont: async () => ({ widthOfTextAtSize: vi.fn() }) as unknown as PDFFont,
      getReusedFont: async () => null,
      embeddedCovers: () => false,
    };
    const operation: AnnotationOperation = {
      id: "callout-defaults",
      type: "annotation",
      kind: "callout",
      pageIndex: 0,
      rect: { x: 80, y: 120, width: 160, height: 60 },
      color: "#4f46e5",
      createdAt: 1,
    };

    await writeAnnotation(page, operation, 0.8, context);

    expect(drawLine).toHaveBeenCalledOnce();
    expect(drawLine).toHaveBeenCalledWith(expect.objectContaining({
      start: { x: 32, y: 150 },
      end: { x: 80, y: 150 },
      thickness: 1.5,
    }));
    expect(drawText).not.toHaveBeenCalled();
  });

  it("exports a right-anchored callout with the same cleaned text it preflights", async () => {
    const drawLine = vi.fn();
    const drawText = vi.fn();
    const page = {
      drawLine,
      drawText,
      drawEllipse: vi.fn(),
      drawRectangle: vi.fn(),
    } as unknown as PDFPage;
    const font = { widthOfTextAtSize: vi.fn() } as unknown as PDFFont;
    const context: WriterContext = {
      getFont: async () => font,
      getReusedFont: async () => null,
      embeddedCovers: () => false,
    };
    const operation: AnnotationOperation = {
      id: "callout-right",
      type: "annotation",
      kind: "callout",
      pageIndex: 0,
      rect: { x: 80, y: 120, width: 160, height: 60 },
      color: "#4f46e5",
      text: "Review\tthis\b",
      anchor: { x: 300, y: 150 },
      elbow: { x: 270, y: 150 },
      fillColor: "transparent",
      createdAt: 1,
    };

    await writeAnnotation(page, operation, 0.8, context);

    expect(drawLine).toHaveBeenCalledTimes(2);
    expect(drawLine.mock.calls[1][0]).toMatchObject({ end: { x: 240, y: 150 } });
    expect(font.widthOfTextAtSize).toHaveBeenCalledWith("Review    this", 12);
    expect(drawText).toHaveBeenCalledWith("Review    this", expect.objectContaining({
      color: expect.any(Object),
    }));
  });

  it("keeps a callout box but skips text that cleans to empty", async () => {
    const drawText = vi.fn();
    const page = {
      drawLine: vi.fn(),
      drawText,
      drawEllipse: vi.fn(),
      drawRectangle: vi.fn(),
    } as unknown as PDFPage;
    const font = { widthOfTextAtSize: vi.fn() } as unknown as PDFFont;
    const context: WriterContext = {
      getFont: async () => font,
      getReusedFont: async () => null,
      embeddedCovers: () => false,
    };

    await writeAnnotation(page, {
      id: "callout-empty",
      type: "annotation",
      kind: "callout",
      pageIndex: 0,
      rect: { x: 80, y: 120, width: 160, height: 60 },
      color: "#4f46e5",
      text: "\b",
      createdAt: 1,
    }, 1, context);

    expect(font.widthOfTextAtSize).not.toHaveBeenCalled();
    expect(drawText).not.toHaveBeenCalled();
  });

  it("exports freehand highlights with round caps and Multiply blending", () => {
    const drawLine = vi.fn();
    const page = { drawLine } as unknown as PDFPage;
    const operation: InkOperation = {
      id: "marker-1",
      type: "ink",
      variant: "freehand-highlight",
      pageIndex: 0,
      rect: { x: 10, y: 20, width: 0.01, height: 0.01 },
      points: [{ x: 10, y: 20 }, { x: 10.01, y: 20.01 }],
      stroke: "#ffe066",
      strokeWidth: 18,
      createdAt: 1,
    };

    writeInk(page, operation, 0.42);

    expect(drawLine).toHaveBeenCalledWith(expect.objectContaining({
      lineCap: LineCapStyle.Round,
      blendMode: BlendMode.Multiply,
      opacity: 0.42,
    }));
  });

  it("exports text highlights with Multiply blending", async () => {
    const drawRectangle = vi.fn();
    const page = { drawRectangle } as unknown as PDFPage;
    const operation: AnnotationOperation = {
      id: "highlight-1",
      type: "annotation",
      kind: "highlight",
      pageIndex: 0,
      rect: { x: 10, y: 20, width: 100, height: 14 },
      color: "#ffe066",
      opacity: 0.36,
      createdAt: 1,
    };
    const context: WriterContext = {
      getFont: vi.fn(),
      getReusedFont: vi.fn(),
      embeddedCovers: vi.fn(),
    };

    await writeAnnotation(page, operation, 1, context);

    expect(drawRectangle).toHaveBeenCalledWith(expect.objectContaining({
      blendMode: BlendMode.Multiply,
      opacity: 0.36,
    }));
  });
});
