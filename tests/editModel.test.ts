import { describe, expect, it } from "vitest";
import { editReducer, initialEditState } from "../src/state/editModel";
import type { TextOperation } from "../src/types/editor";

const operation: TextOperation = {
  id: "text_1",
  type: "text",
  pageIndex: 0,
  rect: { x: 10, y: 10, width: 120, height: 30 },
  text: "Hello",
  fontFamily: "Inter",
  fontSize: 14,
  color: "#111827",
  align: "left",
  createdAt: 1,
};

describe("edit reducer", () => {
  it("adds, selects, undoes, and redoes operations", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    expect(added.operations).toHaveLength(1);
    expect(added.selectedId).toBe("text_1");

    const selected = editReducer(added, { type: "select", id: "text_1" });
    expect(selected.selectedId).toBe("text_1");

    const undone = editReducer(selected, { type: "undo" });
    expect(undone.operations).toHaveLength(0);
    expect(undone.future).toHaveLength(1);

    const redone = editReducer(undone, { type: "redo" });
    expect(redone.operations[0].id).toBe("text_1");
  });
});
