import { describe, expect, it } from "vitest";
import {
  remapOperationsForCroppedPages,
  shiftOperationsForDeletedPage,
  shiftOperationsForInsertedPage,
} from "../src/editor/pageOperations";
import type { EditOperation, TextOperation } from "../src/types/editor";

function operation(id: string, pageIndex: number): TextOperation {
  return {
    id,
    type: "text",
    pageIndex,
    rect: { x: 10, y: 20, width: 100, height: 24 },
    text: id,
    fontFamily: "Inter",
    fontSize: 12,
    color: "#111827",
    align: "left",
    createdAt: 1,
  };
}

describe("page operations", () => {
  it("shifts overlays after an inserted page", () => {
    const shifted = shiftOperationsForInsertedPage([operation("a", 0), operation("b", 1), operation("c", 2)], 1);
    expect(shifted.map((item) => [item.id, item.pageIndex])).toEqual([
      ["a", 0],
      ["b", 2],
      ["c", 3],
    ]);
  });

  it("drops overlays on a deleted page and shifts following pages back", () => {
    const shifted = shiftOperationsForDeletedPage([operation("a", 0), operation("b", 1), operation("c", 2)], 1);
    expect(shifted.map((item) => [item.id, item.pageIndex])).toEqual([
      ["a", 0],
      ["c", 1],
    ]);
  });

  it("translates cropped-page rects while preserving the size of partially clipped objects", () => {
    const inside = operation("inside", 0);
    const partial = { ...operation("partial", 0), rect: { x: 80, y: 45, width: 50, height: 30 } };
    const untouched = operation("other-page", 1);
    const remapped = remapOperationsForCroppedPages(
      [inside, partial, untouched],
      [{ pageIndex: 0, rect: { x: 50, y: 40, width: 60, height: 80 } }],
    );

    expect(remapped.find((item) => item.id === "inside")?.rect).toEqual({ x: -40, y: -20, width: 100, height: 24 });
    expect(remapped.find((item) => item.id === "partial")?.rect).toEqual({ x: 30, y: 5, width: 50, height: 30 });
    expect(remapped.find((item) => item.id === "other-page")).toBe(untouched);
  });

  it("drops operations fully outside the crop but retains a text mask that still intersects", () => {
    const masked = {
      ...operation("masked", 0),
      rect: { x: 0, y: 0, width: 10, height: 10 },
      sourceCoverRect: { x: 55, y: 45, width: 15, height: 10 },
    };
    const remapped = remapOperationsForCroppedPages(
      [{ ...operation("outside", 0), rect: { x: 0, y: 0, width: 5, height: 5 } }, masked],
      [{ pageIndex: 0, rect: { x: 50, y: 40, width: 30, height: 30 } }],
    );

    expect(remapped.map((item) => item.id)).toEqual(["masked"]);
    expect((remapped[0] as TextOperation).sourceCoverRect).toEqual({ x: 5, y: 5, width: 15, height: 10 });
    expect(remapped[0].rect).toEqual({ x: -50, y: -40, width: 10, height: 10 });
  });

  it("translates ink and callout points along with their owning rects", () => {
    const operations: EditOperation[] = [
      {
        id: "ink",
        type: "ink",
        pageIndex: 0,
        rect: { x: 60, y: 50, width: 20, height: 20 },
        points: [{ x: 60, y: 50 }, { x: 80, y: 70 }],
        stroke: "#111827",
        strokeWidth: 2,
        createdAt: 1,
      },
      {
        id: "callout",
        type: "annotation",
        kind: "callout",
        pageIndex: 0,
        rect: { x: 70, y: 70, width: 40, height: 20 },
        anchor: { x: 52, y: 48 },
        elbow: { x: 64, y: 60 },
        color: "#111827",
        createdAt: 2,
      },
    ];
    const remapped = remapOperationsForCroppedPages(
      operations,
      [{ pageIndex: 0, rect: { x: 50, y: 40, width: 100, height: 100 } }],
    );

    expect(remapped[0]).toMatchObject({
      rect: { x: 10, y: 10, width: 20, height: 20 },
      points: [{ x: 10, y: 10 }, { x: 30, y: 30 }],
    });
    expect(remapped[1]).toMatchObject({
      rect: { x: 20, y: 30, width: 40, height: 20 },
      anchor: { x: 2, y: 8 },
      elbow: { x: 14, y: 20 },
    });
  });

});
