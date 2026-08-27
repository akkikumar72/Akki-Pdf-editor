import type { EditOperation, EditOperationPatch, OperationReplacement } from "../types/editor";
import { moveOperationZ, translateOperation } from "../editor/selectionModel";
import { createId } from "../utils/ids";

export type DocumentSnapshot = {
  bytes: Uint8Array;
  pageIndex: number;
};

export type EditHistoryEntry = {
  id: string;
  label: string;
  timestamp: number;
  operations: EditOperation[];
  selectedIds?: string[];
  pageIndex?: number;
  coalesceKey?: string;
  /** Present only at a document-byte revision boundary such as Crop. */
  documentSnapshot?: DocumentSnapshot;
};

export type EditState = {
  operations: EditOperation[];
  selectedIds: string[];
  past: EditHistoryEntry[];
  future: EditHistoryEntry[];
};

export const EDIT_HISTORY_ENTRY_LIMIT = 80;
export const DOCUMENT_SNAPSHOT_COUNT_LIMIT = 6;
export const DOCUMENT_SNAPSHOT_BYTE_LIMIT = 256 * 1024 * 1024;

export type EditAction =
  | { type: "add"; operation: EditOperation }
  | { type: "add-many"; operations: EditOperation[] }
  | { type: "update"; id: string; patch: EditOperationPatch }
  | { type: "translate"; ids: string[]; dx: number; dy: number }
  | { type: "remove"; id: string }
  | { type: "remove-many"; ids: string[] }
  | { type: "replace-many"; replacements: OperationReplacement[]; label?: string }
  | { type: "select"; ids: string[]; additive?: boolean }
  | { type: "z"; id: string; direction: "forward" | "backward" }
  | { type: "document-edit"; operations: EditOperation[]; label: string; beforeDocument: DocumentSnapshot }
  | { type: "undo"; currentDocument?: DocumentSnapshot }
  | { type: "redo"; currentDocument?: DocumentSnapshot }
  | { type: "restore-history"; id: string; currentDocument?: DocumentSnapshot }
  | { type: "reset"; operations?: EditOperation[]; past?: EditHistoryEntry[]; future?: EditHistoryEntry[] };

export const initialEditState: EditState = {
  operations: [],
  selectedIds: [],
  past: [],
  future: [],
};

function documentSnapshotUsage(past: EditHistoryEntry[], future: EditHistoryEntry[]) {
  let count = 0;
  let bytes = 0;
  for (const entry of [...past, ...future]) {
    if (!entry.documentSnapshot) continue;
    count += 1;
    bytes += entry.documentSnapshot.bytes.byteLength;
  }
  return { count, bytes };
}

/**
 * Keeps history bounded without leaving overlay checkpoints detached from the
 * PDF revision whose coordinate system they use. A past document boundary is
 * evicted together with every older entry. A future boundary is evicted with
 * every later redo entry. Ordinary overlay-only history still keeps 80 entries.
 */
function trimHistory(
  past: EditHistoryEntry[],
  future: EditHistoryEntry[],
): Pick<EditState, "past" | "future"> {
  let nextPast = past.length > EDIT_HISTORY_ENTRY_LIMIT
    ? past.slice(-EDIT_HISTORY_ENTRY_LIMIT)
    : past;
  let nextFuture = future;

  while (true) {
    const usage = documentSnapshotUsage(nextPast, nextFuture);
    if (
      usage.count <= DOCUMENT_SNAPSHOT_COUNT_LIMIT
      && usage.bytes <= DOCUMENT_SNAPSHOT_BYTE_LIMIT
    ) {
      return { past: nextPast, future: nextFuture };
    }

    const oldestPastBoundary = nextPast.findIndex((entry) => entry.documentSnapshot);
    if (oldestPastBoundary >= 0) {
      nextPast = nextPast.slice(oldestPastBoundary + 1);
      continue;
    }

    let farthestFutureBoundary = -1;
    for (let index = nextFuture.length - 1; index >= 0; index -= 1) {
      if (nextFuture[index].documentSnapshot) {
        farthestFutureBoundary = index;
        break;
      }
    }
    if (farthestFutureBoundary >= 0) {
      nextFuture = nextFuture.slice(0, farthestFutureBoundary);
      continue;
    }

    return { past: nextPast, future: nextFuture };
  }
}

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

  const history = trimHistory(
    shouldCoalesce ? [...state.past.slice(0, -1), entry] : [...state.past, entry],
    [],
  );
  return {
    operations,
    selectedIds,
    ...history,
  };
}

