import { PDFDocument, PDFFont, PDFName, PDFPage, PDFString, rgb } from "pdf-lib";
import type {
  AnnotationOperation,
  FormFieldOperation,
  FormMarkOperation,
  ImageOperation,
  InkOperation,
  LinkOperation,
  PdfRect,
  ShapeOperation,
  SignatureOperation,
  StampOperation,
  TextOperation,
} from "../types/editor";
import { dataUrlToBytes } from "../utils/download";
import { sanitizeLinkTarget } from "../utils/url";
import { textBaselineDrawY } from "../utils/textMetrics";

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

function drawCheckMark(page: PDFPage, rect: PdfRect, color: string, opacity: number, thickness = 1.4) {
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

export type FontLookup = (
  fontFamily?: string,
  style?: { bold?: boolean; italic?: boolean; fontWeight?: number; fontStyle?: "normal" | "italic" },
) => Promise<PDFFont>;

/**
 * Per-`savePdf`-call state (embedded/reused font caches keyed off the live
 * `PDFDocument`) that every writer needing a font shares. Built once in
 * `PdfEngine.savePdf` and threaded through so writers stay pure functions of
 * (page, operation, opacity, context) rather than closing over engine state.
 */
export type WriterContext = {
  getFont: FontLookup;
  getReusedFont: (key: string) => Promise<PDFFont | null>;
  embeddedCovers: (key: string, text: string) => boolean;
};

export function writeWhiteoutMask(page: PDFPage, rect: PdfRect, color: string, opacity: number) {
  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    color: hexToRgb(color),
    opacity,
  });
}

/**
 * Draws a replacement text run. A `whiteout` text op additionally draws its
 * mask first, anchored to `sourceCoverRect` (the original PDF text's bounds)
 * rather than the (possibly moved) editable rect, so the underlying glyph
 * never reappears at its old position.
 */
