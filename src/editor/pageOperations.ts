import type { EditOperation } from "../types/editor";

export function shiftOperationsForInsertedPage(operations: EditOperation[], insertedPageIndex: number) {
  return operations.map((operation) => (
    operation.pageIndex >= insertedPageIndex
      ? { ...operation, pageIndex: operation.pageIndex + 1 }
      : operation
  ));
}

export function shiftOperationsForDeletedPage(operations: EditOperation[], deletedPageIndex: number) {
  return operations
    .filter((operation) => operation.pageIndex !== deletedPageIndex)
    .map((operation) => (
      operation.pageIndex > deletedPageIndex
        ? { ...operation, pageIndex: operation.pageIndex - 1 }
        : operation
    ));
}

/**
 * A duplicated page is inserted right after the source. Existing overlays on pages at or
 * after the new slot shift forward by one; the duplicate page itself starts empty (overlays
 * are baked at the source index, so the copy carries no editable overlays).
 */
export function shiftOperationsForDuplicatedPage(operations: EditOperation[], sourcePageIndex: number) {
  return shiftOperationsForInsertedPage(operations, sourcePageIndex + 1);
}

/**
 * Remap overlay pageIndex values after a page is moved from `from` to `to`. Pages between the
 * two positions slide by one in the opposite direction; the moved page's overlays follow it.
 */
export function shiftOperationsForMovedPage(operations: EditOperation[], from: number, to: number) {
  if (from === to) return operations;
  return operations.map((operation) => {
    const { pageIndex } = operation;
    let next = pageIndex;
    if (pageIndex === from) {
      next = to;
    } else if (from < to && pageIndex > from && pageIndex <= to) {
      next = pageIndex - 1;
    } else if (from > to && pageIndex >= to && pageIndex < from) {
      next = pageIndex + 1;
    }
    return next === pageIndex ? operation : { ...operation, pageIndex: next };
  });
}
