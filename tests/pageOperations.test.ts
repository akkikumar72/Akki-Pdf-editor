import { describe, expect, it } from "vitest";
import {
  shiftOperationsForDeletedPage,
  shiftOperationsForDuplicatedPage,
  shiftOperationsForInsertedPage,
  shiftOperationsForMovedPage,
} from "../src/editor/pageOperations";
import type { TextOperation } from "../src/types/editor";

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

  it("shifts overlays after a duplicated page (duplicate slot starts empty)", () => {
    const shifted = shiftOperationsForDuplicatedPage([operation("a", 0), operation("b", 1), operation("c", 2)], 0);
    // Source page 0 keeps its overlays; everything at/after the new slot (index 1) moves forward.
    expect(shifted.map((item) => [item.id, item.pageIndex])).toEqual([
      ["a", 0],
      ["b", 2],
      ["c", 3],
    ]);
  });

  it("remaps overlays when a page moves forward (down)", () => {
    const shifted = shiftOperationsForMovedPage(
      [operation("a", 0), operation("b", 1), operation("c", 2)],
      0,
      2,
    );
    // page 0 -> 2; pages 1,2 slide back to 0,1.
    const byId = Object.fromEntries(shifted.map((item) => [item.id, item.pageIndex]));
    expect(byId).toEqual({ a: 2, b: 0, c: 1 });
  });

  it("remaps overlays when a page moves backward (up)", () => {
    const shifted = shiftOperationsForMovedPage(
      [operation("a", 0), operation("b", 1), operation("c", 2)],
      2,
      0,
    );
    // page 2 -> 0; pages 0,1 slide forward to 1,2.
    const byId = Object.fromEntries(shifted.map((item) => [item.id, item.pageIndex]));
    expect(byId).toEqual({ a: 1, b: 2, c: 0 });
  });

  it("is a no-op when moving a page to its own position", () => {
    const ops = [operation("a", 0), operation("b", 1)];
    expect(shiftOperationsForMovedPage(ops, 1, 1)).toBe(ops);
  });
});
