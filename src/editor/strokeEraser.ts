/** A structural point type, compatible with PdfPoint and viewport coordinates. */
export type StrokePoint = Readonly<{
  x: number;
  y: number;
}>;

/** Optional counters for profiling and deterministic complexity regressions. */
export type StrokeEraserDiagnostics = {
  indexNodeVisits: number;
  candidateSegmentChecks: number;
};

export type StrokeEraserOptions = Readonly<{
  /** Full rendered width of the ink stroke. */
  strokeWidth: number;
  /** Radius of the eraser path, measured from its center line. */
  eraserRadius: number;
  diagnostics?: StrokeEraserDiagnostics;
}>;

export type StrokeEraseResult = Readonly<{
  didErase: boolean;
  fragments: StrokePoint[][];
}>;

type Interval = {
  start: number;
  end: number;
};

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type PreparedEraserSegment = Bounds & {
  start: StrokePoint;
  end: StrokePoint;
  dx: number;
  dy: number;
  length: number;
  lengthSquared: number;
};

type SegmentIndexNode = Bounds & {
  segments?: PreparedEraserSegment[];
  left?: SegmentIndexNode;
  right?: SegmentIndexNode;
};

type PreparedEraser = {
  bounds?: Bounds;
  index?: SegmentIndexNode;
  effectiveRadius: number;
  diagnostics?: StrokeEraserDiagnostics;
};

const GEOMETRY_EPSILON = 1e-9;
const PARAMETER_EPSILON = 1e-10;
const SEGMENT_INDEX_LEAF_SIZE = 8;

function validateOptions(options: StrokeEraserOptions) {
  if (!Number.isFinite(options.strokeWidth) || options.strokeWidth < 0) {
    throw new RangeError("strokeWidth must be a finite non-negative number");
  }
  if (!Number.isFinite(options.eraserRadius) || options.eraserRadius < 0) {
    throw new RangeError("eraserRadius must be a finite non-negative number");
  }
}

function clonePoints(points: readonly StrokePoint[]) {
  const clones = new Array<StrokePoint>(points.length);
  for (let index = 0; index < points.length; index += 1) {
    clones[index] = { x: points[index].x, y: points[index].y };
  }
  return clones;
}

function getPolylineBounds(points: readonly StrokePoint[]): Bounds | undefined {
  if (points.length === 0) return undefined;

  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = minX;
  let maxY = minY;
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  return { minX, minY, maxX, maxY };
}

function boundsOverlap(a: Bounds, b: Bounds) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function buildSegmentIndexRange(
  sorted: PreparedEraserSegment[],
  start: number,
  end: number,
): SegmentIndexNode {
  if (end - start <= SEGMENT_INDEX_LEAF_SIZE) {
    const leafSegments = sorted.slice(start, end);
    const first = leafSegments[0];
    const leaf: SegmentIndexNode = {
      minX: first.minX,
      minY: first.minY,
      maxX: first.maxX,
      maxY: first.maxY,
      segments: leafSegments,
    };
    for (let index = 1; index < leafSegments.length; index += 1) {
      const segment = leafSegments[index];
      if (segment.minX < leaf.minX) leaf.minX = segment.minX;
      if (segment.minY < leaf.minY) leaf.minY = segment.minY;
      if (segment.maxX > leaf.maxX) leaf.maxX = segment.maxX;
      if (segment.maxY > leaf.maxY) leaf.maxY = segment.maxY;
    }
    return leaf;
  }

  const midpoint = (start + end) >> 1;
  const left = buildSegmentIndexRange(sorted, start, midpoint);
  const right = buildSegmentIndexRange(sorted, midpoint, end);
  return {
    minX: Math.min(left.minX, right.minX),
    minY: Math.min(left.minY, right.minY),
    maxX: Math.max(left.maxX, right.maxX),
    maxY: Math.max(left.maxY, right.maxY),
    left,
    right,
  };
}

