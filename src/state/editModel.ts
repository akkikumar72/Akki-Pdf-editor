import type { EditOperation, EditOperationPatch } from "../types/editor";
import { moveOperationZ, translateOperation } from "../editor/selectionModel";
import { createId } from "../utils/ids";

export type EditHistoryEntry = {
  id: string;
  label: string;
  timestamp: number;
  operations: EditOperation[];
  selectedIds?: string[];
  pageIndex?: number;
  coalesceKey?: string;
};

export type EditState = {
  operations: EditOperation[];
  selectedIds: string[];
  past: EditHistoryEntry[];
  future: EditHistoryEntry[];
};

export type EditAction =
  | { type: "add"; operation: EditOperation }
  | { type: "add-many"; operations: EditOperation[] }
  | { type: "update"; id: string; patch: EditOperationPatch }
  | { type: "translate"; ids: string[]; dx: number; dy: number }
  | { type: "remove"; id: string }
  | { type: "remove-many"; ids: string[] }
  | { type: "select"; ids: string[]; additive?: boolean }
  | { type: "z"; id: string; direction: "forward" | "backward" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "restore-history"; id: string }
  | { type: "reset"; operations?: EditOperation[]; past?: EditHistoryEntry[]; future?: EditHistoryEntry[] };

export const initialEditState: EditState = {
  operations: [],
  selectedIds: [],
  past: [],
  future: [],
};

function commit(
  state: EditState,
  operations: EditOperation[],
  selectedIds = state.selectedIds,
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
        selectedIds: state.selectedIds,
        coalesceKey,
      };

  return {
    operations,
    selectedIds,
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
    selectedIds: state.selectedIds,
  };
}

function toggleSelection(current: string[], ids: string[]): string[] {
  const next = [...current];
  for (const id of ids) {
    const index = next.indexOf(id);
    if (index >= 0) next.splice(index, 1);
    else next.push(id);
  }
  return next;
}

export function editReducer(state: EditState, action: EditAction): EditState {
  switch (action.type) {
    case "add":
      return commit(
        state,
        [...state.operations, action.operation],
        [action.operation.id],
        `${historyLabelForOperation(action.operation, "Add edit")} added`,
      );
    case "add-many": {
      const last = action.operations[action.operations.length - 1];
      if (!last) return state;
      return commit(
        state,
        [...state.operations, ...action.operations],
        [last.id],
        action.operations.length === 1
          ? `${historyLabelForOperation(last, "Add edit")} added`
          : `${action.operations.length} edits added`,
      );
    }
    case "update":
      return commit(
        state,
        state.operations.map((operation) =>
          operation.id === action.id ? ({ ...operation, ...action.patch } as EditOperation) : operation,
        ),
        state.selectedIds,
        historyLabelForOperation(state.operations.find((operation) => operation.id === action.id), "Update edit"),
        `update:${action.id}`,
      );
    case "translate": {
      if (action.ids.length === 0) return state;
      return commit(
        state,
        state.operations.map((operation) =>
          action.ids.includes(operation.id) ? translateOperation(operation, action.dx, action.dy) : operation,
        ),
        state.selectedIds,
        action.ids.length === 1 ? "Move edit" : `Moved ${action.ids.length} objects`,
        `translate:${[...action.ids].sort().join(",")}`,
      );
    }
    case "remove": {
      const operations = state.operations.filter((operation) => operation.id !== action.id);
      return commit(
        state,
        operations,
        state.selectedIds.filter((id) => id !== action.id),
        "Delete edit",
      );
    }
    case "remove-many": {
      if (action.ids.length === 0) return state;
      const operations = state.operations.filter((operation) => !action.ids.includes(operation.id));
      return commit(
        state,
        operations,
        state.selectedIds.filter((id) => !action.ids.includes(id)),
        action.ids.length === 1 ? "Delete edit" : `Deleted ${action.ids.length} objects`,
      );
    }
    case "select":
      return {
        ...state,
        selectedIds: action.additive ? toggleSelection(state.selectedIds, action.ids) : [...action.ids],
      };
    case "z":
      return commit(state, moveOperationZ(state.operations, action.id, action.direction), state.selectedIds, "Layer order");
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        operations: previous.operations,
        selectedIds: previous.selectedIds ?? [],
        past: state.past.slice(0, -1),
        future: [futureEntryFromCurrent(state, previous.label), ...state.future],
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        operations: next.operations,
        selectedIds: next.selectedIds ?? [],
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
        selectedIds: entry.selectedIds ?? [],
        past: state.past.slice(0, index),
        future: [futureEntryFromCurrent(state, `Restore before ${entry.label}`), ...state.future],
      };
    }
    case "reset":
      return {
        operations: action.operations ?? [],
        selectedIds: [],
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
  return state.operations.find((operation) => operation.id === state.selectedIds[0]);
}

export function getSelectedOperations(state: EditState) {
  return state.operations.filter((operation) => state.selectedIds.includes(operation.id));
}
