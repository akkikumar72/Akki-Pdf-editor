import { describe, expect, it } from "vitest";
import { duplicateOperation, moveOperationZ } from "../src/editor/selectionModel";
import type { InkOperation, TextOperation } from "../src/types/editor";

const baseOperation: TextOperation = {
  id: "text_1",
  type: "text",
  pageIndex: 0,
  rect: { x: 10, y: 20, width: 120, height: 30 },
  text: "Invoice total",
  fontFamily: "Inter",
  fontSize: 14,
  color: "#111827",
  align: "left",
  createdAt: 1,
};

describe("selection model", () => {
  it("duplicates operations with a fresh id and visible offset", () => {
    const copy = duplicateOperation(baseOperation);

    expect(copy.id).not.toBe(baseOperation.id);
    expect(copy.rect).toEqual({ x: 22, y: 8, width: 120, height: 30 });
    expect(copy.createdAt).toBeGreaterThanOrEqual(baseOperation.createdAt);
  });

  it("drops the source mask when duplicating a replacement text overlay", () => {
    const replacement: TextOperation = {
      ...baseOperation,
      whiteout: true,
      whiteoutColor: "#ffffff",
      sourceCoverRect: { x: 10, y: 20, width: 120, height: 30 },
      sourceRunId: "0:1",
    };

    const copy = duplicateOperation(replacement) as TextOperation;

    expect(copy.sourceCoverRect).toBeUndefined();
    expect(copy.sourceRunId).toBeUndefined();
    expect(copy.whiteout).toBe(false);
  });

  it("translates ink points alongside the rect when duplicating", () => {
    const ink: InkOperation = {
      id: "ink_1",
      type: "ink",
      pageIndex: 0,
      rect: { x: 10, y: 20, width: 40, height: 40 },
      points: [
        { x: 10, y: 60 },
        { x: 50, y: 20 },
      ],
      stroke: "#111827",
      strokeWidth: 2,
      createdAt: 1,
    };

    const copy = duplicateOperation(ink) as InkOperation;

    expect(copy.points).toEqual([
      { x: 22, y: 48 },
      { x: 62, y: 8 },
    ]);
  });

  it("preserves ink stroke shape when duplicated near the top edge", () => {
    // rect.y (5) is within DUPLICATE_OFFSET (12) of the top, so the clamped
    // delta must apply uniformly to rect AND points — a per-point Math.max would
    // shift points by different amounts and distort the stroke.
    const ink: InkOperation = {
      id: "ink_edge",
      type: "ink",
      pageIndex: 0,
      rect: { x: 10, y: 5, width: 40, height: 45 },
      points: [
        { x: 10, y: 5 },
        { x: 50, y: 50 },
      ],
      stroke: "#111827",
      strokeWidth: 2,
      createdAt: 1,
    };

    const copy = duplicateOperation(ink) as InkOperation;

    // Clamped delta: dy = max(0, 5 - 12) - 5 = -5, dx = +12.
    expect(copy.rect.x).toBe(22);
    expect(copy.rect.y).toBe(0);
    expect(copy.points).toEqual([
      { x: 22, y: 0 },
      { x: 62, y: 45 },
    ]);
    // Shape (point-to-point delta) is unchanged.
    expect(copy.points[1].x - copy.points[0].x).toBe(ink.points[1].x - ink.points[0].x);
    expect(copy.points[1].y - copy.points[0].y).toBe(ink.points[1].y - ink.points[0].y);
  });

  it("moves operation z-order forward and backward", () => {
    const operations = [
      { ...baseOperation, id: "a" },
      { ...baseOperation, id: "b" },
      { ...baseOperation, id: "c" },
    ];

    expect(moveOperationZ(operations, "a", "forward").map((operation) => operation.id)).toEqual(["b", "a", "c"]);
    expect(moveOperationZ(operations, "c", "backward").map((operation) => operation.id)).toEqual(["a", "c", "b"]);
    expect(moveOperationZ(operations, "c", "forward")).toBe(operations);
  });
});