function historyLabelForOperation(operation?: EditOperation, fallback = "Edit") {
  if (!operation) return fallback;
  if (operation.type === "text") return "Text edit";
  if (operation.type === "whiteout") return "Whiteout";
  if (operation.type === "redaction") return "Redaction";
  if (operation.type === "form-field" || operation.type === "form-mark") return "Form edit";
  return `${operation.type.replace("-", " ")} edit`;
}

function futureEntryFromCurrent(
  state: EditState,
  label = "Redo edit",
  documentSnapshot?: DocumentSnapshot,
): EditHistoryEntry {
  return {
    id: createId("history"),
    label,
    timestamp: Date.now(),
    operations: state.operations,
    selectedIds: state.selectedIds,
    documentSnapshot,
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
    case "replace-many": {
      if (action.replacements.length === 0) return state;
      const replacements = new Map(action.replacements.map((replacement) => [replacement.id, replacement.operations]));
      const existingIds = new Set(state.operations.map((operation) => operation.id));
      const replacedIds = action.replacements.map((replacement) => replacement.id).filter((id) => existingIds.has(id));
      if (replacedIds.length === 0) return state;
      const operations = state.operations.flatMap((operation) => replacements.get(operation.id) ?? [operation]);
      const selectedIds = state.selectedIds.flatMap((id) =>
        replacements.has(id) ? replacements.get(id)!.map((operation) => operation.id) : [id],
      );
      return commit(
        state,
        operations,
        selectedIds,
        action.label ?? (replacedIds.length === 1 ? "Erase stroke" : `Erased ${replacedIds.length} strokes`),
      );
    }
    case "select":
      return {
        ...state,
        selectedIds: action.additive ? toggleSelection(state.selectedIds, action.ids) : [...action.ids],
      };
    case "z":
      return commit(state, moveOperationZ(state.operations, action.id, action.direction), state.selectedIds, "Layer order");
    case "document-edit": {
      const entry: EditHistoryEntry = {
        id: createId("history"),
        label: action.label,
        timestamp: Date.now(),
        operations: state.operations,
        selectedIds: state.selectedIds,
        pageIndex: action.beforeDocument.pageIndex,
        documentSnapshot: action.beforeDocument,
      };
      const history = trimHistory([...state.past, entry], []);
      return {
        operations: action.operations,
        selectedIds: [],
        ...history,
      };
    }
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      const history = trimHistory(
        state.past.slice(0, -1),
        [
          futureEntryFromCurrent(
            state,
            previous.label,
            previous.documentSnapshot ? action.currentDocument : undefined,
          ),
          ...state.future,
        ],
      );
      return {
        operations: previous.operations,
        selectedIds: previous.selectedIds ?? [],
        ...history,
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      const history = trimHistory(
        [
          ...state.past,
          futureEntryFromCurrent(state, next.label, next.documentSnapshot ? action.currentDocument : undefined),
        ],
        state.future.slice(1),
      );
      return {
        operations: next.operations,
        selectedIds: next.selectedIds ?? [],
        ...history,
      };
    }
    case "restore-history": {
      const index = state.past.findIndex((entry) => entry.id === action.id);
      const entry = state.past[index];
      if (!entry) return state;
      const history = trimHistory(
        state.past.slice(0, index),
        [
          futureEntryFromCurrent(
            state,
            `Restore before ${entry.label}`,
            action.currentDocument,
          ),
          ...state.future,
        ],
      );
      return {
        operations: entry.operations,
        selectedIds: entry.selectedIds ?? [],
        ...history,
      };
    }
    case "reset": {
      const history = trimHistory(action.past ?? [], action.future ?? []);
      return {
        operations: action.operations ?? [],
        selectedIds: [],
        ...history,
      };
    }
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
