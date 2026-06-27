import type { EditOperation } from "../types/editor";
import { moveOperationZ } from "../editor/selectionModel";
import { createId } from "../utils/ids";

export type EditHistoryEntry = {
  id: string;
  label: string;
  timestamp: number;
  operations: EditOperation[];
  selectedId?: string;
  pageIndex?: number;
  coalesceKey?: string;
};

export type EditState = {
  operations: EditOperation[];
  selectedId?: string;
  past: EditHistoryEntry[];
  future: EditHistoryEntry[];
};

export type EditAction =
  | { type: "add"; operation: EditOperation }
  | { type: "update"; id: string; patch: Partial<EditOperation> }
  | { type: "remove"; id: string }
  | { type: "select"; id?: string }
  | { type: "z"; id: string; direction: "forward" | "backward" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "restore-history"; id: string }
  | { type: "reset"; operations?: EditOperation[]; past?: EditHistoryEntry[]; future?: EditHistoryEntry[] };

export const initialEditState: EditState = {
  operations: [],
  selectedId: undefined,
  past: [],
  future: [],
};

function commit(
  state: EditState,
  operations: EditOperation[],
  selectedId = state.selectedId,
  label = "Edit",
  coalesceKey?: string,
): EditState {
  const timestamp = Date.now();
  const previous = state.past[state.past.length - 1];
  const shouldCoalesce = Boolean(
    coalesceKey && previous?.coalesceKey === coalesceKey && timestamp - previous.timestamp < 1400,
  );
  const entry: EditHistoryEntry = shouldCoalesce && previous
    ? { ...previous, label, timestamp }
    : {
        id: createId("history"),
        label,
        timestamp,
        operations: state.operations,
        selectedId: state.selectedId,
        coalesceKey,
      };

  return {
    operations,
    selectedId,
    past: shouldCoalesce ? [...state.past.slice(0, -1), entry] : [...state.past, entry].slice(-80),
    future: [],
  };
}

function historyLabelForOperation(operation?: EditOperation, fallback = "Edit") {
  if (!operation) return fallback;
  if (operation.type === "text") return "Text edit";
  if (operation.type === "whiteout") return "Whiteout";
  if (operation.type === "form-field" || operation.type === "form-mark") return "Form edit";
  return `${operation.type.replace("-", " ")} edit`;
}

function futureEntryFromCurrent(state: EditState, label = "Redo edit"): EditHistoryEntry {
  return {
    id: createId("history"),
    label,
    timestamp: Date.now(),
    operations: state.operations,
    selectedId: state.selectedId,
  };
}

export function editReducer(state: EditState, action: EditAction): EditState {
  switch (action.type) {
    case "add":
      return commit(
        state,
        [...state.operations, action.operation],
        action.operation.id,
        `${historyLabelForOperation(action.operation, "Add edit")} added`,
      );
    case "update":
      return commit(
        state,
        state.operations.map((operation) =>
          operation.id === action.id ? ({ ...operation, ...action.patch } as EditOperation) : operation,
        ),
        state.selectedId,
        historyLabelForOperation(state.operations.find((operation) => operation.id === action.id), "Update edit"),
        `update:${action.id}`,
      );
    case "remove": {
      const operations = state.operations.filter((operation) => operation.id !== action.id);
      // commit()'s `selectedId = state.selectedId` default swallows an explicit
      // `undefined`, so removing the selected op never cleared selection.
      const next = state.selectedId === action.id ? undefined : state.selectedId;
      return { ...commit(state, operations, next, "Delete edit"), selectedId: next };
    }
    case "select":
      return { ...state, selectedId: action.id };
    case "z":
      return commit(state, moveOperationZ(state.operations, action.id, action.direction), state.selectedId, "Layer order");
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        operations: previous.operations,
        selectedId: previous.selectedId,
        past: state.past.slice(0, -1),
        future: [futureEntryFromCurrent(state, previous.label), ...state.future],
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        operations: next.operations,
        selectedId: next.selectedId,
        past: [...state.past, futureEntryFromCurrent(state, next.label)],
        future: state.future.slice(1),
      };
    }
    case "restore-history": {
      const index = state.past.findIndex((entry) => entry.id === action.id);
      const entry = state.past[index];
      if (!entry) return state;
      return {
        operations: entry.operations,
        selectedId: entry.selectedId,
        past: state.past.slice(0, index),
        future: [futureEntryFromCurrent(state, `Restore before ${entry.label}`), ...state.future],
      };
    }
    case "reset":
      return {
        operations: action.operations ?? [],
        selectedId: undefined,
        past: action.past ?? [],
        future: action.future ?? [],
      };
    default: {
      const exhaustive: never = action;
      void exhaustive;
      return state;
    }
  }
}

export function getSelectedOperation(state: EditState) {
  return state.operations.find((operation) => operation.id === state.selectedId);
}
