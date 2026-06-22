import type { PdfRect } from "../types/editor";

/** Vertical slack so a whiteout mask fully covers PDF.js text-layer span bleed. */
export function replacementCoverPadding(fontSize: number): number {
  return Math.max(1, fontSize * 0.18);
}

/**
 * How much to trim the top of the whiteout cover so it hugs the glyph ascent
 * instead of the full PDF.js line box. PDF.js text-run boxes span a full em
 * (~ascent + descent + leading); the painted glyphs only reach cap/ascent
 * (~0.78em). Whiting out the untouched top strip erases the descenders of a
 * tightly-leaded line above (Sejda keeps the mask tight to the run). Trimming
 * the top is safe: the original glyphs never reach that strip.
 */
export function replacementCoverTopTrim(fontSize: number): number {
  return fontSize * 0.16;
}

/**
 * Expand and shift a PDF-space cover rect so it masks the original glyphs without
 * bleeding onto neighboring lines. PDF rects use a bottom-left anchor; decreasing
 * `y` moves the box down on screen, increasing `y + height` moves the top up.
 *
 * - Bottom edge: padded down (`pad * 1.2`) to cover PDF.js span bleed below the run.
 * - Top edge: trimmed down to the glyph ascent so it never overlaps the line above.
 */
export function padReplacementCoverRect(rect: PdfRect, fontSize: number): PdfRect {
  const pad = replacementCoverPadding(fontSize);
  const bottomPad = pad * 1.2;
  const topTrim = replacementCoverTopTrim(fontSize);
  return {
    ...rect,
    y: rect.y - bottomPad,
    height: Math.max(fontSize * 0.5, rect.height - topTrim + bottomPad),
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
