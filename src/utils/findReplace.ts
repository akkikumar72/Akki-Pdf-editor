import { createOperationsForTool } from "../editor/operationFactory";
import type { EditOperation, TextItem, TextOperation } from "../types/editor";
import { pdfRectToViewport } from "./coordinates";

export type FindReplaceOptions = {
  /** When true, matching is case-sensitive. Defaults to false (case-insensitive). */
  caseSensitive?: boolean;
};

export type FindMatch = {
  /** Stable identifier so the UI can key/track a match across re-searches. */
  id: string;
  /** The source text item that contains the match. */
  item: TextItem;
  /** Index of the source item within the supplied `textItems` array. */
  itemIndex: number;
  /** Page the match lives on (mirrors `item.pageIndex`). */
  pageIndex: number;
  /** Start offset of the match within `item.str`. */
  start: number;
  /** End offset (exclusive) of the match within `item.str`. */
  end: number;
  /** The exact matched substring (preserves source casing). */
  text: string;
};

/**
 * Find every occurrence of `query` across the supplied text items. Matching is a
 * plain substring search (case-insensitive by default) and reports one `FindMatch`
 * per occurrence, even when a single text item contains the query multiple times.
 *
 * This is the search index for the Find & Replace panel; it is intentionally pure
 * so it can be unit-tested without any PDF.js / DOM dependency.
 */
export function findMatches(
  textItems: TextItem[],
  query: string,
  options: FindReplaceOptions = {},
): FindMatch[] {
  if (!query) return [];
  const caseSensitive = options.caseSensitive ?? false;
  const needle = caseSensitive ? query : query.toLowerCase();
  const matches: FindMatch[] = [];

  textItems.forEach((item, itemIndex) => {
    const haystack = caseSensitive ? item.str : item.str.toLowerCase();
    if (!haystack) return;
    let from = 0;
    let occurrence = 0;
    for (;;) {
      const index = haystack.indexOf(needle, from);
      if (index === -1) break;
      matches.push({
        id: `${itemIndex}:${index}:${occurrence}`,
        item,
        itemIndex,
        pageIndex: item.pageIndex,
        start: index,
        end: index + query.length,
        text: item.str.slice(index, index + query.length),
      });
      occurrence += 1;
      // Advance past this occurrence. Step by at least one char to avoid an
      // infinite loop if the query were ever empty (guarded above) or zero-width.
      from = index + Math.max(1, query.length);
    }
  });

  return matches;
}

/**
 * Compute the replacement string for a matched item by swapping only the matched
 * substring while preserving the rest of the item's text. Replaces every occurrence
 * of `query` in the item so a Replace-all leaves no stragglers within a single run.
 */
export function buildReplacedString(
  source: string,
  query: string,
  replacement: string,
  options: FindReplaceOptions = {},
): string {
  if (!query) return source;
  const caseSensitive = options.caseSensitive ?? false;
  const haystack = caseSensitive ? source : source.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  let result = "";
  let from = 0;
  for (;;) {
    const index = haystack.indexOf(needle, from);
    if (index === -1) {
      result += source.slice(from);
      break;
    }
    result += source.slice(from, index) + replacement;
    from = index + query.length;
  }
  return result;
}

/**
 * Build a text-replacement overlay for a matched text item. This reuses the exact
 * same machinery as the click-to-replace flow (`createOperationsForTool` with a
 * `sourceTextItem`): it produces a `TextOperation` carrying the whiteout mask and
 * `sourceCoverRect` so the original glyph never reappears, with closest-match font
 * styling derived from the item's font metadata. The replacement text swaps only the
 * matched substring(s) inside the run, keeping any surrounding characters intact.
 *
 * Returns `null` when the tool factory produced no text operation (should not happen
 * for a text item, but keeps callers defensive).
 */
export function createReplacementOperation(
  item: TextItem,
  query: string,
  replacement: string,
  pageHeight: number,
  options: FindReplaceOptions = {},
): TextOperation | null {
  const viewportRect = pdfRectToViewport(item.rect, pageHeight, 1);
  const operations: EditOperation[] = createOperationsForTool({
    activeTool: "select",
    viewportRect,
    pageHeight,
    pageIndex: item.pageIndex,
    scale: 1,
    operations: [],
    prompt: () => null,
    sourceTextItem: item,
  });
  const textOperation = operations.find(
    (operation): operation is TextOperation => operation.type === "text",
  );
  if (!textOperation) return null;
  return {
    ...textOperation,
    text: buildReplacedString(item.str, query, replacement, options),
  };
}