function buildSegmentIndex(segments: PreparedEraserSegment[]): SegmentIndexNode | undefined {
  if (segments.length === 0) return undefined;

  let minCenterX = (segments[0].minX + segments[0].maxX) / 2;
  let maxCenterX = minCenterX;
  let minCenterY = (segments[0].minY + segments[0].maxY) / 2;
  let maxCenterY = minCenterY;
  for (let index = 1; index < segments.length; index += 1) {
    const segment = segments[index];
    const centerX = (segment.minX + segment.maxX) / 2;
    const centerY = (segment.minY + segment.maxY) / 2;
    if (centerX < minCenterX) minCenterX = centerX;
    if (centerX > maxCenterX) maxCenterX = centerX;
    if (centerY < minCenterY) minCenterY = centerY;
    if (centerY > maxCenterY) maxCenterY = centerY;
  }

  const splitOnX = maxCenterX - minCenterX >= maxCenterY - minCenterY;
  const sorted = [...segments].sort((a, b) => {
    const aCenter = splitOnX ? (a.minX + a.maxX) / 2 : (a.minY + a.maxY) / 2;
    const bCenter = splitOnX ? (b.minX + b.maxX) / 2 : (b.minY + b.maxY) / 2;
    return aCenter - bCenter;
  });
  return buildSegmentIndexRange(sorted, 0, sorted.length);
}

function visitOverlappingSegments(
  node: SegmentIndexNode,
  query: Bounds,
  diagnostics: StrokeEraserDiagnostics | undefined,
  visit: (segment: PreparedEraserSegment) => void,
) {
  if (diagnostics) diagnostics.indexNodeVisits += 1;
  if (!boundsOverlap(query, node)) return;

  if (node.segments) {
    for (let index = 0; index < node.segments.length; index += 1) {
      if (diagnostics) diagnostics.candidateSegmentChecks += 1;
      const segment = node.segments[index];
      if (boundsOverlap(query, segment)) visit(segment);
    }
    return;
  }
  if (node.left) visitOverlappingSegments(node.left, query, diagnostics, visit);
  if (node.right) visitOverlappingSegments(node.right, query, diagnostics, visit);
}

