import type { EditOperation } from "../types/editor";
import { createId } from "../utils/ids";

const DUPLICATE_OFFSET = 12;

export function duplicateOperation(operation: EditOperation): EditOperation {
  const duplicate = {
    ...operation,
    id: createId(operation.type),
    rect: {
      ...operation.rect,
      x: operation.rect.x + DUPLICATE_OFFSET,
      y: Math.max(0, operation.rect.y - DUPLICATE_OFFSET),
    },
    createdAt: Date.now(),
  } as EditOperation;

  if (duplicate.type === "ink") {
    duplicate.points = duplicate.points.map((point) => ({
      x: point.x + DUPLICATE_OFFSET,
      y: Math.max(0, point.y - DUPLICATE_OFFSET),
    }));
  }

  return duplicate;
}

export function moveOperationZ(operations: EditOperation[], id: string, direction: "forward" | "backward") {
  const index = operations.findIndex((operation) => operation.id === id);
  if (index < 0) return operations;
  const target = direction === "forward" ? index + 1 : index - 1;
  if (target < 0 || target >= operations.length) return operations;
  const next = [...operations];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
