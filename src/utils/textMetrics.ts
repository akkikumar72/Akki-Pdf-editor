import type { PdfRect } from "../types/editor";

/** Vertical slack so a whiteout mask fully covers PDF.js text-layer span bleed. */
export function replacementCoverPadding(fontSize: number): number {
  return Math.max(1, fontSize * 0.18);
}

/**
 * Expand and shift a PDF-space cover rect so it fully masks the PDF.js text layer.
 * PDF rects use a bottom-left anchor; decreasing `y` moves the box down on screen.
 */
export function padReplacementCoverRect(rect: PdfRect, fontSize: number): PdfRect {
  const pad = replacementCoverPadding(fontSize);
  return {
    ...rect,
    y: rect.y - pad * 1.2,
    height: rect.height + pad * 0.8,
  };
}

/** pdf-lib `drawText` baseline y for text anchored to the bottom of a PDF rect. */
export function textBaselineDrawY(rect: PdfRect, fontSize: number): number {
  return rect.y + fontSize * 0.22;
}

/** CSS top padding (px) to align overlay glyphs on the same baseline as export. */
export function textBaselineTopPaddingPx(fontSize: number, scale: number): number {
  const boxHeightPx = fontSize * scale;
  const baselineFromBottomPx = fontSize * 0.22 * scale;
  return Math.max(0, boxHeightPx - baselineFromBottomPx - fontSize * scale * 0.88);
}

export function viewportRectsOverlap(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number },
): boolean {
  const overlapX = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const overlapY = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  const overlapArea = overlapX * overlapY;
  const smaller = Math.max(1, Math.min(a.width * a.height, b.width * b.height));
  return overlapArea / smaller >= 0.35;
}
