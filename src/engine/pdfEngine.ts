import { PDFDocument, PDFName, PDFString, degrees, rgb } from "pdf-lib";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { EditOperation, LoadedPdf, TextItem } from "../types/editor";
import { dataUrlToBytes } from "../utils/download";
import { sanitizeUrl } from "../utils/url";
import { inferFontWeight, inferItalic, resolvePdfFont } from "./fontResolver";

const PDF_JS_OPTIONS = {
  cMapUrl: "/pdfjs/cmaps/",
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
};

function hexToRgb(color: string) {
  const normalized = color.replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
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

function drawCheckMark(page: ReturnType<PDFDocument["getPage"]>, rect: EditOperation["rect"], color: string, opacity: number, thickness = 1.4) {
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
        fingerprint: Array.isArray(pdf.fingerprints) ? pdf.fingerprints[0] ?? undefined : undefined,
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

  async getTextContent(bytes: Uint8Array, pageIndex?: number): Promise<TextItem[]> {
    const pdfjs = await this.getPdfJs();
    const pdf = await pdfjs.getDocument({ data: bytes.slice(), ...PDF_JS_OPTIONS }).promise;
    const items: TextItem[] = [];

    try {
      const pageIndexes = pageIndex === undefined
        ? Array.from({ length: pdf.numPages }, (_, index) => index)
        : [pageIndex];

      for (const currentPageIndex of pageIndexes) {
        const page = await pdf.getPage(currentPageIndex + 1);
        const textContent = await page.getTextContent();
        const styles = textContent.styles as Record<string, Record<string, unknown>>;
        for (const item of textContent.items as Array<Record<string, unknown>>) {
          if (!("str" in item) || !String(item.str).trim()) continue;
          const str = String(item.str);
          const transform = Array.isArray(item.transform) ? item.transform as number[] : [1, 0, 0, 12, 0, 0];
          const x = transform[4] ?? 0;
          const y = transform[5] ?? 0;
          const fontSize = Math.hypot(transform[2], transform[3]) || Math.abs(transform[0]) || 12;
          const fontName = typeof item.fontName === "string" ? item.fontName : undefined;
          const style = fontName ? styles[fontName] : undefined;
          const cssFontFamily = typeof style?.fontFamily === "string" ? style.fontFamily : undefined;
          const styleDescriptor = [fontName, cssFontFamily].filter(Boolean).join(" ");
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
            cssFontFamily,
            fontSize,
            fontWeight: inferFontWeight(styleDescriptor),
            italic: inferItalic(styleDescriptor),
          });
        }
      }
    } finally {
      void pdf.destroy().catch(() => undefined);
    }

    return items;
  }

  async getPageSizes(bytes: Uint8Array) {
    const pdf = await PDFDocument.load(bytes);
    return pdf.getPages().map((page) => page.getSize());
  }

  async savePdf(originalBytes: Uint8Array, operations: EditOperation[]) {
    const pdf = await PDFDocument.load(originalBytes);
    const pages = pdf.getPages();
    const embeddedFonts = new Map<string, Awaited<ReturnType<typeof pdf.embedFont>>>();

    const getFont = async (fontFamily?: string, style?: { bold?: boolean; italic?: boolean; fontWeight?: number; fontStyle?: "normal" | "italic" }) => {
      const key = resolvePdfFont(fontFamily, style);
      if (!embeddedFonts.has(key)) {
        embeddedFonts.set(key, await pdf.embedFont(key));
      }
      return embeddedFonts.get(key)!;
    };

    for (const operation of operations) {
      const page = pages[operation.pageIndex];
      if (!page) continue;
      const rect = operation.rect;
      const opacity = operation.opacity ?? 1;

      if (operation.type === "whiteout" || (operation.type === "text" && operation.whiteout)) {
        page.drawRectangle({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          color: hexToRgb(operation.type === "whiteout" ? operation.color : operation.whiteoutColor ?? "#ffffff"),
          opacity,
        });
      }

      if (operation.type === "text") {
        const font = await getFont(operation.fontFamily, {
          bold: operation.bold,
          italic: operation.italic,
          fontWeight: operation.fontWeight,
          fontStyle: operation.fontStyle,
        });
        const textWidth = font.widthOfTextAtSize(operation.text, operation.fontSize);
        const x = operation.align === "center"
          ? rect.x + Math.max(0, rect.width - textWidth) / 2
          : operation.align === "right"
            ? rect.x + Math.max(0, rect.width - textWidth)
            : rect.x;
        page.drawText(operation.text, {
          x,
          y: rect.y + Math.max(2, rect.height - operation.fontSize) / 2,
          size: operation.fontSize,
          font,
          color: hexToRgb(operation.color),
          opacity,
          maxWidth: rect.width,
          lineHeight: operation.fontSize * 1.22,
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
          const y = operation.kind === "strikeout"
            ? rect.y + rect.height * 0.55
            : rect.y + Math.max(1, rect.height * 0.12);
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
        const image = mime.includes("jpeg") || mime.includes("jpg")
          ? await pdf.embedJpg(bytes)
          : await pdf.embedPng(bytes);
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
          page.drawLine({ start: { x: rect.x, y: rect.y }, end: { x: rect.x + rect.width, y: rect.y + rect.height }, color: hexToRgb(operation.color), thickness: 1.6, opacity });
          page.drawLine({ start: { x: rect.x + rect.width, y: rect.y }, end: { x: rect.x, y: rect.y + rect.height }, color: hexToRgb(operation.color), thickness: 1.6, opacity });
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

        if (operation.kind === "checkbox") {
          const boxSize = Math.min(rect.width, rect.height) * 0.58;
          const boxRect = {
            x: rect.x + 5,
            y: rect.y + (rect.height - boxSize) / 2,
            width: boxSize,
            height: boxSize,
          };
          page.drawRectangle({ ...boxRect, borderColor: hexToRgb("#475569"), borderWidth: 1 });
          if (operation.checked) drawCheckMark(page, boxRect, "#111827", opacity, 1.4);
        } else if (operation.kind === "radio") {
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
