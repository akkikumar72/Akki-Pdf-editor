import type { PdfPoint, PdfRect, ViewportRect } from "../types/editor";

export function viewportPointToPdf(point: PdfPoint, pageHeight: number, scale: number): PdfPoint {
  return {
    x: point.x / scale,
    y: pageHeight - point.y / scale,
  };
}

export function pdfPointToViewport(point: PdfPoint, pageHeight: number, scale: number): PdfPoint {
  return {
    x: point.x * scale,
    y: (pageHeight - point.y) * scale,
  };
}

export function viewportRectToPdf(rect: ViewportRect, pageHeight: number, scale: number): PdfRect {
  return {
    x: rect.left / scale,
    y: pageHeight - (rect.top + rect.height) / scale,
    width: rect.width / scale,
    height: rect.height / scale,
  };
}

export function pdfRectToViewport(rect: PdfRect, pageHeight: number, scale: number): ViewportRect {
  return {
    left: rect.x * scale,
    top: (pageHeight - rect.y - rect.height) * scale,
    width: rect.width * scale,
    height: rect.height * scale,
  };
}

export function clampRect(rect: PdfRect, pageWidth: number, pageHeight: number): PdfRect {
  const width = Math.max(1, Math.min(rect.width, pageWidth));
  const height = Math.max(1, Math.min(rect.height, pageHeight));
  return {
    x: Math.max(0, Math.min(rect.x, pageWidth - width)),
    y: Math.max(0, Math.min(rect.y, pageHeight - height)),
    width,
    height,
  };
}
