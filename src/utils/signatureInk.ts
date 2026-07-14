import { getStroke } from "perfect-freehand";

/** One captured input sample in the draw pad's logical coordinate space. */
export type InkPoint = { x: number; y: number; pressure: number };

/** One pen-down..pen-up gesture. Color is captured per stroke, so recoloring mid-signature keeps earlier ink. */
export type InkStroke = {
  points: InkPoint[];
  color: string;
  /** Pens report real pressure; mouse/touch strokes get velocity-simulated pressure instead. */
  simulatePressure: boolean;
};

/** The minimal 2D-context surface the ink renderer needs (keeps tests independent of a real canvas). */
export type InkPathContext = {
  fillStyle: string | CanvasGradient | CanvasPattern;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  closePath(): void;
  fill(): void;
};

/**
 * Documenso-style ink feel (its signature pad drives perfect-freehand the same
 * way): a medium nib thinned by velocity, with input smoothing/streamlining so
 * jittery pointer samples still produce a calm line.
 */
const STROKE_OPTIONS = {
  size: 5,
  thinning: 0.55,
  smoothing: 0.5,
  streamline: 0.45,
  last: true,
};

/**
 * Clamps an input sample to the pad's logical bounds. Pointer capture keeps
 * delivering moves after the cursor leaves the canvas, and unbounded points
 * would balloon the ink bounds (and with them the trimmed export).
 */
export function clampInkPoint(point: InkPoint, width: number, height: number): InkPoint {
  return {
    x: Math.min(width, Math.max(0, point.x)),
    y: Math.min(height, Math.max(0, point.y)),
    pressure: point.pressure,
  };
}

/** Expands a stroke's input samples into a closed variable-width outline polygon. */
export function strokeOutline(stroke: InkStroke): number[][] {
  return getStroke(
    stroke.points.map((point) => [point.x, point.y, point.pressure]),
    { ...STROKE_OPTIONS, simulatePressure: stroke.simulatePressure },
  );
}

/**
 * Fills one outline polygon using the midpoint quadratic-curve technique from
 * the perfect-freehand docs, translated from SVG path data to canvas calls.
 */
export function fillOutline(context: InkPathContext, outline: number[][], color: string) {
  if (outline.length === 0) return;
  context.fillStyle = color;
  context.beginPath();
  context.moveTo(outline[0][0], outline[0][1]);
  for (let index = 1; index < outline.length; index += 1) {
    const point = outline[index];
    const next = outline[(index + 1) % outline.length];
    context.quadraticCurveTo(point[0], point[1], (point[0] + next[0]) / 2, (point[1] + next[1]) / 2);
  }
  context.closePath();
  context.fill();
}

/** Paints every stroke onto the given context in draw order. */
export function renderInk(context: InkPathContext, strokes: InkStroke[]) {
  for (const stroke of strokes) fillOutline(context, strokeOutline(stroke), stroke.color);
}

export type InkBounds = { left: number; top: number; width: number; height: number };

/** The ink's extent including stroke width (measured on outlines, not raw input points). */
export function inkBounds(strokes: InkStroke[]): InkBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const stroke of strokes) {
    for (const [x, y] of strokeOutline(stroke)) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (minX === Infinity) return null;
  return {
    left: minX,
    top: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

const EXPORT_PADDING = 12;
const EXPORT_SCALE = 2;

export type InkExport = { dataUrl: string; width: number; height: number };

/**
 * Renders the strokes to a transparent PNG cropped to the ink bounds plus a
 * small margin, at 2x. Cropping keeps the placed signature tight around the
 * ink instead of carrying the whole pad's empty margins into its placement
 * box; the 2x scale keeps it crisp when resized on the page.
 */
export function exportInkPng(strokes: InkStroke[]): InkExport | null {
  const bounds = inkBounds(strokes);
  if (!bounds) return null;
  const width = Math.ceil((bounds.width + EXPORT_PADDING * 2) * EXPORT_SCALE);
  const height = Math.ceil((bounds.height + EXPORT_PADDING * 2) * EXPORT_SCALE);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.setTransform(
    EXPORT_SCALE,
    0,
    0,
    EXPORT_SCALE,
    (EXPORT_PADDING - bounds.left) * EXPORT_SCALE,
    (EXPORT_PADDING - bounds.top) * EXPORT_SCALE,
  );
  renderInk(context, strokes);
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL("image/png");
  } catch {
    return null;
  }
  // Same shape safeImageSrc accepts at render time — a PNG data URL that is
  // not base64-encoded would be persisted here only to be dropped by every
  // <img> overlay later.
  if (!/^data:image\/png;base64,/i.test(dataUrl)) return null;
  return { dataUrl, width, height };
}
