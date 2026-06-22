import { describe, expect, it, vi } from "vitest";
import { OcrEngine, ocrWordsToTextItems, type OcrResult } from "../src/engine/ocr";
import type { PdfEngine } from "../src/engine/pdfEngine";

const canvas = { width: 200, height: 400 } as HTMLCanvasElement;

// A fake PdfEngine that returns a fixed canvas + page size, so OCR wiring is exercised
// without touching PDF.js or the DOM. pageHeight 800 over canvas height 400 => factor 2.
function fakeEngine(): PdfEngine {
  return {
    renderPageToCanvas: vi.fn(async () => ({ canvas, pageWidth: 300, pageHeight: 800 })),
  } as unknown as PdfEngine;
}

const mockResult: OcrResult = {
  text: "Hello world",
  words: [
    { text: "Hello", confidence: 95, bbox: { x0: 10, y0: 20, x1: 60, y1: 50 } },
    { text: "world", confidence: 90, bbox: { x0: 70, y0: 20, x1: 120, y1: 50 } },
    { text: "  ", confidence: 99, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } },
    { text: "noise", confidence: 5, bbox: { x0: 0, y0: 0, x1: 5, y1: 5 } },
  ],
};

describe("ocr wiring", () => {
  it("rasterizes the page and maps recognized words into PDF-space TextItems", async () => {
    const recognize = vi.fn(async () => mockResult);
    const engine = new OcrEngine(recognize, fakeEngine());

    const { text, items } = await engine.ocrPage(new Uint8Array([1, 2, 3]), 2, { minConfidence: 50 });

    expect(recognize).toHaveBeenCalledOnce();
    expect(text).toBe("Hello world");
    // Blank + low-confidence words are dropped.
    expect(items).toHaveLength(2);
    expect(items[0].str).toBe("Hello");
    expect(items[0].pageIndex).toBe(2);
    // factor = pageHeight(800)/canvasHeight(400) = 2. x0=10 -> 20.
    expect(items[0].rect.x).toBe(20);
    // y flips: (canvasHeight - y1) * factor = (400 - 50) * 2 = 700.
    expect(items[0].rect.y).toBe(700);
    expect(items[0].rect.width).toBe((60 - 10) * 2);
    expect(items[0].rect.height).toBe((50 - 20) * 2);
  });

  it("surfaces recognizer/import failures as a rejected promise the caller can catch", async () => {
    const recognize = vi.fn(async () => {
      throw new Error("tesseract.js unavailable");
    });
    const engine = new OcrEngine(recognize, fakeEngine());
    await expect(engine.ocrPage(new Uint8Array([1]), 0)).rejects.toThrow("tesseract.js unavailable");
  });

  it("ocrWordsToTextItems flips the y-axis and filters empty/low-confidence words", () => {
    const items = ocrWordsToTextItems(mockResult.words, 0, canvas, 800, 50);
    expect(items.map((item) => item.str)).toEqual(["Hello", "world"]);
    // Top-left origin word maps below a lower one after the flip.
    expect(items[0].rect.y).toBeGreaterThan(0);
  });
});
