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

/**
 * CSS top padding (px) to align overlay glyphs on the same baseline as export.
 *
 * The overlay box is the *padded* replacement rect (see `padReplacementCoverRect`),
 * so it is taller than the glyph em-box. This pushes the text down so its baseline
 * lands `fontSize * 0.22` above the box bottom — matching `textBaselineDrawY`, which
 * positions the exported glyphs. Clamps to 0 when the box is not taller than the em-box.
 *
 * `boxHeightPx` must be the actual rendered box height in pixels (viewport rect
 * height), not the font size — deriving it from `fontSize` made this a no-op.
 */
export function textBaselineTopPaddingPx(boxHeightPx: number, fontSize: number, scale: number): number {
  const baselineFromBottomPx = fontSize * 0.22 * scale;
  const ascentPx = fontSize * 0.88 * scale;
  return Math.max(0, boxHeightPx - baselineFromBottomPx - ascentPx);
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
