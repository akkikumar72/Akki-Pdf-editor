import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Replace, Search } from "lucide-react";
import type { TextItem, TextOperation } from "../types/editor";
import { createReplacementOperation, findMatches } from "../utils/findReplace";

export type FindReplacePanelProps = {
  /** All extracted text items across every page (the search index). */
  textItems: TextItem[];
  /** Page heights in PDF units, indexed by page. Needed to build replacement overlays. */
  pageHeights: number[];
  /** Add a freshly built replacement overlay to the edit model. */
  onAddOperation: (operation: TextOperation) => void;
  /** Navigate to and reveal a match: jump to its page and select the source rect. */
  onLocateMatch?: (pageIndex: number, rect: TextItem["rect"]) => void;
  /** Surface a short status message (e.g. "Replaced 3 matches"). */
  onNotice?: (message: string) => void;
};

export function FindReplacePanel({
  textItems,
  pageHeights,
  onAddOperation,
  onLocateMatch,
  onNotice,
}: FindReplacePanelProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const matches = useMemo(
    () => findMatches(textItems, query, { caseSensitive }),
    [textItems, query, caseSensitive],
  );

  // Keep the active match in range whenever the result set changes.
  useEffect(() => {
    setActiveIndex((index) => {
      if (matches.length === 0) return 0;
      return Math.min(index, matches.length - 1);
    });
  }, [matches.length]);

  const hasMatches = matches.length > 0;
  const activeMatch = hasMatches ? matches[Math.min(activeIndex, matches.length - 1)] : undefined;

  const locate = (matchIndex: number) => {
    const match = matches[matchIndex];
    if (!match) return;
    onLocateMatch?.(match.pageIndex, match.item.rect);
  };

  const goTo = (nextIndex: number) => {
    if (!hasMatches) return;
    const wrapped = (nextIndex + matches.length) % matches.length;
    setActiveIndex(wrapped);
    locate(wrapped);
  };

  const replaceOne = () => {
    if (!activeMatch) return;
    const pageHeight = pageHeights[activeMatch.pageIndex];
    if (pageHeight === undefined) return;
    const operation = createReplacementOperation(
      activeMatch.item,
      query,
      replacement,
      pageHeight,
      { caseSensitive },
    );
    if (!operation) return;
    onAddOperation(operation);
    onLocateMatch?.(activeMatch.pageIndex, activeMatch.item.rect);
    onNotice?.(`Replaced "${query}" on page ${activeMatch.pageIndex + 1}`);
  };

  const replaceAll = () => {
    if (!hasMatches) return;
    // One overlay per source item: building from a per-item set avoids stacking
    // multiple whiteout masks over the same run when it holds several occurrences.
    const itemsByIndex = new Map<number, TextItem>();
    for (const match of matches) {
      if (!itemsByIndex.has(match.itemIndex)) itemsByIndex.set(match.itemIndex, match.item);
    }
    let count = 0;
    for (const item of itemsByIndex.values()) {
      const pageHeight = pageHeights[item.pageIndex];
      if (pageHeight === undefined) continue;
      const operation = createReplacementOperation(item, query, replacement, pageHeight, {
        caseSensitive,
      });
      if (!operation) continue;
      onAddOperation(operation);
      count += 1;
    }
    onNotice?.(`Replaced ${matches.length} match${matches.length === 1 ? "" : "es"} across ${count} text run${count === 1 ? "" : "s"}`);
  };

  return (
    <section className="inspector-section find-replace" aria-label="Find and replace" id="find-replace-panel">
      <div className="panel-heading panel-heading--small">
        <span>Find &amp; replace</span>
        <strong aria-live="polite">
          {query ? (hasMatches ? `${activeIndex + 1}/${matches.length}` : "0") : `${textItems.length} items`}
        </strong>
      </div>

      <div className="field-stack">
        <label>
          Find
          <input
            id="find-replace-query"
            type="text"
            value={query}
            placeholder="Search page text"
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                goTo(event.shiftKey ? activeIndex - 1 : activeIndex + 1);
              }
            }}
          />
        </label>
        <label>
          Replace with
          <input
            type="text"
            value={replacement}
            placeholder="Replacement text"
            onChange={(event) => setReplacement(event.currentTarget.value)}
          />
        </label>

        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={caseSensitive}
            onChange={(event) => setCaseSensitive(event.currentTarget.checked)}
          />
          Match case
        </label>
      </div>

      <div className="find-replace__nav">
        <button type="button" onClick={() => goTo(activeIndex - 1)} disabled={!hasMatches} aria-label="Previous match">
          <ChevronUp aria-hidden="true" /> Prev
        </button>
        <button type="button" onClick={() => goTo(activeIndex + 1)} disabled={!hasMatches} aria-label="Next match">
          <ChevronDown aria-hidden="true" /> Next
        </button>
      </div>

      <p className="helper-text" role="status">
        {query
          ? hasMatches
            ? `Match ${activeIndex + 1} of ${matches.length}${activeMatch ? ` · page ${activeMatch.pageIndex + 1}` : ""}`
            : "No matches"
          : "Type to search text across all pages."}
      </p>

      <div className="export-grid">
        <button type="button" onClick={replaceOne} disabled={!hasMatches}>
          <Replace aria-hidden="true" /> Replace
        </button>
        <button type="button" onClick={replaceAll} disabled={!hasMatches}>
          <Search aria-hidden="true" /> Replace all
        </button>
      </div>
    </section>
  );
}
