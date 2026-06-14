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
