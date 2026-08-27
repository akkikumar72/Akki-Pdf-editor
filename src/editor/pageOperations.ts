import type { AnnotationOperation, EditOperation, PdfPoint, PdfRect } from "../types/editor";

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

function pointInRect(point: PdfPoint, rect: PdfRect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function segmentIntersectsRect(start: PdfPoint, end: PdfPoint, rect: PdfRect) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let near = 0;
  let far = 1;
  for (const [direction, distance] of [
    [-dx, start.x - rect.x],
    [dx, rect.x + rect.width - start.x],
    [-dy, start.y - rect.y],
    [dy, rect.y + rect.height - start.y],
  ]) {
    if (direction === 0) {
      if (distance < 0) return false;
      continue;
    }
    const ratio = distance / direction;
    if (direction < 0) near = Math.max(near, ratio);
    else far = Math.min(far, ratio);
    if (near > far) return false;
  }
  return true;
}

function calloutLeaderIntersectsRect(operation: AnnotationOperation, rect: PdfRect) {
  if (operation.kind !== "callout") return false;
  const anchor = operation.anchor ?? { x: operation.rect.x - 48, y: operation.rect.y + operation.rect.height / 2 };
  const edge = anchor.x <= operation.rect.x
    ? { x: operation.rect.x, y: operation.rect.y + operation.rect.height / 2 }
    : { x: operation.rect.x + operation.rect.width, y: operation.rect.y + operation.rect.height / 2 };
  const points = [anchor, operation.elbow, edge].filter((point): point is PdfPoint => Boolean(point));
  return points.some((point) => pointInRect(point, rect)) || points.slice(1).some((point, index) => segmentIntersectsRect(points[index], point, rect));
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
    const visibleCalloutLeader = operation.type === "annotation" && calloutLeaderIntersectsRect(operation, crop);
    if (!rectsIntersect(operation.rect, crop) && (!sourceCoverRect || !rectsIntersect(sourceCoverRect, crop)) && !visibleCalloutLeader) {
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
    if (operation.type === "shape" && (operation.kind === "line" || operation.kind === "arrow")) {
      return [{
        ...operation,
        rect,
        start: operation.start ? { x: operation.start.x + dx, y: operation.start.y + dy } : undefined,
        end: operation.end ? { x: operation.end.x + dx, y: operation.end.y + dy } : undefined,
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
