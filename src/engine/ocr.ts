import type { TextItem } from "../types/editor";
import { PdfEngine, pdfEngine as defaultPdfEngine } from "./pdfEngine";

/**
 * Minimal shape of the tesseract.js recognize result we depend on. Kept local so the
 * module type-checks without the dependency being resolvable at build time and so unit
 * tests can supply a mock recognizer that matches this contract.
 */
export type OcrWord = {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

export type OcrResult = {
  text: string;
  words: OcrWord[];
};

/**
 * The OCR recognizer: takes a rasterized page (canvas) and returns recognized text and
 * word boxes in canvas-pixel coordinates. The default implementation lazily imports
 * tesseract.js so it never enters the main bundle; tests inject a mock instead.
 */
export type OcrRecognizer = (canvas: HTMLCanvasElement, lang?: string) => Promise<OcrResult>;

/**
 * Lazily load tesseract.js and recognize a canvas. The dynamic import keeps the ~heavy
 * wasm/worker dependency out of the initial bundle and lets the module be mocked in
 * tests. If the dependency or its runtime model download is unavailable (e.g. blocked
 * by network/CSP), the import rejects and the caller surfaces a friendly message.
 */
export const recognizeWithTesseract: OcrRecognizer = async (canvas, lang = "eng") => {
  // Bundlers must not eagerly resolve this; the indirection keeps it a pure runtime import.
  const moduleName = "tesseract.js";
  const tesseract = (await import(/* @vite-ignore */ moduleName)) as {
    recognize: (
      image: HTMLCanvasElement,
      lang?: string,
    ) => Promise<{ data: { text: string; words?: OcrWord[] } }>;
  };
  const { data } = await tesseract.recognize(canvas, lang);
  return { text: data.text ?? "", words: data.words ?? [] };
};

export type OcrPageOptions = {
  /** Render scale handed to PDF.js. Higher = sharper raster, slower OCR. */
  scale?: number;
  /** Tesseract language traineddata to use. */
  lang?: string;
  /** Drop words below this confidence (0-100). */
  minConfidence?: number;
};

/**
 * Render a PDF page to a canvas and recognize its text, returning overlay-ready
 * {@link TextItem}s in PDF coordinate space (origin bottom-left, scale-1 units) so the
 * results merge cleanly with PDF.js-extracted text in the page-text index / Inspector.
 */
export class OcrEngine {
  constructor(
    private readonly recognize: OcrRecognizer = recognizeWithTesseract,
    private readonly engine: PdfEngine = defaultPdfEngine,
  ) {}

  async ocrPage(
    bytes: Uint8Array,
    pageIndex: number,
    options: OcrPageOptions = {},
  ): Promise<{ text: string; items: TextItem[] }> {
    const scale = options.scale ?? 2;
    const minConfidence = options.minConfidence ?? 0;
    const { canvas, pageHeight } = await this.engine.renderPageToCanvas(bytes, pageIndex, scale);
    const result = await this.recognize(canvas, options.lang);
    const items = ocrWordsToTextItems(result.words, pageIndex, canvas, pageHeight, minConfidence);
    return { text: result.text.trim(), items };
  }
}

/**
 * Convert tesseract word boxes (canvas pixels, top-left origin) into {@link TextItem}s
 * in PDF user space (bottom-left origin, scale-1 units). Empty/low-confidence words are
 * dropped so noise does not pollute the text index.
 */
export function ocrWordsToTextItems(
  words: OcrWord[],
  pageIndex: number,
  canvas: { width: number; height: number },
  pageHeight: number,
  minConfidence = 0,
): TextItem[] {
  const factor = canvas.height > 0 ? pageHeight / canvas.height : 1;
  const items: TextItem[] = [];
  for (const word of words) {
    const str = word.text?.trim();
    if (!str) continue;
    if (word.confidence < minConfidence) continue;
    const widthPx = Math.max(0, word.bbox.x1 - word.bbox.x0);
    const heightPx = Math.max(0, word.bbox.y1 - word.bbox.y0);
    items.push({
      str,
      pageIndex,
      rect: {
        x: word.bbox.x0 * factor,
        // Flip the y-axis: canvas top-left origin -> PDF bottom-left origin.
        y: (canvas.height - word.bbox.y1) * factor,
        width: widthPx * factor,
        height: heightPx * factor,
      },
      fontSize: heightPx * factor,
    });
  }
  return items;
}

export const ocrEngine = new OcrEngine();
