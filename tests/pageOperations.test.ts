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

  it("translates line endpoints into cropped page coordinates", () => {
    const line: EditOperation = {
      id: "line",
      type: "shape",
      kind: "line",
      pageIndex: 0,
      rect: { x: 60, y: 50, width: 40, height: 30 },
      start: { x: 100, y: 50 },
      end: { x: 60, y: 80 },
      stroke: "#111827",
      strokeWidth: 2,
      createdAt: 1,
    };

    const [remapped] = remapOperationsForCroppedPages(
      [line],
      [{ pageIndex: 0, rect: { x: 50, y: 40, width: 100, height: 100 } }],
    );

    expect(remapped).toMatchObject({
      rect: { x: 10, y: 10, width: 40, height: 30 },
      start: { x: 50, y: 10 },
      end: { x: 10, y: 40 },
    });
  });

  it("keeps a callout whose leader remains visible when its box is outside the crop", () => {
    const callout: EditOperation = {
      id: "callout-leader",
      type: "annotation",
      kind: "callout",
      pageIndex: 0,
      rect: { x: 160, y: 80, width: 80, height: 30 },
      anchor: { x: 70, y: 95 },
      elbow: { x: 130, y: 95 },
      color: "#111827",
      createdAt: 1,
    };

    const [remapped] = remapOperationsForCroppedPages(
      [callout],
      [{ pageIndex: 0, rect: { x: 50, y: 50, width: 60, height: 90 } }],
    );

    expect(remapped).toMatchObject({
      rect: { x: 110, y: 30, width: 80, height: 30 },
      anchor: { x: 20, y: 45 },
      elbow: { x: 80, y: 45 },
    });
  });

  it("keeps a callout when its leader crosses the crop without an endpoint inside", () => {
    const callout: EditOperation = {
      id: "callout-crossing",
      type: "annotation",
      kind: "callout",
      pageIndex: 0,
      rect: { x: 170, y: 80, width: 80, height: 30 },
      anchor: { x: 10, y: 95 },
      elbow: { x: 150, y: 95 },
      color: "#111827",
      createdAt: 1,
    };

    const remapped = remapOperationsForCroppedPages(
      [callout],
      [{ pageIndex: 0, rect: { x: 60, y: 70, width: 40, height: 50 } }],
    );

    expect(remapped).toHaveLength(1);
  });

  it("drops non-callout annotations and callout leaders that stay outside the crop", () => {
    const outside: EditOperation[] = [
      {
        id: "note-outside",
        type: "annotation",
        kind: "note",
        pageIndex: 0,
        rect: { x: 170, y: 10, width: 30, height: 20 },
        color: "#111827",
        createdAt: 1,
      },
      {
        id: "parallel-leader",
        type: "annotation",
        kind: "callout",
        pageIndex: 0,
        rect: { x: 170, y: 40, width: 80, height: 20 },
        anchor: { x: 10, y: 50 },
        elbow: { x: 150, y: 50 },
        color: "#111827",
        createdAt: 2,
      },
      {
        id: "diagonal-leader",
        type: "annotation",
        kind: "callout",
        pageIndex: 0,
        rect: { x: 170, y: 10, width: 20, height: 20 },
        anchor: { x: 10, y: 10 },
        elbow: { x: 20, y: 20 },
        color: "#111827",
        createdAt: 3,
      },
    ];

    expect(remapOperationsForCroppedPages(
      outside,
      [{ pageIndex: 0, rect: { x: 60, y: 70, width: 40, height: 50 } }],
    )).toEqual([]);
  });

  it("uses default and right-side callout leaders and preserves optional leader geometry", () => {
    const operations: EditOperation[] = [
      {
        id: "default-anchor",
        type: "annotation",
        kind: "callout",
        pageIndex: 0,
        rect: { x: 160, y: 80, width: 50, height: 20 },
        elbow: { x: 120, y: 90 },
        color: "#111827",
        createdAt: 1,
      },
      {
        id: "right-anchor",
        type: "annotation",
        kind: "callout",
        pageIndex: 0,
        rect: { x: 20, y: 80, width: 50, height: 20 },
        anchor: { x: 150, y: 90 },
        color: "#111827",
        createdAt: 2,
      },
    ];

    const remapped = remapOperationsForCroppedPages(
      operations,
      [{ pageIndex: 0, rect: { x: 100, y: 80, width: 30, height: 20 } }],
    );

    expect(remapped[0]).toMatchObject({
      id: "default-anchor",
      anchor: undefined,
      elbow: { x: 20, y: 10 },
    });
    expect(remapped[1]).toMatchObject({
      id: "right-anchor",
      anchor: { x: 50, y: 10 },
      elbow: undefined,
    });
  });

  it("remaps an arrow that relies on its rectangle-derived endpoints", () => {
    const arrow: EditOperation = {
      id: "arrow-defaults",
      type: "shape",
      kind: "arrow",
      pageIndex: 0,
      rect: { x: 60, y: 50, width: 40, height: 30 },
      stroke: "#111827",
      strokeWidth: 2,
      createdAt: 1,
    };

    const [remapped] = remapOperationsForCroppedPages(
      [arrow],
      [{ pageIndex: 0, rect: { x: 50, y: 40, width: 100, height: 100 } }],
    );

    expect(remapped).toMatchObject({
      rect: { x: 10, y: 10, width: 40, height: 30 },
      start: undefined,
      end: undefined,
    });
  });

});
