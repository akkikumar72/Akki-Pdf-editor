import { describe, expect, it } from "vitest";
import { findMatches, isTextItemReplaced, replaceAllOccurrences } from "../src/utils/textSearch";
import type { EditOperation, TextItem, TextOperation } from "../src/types/editor";

function item(overrides: Partial<TextItem> = {}): TextItem {
  return {
    str: "Hello world",
    pageIndex: 0,
    rect: { x: 100, y: 700, width: 110, height: 14 },
    ...overrides,
  };
}

function replacementOp(overrides: Partial<TextOperation> = {}): TextOperation {
  return {
    id: "text_1",
    type: "text",
    pageIndex: 0,
    rect: { x: 100, y: 700, width: 110, height: 14 },
    sourceCoverRect: { x: 100, y: 700, width: 110, height: 14 },
    text: "Replaced",
    fontFamily: "Inter",
    fontSize: 12,
    color: "#111827",
    align: "left",
    createdAt: 1,
    ...overrides,
  };
}

describe("findMatches", () => {
  it("returns no matches for an empty query", () => {
    expect(findMatches([item()], "")).toEqual([]);
  });

  it("matches case-insensitively by default", () => {
    const matches = findMatches([item()], "HELLO");
    expect(matches).toHaveLength(1);
    expect(matches[0].startIndex).toBe(0);
    expect(matches[0].endIndex).toBe(5);
  });

  it("respects matchCase", () => {
    expect(findMatches([item()], "HELLO", { matchCase: true })).toHaveLength(0);
    expect(findMatches([item()], "Hello", { matchCase: true })).toHaveLength(1);
  });

  it("finds multiple matches inside one item", () => {
    const matches = findMatches([item({ str: "abcabcabc" })], "abc");
    expect(matches.map((match) => match.startIndex)).toEqual([0, 3, 6]);
  });

  it("slices the item rect proportionally by character offsets", () => {
    // "world" spans offsets 6..11 of an 11-char string, rect width 110.
    const [match] = findMatches([item()], "world");
    expect(match.rect.x).toBeCloseTo(100 + 110 * (6 / 11));
    expect(match.rect.width).toBeCloseTo(110 * (5 / 11));
    expect(match.rect.y).toBe(700);
    expect(match.rect.height).toBe(14);
  });

  it("orders matches by page, then top-to-bottom, then left-to-right", () => {
    const items = [
      item({ str: "x", pageIndex: 1, rect: { x: 0, y: 700, width: 10, height: 10 } }),
      item({ str: "x", pageIndex: 0, rect: { x: 0, y: 100, width: 10, height: 10 } }),
      item({ str: "x", pageIndex: 0, rect: { x: 200, y: 700, width: 10, height: 10 } }),
      item({ str: "x", pageIndex: 0, rect: { x: 50, y: 700, width: 10, height: 10 } }),
    ];
    const matches = findMatches(items, "x");
    expect(matches.map((match) => [match.pageIndex, match.item.rect.y, match.item.rect.x])).toEqual([
      [0, 700, 50],
      [0, 700, 200],
      [0, 100, 0],
      [1, 700, 0],
    ]);
  });

  it("skips items without any occurrence", () => {
    expect(findMatches([item({ str: "nothing here" })], "zzz")).toEqual([]);
  });
});

describe("replaceAllOccurrences", () => {
  it("returns the text untouched for an empty query", () => {
    expect(replaceAllOccurrences("abc", "", "x")).toBe("abc");
  });

  it("replaces every occurrence case-insensitively by default", () => {
    expect(replaceAllOccurrences("Cat cat CAT", "cat", "dog")).toBe("dog dog dog");
  });

  it("replaces only exact-case occurrences when matchCase is on", () => {
    expect(replaceAllOccurrences("Cat cat CAT", "cat", "dog", { matchCase: true })).toBe("Cat dog CAT");
  });

  it("returns the text unchanged when nothing matches", () => {
    expect(replaceAllOccurrences("abc", "zzz", "x")).toBe("abc");
  });

  it("keeps indices aligned when the text contains length-changing case folds (Turkish İ)", () => {
    // "İ".toLowerCase() is TWO UTF-16 units; naive lowercase-then-index would
    // shift every later match and splice the replacement into the wrong offset.
    expect(replaceAllOccurrences("İstanbul TOTAL end", "total", "SUM")).toBe("İstanbul SUM end");
    // The length-changing character itself is not case-matched — but it must
    // never corrupt the string either.
    expect(replaceAllOccurrences("İİİ abc", "abc", "xyz")).toBe("İİİ xyz");
  });
});

describe("findMatches with length-changing case folds", () => {
  it("reports offsets in the original string, not the expanded fold", () => {
    const items = [item({ str: "İzmir Report", rect: { x: 0, y: 700, width: 120, height: 12 } })];
    const matches = findMatches(items, "report");
    expect(matches).toHaveLength(1);
    expect(matches[0].startIndex).toBe(6);
    expect(matches[0].endIndex).toBe(12);
    expect(items[0].str.slice(matches[0].startIndex, matches[0].endIndex)).toBe("Report");
  });
});

describe("isTextItemReplaced", () => {
  it("is true when a replacement op's cover rect overlaps the item", () => {
    expect(isTextItemReplaced(item(), [replacementOp()])).toBe(true);
  });

  it("is false for non-text operations", () => {
    const whiteout: EditOperation = {
      id: "w1",
      type: "whiteout",
      pageIndex: 0,
      rect: { x: 100, y: 700, width: 110, height: 14 },
      color: "#fff",
      createdAt: 1,
    };
    expect(isTextItemReplaced(item(), [whiteout])).toBe(false);
  });

  it("is false when the text op has no sourceCoverRect and no whiteout", () => {
    expect(isTextItemReplaced(item(), [replacementOp({ sourceCoverRect: undefined })])).toBe(false);
  });

  it("is true for a manually-whiteouted text op covering the item (no sourceCoverRect)", () => {
    // The writer masks under the op's own rect when whiteout is on — Find
    // must treat the covered original as redacted the same way.
    expect(
      isTextItemReplaced(item(), [replacementOp({ sourceCoverRect: undefined, whiteout: true })]),
    ).toBe(true);
  });

  it("is true for a replacement with sourceCoverRect even when whiteout is off (matches the editor preview, not the PDF writer)", () => {
    // The on-canvas .operation--source-cover preview suppresses the original
    // text layer whenever sourceCoverRect is set, independent of whiteout —
    // whiteout only decides whether the *exported PDF bytes* get an opaque
    // mask. Find must match what the user sees in the editor, so this stays
    // true even with whiteout: false.
    expect(
      isTextItemReplaced(item(), [replacementOp({ whiteout: false })]),
    ).toBe(true);
  });

  it("is false when the op lives on another page", () => {
    expect(isTextItemReplaced(item(), [replacementOp({ pageIndex: 2 })])).toBe(false);
  });

  it("is false when the overlap is below the significance threshold", () => {
    expect(
      isTextItemReplaced(item(), [replacementOp({ sourceCoverRect: { x: 500, y: 100, width: 10, height: 10 } })]),
    ).toBe(false);
  });
});
