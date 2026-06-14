import { describe, expect, it } from "vitest";
import { shiftOperationsForDeletedPage, shiftOperationsForInsertedPage } from "../src/editor/pageOperations";
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
});
