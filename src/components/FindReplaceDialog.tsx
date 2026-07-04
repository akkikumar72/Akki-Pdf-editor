import { useEffect, useMemo, useRef, useState } from "react";
import { createReplacementOperation, createTextItemReplacementOperation } from "../editor/operationFactory";
import type { EditOperation, PdfRect, TextItem } from "../types/editor";
import { findMatches, isTextItemReplaced, replaceAllOccurrences } from "../utils/textSearch";
import { IconX } from "./AppIcons";
import { Button } from "./ui/button";

export type SearchHighlight = {
  pageIndex: number;
  rect: PdfRect;
};

type FindReplaceDialogProps = {
  textItems: TextItem[];
  operations: EditOperation[];
  pageSizes: Array<{ width: number; height: number }>;
  onAddOperations: (operations: EditOperation[]) => void;
  onHighlight: (highlight: SearchHighlight | null) => void;
  onPageChange: (pageIndex: number) => void;
  onClose: () => void;
};

const DEFAULT_PAGE_HEIGHT = 792;

export function FindReplaceDialog({
  textItems,
  operations,
  pageSizes,
  onAddOperations,
  onHighlight,
  onPageChange,
  onClose,
}: FindReplaceDialogProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const findInputRef = useRef<HTMLInputElement>(null);

  // Items already masked by a replacement operation show the operation's text,
  // not their extracted glyphs, so Find must skip them.
  const searchableItems = useMemo(
    () => textItems.filter((item) => !isTextItemReplaced(item, operations)),
    [textItems, operations],
  );
  const matches = useMemo(
    () => findMatches(searchableItems, query, { matchCase }),
    [searchableItems, query, matchCase],
  );
  const currentMatch = cursor !== null ? matches[cursor] : undefined;

  useEffect(() => {
    findInputRef.current?.focus();
  }, []);

  // After a replace the match list shrinks, so an out-of-range cursor lands on
  // the last remaining match (or clears when nothing is left).
  useEffect(() => {
    setCursor((current) => {
      if (current === null || current < matches.length) return current;
      return matches.length === 0 ? null : matches.length - 1;
    });
  }, [matches]);

  useEffect(() => {
    if (!currentMatch) {
      onHighlight(null);
      return;
    }
    onPageChange(currentMatch.pageIndex);
    onHighlight({ pageIndex: currentMatch.pageIndex, rect: currentMatch.rect });
  }, [currentMatch, onHighlight, onPageChange]);

  useEffect(() => () => onHighlight(null), [onHighlight]);

  const pageHeightFor = (pageIndex: number) => pageSizes[pageIndex]?.height ?? DEFAULT_PAGE_HEIGHT;

  const resetSearch = () => {
    setCursor(null);
    setStatus("");
  };

  const findNext = () => {
    if (!query) {
      setStatus("Please enter text to find");
      return;
    }
    if (matches.length === 0) {
      setCursor(null);
      setStatus("No matches found");
      return;
    }
    const next = cursor === null ? 0 : cursor + 1;
    if (next >= matches.length) {
      setCursor(0);
      setStatus("Reached end of the document");
      return;
    }
    setCursor(next);
    setStatus(`Match ${next + 1} of ${matches.length}`);
  };

  const replaceCurrent = () => {
    if (!currentMatch) {
      findNext();
      return;
    }
    const operation = createReplacementOperation(currentMatch, replacement, pageHeightFor(currentMatch.pageIndex));
    onAddOperations([operation]);
    setStatus("Replaced 1 occurrence");
  };

  const replaceAll = () => {
    if (!query) {
      setStatus("Please enter text to find");
      return;
    }
    if (matches.length === 0) {
      setStatus("No matches found");
      return;
    }
    // One replacement op per item: an item can hold several matches, and its
    // whiteout mask covers the whole item either way.
    const items = [...new Set(matches.map((match) => match.item))];
    const created = items.map((item) =>
      createTextItemReplacementOperation(
        item,
        replaceAllOccurrences(item.str, query, replacement, { matchCase }),
        pageHeightFor(item.pageIndex),
      ),
    );
    const count = matches.length;
    onAddOperations(created);
    setCursor(null);
    setStatus(`Replaced ${count} occurrence${count === 1 ? "" : "s"}`);
  };

  return (
    <section
      className="find-replace-dialog"
      role="dialog"
      aria-label="Find and replace"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
      }}
    >
      <div className="find-replace-dialog__head">
        <h2>Find &amp; replace</h2>
        <button className="icon-button" title="Close find and replace" onClick={onClose}>
          <IconX aria-hidden="true" />
        </button>
      </div>
      <div className="find-replace-dialog__fields field-stack">
        <label>
          <span>Find</span>
          <input
            ref={findInputRef}
            type="text"
            value={query}
            placeholder="Text to find"
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              resetSearch();
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              findNext();
            }}
          />
        </label>
        <label>
          <span>Replace with</span>
          <input
            type="text"
            value={replacement}
            placeholder="Replacement"
            onChange={(event) => setReplacement(event.currentTarget.value)}
          />
        </label>
      </div>
      <label className="find-replace-dialog__option">
        <input
          type="checkbox"
          checked={matchCase}
          onChange={(event) => {
            setMatchCase(event.currentTarget.checked);
            resetSearch();
          }}
        />
        <span>Match case</span>
      </label>
      <div className="find-replace-dialog__actions">
        <span className="find-replace-dialog__status" role="status" aria-live="polite">{status}</span>
        <Button type="button" variant="quiet" size="sm" onClick={findNext}>Find</Button>
        <Button type="button" variant="quiet" size="sm" onClick={replaceCurrent}>Replace</Button>
        <Button type="button" variant="primary" size="sm" onClick={replaceAll}>Replace all</Button>
      </div>
    </section>
  );
}
