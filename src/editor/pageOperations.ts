import type { EditOperation, PdfRect } from "../types/editor";

export type PageCropBounds = {
  pageIndex: number;
  rect: PdfRect;
};

function rectsIntersect(a: PdfRect, b: PdfRect) {
  const aRight = a.x + a.width;
  const aTop = a.y + a.height;
  const bRight = b.x + b.width;
  const bTop = b.y + b.height;
  return Math.max(a.x, b.x) < Math.min(aRight, bRight) && Math.max(a.y, b.y) < Math.min(aTop, bTop);
}

function translateRect(rect: PdfRect, dx: number, dy: number): PdfRect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

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
 * Moves overlays into the new page-local coordinate system after a crop.
 * Partially visible objects keep their full geometry so cropping does not
 * resize or reflow them. Objects with no visible geometry are discarded.
 */
export function remapOperationsForCroppedPages(
  operations: EditOperation[],
  cropBounds: PageCropBounds[],
): EditOperation[] {
  const cropByPage = new Map(cropBounds.map((crop) => [crop.pageIndex, crop.rect]));

  return operations.flatMap((operation) => {
    const crop = cropByPage.get(operation.pageIndex);
    if (!crop) return [operation];

    const sourceCoverRect = operation.type === "text" ? operation.sourceCoverRect : undefined;
    if (!rectsIntersect(operation.rect, crop) && (!sourceCoverRect || !rectsIntersect(sourceCoverRect, crop))) {
      return [];
    }

    const dx = -crop.x;
    const dy = -crop.y;
    const rect = translateRect(operation.rect, dx, dy);

    if (operation.type === "ink") {
      return [{
        ...operation,
        rect,
        points: operation.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
      }];
    }
    if (operation.type === "text" && sourceCoverRect) {
      return [{ ...operation, rect, sourceCoverRect: translateRect(sourceCoverRect, dx, dy) }];
    }
    if (operation.type === "annotation" && (operation.anchor || operation.elbow)) {
      return [{
        ...operation,
        rect,
        anchor: operation.anchor ? { x: operation.anchor.x + dx, y: operation.anchor.y + dy } : undefined,
        elbow: operation.elbow ? { x: operation.elbow.x + dx, y: operation.elbow.y + dy } : undefined,
      }];
    }
    return [{ ...operation, rect }];
  });
}
