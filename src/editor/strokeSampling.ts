import type { PdfPoint } from "../types/editor";

const DEFAULT_MIN_DISTANCE = 2;
const DEFAULT_ONLINE_TOLERANCE = 0.75;
const DEFAULT_COMMIT_TOLERANCE = 1.5;
const CORNER_COSINE = Math.cos((35 * Math.PI) / 180);
const MAX_COMMITTED_POINTS = 4_096;
const MAX_LIVE_POINTS = MAX_COMMITTED_POINTS * 2;

type StrokeSamplingOptions = {
  minDistance?: number;
  onlineTolerance?: number;
  commitTolerance?: number;
};

function squaredDistance(a: PdfPoint, b: PdfPoint) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

function shouldKeepCorner(anchor: PdfPoint, candidate: PdfPoint, next: PdfPoint, tolerance: number) {
  const firstX = candidate.x - anchor.x;
  const firstY = candidate.y - anchor.y;
  const secondX = next.x - candidate.x;
  const secondY = next.y - candidate.y;
  const firstLength = Math.hypot(firstX, firstY);
  const secondLength = Math.hypot(secondX, secondY);
  if (firstLength === 0 || secondLength === 0) return false;

  const cosine = (firstX * secondX + firstY * secondY) / (firstLength * secondLength);
  if (cosine < CORNER_COSINE) return true;

  const lineX = next.x - anchor.x;
  const lineY = next.y - anchor.y;
  const lineLength = Math.hypot(lineX, lineY);
  if (lineLength === 0) return true;
  const distanceFromLine = Math.abs(lineX * (anchor.y - candidate.y) - (anchor.x - candidate.x) * lineY) / lineLength;
  return distanceFromLine >= tolerance;
}

function appendSimplified(points: PdfPoint[], point: PdfPoint, tolerance: number) {
  if (points.length < 2) {
    points.push(point);
    return;
  }

  const anchor = points[points.length - 2];
  const candidate = points[points.length - 1];
  if (shouldKeepCorner(anchor, candidate, point, tolerance)) {
    points.push(point);
  } else {
    // The last element is the live endpoint. Replacing it keeps previews current
    // without cloning an ever-growing array on every pointermove.
    points[points.length - 1] = point;
  }
}

function decimatePoints(points: readonly PdfPoint[], limit: number) {
  if (points.length <= limit) return points.map((point) => ({ ...point }));

  const lastIndex = points.length - 1;
  return Array.from({ length: limit }, (_, index) => {
    const sourceIndex = Math.floor((index * lastIndex) / (limit - 1));
    return { ...points[sourceIndex] };
  });
}

function compactLivePoints(points: PdfPoint[]) {
  if (points.length <= MAX_LIVE_POINTS) return;
  const compacted = decimatePoints(points, MAX_COMMITTED_POINTS);
  points.splice(0, points.length, ...compacted);
}

/** Linear, deterministic simplification that always retains both endpoints and meaningful corners. */
export function simplifyStroke(points: readonly PdfPoint[], tolerance = DEFAULT_COMMIT_TOLERANCE): PdfPoint[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  const simplified: PdfPoint[] = [{ ...points[0] }];
  for (let index = 1; index < points.length; index += 1) {
    appendSimplified(simplified, { ...points[index] }, tolerance);
  }
  return decimatePoints(simplified, MAX_COMMITTED_POINTS);
}

/**
 * Mutable gesture-local sampler. Its public points array is safe for the live
 * preview but never enters persistent editor state, so straight updates stay O(1).
 */
export class StrokeSampler {
  readonly points: PdfPoint[];
  private lastInput: PdfPoint;
  private readonly minDistanceSquared: number;
  private readonly onlineTolerance: number;
  private readonly commitTolerance: number;

  constructor(firstPoint: PdfPoint, options: StrokeSamplingOptions = {}) {
    this.points = [{ ...firstPoint }];
    this.lastInput = firstPoint;
    this.minDistanceSquared = (options.minDistance ?? DEFAULT_MIN_DISTANCE) ** 2;
    this.onlineTolerance = options.onlineTolerance ?? DEFAULT_ONLINE_TOLERANCE;
    this.commitTolerance = options.commitTolerance ?? DEFAULT_COMMIT_TOLERANCE;
  }

  add(point: PdfPoint, force = false) {
    const distanceSquared = squaredDistance(this.lastInput, point);
    if (!force && distanceSquared < this.minDistanceSquared) return false;
    if (distanceSquared === 0) return false;
    this.lastInput = point;
    appendSimplified(this.points, { ...point }, this.onlineTolerance);
    compactLivePoints(this.points);
    return true;
  }

  finish(endpoint?: PdfPoint) {
    if (endpoint) this.add(endpoint, true);
    return simplifyStroke(this.points, this.commitTolerance);
  }
}
