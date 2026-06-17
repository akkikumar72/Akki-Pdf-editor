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
});
