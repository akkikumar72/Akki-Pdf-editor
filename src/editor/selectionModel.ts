import type { EditOperation, PdfPoint } from "../types/editor";
import { createId } from "../utils/ids";

const DUPLICATE_OFFSET = 12;

/** Shift a list of absolute points by a uniform delta. */
export function translatePoints(points: PdfPoint[], dx: number, dy: number): PdfPoint[] {
  return points.map((point) => ({ x: point.x + dx, y: point.y + dy }));
}

/**
 * Move an operation by a uniform delta. Ink strokes render and export from their
 * absolute `points`, not `rect`, so both must shift by the same amount to keep the
 * bounding box and the stroke in lockstep. This is the single source of truth for
 * operation translation, shared by drag and duplicate.
 */
export function translateOperation(operation: EditOperation, dx: number, dy: number): EditOperation {
  const moved = {
    ...operation,
    rect: { ...operation.rect, x: operation.rect.x + dx, y: operation.rect.y + dy },
  } as EditOperation;

  if (moved.type === "ink") {
    moved.points = translatePoints(moved.points, dx, dy);
  }

  return moved;
}

export function duplicateOperation(operation: EditOperation): EditOperation {
  // A single clamped delta applied uniformly keeps ink rect and points aligned.
  // Clamping rect.y and each point.y independently (as a per-axis Math.max would)
  // skews a stroke duplicated within DUPLICATE_OFFSET of the top edge.
  const dx = DUPLICATE_OFFSET;
  const dy = Math.max(0, operation.rect.y - DUPLICATE_OFFSET) - operation.rect.y;

  const duplicate = {
    ...translateOperation(operation, dx, dy),
    id: createId(operation.type),
    createdAt: Date.now(),
  } as EditOperation;

  if (duplicate.type === "text") {
    // A duplicated replacement must not re-mask the original text's location.
    // sourceCoverRect anchors a whiteout box to the original PDF glyph bounds;
    // copying it would paint a stray mask over the source while the moved copy
    // has no mask of its own. Drop it so the duplicate behaves like free text.
    delete duplicate.sourceCoverRect;
    duplicate.whiteout = false;
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
