import type { EditOperation } from "../types/editor";
import { moveOperationZ } from "../editor/selectionModel";

export type EditState = {
  operations: EditOperation[];
  selectedId?: string;
  past: EditOperation[][];
  future: EditOperation[][];
};

export type EditAction =
  | { type: "add"; operation: EditOperation }
  | { type: "update"; id: string; patch: Partial<EditOperation> }
  | { type: "remove"; id: string }
  | { type: "select"; id?: string }
  | { type: "z"; id: string; direction: "forward" | "backward" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; operations?: EditOperation[] };

export const initialEditState: EditState = {
  operations: [],
  selectedId: undefined,
  past: [],
  future: [],
};

function commit(state: EditState, operations: EditOperation[], selectedId = state.selectedId): EditState {
  return {
    operations,
    selectedId,
    past: [...state.past, state.operations].slice(-80),
    future: [],
  };
}

export function editReducer(state: EditState, action: EditAction): EditState {
  switch (action.type) {
    case "add":
      return commit(state, [...state.operations, action.operation], action.operation.id);
    case "update":
      return commit(
        state,
        state.operations.map((operation) =>
          operation.id === action.id ? ({ ...operation, ...action.patch } as EditOperation) : operation,
        ),
      );
    case "remove": {
      const operations = state.operations.filter((operation) => operation.id !== action.id);
      return commit(state, operations, state.selectedId === action.id ? undefined : state.selectedId);
    }
    case "select":
      return { ...state, selectedId: action.id };
    case "z":
      return commit(state, moveOperationZ(state.operations, action.id, action.direction), state.selectedId);
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        operations: previous,
        selectedId: undefined,
        past: state.past.slice(0, -1),
        future: [state.operations, ...state.future],
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        operations: next,
        selectedId: undefined,
        past: [...state.past, state.operations],
        future: state.future.slice(1),
      };
    }
    case "reset":
      return { operations: action.operations ?? [], selectedId: undefined, past: [], future: [] };
    default:
      return state;
  }
}

export function getSelectedOperation(state: EditState) {
  return state.operations.find((operation) => operation.id === state.selectedId);
}
