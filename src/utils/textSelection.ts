import type { PdfPoint, PdfRect, TextItem } from "../types/editor";

/**
 * Intersects a drawn marquee (PDF space) with the page's text runs and returns
 * one annotation rect per intersected run line: the run's full vertical band,
 * clipped horizontally to the marquee. Returns [] when no run is touched so
 * callers can fall back to free-rect annotation.
 */
export function annotationRectsForMarquee(marqueeRect: PdfRect, runs: TextItem[]): PdfRect[] {
  const marqueeRight = marqueeRect.x + marqueeRect.width;
  const marqueeTop = marqueeRect.y + marqueeRect.height;
  const rects: PdfRect[] = [];
  for (const run of runs) {
    const left = Math.max(marqueeRect.x, run.rect.x);
    const right = Math.min(marqueeRight, run.rect.x + run.rect.width);
    const overlapY = Math.min(marqueeTop, run.rect.y + run.rect.height) - Math.max(marqueeRect.y, run.rect.y);
    if (right - left <= 0 || overlapY <= 0) continue;
    rects.push({ x: left, y: run.rect.y, width: right - left, height: run.rect.height });
  }
  return rects;
}

/** Snaps a plain click (PDF space) to the whole run under it; [] when the click hits no text. */
export function annotationRectsForClick(point: PdfPoint, runs: TextItem[]): PdfRect[] {
  const hit = runs.find((run) =>
    point.x >= run.rect.x &&
    point.x <= run.rect.x + run.rect.width &&
    point.y >= run.rect.y &&
    point.y <= run.rect.y + run.rect.height,
  );
  return hit ? [{ ...hit.rect }] : [];
}