function prepareEraser(points: readonly StrokePoint[], options: StrokeEraserOptions): PreparedEraser {
  validateOptions(options);
  if (options.diagnostics) {
    options.diagnostics.indexNodeVisits = 0;
    options.diagnostics.candidateSegmentChecks = 0;
  }
  const effectiveRadius = options.eraserRadius + options.strokeWidth / 2;
  if (points.length === 0) {
    return { effectiveRadius, diagnostics: options.diagnostics };
  }

  const segmentCount = Math.max(1, points.length - 1);
  const segments = new Array<PreparedEraserSegment>(segmentCount);

  for (let index = 0; index < segmentCount; index += 1) {
    const start = points[index];
    const end = points.length === 1 ? start : points[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const segment: PreparedEraserSegment = {
      start,
      end,
      dx,
      dy,
      length: Math.sqrt(lengthSquared),
      lengthSquared,
      minX: Math.min(start.x, end.x) - effectiveRadius,
      minY: Math.min(start.y, end.y) - effectiveRadius,
      maxX: Math.max(start.x, end.x) + effectiveRadius,
      maxY: Math.max(start.y, end.y) + effectiveRadius,
    };
    segments[index] = segment;
  }

  const index = buildSegmentIndex(segments);
  return {
    bounds: index,
    index,
    effectiveRadius,
    diagnostics: options.diagnostics,
  };
}

function segmentBounds(start: StrokePoint, end: StrokePoint): Bounds {
  return {
    minX: Math.min(start.x, end.x),
    minY: Math.min(start.y, end.y),
    maxX: Math.max(start.x, end.x),
    maxY: Math.max(start.y, end.y),
  };
}

function pointToSegmentDistanceSquared(point: StrokePoint, segment: PreparedEraserSegment) {
  if (segment.lengthSquared <= GEOMETRY_EPSILON) {
    const dx = point.x - segment.start.x;
    const dy = point.y - segment.start.y;
    return dx * dx + dy * dy;
  }

  const projection =
    ((point.x - segment.start.x) * segment.dx + (point.y - segment.start.y) * segment.dy) / segment.lengthSquared;
  const parameter = Math.max(0, Math.min(1, projection));
  const dx = point.x - (segment.start.x + segment.dx * parameter);
  const dy = point.y - (segment.start.y + segment.dy * parameter);
  return dx * dx + dy * dy;
}

function addCircleInterval(
  output: Interval[],
  inkStart: StrokePoint,
  inkDx: number,
  inkDy: number,
  inkLengthSquared: number,
  center: StrokePoint,
  radiusSquared: number,
) {
  const offsetX = inkStart.x - center.x;
  const offsetY = inkStart.y - center.y;
  const projectionNumerator = offsetX * inkDx + offsetY * inkDy;
  const closestParameter = -projectionNumerator / inkLengthSquared;
  const offsetSquared = offsetX * offsetX + offsetY * offsetY;
  const closestDistanceSquared = Math.max(
    0,
    offsetSquared - (projectionNumerator * projectionNumerator) / inkLengthSquared,
  );
  if (closestDistanceSquared > radiusSquared + GEOMETRY_EPSILON) return;

  const halfSpan = Math.sqrt(Math.max(0, radiusSquared - closestDistanceSquared) / inkLengthSquared);
  const start = Math.max(0, closestParameter - halfSpan);
  const end = Math.min(1, closestParameter + halfSpan);
  if (start <= end + PARAMETER_EPSILON) output.push({ start, end });
}

function constrainLinearRange(base: number, delta: number, minimum: number, maximum: number, interval: Interval) {
  if (Math.abs(delta) <= GEOMETRY_EPSILON) {
    return base >= minimum - GEOMETRY_EPSILON && base <= maximum + GEOMETRY_EPSILON;
  }

  let first = (minimum - base) / delta;
  let second = (maximum - base) / delta;
  if (first > second) {
    const swap = first;
    first = second;
    second = swap;
  }
  if (first > interval.start) interval.start = first;
  if (second < interval.end) interval.end = second;
  return interval.start <= interval.end + PARAMETER_EPSILON;
}

function addCapsuleIntervals(
  output: Interval[],
  inkStart: StrokePoint,
  inkEnd: StrokePoint,
  eraser: PreparedEraserSegment,
  radius: number,
) {
  const inkDx = inkEnd.x - inkStart.x;
  const inkDy = inkEnd.y - inkStart.y;
  const inkLengthSquared = inkDx * inkDx + inkDy * inkDy;
  const radiusSquared = radius * radius;

  if (inkLengthSquared <= GEOMETRY_EPSILON) {
    if (pointToSegmentDistanceSquared(inkStart, eraser) <= radiusSquared + GEOMETRY_EPSILON) {
      output.push({ start: 0, end: 1 });
    }
    return;
  }

  if (eraser.lengthSquared <= GEOMETRY_EPSILON) {
    addCircleInterval(output, inkStart, inkDx, inkDy, inkLengthSquared, eraser.start, radiusSquared);
    return;
  }

  const unitX = eraser.dx / eraser.length;
  const unitY = eraser.dy / eraser.length;
  const fromEraserX = inkStart.x - eraser.start.x;
  const fromEraserY = inkStart.y - eraser.start.y;
  const longitudinalBase = fromEraserX * unitX + fromEraserY * unitY;
  const longitudinalDelta = inkDx * unitX + inkDy * unitY;
  const lateralBase = fromEraserY * unitX - fromEraserX * unitY;
  const lateralDelta = inkDy * unitX - inkDx * unitY;
  const stripInterval = { start: 0, end: 1 };

  if (
    constrainLinearRange(longitudinalBase, longitudinalDelta, 0, eraser.length, stripInterval) &&
    constrainLinearRange(lateralBase, lateralDelta, -radius, radius, stripInterval)
  ) {
    output.push(stripInterval);
  }

  addCircleInterval(output, inkStart, inkDx, inkDy, inkLengthSquared, eraser.start, radiusSquared);
  addCircleInterval(output, inkStart, inkDx, inkDy, inkLengthSquared, eraser.end, radiusSquared);
}

function mergeIntervals(intervals: Interval[]) {
  if (intervals.length <= 1) return intervals;
  intervals.sort((a, b) => a.start - b.start || a.end - b.end);

  let writeIndex = 0;
  for (let readIndex = 1; readIndex < intervals.length; readIndex += 1) {
    const current = intervals[writeIndex];
    const next = intervals[readIndex];
    if (next.start <= current.end + PARAMETER_EPSILON) {
      if (next.end > current.end) current.end = next.end;
    } else {
      writeIndex += 1;
      intervals[writeIndex] = next;
    }
  }
  intervals.length = writeIndex + 1;
  return intervals;
}

function findEraseIntervals(inkStart: StrokePoint, inkEnd: StrokePoint, eraser: PreparedEraser, output: Interval[]) {
  output.length = 0;
  if (!eraser.bounds || !eraser.index) return output;

  const inkBounds = segmentBounds(inkStart, inkEnd);
  if (!boundsOverlap(inkBounds, eraser.bounds)) return output;

  visitOverlappingSegments(eraser.index, inkBounds, eraser.diagnostics, (segment) => {
    addCapsuleIntervals(output, inkStart, inkEnd, segment, eraser.effectiveRadius);
  });
  return mergeIntervals(output);
}

function lerp(start: StrokePoint, end: StrokePoint, parameter: number): StrokePoint {
  if (parameter <= 0) return { x: start.x, y: start.y };
  if (parameter >= 1) return { x: end.x, y: end.y };
  return {
    x: start.x + (end.x - start.x) * parameter,
    y: start.y + (end.y - start.y) * parameter,
  };
}

function appendDistinct(fragment: StrokePoint[], point: StrokePoint) {
  const last = fragment[fragment.length - 1];
  if (!last || last.x !== point.x || last.y !== point.y) fragment.push(point);
}

/** Returns true when the rendered ink stroke touches the swept eraser path. */
export function strokeIntersectsEraser(
  inkPoints: readonly StrokePoint[],
  eraserPoints: readonly StrokePoint[],
  options: StrokeEraserOptions,
) {
  if (inkPoints.length === 0 || eraserPoints.length === 0) return false;
  const eraser = prepareEraser(eraserPoints, options);
  const inkBounds = getPolylineBounds(inkPoints);
  if (!inkBounds || !eraser.bounds || !boundsOverlap(inkBounds, eraser.bounds)) return false;

  const intervals: Interval[] = [];
  if (inkPoints.length === 1) {
    return findEraseIntervals(inkPoints[0], inkPoints[0], eraser, intervals).length > 0;
  }
  for (let index = 1; index < inkPoints.length; index += 1) {
    if (findEraseIntervals(inkPoints[index - 1], inkPoints[index], eraser, intervals).length > 0) return true;
  }
  return false;
}

/**
 * Splits an ink center line wherever its rendered stroke meets the swept eraser
 * path. Boundary points are interpolated, so long sparse segments erase cleanly.
 */
export function eraseStrokeByPath(
  inkPoints: readonly StrokePoint[],
  eraserPoints: readonly StrokePoint[],
  options: StrokeEraserOptions,
): StrokeEraseResult {
  if (inkPoints.length === 0) return { didErase: false, fragments: [] };
  if (eraserPoints.length === 0) return { didErase: false, fragments: [clonePoints(inkPoints)] };

  const eraser = prepareEraser(eraserPoints, options);
  const inkBounds = getPolylineBounds(inkPoints);
  if (!inkBounds || !eraser.bounds || !boundsOverlap(inkBounds, eraser.bounds)) {
    return { didErase: false, fragments: [clonePoints(inkPoints)] };
  }

  const intervals: Interval[] = [];
  if (inkPoints.length === 1) {
    const didErase = findEraseIntervals(inkPoints[0], inkPoints[0], eraser, intervals).length > 0;
    return { didErase, fragments: didErase ? [] : [clonePoints(inkPoints)] };
  }

  const fragments: StrokePoint[][] = [];
  let activeFragment: StrokePoint[] | undefined;
  let didErase = false;

  const appendRetainedRange = (start: StrokePoint, end: StrokePoint, from: number, to: number) => {
    if (!activeFragment) {
      activeFragment = [];
      fragments.push(activeFragment);
    }
    appendDistinct(activeFragment, lerp(start, end, from));
    appendDistinct(activeFragment, lerp(start, end, to));
  };

  for (let index = 1; index < inkPoints.length; index += 1) {
    const start = inkPoints[index - 1];
    const end = inkPoints[index];
    findEraseIntervals(start, end, eraser, intervals);

    if (intervals.length === 0) {
      appendRetainedRange(start, end, 0, 1);
      continue;
    }

    didErase = true;
    let cursor = 0;
    for (let intervalIndex = 0; intervalIndex < intervals.length; intervalIndex += 1) {
      const interval = intervals[intervalIndex];
      if (interval.start > cursor + PARAMETER_EPSILON) {
        appendRetainedRange(start, end, cursor, interval.start);
      }
      activeFragment = undefined;
      if (interval.end > cursor) cursor = interval.end;
    }
    if (cursor < 1 - PARAMETER_EPSILON) appendRetainedRange(start, end, cursor, 1);
  }

  if (!didErase) return { didErase: false, fragments: [clonePoints(inkPoints)] };
  return { didErase: true, fragments };
}
