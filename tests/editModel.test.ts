import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editReducer, getSelectedOperation, getSelectedOperations, initialEditState } from "../src/state/editModel";
import type { EditState } from "../src/state/editModel";
import type {
  EditOperation,
  FormFieldOperation,
  FormMarkOperation,
  InkOperation,
  ShapeOperation,
  TextOperation,
  WhiteoutOperation,
} from "../src/types/editor";

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

const whiteout: WhiteoutOperation = {
  id: "white_1",
  type: "whiteout",
  pageIndex: 0,
  rect: { x: 0, y: 0, width: 10, height: 10 },
  color: "#ffffff",
  createdAt: 1,
};

const formField: FormFieldOperation = {
  id: "field_1",
  type: "form-field",
  pageIndex: 0,
  rect: { x: 0, y: 0, width: 10, height: 10 },
  kind: "text",
  name: "field",
  createdAt: 1,
};

const formMark: FormMarkOperation = {
  id: "mark_1",
  type: "form-mark",
  pageIndex: 0,
  rect: { x: 0, y: 0, width: 10, height: 10 },
  mark: "check",
  color: "#000000",
  createdAt: 1,
};

const shape: ShapeOperation = {
  id: "shape_1",
  type: "shape",
  pageIndex: 0,
  rect: { x: 0, y: 0, width: 10, height: 10 },
  kind: "rectangle",
  stroke: "#000000",
  strokeWidth: 1,
  createdAt: 1,
};

