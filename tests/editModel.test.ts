import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { editReducer, getSelectedOperation, initialEditState } from "../src/state/editModel";
import type { EditState } from "../src/state/editModel";
import type {
  EditOperation,
  FormFieldOperation,
  FormMarkOperation,
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
    expect(added.selectedId).toBe("text_1");

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

  it("select with no id clears selection", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    const cleared = editReducer(added, { type: "select", id: undefined });
    expect(cleared.selectedId).toBeUndefined();
  });

  it("remove takes the selected-id branch when removing the selected operation", () => {
    // Source quirk: commit's `selectedId = state.selectedId` default parameter means
    // passing `undefined` falls back to the prior selectedId, so selection is retained.
    // We still exercise the `state.selectedId === action.id` true branch here.
    const added = editReducer(initialEditState, { type: "add", operation });
    expect(added.selectedId).toBe("text_1");
    const removed = editReducer(added, { type: "remove", id: "text_1" });
    expect(removed.operations).toHaveLength(0);
    expect(removed.selectedId).toBe("text_1");
  });

  it("remove keeps selection when removing a non-selected operation", () => {
    const second: TextOperation = { ...operation, id: "text_2" };
    let state = editReducer(initialEditState, { type: "add", operation });
    state = editReducer(state, { type: "add", operation: second });
    // selectedId is now text_2; remove text_1 keeps selection
    const removed = editReducer(state, { type: "remove", id: "text_1" });
    expect(removed.operations).toHaveLength(1);
    expect(removed.selectedId).toBe("text_2");
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
});

describe("getSelectedOperation", () => {
  it("returns the selected operation when found", () => {
    const added = editReducer(initialEditState, { type: "add", operation });
    expect(getSelectedOperation(added)?.id).toBe("text_1");
  });

  it("returns undefined when nothing matches", () => {
    expect(getSelectedOperation(initialEditState)).toBeUndefined();
  });
});
