import type { EditOperation, PdfRect, TextItem, TextOperation } from "../types/editor";

export type TextMatch = {
  pageIndex: number;
  item: TextItem;
  startIndex: number;
  /** Exclusive end offset of the matched substring within `item.str`. */
  endIndex: number;
  /** Proportional slice of `item.rect` covering the matched substring. */
  rect: PdfRect;
};

export type FindOptions = {
  matchCase?: boolean;
};

/**
 * PDF text extraction has no per-character metrics, so the match rect is a
 * proportional horizontal slice of the item rect by character offsets.
 */
function matchRect(item: TextItem, startIndex: number, endIndex: number): PdfRect {
  const length = item.str.length;
  return {
    x: item.rect.x + item.rect.width * (startIndex / length),
    y: item.rect.y,
    width: item.rect.width * ((endIndex - startIndex) / length),
    height: item.rect.height,
  };
}

/** Document order for cycling: page, then top-to-bottom (PDF y is bottom-anchored), then left-to-right. */
function compareReadingOrder(a: TextItem, b: TextItem) {
  if (a.pageIndex !== b.pageIndex) return a.pageIndex - b.pageIndex;
  const lineDelta = (b.rect.y + b.rect.height / 2) - (a.rect.y + a.rect.height / 2);
  return Math.abs(lineDelta) > 2 ? lineDelta : a.rect.x - b.rect.x;
}

/**
 * Lowercase `value` for case-insensitive matching without ever changing its
 * length. Some case folds expand (Turkish "İ".toLowerCase() is two UTF-16
 * units), which would shift every index found in the folded string out of
 * alignment with the original — corrupting match rects and Replace All
 * splices. Code points whose lowercase form has a different length are kept
 * as-is instead.
 */
function foldForSearch(value: string): string {
  let folded = "";
  for (const char of value) {
    const lower = char.toLowerCase();
    folded += lower.length === char.length ? lower : char;
  }
  return folded;
}

/** Finds every occurrence of `query` across the given text items, case-insensitive by default. */
export function findMatches(textItems: TextItem[], query: string, options: FindOptions = {}): TextMatch[] {
  if (!query) return [];
  const needle = options.matchCase ? query : foldForSearch(query);
  const matches: TextMatch[] = [];
  for (const item of [...textItems].sort(compareReadingOrder)) {
    const haystack = options.matchCase ? item.str : foldForSearch(item.str);
    let index = haystack.indexOf(needle);
    while (index !== -1) {
      const endIndex = index + needle.length;
      matches.push({
        pageIndex: item.pageIndex,
        item,
        startIndex: index,
        endIndex,
        rect: matchRect(item, index, endIndex),
      });
      index = haystack.indexOf(needle, endIndex);
    }
  }
  return matches;
}

/** Substitutes every occurrence of `query` in `text` with `replacement`, honoring the case option. */
export function replaceAllOccurrences(text: string, query: string, replacement: string, options: FindOptions = {}): string {
  if (!query) return text;
  const haystack = options.matchCase ? text : foldForSearch(text);
  const needle = options.matchCase ? query : foldForSearch(query);
  let result = "";
  let cursor = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    result += text.slice(cursor, index) + replacement;
    cursor = index + needle.length;
    index = haystack.indexOf(needle, cursor);
  }
  return result + text.slice(cursor);
}

/**
 * Shared visibility policy for Find and text-based exports. A source text run
 * is suppressed only when a cover hides at least half of that run's area.
 * Measuring against the text run, rather than the smaller rectangle, keeps a
 * narrow redaction from hiding an entire long extracted run.
 */
export function isTextRectSignificantlyCovered(itemRect: PdfRect, coverRect: PdfRect) {
  const itemArea = itemRect.width * itemRect.height;
  if (itemArea <= 0) return false;
  const overlapX = Math.max(
    0,
    Math.min(itemRect.x + itemRect.width, coverRect.x + coverRect.width) - Math.max(itemRect.x, coverRect.x),
  );
  const overlapY = Math.max(
    0,
    Math.min(itemRect.y + itemRect.height, coverRect.y + coverRect.height) - Math.max(itemRect.y, coverRect.y),
  );
  return (overlapX * overlapY) / itemArea >= 0.5;
}

/**
 * The rect a replacement `text` operation covers in the original PDF content
 * — matching the editor's on-canvas preview (the `.operation--source-cover`
 * div in `PdfCanvas.tsx`, which suppresses the original text layer under
 * `sourceCoverRect` whenever it's set, regardless of `whiteout`). `whiteout`
 * only controls whether the *exported PDF bytes* get an opaque mask painted
 * over that rect (see `writeText` in `operationWriters.ts`) — a narrower,
 * separate concern from "does the user currently see the original covered",
 * which is what Find and the CSV/TXT/XLSX data exports need here. The two
 * conditions are intentionally different, not a bug to reconcile: an
 * exported PDF's paint operation and an editor-only text-layer suppression
 * don't have to agree for the export to still be correct.
 */
export function replacementCoverRect(operation: TextOperation): PdfRect | undefined {
  return operation.sourceCoverRect ?? (operation.whiteout ? operation.rect : undefined);
}

/**
 * True when an editor operation visually replaces or redacts this extracted
 * item, so Find must skip glyphs that are no longer visible in the editor.
 */
export function isTextItemReplaced(item: TextItem, operations: EditOperation[]): boolean {
  return operations.some((operation) => {
    if (operation.pageIndex !== item.pageIndex) return false;
    if (operation.type === "redaction") return isTextRectSignificantlyCovered(item.rect, operation.rect);
    if (operation.type !== "text") return false;
    const coverRect = replacementCoverRect(operation);
    return coverRect ? isTextRectSignificantlyCovered(item.rect, coverRect) : false;
  });
}
