import { describe, expect, it } from "vitest";
import { duplicateOperation, moveOperationZ } from "../src/editor/selectionModel";
import type { TextOperation } from "../src/types/editor";

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
