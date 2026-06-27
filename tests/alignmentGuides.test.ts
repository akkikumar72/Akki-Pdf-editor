import { describe, expect, it } from "vitest";
import { collectAlignmentLines, snapViewportRect } from "../src/utils/alignmentGuides";
import type { EditOperation, TextItem } from "../src/types/editor";

function textOp(id: string, x: number, y: number, pageIndex = 0): EditOperation {
  return {
    id,
    type: "text",
    pageIndex,
    rect: { x, y, width: 80, height: 20 },
    text: id,
    fontFamily: "Arial",
    fontSize: 12,
    color: "#000",
    align: "left",
    opacity: 1,
    createdAt: 1,
  };
}

describe("alignmentGuides", () => {
  it("snaps a moving rect's left edge within tolerance", () => {
    const lines = { horizontal: [100, 200], vertical: [50, 150] };
    const result = snapViewportRect({ left: 138, top: 300, width: 40, height: 20 }, lines, 20);
    expect(result.rect.left).toBe(150);
    expect(result.rect.top).toBe(300);
    expect(
      result.guides.some((g) => g.orientation === "vertical" && g.position === 150 && g.snapped),
    ).toBe(true);
  });

  it("snaps the top edge when the top is the closest horizontal line", () => {
    const lines = { horizontal: [100], vertical: [] };
    const result = snapViewportRect({ left: 70, top: 110, width: 40, height: 40 }, lines, 20);
    // top = 110 -> snaps to 100 (delta -10); bottom = 150 is out of tolerance
    expect(result.rect.top).toBe(100);
    expect(result.guides.some((g) => g.orientation === "horizontal" && g.position === 100 && g.snapped)).toBe(true);
  });

  it("snaps the bottom edge when only the bottom is within tolerance", () => {
    const lines = { horizontal: [100], vertical: [] };
    const result = snapViewportRect({ left: 70, top: 70, width: 40, height: 40 }, lines, 20);
    // bottom = 110 -> snaps to 100, delta -10
    expect(result.rect.top).toBe(60);
    expect(result.rect.left).toBe(70);
    expect(result.guides.some((g) => g.orientation === "horizontal" && g.position === 100 && g.snapped)).toBe(true);
  });

  it("snaps the right edge when only the right is within tolerance", () => {
    const lines = { horizontal: [], vertical: [100] };
    const result = snapViewportRect({ left: 70, top: 500, width: 40, height: 20 }, lines, 20);
    // right = 110 -> snaps to 100, delta -10
    expect(result.rect.left).toBe(60);
    expect(result.rect.top).toBe(500);
    expect(result.guides.some((g) => g.orientation === "vertical" && g.position === 100 && g.snapped)).toBe(true);
  });

  it("picks the closest of several candidate lines on each axis", () => {
    // later line is closer -> replaces the running best
    const a = snapViewportRect({ left: 102, top: 500, width: 1, height: 1 }, { horizontal: [], vertical: [105, 100] }, 20);
    expect(a.rect.left).toBe(100);
    // later line is farther -> running best is kept
    const b = snapViewportRect({ left: 102, top: 500, width: 1, height: 1 }, { horizontal: [], vertical: [100, 105] }, 20);
    expect(b.rect.left).toBe(100);
  });

  it("resolves the nearest edge when both edges of an axis are within tolerance", () => {
    // top & bottom both snap (2 horizontal candidates -> comparator runs); same for left & right
    const result = snapViewportRect(
      { left: 70, top: 110, width: 30, height: 30 },
      { horizontal: [100, 140], vertical: [60, 100] },
      20,
    );
    // bottom (delta 0 to 140) beats top (delta -10 to 100); right (delta 0 to 100) beats left
    expect(result.rect.top).toBe(110); // bottom 140 snaps with delta 0 -> top unchanged
    expect(result.rect.left).toBe(70); // right 100 snaps with delta 0 -> left unchanged
  });

  it("leaves the rect untouched when nothing is within tolerance", () => {
    const lines = { horizontal: [10], vertical: [10] };
    const result = snapViewportRect({ left: 500, top: 500, width: 40, height: 20 }, lines, 20);
    expect(result.rect.left).toBe(500);
    expect(result.rect.top).toBe(500);
    expect(result.guides.every((g) => !g.snapped)).toBe(true);
  });

  it("collects lines from text items and other overlays, skipping the moving op and other pages", () => {
    const textItems: TextItem[] = [
      { str: "a", pageIndex: 0, rect: { x: 40, y: 600, width: 60, height: 16 } },
    ];
    const operations: EditOperation[] = [
      textOp("moving", 333, 500),
      textOp("other", 200, 400),
      textOp("elsewhere", 11, 11, 1), // different page -> skipped
    ];
    const lines = collectAlignmentLines({
      movingId: "moving",
      operations,
      textItems,
      pageIndex: 0,
      pageWidth: 612,
      pageHeight: 792,
      scale: 1,
    });
    expect(lines.vertical).toContain(200);
    expect(lines.vertical).toContain(280);
    expect(lines.vertical).toContain(40); // from the text item
    // page edges are always present
    expect(lines.horizontal).toContain(0);
    expect(lines.horizontal).toContain(792);
    // the moving op (left 333) and the other-page op (left 11) must not appear
    expect(lines.vertical).not.toContain(333);
    expect(lines.vertical).not.toContain(11);
  });
});
