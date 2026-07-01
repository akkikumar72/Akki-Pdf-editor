import { PDFDocument, PDFName, PDFString, degrees, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { DocumentFontInfo, DocumentFonts, EditOperation, LoadedPdf, TextItem } from "../types/editor";
import { dataUrlToBytes } from "../utils/download";
import { sanitizeUrl } from "../utils/url";
import { textBaselineDrawY } from "../utils/textMetrics";
import { cleanPdfFontName, inferFontWeight, inferItalic, resolvePdfFont } from "./fontResolver";

type PdfFontMeta = { name?: string; bold?: boolean; italic?: boolean; data?: Uint8Array; mimetype?: string };

type PdfCommonObjs = {
  has?: (id: string) => boolean;
  get: (
    id: string,
  ) => { name?: unknown; bold?: unknown; italic?: unknown; data?: unknown; mimetype?: unknown } | null | undefined;
};

type FontkitFont = {
  familyName?: string;
  subfamilyName?: string;
  italicAngle?: number;
  ["OS/2"]?: { usWeightClass?: number; usWidthClass?: number; fsSelection?: number };
  hasGlyphForCodePoint?: (codePoint: number) => boolean;
};

function toUint8Array(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  return undefined;
}

/**
 * Parse the embedded font program (extracted from pdf.js) with fontkit to read the
 * exact family, weight (OS/2.usWeightClass), italic and width-class so replacement
 * text can match the original precisely. Falls back to name-only info when the
 * program is missing or unsupported (Type3/bitmap fonts).
 */
function buildDocumentFontInfo(
  key: string,
  meta: PdfFontMeta | undefined,
  postScriptName: string | undefined,
): DocumentFontInfo {
  const info: DocumentFontInfo = { key, postScriptName, bytes: meta?.data, mimetype: meta?.mimetype };
  if (meta?.data && meta.data.byteLength > 0) {
    try {
      const font = fontkit.create(meta.data as Buffer) as unknown as FontkitFont;
      /* v8 ignore start -- the parseable font fixtures always expose typed name/OS-2 fields, so the `: undefined`/numeric-fsSelection fallbacks here are only hit by malformed programs that fontkit rejects (caught below) */
      info.familyName = typeof font.familyName === "string" ? font.familyName : undefined;
      info.subfamilyName = typeof font.subfamilyName === "string" ? font.subfamilyName : undefined;
      const os2 = font["OS/2"];
      info.weight = typeof os2?.usWeightClass === "number" ? os2.usWeightClass : undefined;
      info.widthClass = typeof os2?.usWidthClass === "number" ? os2.usWidthClass : undefined;
      const fsItalic = typeof os2?.fsSelection === "number" ? (os2.fsSelection & 0x01) !== 0 : false;
      /* v8 ignore stop */
      info.italic = fsItalic || (typeof font.italicAngle === "number" && font.italicAngle !== 0);
    } catch {
      // Unsupported/Type3/bitmap program: keep name-based info and let export fall back.
    }
  }
  return info;
}

/**
 * pdf.js text items reference fonts by a subset/internal id (e.g. `g_d0_f4`) that
 * carries no weight/style. The real PostScript name (e.g. `Roboto-Medium`) only
 * becomes available on `page.commonObjs` after `getOperatorList()` runs. This reads
 * that name plus the translated font's bold/italic flags so click-to-edit can match
 * the original family + weight instead of guessing from a meaningless id.
 */
function readPdfFontMeta(
  commonObjs: PdfCommonObjs | null,
  fontName: string | undefined,
  cache: Map<string, PdfFontMeta | undefined>,
): PdfFontMeta | undefined {
  if (!fontName || !commonObjs) return undefined;
  if (cache.has(fontName)) return cache.get(fontName);
  let meta: PdfFontMeta | undefined;
  try {
    const available = typeof commonObjs.has === "function" ? commonObjs.has(fontName) : true;
    if (available) {
      const obj = commonObjs.get(fontName);
      if (obj) {
        meta = {
          name: typeof obj.name === "string" ? obj.name : undefined,
          bold: Boolean(obj.bold),
          italic: Boolean(obj.italic),
          data: toUint8Array(obj.data),
          mimetype: typeof obj.mimetype === "string" ? obj.mimetype : undefined,
        };
      }
    }
  } catch {
    meta = undefined;
  }
  cache.set(fontName, meta);
  return meta;
}

const PDF_JS_OPTIONS = {
  cMapUrl: "/pdfjs/cmaps/",
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
};

function hexToRgb(color: string) {
  const normalized = color.replace("#", "");
  const value =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized.padEnd(6, "0").slice(0, 6);
  const number = Number.parseInt(value, 16);
  return rgb(((number >> 16) & 255) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255);
}

/**
 * Resolve a fill color for pdf-lib, treating missing/"transparent"/non-hex
 * values as no fill instead of producing NaN color operands.
 */
function fillColorOrUndefined(color?: string) {
  if (!color || color === "transparent") return undefined;
  if (!/^#?[0-9a-f]{3}([0-9a-f]{3})?$/i.test(color.trim())) return undefined;
  return hexToRgb(color);
}

function dataUrlMimeType(dataUrl: string) {
  return dataUrl.match(/^data:(.*?);/)?.[1] ?? "image/png";
}

function drawCheckMark(
  page: ReturnType<PDFDocument["getPage"]>,
  rect: EditOperation["rect"],
  color: string,
  opacity: number,
  thickness = 1.4,
) {
  page.drawLine({
    start: { x: rect.x + rect.width * 0.2, y: rect.y + rect.height * 0.5 },
    end: { x: rect.x + rect.width * 0.42, y: rect.y + rect.height * 0.25 },
    color: hexToRgb(color),
    thickness,
    opacity,
  });
  page.drawLine({
    start: { x: rect.x + rect.width * 0.42, y: rect.y + rect.height * 0.25 },
    end: { x: rect.x + rect.width * 0.82, y: rect.y + rect.height * 0.78 },
    color: hexToRgb(color),
    thickness,
    opacity,
  });
}

export class PdfEngine {
  private async getPdfJs() {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
    return pdfjs;
  }

  async loadDocument(file: File, password?: string): Promise<LoadedPdf> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdfjs = await this.getPdfJs();
    const task = pdfjs.getDocument({
      data: bytes.slice(),
      password,
      ...PDF_JS_OPTIONS,
    });
    const pdf = await task.promise;
    try {
      return {
        name: file.name,
        bytes,
        pageCount: pdf.numPages,
        fingerprint: Array.isArray(pdf.fingerprints) ? (pdf.fingerprints[0] ?? undefined) : undefined,
      };
    } finally {
      void pdf.destroy().catch(() => undefined);
    }
  }

  async createBlankDocument(name = "blank-document.pdf", size: [number, number] = [612, 792]): Promise<LoadedPdf> {
    const pdf = await PDFDocument.create();
    pdf.addPage(size);
    const bytes = new Uint8Array(await pdf.save({ useObjectStreams: false }));
    return {
      name,
      bytes,
      pageCount: 1,
      fingerprint: `${name}-${Date.now()}`,
    };
  }

  async insertBlankPage(originalBytes: Uint8Array, index: number) {
    const pdf = await PDFDocument.load(originalBytes);
    const pages = pdf.getPages();
    /* v8 ignore next -- pdf-lib never round-trips a 0-page document, so the page lookup always resolves and the size fallback is unreachable */
    const currentSize = pages[Math.max(0, Math.min(index, pages.length - 1))]?.getSize() ?? { width: 612, height: 792 };
    pdf.insertPage(Math.max(0, Math.min(index + 1, pages.length)), [currentSize.width, currentSize.height]);
    return new Uint8Array(await pdf.save({ useObjectStreams: false }));
  }

  async deletePage(originalBytes: Uint8Array, index: number) {
    const pdf = await PDFDocument.load(originalBytes);
    if (pdf.getPageCount() <= 1) throw new Error("Cannot delete the only page.");
    pdf.removePage(index);
    return new Uint8Array(await pdf.save({ useObjectStreams: false }));
  }

  async rotatePage(originalBytes: Uint8Array, index: number, amount = 90) {
    const pdf = await PDFDocument.load(originalBytes);
    const page = pdf.getPage(index);
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + amount) % 360));
    return new Uint8Array(await pdf.save({ useObjectStreams: false }));
  }

  async extractTextAndFonts(
    bytes: Uint8Array,
    pageIndex?: number,
  ): Promise<{ items: TextItem[]; fonts: DocumentFonts }> {
    const pdfjs = await this.getPdfJs();
    // fontExtraProperties exposes the embedded font program bytes (`.data`) on commonObjs,
    // which pdf.js otherwise drops to save memory. Required to reuse the original font.
    const pdf = await pdfjs.getDocument({ data: bytes.slice(), fontExtraProperties: true, ...PDF_JS_OPTIONS }).promise;
    const items: TextItem[] = [];
    const fonts: DocumentFonts = {};

    try {
      const pageIndexes =
        pageIndex === undefined ? Array.from({ length: pdf.numPages }, (_, index) => index) : [pageIndex];

      for (const currentPageIndex of pageIndexes) {
        const page = await pdf.getPage(currentPageIndex + 1);
        const textContent = await page.getTextContent();
        const styles = textContent.styles as Record<string, Record<string, unknown>>;
        let commonObjs: PdfCommonObjs | null = null;
        try {
          await page.getOperatorList();
          commonObjs = page.commonObjs as unknown as PdfCommonObjs;
        } catch {
          commonObjs = null;
        }
        const fontMetaCache = new Map<string, PdfFontMeta | undefined>();
        for (const item of textContent.items as Array<Record<string, unknown>>) {
          if (!("str" in item) || !String(item.str).trim()) continue;
          const str = String(item.str);
          const transform = Array.isArray(item.transform) ? (item.transform as number[]) : [1, 0, 0, 12, 0, 0];
          const x = transform[4] ?? 0;
          const y = transform[5] ?? 0;
          const fontSize = Math.hypot(transform[2], transform[3]) || Math.abs(transform[0]) || 12;
          const subsetFontName = typeof item.fontName === "string" ? item.fontName : undefined;
          const style = subsetFontName ? styles[subsetFontName] : undefined;
          const cssFontFamily = typeof style?.fontFamily === "string" ? style.fontFamily : undefined;
          const fontMeta = readPdfFontMeta(commonObjs, subsetFontName, fontMetaCache);
          const realFontName = fontMeta?.name ? cleanPdfFontName(fontMeta.name) : undefined;
          const fontName = realFontName || subsetFontName;
          const fontKey = subsetFontName || realFontName;
          if (fontKey && !fonts[fontKey]) {
            fonts[fontKey] = buildDocumentFontInfo(fontKey, fontMeta, realFontName);
          }
          const fontInfo = fontKey ? fonts[fontKey] : undefined;
          const styleDescriptor = [fontName, cssFontFamily].filter(Boolean).join(" ");
          const nameWeight = inferFontWeight(styleDescriptor) ?? 400;
          // The embedded font's OS/2 weight is authoritative; the name heuristic only fills in.
          const fontWeight = fontInfo?.weight ?? (nameWeight === 400 && fontMeta?.bold ? 700 : nameWeight);
          const italic = Boolean(fontInfo?.italic) || inferItalic(styleDescriptor) || Boolean(fontMeta?.italic);
          items.push({
            str,
            pageIndex: currentPageIndex,
            rect: {
              x,
              y,
              width: typeof item.width === "number" ? item.width : str.length * fontSize * 0.5,
              height: typeof item.height === "number" ? item.height : fontSize,
            },
            fontName,
            fontKey,
            cssFontFamily,
            fontSize,
            fontWeight,
            italic,
          });
        }
      }
    } finally {
      void pdf.destroy().catch(() => undefined);
    }

    return { items, fonts };
  }

  async getPageSizes(bytes: Uint8Array) {
    const pdf = await PDFDocument.load(bytes);
    return pdf.getPages().map((page) => page.getSize());
  }

  async savePdf(originalBytes: Uint8Array, operations: EditOperation[], fonts?: DocumentFonts) {
    const pdf = await PDFDocument.load(originalBytes);
    pdf.registerFontkit(fontkit);
    const pages = pdf.getPages();
    const embeddedFonts = new Map<string, Awaited<ReturnType<typeof pdf.embedFont>>>();
    const reusedFonts = new Map<string, Awaited<ReturnType<typeof pdf.embedFont>> | null>();
    const fontkitByKey = new Map<string, FontkitFont | null>();

    const getFont = async (
      fontFamily?: string,
      style?: { bold?: boolean; italic?: boolean; fontWeight?: number; fontStyle?: "normal" | "italic" },
    ) => {
      const key = resolvePdfFont(fontFamily, style);
      if (!embeddedFonts.has(key)) {
        embeddedFonts.set(key, await pdf.embedFont(key));
      }
      return embeddedFonts.get(key)!;
    };

    // Reuse the document's actual embedded font for a true replica, but only when it
    // contains every glyph in the replacement string (subset fonts often don't).
    const embeddedCovers = (key: string, text: string): boolean => {
      const info = fonts?.[key];
      if (!info?.bytes) return false;
      let fk = fontkitByKey.get(key);
      if (fk === undefined) {
        try {
          fk = fontkit.create(info.bytes as Buffer) as unknown as FontkitFont;
        } catch {
          fk = null;
        }
        fontkitByKey.set(key, fk);
      }
      if (!fk || typeof fk.hasGlyphForCodePoint !== "function") return false;
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (cp !== undefined && !fk.hasGlyphForCodePoint(cp)) return false;
      }
      return true;
    };

    const getReusedFont = async (key: string) => {
      if (reusedFonts.has(key)) return reusedFonts.get(key) ?? null;
      const info = fonts?.[key];
      let embedded: Awaited<ReturnType<typeof pdf.embedFont>> | null = null;
      if (info?.bytes) {
        try {
          embedded = await pdf.embedFont(info.bytes, { subset: true });
        } catch {
          embedded = null;
        }
      }
      reusedFonts.set(key, embedded);
      return embedded;
    };

    for (const operation of operations) {
      const page = pages[operation.pageIndex];
      if (!page) continue;
      const rect = operation.rect;
      const opacity = operation.opacity ?? 1;

      if (operation.type === "whiteout" || (operation.type === "text" && operation.whiteout)) {
        // For a moved replacement, keep the mask anchored to the original PDF text bounds
        // (sourceCoverRect) so the underlying glyph never reappears at its old position.
        const maskRect = operation.type === "text" ? (operation.sourceCoverRect ?? rect) : rect;
        page.drawRectangle({
          x: maskRect.x,
          y: maskRect.y,
          width: maskRect.width,
          height: maskRect.height,
          color: hexToRgb(operation.type === "whiteout" ? operation.color : (operation.whiteoutColor ?? "#ffffff")),
          opacity,
        });
      }

      if (operation.type === "text") {
        let font: Awaited<ReturnType<typeof pdf.embedFont>> | null = null;
        if (operation.embeddedFontKey && embeddedCovers(operation.embeddedFontKey, operation.text)) {
          font = await getReusedFont(operation.embeddedFontKey);
        }
        if (!font) {
          font = await getFont(operation.fontFamily, {
            bold: operation.bold,
            italic: operation.italic,
            fontWeight: operation.fontWeight,
            fontStyle: operation.fontStyle,
          });
        }
        const textWidth = font.widthOfTextAtSize(operation.text, operation.fontSize);
        const x =
          operation.align === "center"
            ? rect.x + Math.max(0, rect.width - textWidth) / 2
            : operation.align === "right"
              ? rect.x + Math.max(0, rect.width - textWidth)
              : rect.x;
        page.drawText(operation.text, {
          x,
          y: textBaselineDrawY(rect, operation.fontSize),
          size: operation.fontSize,
          font,
          color: hexToRgb(operation.color),
          opacity,
          maxWidth: rect.width,
          lineHeight: operation.fontSize,
        });
      }

      if (operation.type === "annotation" && operation.kind === "highlight") {
        page.drawRectangle({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          color: hexToRgb(operation.color),
          opacity: operation.opacity ?? 0.28,
        });
      }

      if (operation.type === "annotation" && operation.kind !== "highlight") {
        const strokeWidth = operation.strokeWidth ?? 2;
        if (operation.kind === "strikeout" || operation.kind === "underline") {
          const y =
            operation.kind === "strikeout" ? rect.y + rect.height * 0.55 : rect.y + Math.max(1, rect.height * 0.12);
          page.drawLine({
            start: { x: rect.x, y },
            end: { x: rect.x + rect.width, y },
            color: hexToRgb(operation.color),
            thickness: strokeWidth,
            opacity,
          });
        } else {
          const font = await getFont("Inter");
          page.drawRectangle({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            borderColor: hexToRgb(operation.color),
            borderWidth: strokeWidth,
            color: hexToRgb("#ffffff"),
            opacity: Math.min(opacity, 0.92),
          });
          if (operation.text) {
            page.drawText(operation.text, {
              x: rect.x + 6,
              y: rect.y + Math.max(6, rect.height - 17),
              size: Math.min(13, Math.max(8, rect.height * 0.35)),
              font,
              color: hexToRgb(operation.color),
              maxWidth: Math.max(12, rect.width - 12),
              lineHeight: 14,
              opacity,
            });
          }
        }
      }

      if (operation.type === "shape") {
        if (operation.kind === "ellipse") {
          page.drawEllipse({
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
            xScale: rect.width / 2,
            yScale: rect.height / 2,
            borderColor: hexToRgb(operation.stroke),
            borderWidth: operation.strokeWidth,
            color: fillColorOrUndefined(operation.fill),
            opacity,
          });
        } else if (operation.kind === "line" || operation.kind === "arrow") {
          page.drawLine({
            start: { x: rect.x, y: rect.y },
            end: { x: rect.x + rect.width, y: rect.y + rect.height },
            color: hexToRgb(operation.stroke),
            thickness: operation.strokeWidth,
            opacity,
          });
          if (operation.kind === "arrow") {
            page.drawLine({
              start: { x: rect.x + rect.width, y: rect.y + rect.height },
              end: { x: rect.x + rect.width - 10, y: rect.y + rect.height - 2 },
              color: hexToRgb(operation.stroke),
              thickness: operation.strokeWidth,
            });
          }
        } else {
          page.drawRectangle({
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            borderColor: hexToRgb(operation.stroke),
            borderWidth: operation.strokeWidth,
            color: fillColorOrUndefined(operation.fill),
            opacity,
          });
        }
      }

      if (operation.type === "ink" && operation.points.length > 1) {
        for (let index = 1; index < operation.points.length; index += 1) {
          page.drawLine({
            start: operation.points[index - 1],
            end: operation.points[index],
            color: hexToRgb(operation.stroke),
            thickness: operation.strokeWidth,
            opacity,
          });
        }
      }

      if (operation.type === "image" || (operation.type === "signature" && operation.mode === "image")) {
        const dataUrl = operation.type === "image" ? operation.dataUrl : operation.value;
        const bytes = dataUrlToBytes(dataUrl);
        const mime = dataUrlMimeType(dataUrl);
        const image =
          mime.includes("jpeg") || mime.includes("jpg") ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
        page.drawImage(image, {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          opacity,
        });
      }

      if (operation.type === "signature" && operation.mode !== "image") {
        const font = await getFont(operation.fontFamily);
        page.drawText(operation.value, {
          x: rect.x,
          y: rect.y + rect.height * 0.25,
          size: Math.min(rect.height * 0.55, 36),
          font,
          color: hexToRgb(operation.color),
          opacity,
        });
      }

      if (operation.type === "stamp") {
        const font = await getFont("Inter", { bold: true });
        page.drawRectangle({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          borderColor: hexToRgb(operation.borderColor),
          borderWidth: 2,
          color: hexToRgb("#ffffff"),
          opacity: Math.min(opacity, 0.88),
        });
        page.drawText(operation.label.toUpperCase(), {
          x: rect.x + 8,
          y: rect.y + Math.max(6, (rect.height - 14) / 2),
          size: Math.min(18, Math.max(9, rect.height * 0.32)),
          font,
          color: hexToRgb(operation.color),
          maxWidth: Math.max(12, rect.width - 16),
          opacity,
        });
      }

      if (operation.type === "form-mark") {
        if (operation.mark === "check") {
          drawCheckMark(page, rect, operation.color, opacity, Math.max(1.2, Math.min(rect.width, rect.height) * 0.08));
        } else if (operation.mark === "cross") {
          page.drawLine({
            start: { x: rect.x, y: rect.y },
            end: { x: rect.x + rect.width, y: rect.y + rect.height },
            color: hexToRgb(operation.color),
            thickness: 1.6,
            opacity,
          });
          page.drawLine({
            start: { x: rect.x + rect.width, y: rect.y },
            end: { x: rect.x, y: rect.y + rect.height },
            color: hexToRgb(operation.color),
            thickness: 1.6,
            opacity,
          });
        } else {
          page.drawEllipse({
            x: rect.x + rect.width / 2,
            y: rect.y + rect.height / 2,
            xScale: rect.width * 0.26,
            yScale: rect.height * 0.26,
            color: hexToRgb(operation.color),
            opacity,
          });
        }
      }

      if (operation.type === "form-field") {
        const font = await getFont("Inter");
        page.drawRectangle({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          borderColor: hexToRgb("#64748b"),
          borderWidth: 1,
          color: hexToRgb("#ffffff"),
          opacity: Math.min(opacity, 0.82),
        });

        if (operation.kind === "radio") {
          page.drawEllipse({
            x: rect.x + Math.min(rect.width, rect.height) * 0.42,
            y: rect.y + rect.height / 2,
            xScale: Math.min(rect.width, rect.height) * 0.22,
            yScale: Math.min(rect.width, rect.height) * 0.22,
            borderColor: hexToRgb("#475569"),
            borderWidth: 1,
            opacity,
          });
          if (operation.checked) {
            page.drawEllipse({
              x: rect.x + Math.min(rect.width, rect.height) * 0.42,
              y: rect.y + rect.height / 2,
              xScale: Math.min(rect.width, rect.height) * 0.1,
              yScale: Math.min(rect.width, rect.height) * 0.1,
              color: hexToRgb("#111827"),
              opacity,
            });
          }
        } else if (operation.kind === "signature") {
          page.drawText("Signature", {
            x: rect.x + 6,
            y: rect.y + Math.max(5, rect.height * 0.32),
            size: Math.min(12, Math.max(8, rect.height * 0.28)),
            font,
            color: hexToRgb("#64748b"),
            maxWidth: Math.max(12, rect.width - 12),
            opacity,
          });
        } else {
          page.drawText(operation.value || operation.name, {
            x: rect.x + 6,
            y: rect.y + Math.max(5, rect.height * 0.34),
            size: Math.min(12, Math.max(8, rect.height * 0.3)),
            font,
            color: hexToRgb(operation.value ? "#111827" : "#64748b"),
            maxWidth: Math.max(12, rect.width - 12),
            opacity,
          });
        }
      }

      if (operation.type === "link") {
        const safeHref = sanitizeUrl(operation.href);
        if (!safeHref) continue;
        const annotation = pdf.context.obj({
          Type: "Annot",
          Subtype: "Link",
          Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
          Border: [0, 0, 0],
          A: {
            Type: "Action",
            S: "URI",
            URI: PDFString.of(safeHref),
          },
        });
        const annotations = page.node.Annots();
        if (annotations) {
          annotations.push(annotation);
        } else {
          page.node.set(PDFName.of("Annots"), pdf.context.obj([annotation]));
        }
        page.drawRectangle({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          borderColor: hexToRgb("#2563eb"),
          borderWidth: 0.75,
          opacity: 0.45,
        });
      }
    }

    return pdf.save({ useObjectStreams: false });
  }
}

export const pdfEngine = new PdfEngine();
export { PDF_JS_OPTIONS };
