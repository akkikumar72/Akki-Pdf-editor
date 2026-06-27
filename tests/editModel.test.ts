import { describe, expect, it } from "vitest";
import { editReducer, getSelectedOperation, initialEditState, type EditAction } from "../src/state/editModel";
import type { EditOperation, TextOperation } from "../src/types/editor";

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

function shapeOp(id: string): EditOperation {
  return { id, type: "shape", kind: "rectangle", pageIndex: 0, rect: { x: 0, y: 0, width: 10, height: 10 }, stroke: "#000", strokeWidth: 1, createdAt: 1 };
}

describe("edit reducer", () => {
  it("adds, selects, undoes, and redoes operations", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    expect(added.operations).toHaveLength(1);
    expect(added.selectedId).toBe("text_1");
    expect(added.past[0].label).toBe("Text edit added");

    const selected = editReducer(added, { type: "select", id: "text_1" });
    expect(selected.selectedId).toBe("text_1");

    const undone = editReducer(selected, { type: "undo" });
    expect(undone.operations).toHaveLength(0);
    expect(undone.future).toHaveLength(1);

    const redone = editReducer(undone, { type: "redo" });
    expect(redone.operations[0].id).toBe("text_1");
  });

  it("restores a timestamped history checkpoint", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    const updated = editReducer(added, { type: "update", id: "text_1", patch: { text: "Hello there" } });
    const checkpoint = updated.past[0];

    expect(updated.operations[0]).toMatchObject({ type: "text", text: "Hello there" });
    expect(checkpoint.timestamp).toBeGreaterThan(0);

    const restored = editReducer(updated, { type: "restore-history", id: checkpoint.id });
    expect(restored.operations).toHaveLength(0);
    expect(restored.future).toHaveLength(1);
  });

  it("coalesces rapid successive updates to the same operation into one history entry", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    const first = editReducer(added, { type: "update", id: "text_1", patch: { text: "a" } });
    const second = editReducer(first, { type: "update", id: "text_1", patch: { text: "ab" } });
    // Both updates share the coalesce key and fire within the window -> one entry.
    expect(second.past).toHaveLength(first.past.length);
    expect(second.operations[0]).toMatchObject({ text: "ab" });
  });

  it("clears the selection when the selected operation is removed (and keeps it otherwise)", () => {
    const withTwo = editReducer(
      editReducer(initialEditState, { type: "add", operation }),
      { type: "add", operation: shapeOp("shape_1") },
    );
    // shape_1 is selected (last added)
    expect(withTwo.selectedId).toBe("shape_1");

    const removedSelected = editReducer(withTwo, { type: "remove", id: "shape_1" });
    expect(removedSelected.selectedId).toBeUndefined();
    expect(removedSelected.operations.map((o) => o.id)).toEqual(["text_1"]);

    const removedOther = editReducer(withTwo, { type: "remove", id: "text_1" });
    expect(removedOther.selectedId).toBe("shape_1");
  });

  it("reorders operations with the z action", () => {
    let state = editReducer(initialEditState, { type: "add", operation });
    state = editReducer(state, { type: "add", operation: shapeOp("shape_1") });
    const reordered = editReducer(state, { type: "z", id: "text_1", direction: "forward" });
    expect(reordered.operations.map((o) => o.id)).toEqual(["shape_1", "text_1"]);
  });

  it("is a no-op for undo/redo with empty stacks and for an unknown history id", () => {
    expect(editReducer(initialEditState, { type: "undo" })).toBe(initialEditState);
    expect(editReducer(initialEditState, { type: "redo" })).toBe(initialEditState);
    const added = editReducer(initialEditState, { type: "add", operation });
    expect(editReducer(added, { type: "restore-history", id: "nope" })).toBe(added);
  });

  it("resets to provided state or to empty defaults", () => {
    const seeded = editReducer(initialEditState, {
      type: "reset",
      operations: [operation],
      past: [{ id: "h", label: "x", timestamp: 1, operations: [] }],
      future: [{ id: "h2", label: "y", timestamp: 2, operations: [] }],
    });
    expect(seeded.operations).toHaveLength(1);
    expect(seeded.past).toHaveLength(1);
    expect(seeded.future).toHaveLength(1);

    const cleared = editReducer(seeded, { type: "reset" });
    expect(cleared).toEqual({ operations: [], selectedId: undefined, past: [], future: [] });
  });

  it("labels history entries from the operation type", () => {
    const whiteout = editReducer(initialEditState, {
      type: "add",
      operation: { id: "w", type: "whiteout", pageIndex: 0, rect: { x: 0, y: 0, width: 1, height: 1 }, color: "#fff", createdAt: 1 },
    });
    expect(whiteout.past[0].label).toBe("Whiteout added");

    const form = editReducer(initialEditState, {
      type: "add",
      operation: { id: "f", type: "form-mark", mark: "check", pageIndex: 0, rect: { x: 0, y: 0, width: 1, height: 1 }, color: "#000", createdAt: 1 },
    });
    expect(form.past[0].label).toBe("Form edit added");

    const field = editReducer(initialEditState, {
      type: "add",
      operation: { id: "ff", type: "form-field", kind: "text", pageIndex: 0, rect: { x: 0, y: 0, width: 1, height: 1 }, name: "n", createdAt: 1 },
    });
    expect(field.past[0].label).toBe("Form edit added");

    const shape = editReducer(initialEditState, { type: "add", operation: shapeOp("s") });
    expect(shape.past[0].label).toBe("shape edit added");
  });

  it("falls back to a generic label when updating an operation that no longer exists", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    const updated = editReducer(added, { type: "update", id: "ghost", patch: { color: "#fff" } });
    expect(updated.past.at(-1)?.label).toBe("Update edit");
  });

  it("ignores unknown actions", () => {
    expect(editReducer(initialEditState, { type: "bogus" } as unknown as EditAction)).toBe(initialEditState);
  });
});

describe("getSelectedOperation", () => {
  it("returns the selected operation or undefined", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    expect(getSelectedOperation(added)?.id).toBe("text_1");
    expect(getSelectedOperation({ ...added, selectedId: undefined })).toBeUndefined();
  });
});
