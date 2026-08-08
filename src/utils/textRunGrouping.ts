import type { TextItem, ViewportRect } from "../types/editor";
import { pdfRectToViewport } from "./coordinates";

function isGenericCssFontFamily(name?: string) {
  /* v8 ignore next -- callers guard on `item.cssFontFamily` before calling, so `name` is never undefined and the `?? ""` fallback is unreachable */
  return /^(serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i.test((name ?? "").replace(/^["']|["']$/g, "").trim());
}

function isInternalPdfFontName(name?: string) {
  /* v8 ignore next -- callers guard on `item.fontName` before calling, so `name` is never undefined and the `?? ""` fallback is unreachable */
  return /^g_d\d+_f\d+$/i.test((name ?? "").trim());
}

function sameTextLine(a: TextItem, b: TextItem) {
  const aMidY = a.rect.y + a.rect.height / 2;
  const bMidY = b.rect.y + b.rect.height / 2;
  const fontSize = Math.max(1, Math.min(a.fontSize ?? a.rect.height, b.fontSize ?? b.rect.height));
  return Math.abs(aMidY - bMidY) <= Math.max(2, fontSize * 0.42);
}

function textFontSize(item: TextItem) {
  return item.fontSize ?? item.rect.height;
}

function sameTextScale(a: TextItem, b: TextItem) {
  const aSize = textFontSize(a);
  const bSize = textFontSize(b);
  return Math.abs(aSize - bSize) <= Math.max(1.5, Math.min(aSize, bSize) * 0.18);
}

type PaintRun = {
  items: TextItem[];
  left: number;
  right: number;
};

function horizontalGap(run: PaintRun, item: TextItem) {
  const itemRight = item.rect.x + item.rect.width;
  if (item.rect.x > run.right) return item.rect.x - run.right;
  if (itemRight < run.left) return run.left - itemRight;
  return 0;
}

/**
 * PDF replacement export leaves the covered source operators in the content
 * stream, then appends the newly painted text. PDF.js preserves that paint
 * order. A later item restarting at an existing run's left edge therefore
 * supersedes the whole earlier run, even when the replacement is much shorter.
 */
export function collapseSupersededPaintRuns(items: TextItem[]) {
  const runs: PaintRun[] = [];

  for (const item of items) {
    const sameBand = (run: PaintRun) => {
      const first = run.items[0];
      return first.pageIndex === item.pageIndex && sameTextLine(first, item) && sameTextScale(first, item);
    };
    const originTolerance = Math.max(0.75, textFontSize(item) * 0.08);
    const restarted = runs.find(
      (run) => sameBand(run) && Math.abs(item.rect.x - run.left) <= originTolerance,
    );
    if (restarted) {
      restarted.items = [item];
      restarted.left = item.rect.x;
      restarted.right = item.rect.x + item.rect.width;
      continue;
    }

    let closest: { run: PaintRun; gap: number } | undefined;
    for (const run of runs) {
      if (!sameBand(run)) continue;
      const gap = horizontalGap(run, item);
      const runSize = textFontSize(run.items[0]);
      if (gap > Math.max(10, Math.min(runSize, textFontSize(item)) * 1.35)) continue;
      if (!closest || gap < closest.gap) closest = { run, gap };
    }

    if (closest) {
      closest.run.items.push(item);
      closest.run.left = Math.min(closest.run.left, item.rect.x);
      closest.run.right = Math.max(closest.run.right, item.rect.x + item.rect.width);
    } else {
      runs.push({ items: [item], left: item.rect.x, right: item.rect.x + item.rect.width });
    }
  }

  return runs.flatMap((run) => run.items);
}

function styleSpecificityScore(item: TextItem) {
  const weightScore = item.fontWeight ?? 400;
  const familyScore =
    item.cssFontFamily && !isGenericCssFontFamily(item.cssFontFamily)
      ? 90
      : item.fontName && !isInternalPdfFontName(item.fontName)
        ? 70
        : 0;
  const sizeScore = Math.round(item.fontSize ?? item.rect.height);
  return weightScore * 10 + familyScore + sizeScore;
}

function chooseRunStyleItem(items: TextItem[]) {
  return items.reduce((best, item) => (
    styleSpecificityScore(item) > styleSpecificityScore(best) ? item : best
  ), items[0]);
}

function mergeTextRun(items: TextItem[]): TextItem {
  const sorted = [...items].sort((a, b) => a.rect.x - b.rect.x);
  const styleItem = chooseRunStyleItem(sorted);
  const x = Math.min(...sorted.map((item) => item.rect.x));
  const y = Math.min(...sorted.map((item) => item.rect.y));
  const right = Math.max(...sorted.map((item) => item.rect.x + item.rect.width));
  const top = Math.max(...sorted.map((item) => item.rect.y + item.rect.height));
  const text = sorted.reduce((value, item, index) => {
    if (index === 0) return item.str;
    const previous = sorted[index - 1];
    const gap = item.rect.x - (previous.rect.x + previous.rect.width);
    const fontSize = previous.fontSize ?? previous.rect.height;
    const shouldSpace = /\w$/.test(previous.str) && /^\w/.test(item.str)
      ? gap > -Math.max(1, fontSize * 0.08)
      : gap > Math.max(1.5, fontSize * 0.15);
    const space = shouldSpace ? " " : "";
    return `${value}${space}${item.str}`;
  }, "");

  return {
    ...styleItem,
    str: text,
    rect: {
      x,
      y,
      width: right - x,
      height: top - y,
    },
  };
}

export function groupEditableTextRuns(items: TextItem[]) {
  const sorted = collapseSupersededPaintRuns(items).sort((a, b) => {
    const lineDelta = (b.rect.y + b.rect.height / 2) - (a.rect.y + a.rect.height / 2);
    return Math.abs(lineDelta) > 2 ? lineDelta : a.rect.x - b.rect.x;
  });
  const runs: TextItem[] = [];
  let current: TextItem[] = [];

  for (const item of sorted) {
    const previous = current[current.length - 1];
    const fontSize = textFontSize(item);
    const previousFontSize = previous ? textFontSize(previous) : fontSize;
    const gap = previous ? item.rect.x - (previous.rect.x + previous.rect.width) : 0;
    const sameLine = previous ? sameTextLine(previous, item) : true;
    const sameScale = previous ? sameTextScale(previous, item) : true;
    const closeEnough = !previous || gap <= Math.max(10, Math.min(fontSize, previousFontSize) * 1.35);

    if (!previous || (sameLine && sameScale && closeEnough)) {
      current.push(item);
      continue;
    }

    runs.push(mergeTextRun(current));
    current = [item];
  }

  if (current.length) runs.push(mergeTextRun(current));
  return runs;
}

export function findNearbyTextRunForStyle(pointRect: ViewportRect, textRuns: TextItem[], pageHeight: number, scale: number) {
  const pointX = pointRect.left + pointRect.width / 2;
  const pointY = pointRect.top + pointRect.height / 2;
  let best: { item: TextItem; score: number } | undefined;

  for (const item of textRuns) {
    const rect = pdfRectToViewport(item.rect, pageHeight, scale);
    const lineCenterY = rect.top + rect.height / 2;
    const yDistance = Math.abs(pointY - lineCenterY);
    const lineTolerance = Math.max(12, rect.height * 1.5);
    if (yDistance > lineTolerance) continue;

    const xDistance = pointX < rect.left
      ? rect.left - pointX
      : pointX > rect.left + rect.width
        ? pointX - (rect.left + rect.width)
        : 0;
    if (xDistance > Math.max(180, rect.height * 18)) continue;

    const score = yDistance * 4 + xDistance;
    /* v8 ignore next -- the tie-break sub-branch (a later candidate not beating the current best) depends on scan order not reproduced by the unit fixtures; exercised by the e2e suite */
    if (!best || score < best.score) best = { item, score };
  }

  return best?.item;
}