describe("edit reducer", () => {
  it("adds, selects, undoes, and redoes operations", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    expect(added.operations).toHaveLength(1);
    expect(added.selectedIds).toEqual(["text_1"]);

    const selected = editReducer(added, { type: "select", ids: ["text_1"] });
    expect(selected.selectedIds).toEqual(["text_1"]);

    const undone = editReducer(selected, { type: "undo" });
    expect(undone.operations).toHaveLength(0);
    expect(undone.future).toHaveLength(1);

    const redone = editReducer(undone, { type: "redo" });
    expect(redone.operations[0].id).toBe("text_1");
    expect(redone.selectedIds).toEqual(["text_1"]);
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
    expect(restored.selectedIds).toEqual([]);
  });

  it("select with empty ids clears the selection", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    const cleared = editReducer(added, { type: "select", ids: [] });
    expect(cleared.selectedIds).toEqual([]);
  });

  it("non-additive select replaces the whole selection", () => {
    const second: TextOperation = { ...operation, id: "text_2" };
    let state = editReducer(initialEditState, { type: "add", operation });
    state = editReducer(state, { type: "add", operation: second });
    const selected = editReducer(state, { type: "select", ids: ["text_1"] });
    expect(selected.selectedIds).toEqual(["text_1"]);
  });

  it("additive select toggles ids in and out of the selection", () => {
    const second: TextOperation = { ...operation, id: "text_2" };
    let state = editReducer(initialEditState, { type: "add", operation });
    state = editReducer(state, { type: "add", operation: second });
    // add sets selection to ["text_2"]; toggle text_1 in
    const both = editReducer(state, { type: "select", ids: ["text_1"], additive: true });
    expect(both.selectedIds).toEqual(["text_2", "text_1"]);
    // toggle text_2 out
    const one = editReducer(both, { type: "select", ids: ["text_2"], additive: true });
    expect(one.selectedIds).toEqual(["text_1"]);
  });

  it("remove drops the removed id from the selection", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    expect(added.selectedIds).toEqual(["text_1"]);
    const removed = editReducer(added, { type: "remove", id: "text_1" });
    expect(removed.operations).toHaveLength(0);
    expect(removed.selectedIds).toEqual([]);
  });

  it("remove keeps selection when removing a non-selected operation", () => {
    const second: TextOperation = { ...operation, id: "text_2" };
    let state = editReducer(initialEditState, { type: "add", operation });
    state = editReducer(state, { type: "add", operation: second });
    // selectedIds is now ["text_2"]; remove text_1 keeps selection
    const removed = editReducer(state, { type: "remove", id: "text_1" });
    expect(removed.operations).toHaveLength(1);
    expect(removed.selectedIds).toEqual(["text_2"]);
  });

  it("remove-many deletes all listed operations as one undo entry", () => {
    const second: TextOperation = { ...operation, id: "text_2" };
    const third: TextOperation = { ...operation, id: "text_3" };
    let state = editReducer(initialEditState, { type: "add", operation });
    state = editReducer(state, { type: "add", operation: second });
    state = editReducer(state, { type: "add", operation: third });
    state = editReducer(state, { type: "select", ids: ["text_1", "text_2"] });
    const pastBefore = state.past.length;

    const removed = editReducer(state, { type: "remove-many", ids: ["text_1", "text_2"] });
    expect(removed.operations.map((op) => op.id)).toEqual(["text_3"]);
    expect(removed.selectedIds).toEqual([]);
    expect(removed.past).toHaveLength(pastBefore + 1);
    expect(removed.past[removed.past.length - 1].label).toBe("Deleted 2 objects");

    const undone = editReducer(removed, { type: "undo" });
    expect(undone.operations).toHaveLength(3);
  });

  it("remove-many with one id uses the single-delete label", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    const removed = editReducer(added, { type: "remove-many", ids: ["text_1"] });
    expect(removed.past[removed.past.length - 1].label).toBe("Delete edit");
  });

  it("remove-many with no ids is a no-op", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    expect(editReducer(added, { type: "remove-many", ids: [] })).toBe(added);
  });

  it("translate moves every listed operation by the same delta", () => {
    const second: TextOperation = { ...operation, id: "text_2", rect: { x: 100, y: 200, width: 50, height: 20 } };
    let state = editReducer(initialEditState, { type: "add", operation });
    state = editReducer(state, { type: "add", operation: second });

    const moved = editReducer(state, { type: "translate", ids: ["text_1", "text_2"], dx: 5, dy: -7 });
    expect(moved.operations[0].rect).toMatchObject({ x: 15, y: 3 });
    expect(moved.operations[1].rect).toMatchObject({ x: 105, y: 193 });
    expect(moved.past[moved.past.length - 1].label).toBe("Moved 2 objects");

    const undone = editReducer(moved, { type: "undo" });
    expect(undone.operations[0].rect).toMatchObject({ x: 10, y: 10 });
    expect(undone.operations[1].rect).toMatchObject({ x: 100, y: 200 });
  });

  it("translate leaves non-member operations untouched and uses the single-move label", () => {
    const second: TextOperation = { ...operation, id: "text_2", rect: { x: 100, y: 200, width: 50, height: 20 } };
    let state = editReducer(initialEditState, { type: "add", operation });
    state = editReducer(state, { type: "add", operation: second });

    const moved = editReducer(state, { type: "translate", ids: ["text_1"], dx: 1, dy: 1 });
    expect(moved.operations[0].rect).toMatchObject({ x: 11, y: 11 });
    expect(moved.operations[1].rect).toMatchObject({ x: 100, y: 200 });
    expect(moved.past[moved.past.length - 1].label).toBe("Move edit");
  });

  it("translate shifts ink points together with the rect", () => {
    const ink: InkOperation = {
      id: "ink_1",
      type: "ink",
      pageIndex: 0,
      rect: { x: 10, y: 10, width: 40, height: 20 },
      points: [{ x: 10, y: 10 }, { x: 50, y: 30 }],
      stroke: "#000000",
      strokeWidth: 2,
      createdAt: 1,
    };
    const state = editReducer(initialEditState, { type: "add", operation: ink });
    const moved = editReducer(state, { type: "translate", ids: ["ink_1"], dx: 3, dy: 4 });
    const movedInk = moved.operations[0] as InkOperation;
    expect(movedInk.rect).toMatchObject({ x: 13, y: 14 });
    expect(movedInk.points).toEqual([{ x: 13, y: 14 }, { x: 53, y: 34 }]);
  });

  it("translate with no ids is a no-op", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    expect(editReducer(added, { type: "translate", ids: [], dx: 5, dy: 5 })).toBe(added);
  });

  it("moves operation forward and backward via z action", () => {
    const second: TextOperation = { ...operation, id: "text_2" };
    let state = editReducer(initialEditState, { type: "add", operation });
    state = editReducer(state, { type: "add", operation: second });

    const forward = editReducer(state, { type: "z", id: "text_1", direction: "forward" });
    expect(forward.operations.map((op) => op.id)).toEqual(["text_2", "text_1"]);

    const backward = editReducer(forward, { type: "z", id: "text_1", direction: "backward" });
    expect(backward.operations.map((op) => op.id)).toEqual(["text_1", "text_2"]);
  });

  it("undo with no past returns the same state", () => {
    expect(editReducer(initialEditState, { type: "undo" })).toBe(initialEditState);
  });

  it("redo with no future returns the same state", () => {
    expect(editReducer(initialEditState, { type: "redo" })).toBe(initialEditState);
  });

  it("undo/redo/restore fall back to an empty selection for legacy history entries", () => {
    // Sessions saved before multi-select carry entries without selectedIds.
    const legacyPast = [
      { id: "h1", label: "L", timestamp: 1, operations: [operation] },
    ];
    const state = editReducer(initialEditState, { type: "reset", past: legacyPast });

    const undone = editReducer(state, { type: "undo" });
    expect(undone.selectedIds).toEqual([]);

    const legacyFuture = [
      { id: "h2", label: "L2", timestamp: 2, operations: [operation] },
    ];
    const withFuture = editReducer(initialEditState, { type: "reset", future: legacyFuture });
    const redone = editReducer(withFuture, { type: "redo" });
    expect(redone.selectedIds).toEqual([]);

    const restored = editReducer(state, { type: "restore-history", id: "h1" });
    expect(restored.selectedIds).toEqual([]);
  });

  it("restore-history with unknown id returns the same state", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    expect(editReducer(added, { type: "restore-history", id: "nope" })).toBe(added);
  });

  it("reset with no payload yields empty state", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    const reset = editReducer(added, { type: "reset" });
    expect(reset).toEqual(initialEditState);
  });

  it("reset with provided operations/past/future", () => {
    const past = [
      { id: "h1", label: "L", timestamp: 1, operations: [] as EditOperation[] },
    ];
    const future = [
      { id: "h2", label: "L2", timestamp: 2, operations: [] as EditOperation[] },
    ];
    const reset = editReducer(initialEditState, {
      type: "reset",
      operations: [operation],
      past,
      future,
    });
    expect(reset.operations).toEqual([operation]);
    expect(reset.past).toBe(past);
    expect(reset.future).toBe(future);
  });

  it("falls through to default for unknown action type", () => {
    const unknown = { type: "bogus" } as unknown as Parameters<typeof editReducer>[1];
    expect(editReducer(initialEditState, unknown)).toBe(initialEditState);
  });

  it("history labels reflect operation type", () => {
    const textAdd = editReducer(initialEditState, { type: "add", operation });
    expect(textAdd.past[0].label).toBe("Text edit added");

    const whiteAdd = editReducer(initialEditState, { type: "add", operation: whiteout });
    expect(whiteAdd.past[0].label).toBe("Whiteout added");

    const fieldAdd = editReducer(initialEditState, { type: "add", operation: formField });
    expect(fieldAdd.past[0].label).toBe("Form edit added");

    const markAdd = editReducer(initialEditState, { type: "add", operation: formMark });
    expect(markAdd.past[0].label).toBe("Form edit added");

    const shapeAdd = editReducer(initialEditState, { type: "add", operation: shape });
    expect(shapeAdd.past[0].label).toBe("shape edit added");
  });

  it("update of a missing operation uses the fallback label", () => {
    // No operations present, so historyLabelForOperation receives undefined -> fallback
    const updated = editReducer(initialEditState, { type: "update", id: "missing", patch: {} });
    expect(updated.past[0].label).toBe("Update edit");
  });

  it("add-many appends all operations as a single undo entry and selects the last", () => {
    const second: TextOperation = { ...operation, id: "text_2" };
    const added = editReducer(initialEditState, { type: "add-many", operations: [operation, second] });
    expect(added.operations.map((op) => op.id)).toEqual(["text_1", "text_2"]);
    expect(added.selectedIds).toEqual(["text_2"]);
    expect(added.past).toHaveLength(1);
    expect(added.past[0].label).toBe("2 edits added");

    const undone = editReducer(added, { type: "undo" });
    expect(undone.operations).toHaveLength(0);
  });

  it("add-many with a single operation reuses the per-type label", () => {
    const added = editReducer(initialEditState, { type: "add-many", operations: [operation] });
    expect(added.past[0].label).toBe("Text edit added");
    expect(added.selectedIds).toEqual(["text_1"]);
  });

  it("add-many with no operations is a no-op", () => {
    expect(editReducer(initialEditState, { type: "add-many", operations: [] })).toBe(initialEditState);
  });

  it("caps history at 80 entries", () => {
    let state: EditState = initialEditState;
    for (let i = 0; i < 100; i += 1) {
      state = editReducer(state, { type: "add", operation: { ...operation, id: `text_${i}` } });
    }
    expect(state.past).toHaveLength(80);
  });
});

