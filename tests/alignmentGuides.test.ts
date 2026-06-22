import { describe, expect, it } from "vitest";
import { collectAlignmentLines, snapViewportRect } from "../src/utils/alignmentGuides";
import type { EditOperation } from "../src/types/editor";

describe("alignmentGuides", () => {
  it("snaps a moving rect within tolerance", () => {
    const lines = {
      horizontal: [100, 200],
      vertical: [50, 150],
    };
    const result = snapViewportRect({ left: 138, top: 300, width: 40, height: 20 }, lines, 20);
    expect(result.rect.left).toBe(150);
    expect(result.rect.top).toBe(300);
    expect(result.guides.some((guide) => guide.orientation === "vertical" && guide.position === 150 && guide.snapped)).toBe(true);
  });

  it("snaps the top edge when it is the closer horizontal candidate", () => {
    const lines = { horizontal: [105, 400], vertical: [] };
    const result = snapViewportRect({ left: 10, top: 100, width: 40, height: 20 }, lines, 20);
    // top edge (100) is 5px from line 105; bottom edge (120) is 280px away.
    expect(result.rect.top).toBe(105);
    expect(result.guides.some((g) => g.orientation === "horizontal" && g.position === 105 && g.snapped)).toBe(true);
  });

  it("snaps the bottom edge when only the bottom is within tolerance", () => {
    const lines = { horizontal: [125, 400], vertical: [] };
    // top edge (100) is 25px from 125 (> tolerance); bottom (120) is 5px from 125.
    const result = snapViewportRect({ left: 10, top: 100, width: 40, height: 20 }, lines, 20);
    expect(result.rect.top).toBe(105); // bottom 120 -> 125 means top shifts by +5
    expect(result.guides.some((g) => g.orientation === "horizontal" && g.position === 125 && g.snapped)).toBe(true);
  });

  it("snaps the right edge when only the right is within tolerance", () => {
    const lines = { horizontal: [], vertical: [155, 400] };
    // left edge (100) is 55px away; right edge (140) is 15px from 155.
    const result = snapViewportRect({ left: 100, top: 10, width: 40, height: 20 }, lines, 20);
    expect(result.rect.left).toBe(115); // right 140 -> 155 means left shifts by +15
    expect(result.guides.some((g) => g.orientation === "vertical" && g.position === 155 && g.snapped)).toBe(true);
  });

  it("leaves the rect unchanged when nothing is within tolerance", () => {
    const lines = { horizontal: [1000], vertical: [1000] };
    const result = snapViewportRect({ left: 10, top: 10, width: 40, height: 20 }, lines, 20);
    expect(result.rect.top).toBe(10);
    expect(result.rect.left).toBe(10);
    expect(result.guides.every((g) => !g.snapped)).toBe(true);
  });

  it("uses the default snap tolerance when none is provided", () => {
    const lines = { horizontal: [105], vertical: [] };
    const result = snapViewportRect({ left: 10, top: 100, width: 40, height: 20 }, lines);
    expect(result.rect.top).toBe(105);
  });

  it("keeps the closest line when several are within tolerance (comparator + best retention)", () => {
    // For the top edge (100): lines 118 (delta 18) then 102 (delta 2) — second is closer,
    // so best is replaced; then 110 (delta 10) is farther, so best is retained (line 65 else).
    // Both top (100->102) and bottom (120) candidates land within tolerance, exercising the
    // vertical-candidate sort comparator. Same setup mirrored for left/right edges.
    const lines = {
      horizontal: [118, 102, 110, 130, 138],
      vertical: [218, 202, 210, 230, 238],
    };
    const result = snapViewportRect({ left: 200, top: 100, width: 20, height: 20 }, lines, 20);
    // top edge snaps to 102 (closest to 100); bottom edge nearest within tol is 130 (delta 10),
    // so top wins (delta 2 < 10).
    expect(result.rect.top).toBe(102);
    expect(result.rect.left).toBe(202);
  });

  it("collects lines from other overlays on the same page", () => {
    const operations: EditOperation[] = [
      {
        id: "moving",
        type: "text",
        pageIndex: 0,
        rect: { x: 100, y: 500, width: 120, height: 24 },
        text: "Move me",
        fontFamily: "Arial",
        fontSize: 12,
        color: "#000",
        align: "left",
        opacity: 1,
        createdAt: 1,
      },
      {
        id: "other",
        type: "text",
        pageIndex: 0,
        rect: { x: 200, y: 400, width: 80, height: 20 },
        text: "Other",
        fontFamily: "Arial",
        fontSize: 12,
        color: "#000",
        align: "left",
        opacity: 1,
        createdAt: 2,
      },
    ];
    const lines = collectAlignmentLines({
      movingId: "moving",
      operations,
      textItems: [],
      pageIndex: 0,
      pageWidth: 612,
      pageHeight: 792,
      scale: 1,
    });
    expect(lines.vertical).toContain(200);
    expect(lines.vertical).toContain(280);
  });

  it("includes text-item edges and skips operations on other pages", () => {
    const operations: EditOperation[] = [
      {
        id: "other-page",
        type: "text",
        pageIndex: 1,
        rect: { x: 10, y: 10, width: 50, height: 10 },
        text: "Elsewhere",
        fontFamily: "Arial",
        fontSize: 12,
        color: "#000",
        align: "left",
        opacity: 1,
        createdAt: 1,
      },
    ];
    const lines = collectAlignmentLines({
      movingId: "moving",
      operations,
      textItems: [
        {
          id: "t1",
          pageIndex: 0,
          rect: { x: 50, y: 700, width: 90, height: 12 },
          text: "Title",
          fontName: "Arial",
          fontSize: 12,
          color: "#000",
          dir: "ltr",
        } as unknown as import("../src/types/editor").TextItem,
      ],
      pageIndex: 0,
      pageWidth: 612,
      pageHeight: 792,
      scale: 1,
    });
    // text item left edge present
    expect(lines.vertical).toContain(50);
    // the off-page operation's edges (10) must not have leaked in beyond defaults
    expect(lines.vertical).not.toContain(10);
  });
});
