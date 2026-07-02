import type { EditOperation, TextItem, ViewportRect } from "../types/editor";
import { pdfRectToViewport } from "./coordinates";

export const SNAP_TOLERANCE_PX = 20;

export type GuideLine = {
  orientation: "horizontal" | "vertical";
  position: number;
  snapped: boolean;
};

export type AlignmentLines = {
  horizontal: number[];
  vertical: number[];
};

function uniqueSorted(values: number[]) {
  return [...new Set(values.map((value) => Math.round(value * 100) / 100))].sort((a, b) => a - b);
}

export function collectAlignmentLines({
  movingIds,
  operations,
  textItems,
  pageIndex,
  pageWidth,
  pageHeight,
  scale,
}: {
  movingIds: string[];
  operations: EditOperation[];
  textItems: TextItem[];
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  scale: number;
}): AlignmentLines {
  const horizontal: number[] = [0, pageHeight * scale];
  const vertical: number[] = [0, pageWidth * scale];

  for (const item of textItems) {
    const rect = pdfRectToViewport(item.rect, pageHeight, scale);
    horizontal.push(rect.top, rect.top + rect.height);
    vertical.push(rect.left, rect.left + rect.width);
  }

  for (const operation of operations) {
    if (movingIds.includes(operation.id) || operation.pageIndex !== pageIndex) continue;
    const rect = pdfRectToViewport(operation.rect, pageHeight, scale);
    horizontal.push(rect.top, rect.top + rect.height);
    vertical.push(rect.left, rect.left + rect.width);
  }

  return {
    horizontal: uniqueSorted(horizontal),
    vertical: uniqueSorted(vertical),
  };
}

function nearestSnapDelta(value: number, lines: number[], tolerance: number) {
  let best: { line: number; delta: number } | undefined;
  for (const line of lines) {
    const delta = line - value;
    if (Math.abs(delta) > tolerance) continue;
    if (!best || Math.abs(delta) < Math.abs(best.delta)) best = { line, delta };
  }
  return best;
}

export function snapViewportRect(
  rect: ViewportRect,
  lines: AlignmentLines,
  tolerance = SNAP_TOLERANCE_PX,
): { rect: ViewportRect; guides: GuideLine[] } {
  const edges = {
    top: rect.top,
    bottom: rect.top + rect.height,
    left: rect.left,
    right: rect.left + rect.width,
  };

  const snapTop = nearestSnapDelta(edges.top, lines.horizontal, tolerance);
  const snapBottom = nearestSnapDelta(edges.bottom, lines.horizontal, tolerance);
  const snapLeft = nearestSnapDelta(edges.left, lines.vertical, tolerance);
  const snapRight = nearestSnapDelta(edges.right, lines.vertical, tolerance);

  let nextTop = rect.top;
  let nextLeft = rect.left;
  const snappedHorizontal = new Set<number>();
  const snappedVertical = new Set<number>();

  const verticalCandidates = [snapTop, snapBottom].filter(Boolean) as Array<{ line: number; delta: number }>;
  const horizontalWinner = verticalCandidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0];
  if (horizontalWinner === snapTop && snapTop) {
    nextTop += snapTop.delta;
    snappedHorizontal.add(snapTop.line);
  } else if (snapBottom) {
    nextTop += snapBottom.delta;
    snappedHorizontal.add(snapBottom.line);
  }

  const horizontalCandidates = [snapLeft, snapRight].filter(Boolean) as Array<{ line: number; delta: number }>;
  const verticalWinner = horizontalCandidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0];
  if (verticalWinner === snapLeft && snapLeft) {
    nextLeft += snapLeft.delta;
    snappedVertical.add(snapLeft.line);
  } else if (snapRight) {
    nextLeft += snapRight.delta;
    snappedVertical.add(snapRight.line);
  }

  const guides: GuideLine[] = [
    ...lines.horizontal.map((position) => ({
      orientation: "horizontal" as const,
      position,
      snapped: snappedHorizontal.has(position),
    })),
    ...lines.vertical.map((position) => ({
      orientation: "vertical" as const,
      position,
      snapped: snappedVertical.has(position),
    })),
  ];

  return {
    rect: {
      ...rect,
      top: nextTop,
      left: nextLeft,
    },
    guides,
  };
}
