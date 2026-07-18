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

function overlapRatio(a: PdfRect, b: PdfRect) {
  const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const smaller = Math.max(1, Math.min(a.width * a.height, b.width * b.height));
  return (overlapX * overlapY) / smaller;
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
 * True when a replacement text operation already masks this extracted item,
 * so Find must skip it — the visible content is the operation's text, not
 * the original glyphs still present in the extraction snapshot.
 */
export function isTextItemReplaced(item: TextItem, operations: EditOperation[]): boolean {
  return operations.some((operation) => {
    if (operation.type !== "text" || operation.pageIndex !== item.pageIndex) return false;
    const coverRect = replacementCoverRect(operation);
    return Boolean(coverRect) && overlapRatio(coverRect!, item.rect) >= 0.5;
  });
}
