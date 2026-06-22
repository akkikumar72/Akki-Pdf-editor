import { describe, expect, it } from "vitest";
import { buildReplacedString, createReplacementOperation, findMatches } from "../src/utils/findReplace";
import { padReplacementCoverRect } from "../src/utils/textMetrics";
import type { TextItem } from "../src/types/editor";

const items: TextItem[] = [
  {
    str: "Invoice total due",
    pageIndex: 0,
    rect: { x: 72, y: 700, width: 140, height: 20 },
    fontName: "Helvetica-Bold",
    cssFontFamily: "Helvetica",
    fontSize: 20,
    fontWeight: 700,
  },
  {
    str: "Total amount: total",
    pageIndex: 1,
    rect: { x: 72, y: 500, width: 160, height: 16 },
    fontName: "Helvetica",
    cssFontFamily: "Helvetica",
    fontSize: 16,
  },
  {
    str: "No relevant content",
    pageIndex: 1,
    rect: { x: 72, y: 400, width: 160, height: 16 },
  },
];

describe("findMatches", () => {
  it("returns an empty list for an empty query", () => {
    expect(findMatches(items, "")).toEqual([]);
  });

  it("matches case-insensitively by default and counts every occurrence", () => {
    const matches = findMatches(items, "total");
    // "total" in item0, "Total" + "total" in item1 => 3 occurrences total.
    expect(matches).toHaveLength(3);
    expect(matches.map((match) => match.pageIndex)).toEqual([0, 1, 1]);
    expect(matches[1].text).toBe("Total");
    expect(matches[2].text).toBe("total");
  });

  it("reports correct offsets for each occurrence", () => {
    const matches = findMatches(items, "total");
    expect(matches[1]).toMatchObject({ start: 0, end: 5, itemIndex: 1 });
    expect(matches[2]).toMatchObject({ start: 14, end: 19, itemIndex: 1 });
  });

  it("honours case sensitivity when requested", () => {
    const matches = findMatches(items, "Total", { caseSensitive: true });
    expect(matches).toHaveLength(1);
    expect(matches[0].pageIndex).toBe(1);
    expect(matches[0].start).toBe(0);
  });

  it("produces stable, unique ids per occurrence", () => {
    const matches = findMatches(items, "total");
    const ids = matches.map((match) => match.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("buildReplacedString", () => {
  it("replaces only the matched substring, preserving surrounding text", () => {
    expect(buildReplacedString("Invoice total due", "total", "balance")).toBe("Invoice balance due");
  });

  it("replaces every occurrence within a single run", () => {
    expect(buildReplacedString("Total amount: total", "total", "X")).toBe("X amount: X");
  });

  it("preserves source casing for non-matched characters in case-insensitive mode", () => {
    expect(buildReplacedString("Total amount: total", "total", "Sum")).toBe("Sum amount: Sum");
  });

  it("only swaps exact-case matches when case-sensitive", () => {
    expect(buildReplacedString("Total amount: total", "total", "X", { caseSensitive: true })).toBe(
      "Total amount: X",
    );
  });

  it("returns the source unchanged for an empty query", () => {
    expect(buildReplacedString("Total amount", "", "X")).toBe("Total amount");
  });
});

describe("createReplacementOperation", () => {
  const pageHeight = 792;

  it("creates a whiteout text overlay with a source cover rect over the original", () => {
    const operation = createReplacementOperation(items[0], "total", "balance", pageHeight);
    expect(operation).not.toBeNull();
    if (!operation) throw new Error("Expected a text operation");
    expect(operation.type).toBe("text");
    expect(operation.text).toBe("Invoice balance due");
    expect(operation.whiteout).toBe(true);
    expect(operation.bold).toBe(true);
    expect(operation.fontSize).toBe(20);
    expect(operation.pageIndex).toBe(0);
    expect(operation.sourceCoverRect).toEqual(
      padReplacementCoverRect({ x: 72, y: 700, width: 140, height: 20 }, 20),
    );
  });

  it("matches the closest embedded font for the source item", () => {
    const operation = createReplacementOperation(items[0], "total", "balance", pageHeight);
    if (!operation) throw new Error("Expected a text operation");
    // The font resolver maps Helvetica onto its bundled Arial metric-compatible choice.
    expect(operation.fontFamily).toBe("Arial");
    expect(operation.detectedFontName).toBe("Helvetica-Bold");
  });

  it("replaces all occurrences within the matched run", () => {
    const operation = createReplacementOperation(items[1], "total", "sum", pageHeight);
    if (!operation) throw new Error("Expected a text operation");
    expect(operation.text).toBe("sum amount: sum");
  });

  it("respects case sensitivity when building the replacement text", () => {
    const operation = createReplacementOperation(items[1], "total", "sum", pageHeight, {
      caseSensitive: true,
    });
    if (!operation) throw new Error("Expected a text operation");
    expect(operation.text).toBe("Total amount: sum");
  });
});
