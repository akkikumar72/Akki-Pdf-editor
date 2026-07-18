import { describe, expect, it } from "vitest";
import { findNearbyTextRunForStyle, groupEditableTextRuns } from "../src/utils/textRunGrouping";
import type { TextItem } from "../src/types/editor";

function item(overrides: Partial<TextItem> = {}): TextItem {
  return {
    str: "word",
    pageIndex: 0,
    rect: { x: 10, y: 700, width: 40, height: 12 },
    fontSize: 12,
    ...overrides,
  };
}

describe("groupEditableTextRuns", () => {
  it("merges adjacent same-line fragments into one run with a joined string and union rect", () => {
    const runs = groupEditableTextRuns([
      item({ str: "Invoice", rect: { x: 10, y: 700, width: 50, height: 12 } }),
      item({ str: "total", rect: { x: 64, y: 700, width: 34, height: 12 } }),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].str).toBe("Invoice total");
    expect(runs[0].rect).toEqual({ x: 10, y: 700, width: 88, height: 12 });
  });

  it("joins word fragments split mid-word without inserting a space", () => {
    // Negative/zero gap between "Tech" and "nical" (same word split by the PDF).
    const runs = groupEditableTextRuns([
      item({ str: "Tech", rect: { x: 10, y: 700, width: 30, height: 12 } }),
      item({ str: "nical", rect: { x: 39, y: 700, width: 30, height: 12 } }),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].str).toBe("Technical");
  });

  it("splits runs across different lines", () => {
    const runs = groupEditableTextRuns([
      item({ str: "line one", rect: { x: 10, y: 700, width: 60, height: 12 } }),
      item({ str: "line two", rect: { x: 10, y: 660, width: 60, height: 12 } }),
    ]);
    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.str)).toEqual(["line one", "line two"]);
  });

  it("splits runs when the font scale differs sharply (heading vs body)", () => {
    const runs = groupEditableTextRuns([
      item({ str: "Heading", fontSize: 24, rect: { x: 10, y: 700, width: 90, height: 24 } }),
      item({ str: "body", fontSize: 10, rect: { x: 104, y: 706, width: 30, height: 10 } }),
    ]);
    expect(runs).toHaveLength(2);
  });

  it("splits runs across a wide horizontal gap (table columns)", () => {
    const runs = groupEditableTextRuns([
      item({ str: "Name", rect: { x: 10, y: 700, width: 40, height: 12 } }),
      item({ str: "Amount", rect: { x: 300, y: 700, width: 50, height: 12 } }),
    ]);
    expect(runs).toHaveLength(2);
  });

  it("styles the merged run from the most specific fragment (weight beats family and size)", () => {
    const runs = groupEditableTextRuns([
      item({ str: "Total:", fontWeight: 700, fontName: "Inter-Bold", cssFontFamily: "Inter", rect: { x: 10, y: 700, width: 40, height: 12 } }),
      item({ str: "$42", fontWeight: 400, cssFontFamily: "sans-serif", rect: { x: 54, y: 700, width: 26, height: 12 } }),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].fontWeight).toBe(700);
    expect(runs[0].cssFontFamily).toBe("Inter");
  });

  it("prefers a named (non-internal) font over a generic family at equal weight", () => {
    const runs = groupEditableTextRuns([
      item({ str: "a", cssFontFamily: "sans-serif", fontName: "g_d0_f4", rect: { x: 10, y: 700, width: 10, height: 12 } }),
      item({ str: "b", cssFontFamily: "sans-serif", fontName: "UberMove-Regular", rect: { x: 22, y: 700, width: 10, height: 12 } }),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].fontName).toBe("UberMove-Regular");
  });

  it("returns no runs for no items", () => {
    expect(groupEditableTextRuns([])).toEqual([]);
  });
});

describe("findNearbyTextRunForStyle", () => {
  // pageHeight 792, scale 1: viewport top = 792 - y - height.
  const runs = [
    item({ str: "near", rect: { x: 100, y: 700, width: 60, height: 12 } }), // viewport top 80
    item({ str: "far", rect: { x: 100, y: 300, width: 60, height: 12 } }), // viewport top 480
  ];

  it("picks the run on the same line as the point", () => {
    const found = findNearbyTextRunForStyle({ left: 130, top: 82, width: 1, height: 12 }, runs, 792, 1);
    expect(found?.str).toBe("near");
  });

  it("returns undefined when every run is vertically out of tolerance", () => {
    const found = findNearbyTextRunForStyle({ left: 130, top: 250, width: 1, height: 12 }, runs, 792, 1);
    expect(found).toBeUndefined();
  });

  it("skips runs that are too far horizontally even on the same line", () => {
    const found = findNearbyTextRunForStyle({ left: 500, top: 82, width: 1, height: 12 }, runs, 792, 1);
    expect(found).toBeUndefined();
  });
});