describe("edit reducer coalescing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces two updates with the same key inside the window", () => {
    vi.setSystemTime(1_000_000);
    const added = editReducer(initialEditState, { type: "add", operation });
    expect(added.past).toHaveLength(1);

    vi.setSystemTime(1_000_100);
    const first = editReducer(added, { type: "update", id: "text_1", patch: { text: "A" } });
    expect(first.past).toHaveLength(2);

    vi.setSystemTime(1_000_500); // within 1400ms of the first update entry
    const second = editReducer(first, { type: "update", id: "text_1", patch: { text: "AB" } });
    // coalesced: past length unchanged
    expect(second.past).toHaveLength(2);
    expect(second.operations[0]).toMatchObject({ text: "AB" });
  });

  it("does not coalesce updates outside the time window", () => {
    vi.setSystemTime(2_000_000);
    const added = editReducer(initialEditState, { type: "add", operation });

    vi.setSystemTime(2_000_100);
    const first = editReducer(added, { type: "update", id: "text_1", patch: { text: "A" } });
    expect(first.past).toHaveLength(2);

    vi.setSystemTime(2_002_000); // > 1400ms later
    const second = editReducer(first, { type: "update", id: "text_1", patch: { text: "AB" } });
    expect(second.past).toHaveLength(3);
  });

  it("does not coalesce updates with a different key", () => {
    const second: TextOperation = { ...operation, id: "text_2" };
    vi.setSystemTime(3_000_000);
    let state = editReducer(initialEditState, { type: "add", operation });
    state = editReducer(state, { type: "add", operation: second });

    vi.setSystemTime(3_000_100);
    const first = editReducer(state, { type: "update", id: "text_1", patch: { text: "A" } });
    const firstLen = first.past.length;

    vi.setSystemTime(3_000_200);
    const next = editReducer(first, { type: "update", id: "text_2", patch: { text: "B" } });
    expect(next.past.length).toBe(firstLen + 1);
  });

  it("coalesces consecutive translates of the same id set (order-insensitive key)", () => {
    const second: TextOperation = { ...operation, id: "text_2" };
    vi.setSystemTime(4_000_000);
    let state = editReducer(initialEditState, { type: "add", operation });
    state = editReducer(state, { type: "add", operation: second });
    const pastBefore = state.past.length;

    vi.setSystemTime(4_000_100);
    const first = editReducer(state, { type: "translate", ids: ["text_1", "text_2"], dx: 1, dy: 0 });
    expect(first.past).toHaveLength(pastBefore + 1);

    vi.setSystemTime(4_000_400);
    // Same members in a different order coalesce (the key sorts ids).
    const secondMove = editReducer(first, { type: "translate", ids: ["text_2", "text_1"], dx: 1, dy: 0 });
    expect(secondMove.past).toHaveLength(pastBefore + 1);
    expect(secondMove.operations[0].rect).toMatchObject({ x: 12 });

    // Undo collapses both moves in one step.
    const undone = editReducer(secondMove, { type: "undo" });
    expect(undone.operations[0].rect).toMatchObject({ x: 10 });
  });

  it("does not coalesce translates of different id sets", () => {
    const second: TextOperation = { ...operation, id: "text_2" };
    vi.setSystemTime(5_000_000);
    let state = editReducer(initialEditState, { type: "add", operation });
    state = editReducer(state, { type: "add", operation: second });
    const pastBefore = state.past.length;

    vi.setSystemTime(5_000_100);
    const first = editReducer(state, { type: "translate", ids: ["text_1"], dx: 1, dy: 0 });
    vi.setSystemTime(5_000_200);
    const next = editReducer(first, { type: "translate", ids: ["text_2"], dx: 1, dy: 0 });
    expect(next.past).toHaveLength(pastBefore + 2);
  });
});

describe("getSelectedOperation(s)", () => {
  it("returns the first selected operation when found", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    expect(getSelectedOperation(added)?.id).toBe("text_1");
  });

  it("returns undefined when nothing matches", () => {
    expect(getSelectedOperation(initialEditState)).toBeUndefined();
  });

  it("returns every selected operation in operations order", () => {
    const second: TextOperation = { ...operation, id: "text_2" };
    let state = editReducer(initialEditState, { type: "add", operation });
    state = editReducer(state, { type: "add", operation: second });
    state = editReducer(state, { type: "select", ids: ["text_2", "text_1"] });
    expect(getSelectedOperations(state).map((op) => op.id)).toEqual(["text_1", "text_2"]);
  });

  it("returns an empty list when nothing is selected", () => {
    expect(getSelectedOperations(initialEditState)).toEqual([]);
  });
});