export async function writeText(page: PDFPage, operation: TextOperation, opacity: number, ctx: WriterContext) {
  let font: PDFFont | null = null;
  if (operation.embeddedFontKey && ctx.embeddedCovers(operation.embeddedFontKey, operation.text)) {
    font = await ctx.getReusedFont(operation.embeddedFontKey);
  }
  if (!font) {
    font = await ctx.getFont(operation.fontFamily, {
      bold: operation.bold,
      italic: operation.italic,
      fontWeight: operation.fontWeight,
      fontStyle: operation.fontStyle,
    });
  }

  const rect = operation.rect;
  // Measured before the mask is drawn: this is the first call that throws when
  // the resolved font cannot encode the text (e.g. non-WinAnsi characters in a
  // standard font), and failing here keeps the operation atomic — no mask is
  // left covering the original text without its replacement.
  const textWidth = font.widthOfTextAtSize(operation.text, operation.fontSize);

  if (operation.whiteout) {
    // The mask is a redaction: it must cover the original glyphs at full
    // strength no matter what opacity the user gave the replacement text,
    // matching the editor preview (.operation--source-cover never fades).
    writeWhiteoutMask(page, operation.sourceCoverRect ?? operation.rect, operation.whiteoutColor ?? "#ffffff", 1);
  }

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

export async function writeAnnotation(page: PDFPage, operation: AnnotationOperation, opacity: number, ctx: WriterContext) {
  const rect = operation.rect;

  if (operation.kind === "highlight") {
    page.drawRectangle({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      color: hexToRgb(operation.color),
      opacity: operation.opacity ?? 0.28,
    });
    return;
  }

  const strokeWidth = operation.strokeWidth ?? 2;
  if (operation.kind === "strikeout" || operation.kind === "underline") {
    const y = operation.kind === "strikeout" ? rect.y + rect.height * 0.55 : rect.y + Math.max(1, rect.height * 0.12);
    page.drawLine({
      start: { x: rect.x, y },
      end: { x: rect.x + rect.width, y },
      color: hexToRgb(operation.color),
      thickness: strokeWidth,
      opacity,
    });
    return;
  }

  const font = await ctx.getFont("Inter");
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

export function writeShape(page: PDFPage, operation: ShapeOperation, opacity: number) {
  const rect = operation.rect;

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
    return;
  }

  if (operation.kind === "line" || operation.kind === "arrow") {
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
    return;
  }

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

export function writeInk(page: PDFPage, operation: InkOperation, opacity: number) {
  if (operation.points.length <= 1) return;
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

async function drawImageAt(pdf: PDFDocument, page: PDFPage, dataUrl: string, rect: PdfRect, opacity: number) {
  const bytes = dataUrlToBytes(dataUrl);
  const mime = dataUrlMimeType(dataUrl);
  const image = mime.includes("jpeg") || mime.includes("jpg") ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
  page.drawImage(image, {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    opacity,
  });
}

export async function writeImage(pdf: PDFDocument, page: PDFPage, operation: ImageOperation, opacity: number) {
  await drawImageAt(pdf, page, operation.dataUrl, operation.rect, opacity);
}

export async function writeSignature(pdf: PDFDocument, page: PDFPage, operation: SignatureOperation, opacity: number, ctx: WriterContext) {
  const rect = operation.rect;
  if (operation.mode === "image") {
    await drawImageAt(pdf, page, operation.value, rect, opacity);
    return;
  }

  const font = await ctx.getFont(operation.fontFamily);
  page.drawText(operation.value, {
    x: rect.x,
    y: rect.y + rect.height * 0.25,
    size: Math.min(rect.height * 0.55, 36),
    font,
    color: hexToRgb(operation.color),
    opacity,
  });
}

export async function writeStamp(page: PDFPage, operation: StampOperation, opacity: number, ctx: WriterContext) {
  const rect = operation.rect;
  const font = await ctx.getFont("Inter", { bold: true });
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
  const labelSize = Math.min(18, Math.max(9, rect.height * (operation.subline ? 0.28 : 0.32)));
  if (operation.subline) {
    const sublineFont = await ctx.getFont("Inter");
    const sublineSize = Math.min(11, Math.max(7, rect.height * 0.16));
    page.drawText(operation.label.toUpperCase(), {
      x: rect.x + 8,
      y: rect.y + rect.height * 0.52,
      size: labelSize,
      font,
      color: hexToRgb(operation.color),
      maxWidth: Math.max(12, rect.width - 16),
      opacity,
    });
    page.drawText(operation.subline, {
      x: rect.x + 8,
      y: rect.y + Math.max(4, rect.height * 0.22),
      size: sublineSize,
      font: sublineFont,
      color: hexToRgb(operation.color),
      maxWidth: Math.max(12, rect.width - 16),
      opacity,
    });
    return;
  }
  page.drawText(operation.label.toUpperCase(), {
    x: rect.x + 8,
    y: rect.y + Math.max(6, (rect.height - 14) / 2),
    size: labelSize,
    font,
    color: hexToRgb(operation.color),
    maxWidth: Math.max(12, rect.width - 16),
    opacity,
  });
}

export function writeFormMark(page: PDFPage, operation: FormMarkOperation, opacity: number) {
  const rect = operation.rect;

  if (operation.mark === "check") {
    drawCheckMark(page, rect, operation.color, opacity, Math.max(1.2, Math.min(rect.width, rect.height) * 0.08));
    return;
  }

  if (operation.mark === "cross") {
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
    return;
  }

  page.drawEllipse({
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
    xScale: rect.width * 0.26,
    yScale: rect.height * 0.26,
    color: hexToRgb(operation.color),
    opacity,
  });
}

export async function writeFormField(page: PDFPage, operation: FormFieldOperation, opacity: number, ctx: WriterContext) {
  const rect = operation.rect;
  const font = await ctx.getFont("Inter");
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
    return;
  }

  if (operation.kind === "signature") {
    page.drawText("Signature", {
      x: rect.x + 6,
      y: rect.y + Math.max(5, rect.height * 0.32),
      size: Math.min(12, Math.max(8, rect.height * 0.28)),
      font,
      color: hexToRgb("#64748b"),
      maxWidth: Math.max(12, rect.width - 12),
      opacity,
    });
    return;
  }

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

export function writeLink(pdf: PDFDocument, page: PDFPage, operation: LinkOperation) {
  const target = sanitizeLinkTarget(operation.target);
  if (!target) return;
  // sanitizeLinkTarget already rejects negative page indexes; the upper bound
  // can only be validated here, against the document being written.
  if (target.kind === "page" && target.pageIndex >= pdf.getPageCount()) return;

  const rect = operation.rect;
  const action =
    target.kind === "page"
      ? {
          Type: "Action",
          S: "GoTo",
          D: [pdf.getPage(target.pageIndex).ref, PDFName.of("XYZ"), null, null, null],
        }
      : {
          Type: "Action",
          S: "URI",
          URI: PDFString.of(target.href),
        };
  const annotation = pdf.context.obj({
    Type: "Annot",
    Subtype: "Link",
    Rect: [rect.x, rect.y, rect.x + rect.width, rect.y + rect.height],
    Border: [0, 0, 0],
    A: action,
  });
  const annotations = page.node.Annots();
  if (annotations) {
    annotations.push(annotation);
  } else {
    page.node.set(PDFName.of("Annots"), pdf.context.obj([annotation]));
  }
  // Imported links re-emit the original (invisible) annotation; painting the
  // editor's blue frame onto them would deface the source document.
  if (operation.imported) return;
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
