import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clampInkPoint,
  exportInkPng,
  fillOutline,
  inkBounds,
  renderInk,
  strokeOutline,
  type InkPathContext,
  type InkStroke,
} from "../src/utils/signatureInk";

function stroke(
  points: Array<[number, number]>,
  color = "#000000",
  simulatePressure = true,
  pressure = 0.5,
): InkStroke {
  return { points: points.map(([x, y]) => ({ x, y, pressure })), color, simulatePressure };
}

function mockPathContext() {
  return {
    fillStyle: "#000000",
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
  } satisfies InkPathContext & Record<string, unknown>;
}

describe("strokeOutline", () => {
  it("expands a multi-point stroke into a closed variable-width polygon", () => {
    const outline = strokeOutline(stroke([[10, 10], [40, 30], [90, 20]]));
    expect(outline.length).toBeGreaterThan(3);
    for (const point of outline) expect(point.length).toBeGreaterThanOrEqual(2);
  });

  it("turns a bare tap (single point) into a dot outline", () => {
    const outline = strokeOutline(stroke([[25, 25]]));
    expect(outline.length).toBeGreaterThan(3);
  });

  it("respects real pen pressure when simulation is off", () => {
    // Same path, different reported pressure: the harder stroke must produce a
    // measurably fatter outline, proving the pressure input is not ignored.
    const points: Array<[number, number]> = [[10, 80], [110, 80], [210, 80]];
    const soft = inkBounds([stroke(points, "#000000", false, 0.1)]);
    const hard = inkBounds([stroke(points, "#000000", false, 0.9)]);
    expect(soft).not.toBeNull();
    expect(hard).not.toBeNull();
    expect(hard!.height).toBeGreaterThan(soft!.height);
  });
});

describe("clampInkPoint", () => {
  it("passes through points inside the pad and preserves pressure", () => {
    expect(clampInkPoint({ x: 12, y: 34, pressure: 0.7 }, 440, 160)).toEqual({ x: 12, y: 34, pressure: 0.7 });
  });

  it("clamps runaway pointer-capture coordinates to the pad bounds", () => {
    expect(clampInkPoint({ x: -50, y: 4000, pressure: 0.5 }, 440, 160)).toEqual({ x: 0, y: 160, pressure: 0.5 });
    expect(clampInkPoint({ x: 9999, y: -1, pressure: 0.5 }, 440, 160)).toEqual({ x: 440, y: 0, pressure: 0.5 });
  });
});

describe("fillOutline / renderInk", () => {
  it("traces the outline with midpoint quadratic curves and fills it in the stroke color", () => {
    const context = mockPathContext();
    const outline = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ];
    fillOutline(context, outline, "#2b4ea1");
    expect(context.fillStyle).toBe("#2b4ea1");
    expect(context.beginPath).toHaveBeenCalledTimes(1);
    expect(context.moveTo).toHaveBeenCalledWith(0, 0);
    // One curve per remaining outline point, the last wrapping back to the start.
    expect(context.quadraticCurveTo).toHaveBeenCalledTimes(3);
    expect(context.quadraticCurveTo).toHaveBeenLastCalledWith(0, 10, 0, 5);
    expect(context.closePath).toHaveBeenCalledTimes(1);
    expect(context.fill).toHaveBeenCalledTimes(1);
  });

  it("ignores an empty outline", () => {
    const context = mockPathContext();
    fillOutline(context, [], "#000000");
    expect(context.beginPath).not.toHaveBeenCalled();
    expect(context.fill).not.toHaveBeenCalled();
  });

  it("renders every stroke in order, keeping each stroke's own color", () => {
    const context = mockPathContext();
    renderInk(context, [stroke([[0, 0], [20, 10]], "#000000"), stroke([[5, 5], [30, 25]], "#4d6de6")]);
    expect(context.fill).toHaveBeenCalledTimes(2);
    expect(context.fillStyle).toBe("#4d6de6");
  });
});

describe("inkBounds", () => {
  it("returns null when nothing was drawn", () => {
    expect(inkBounds([])).toBeNull();
  });

  it("covers the ink extent of all strokes, including stroke width", () => {
    const bounds = inkBounds([stroke([[20, 20], [60, 40]]), stroke([[100, 80], [140, 90]])]);
    expect(bounds).not.toBeNull();
    // Outlines bulge past the raw input points by the stroke radius.
    expect(bounds!.left).toBeLessThan(20);
    expect(bounds!.top).toBeLessThan(20);
    expect(bounds!.width).toBeGreaterThan(140 - 20);
    expect(bounds!.height).toBeGreaterThan(90 - 20);
  });
});

describe("exportInkPng", () => {
  let context2d: Record<string, unknown> | null;
  let toDataUrlValue: string;
  let toDataUrlThrows: boolean;

  beforeEach(() => {
    context2d = { ...mockPathContext(), setTransform: vi.fn() };
    toDataUrlValue = "data:image/png;base64,INK";
    toDataUrlThrows = false;
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => context2d,
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.toDataURL = vi.fn(() => {
      if (toDataUrlThrows) throw new Error("tainted");
      return toDataUrlValue;
    }) as typeof HTMLCanvasElement.prototype.toDataURL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the strokes into a cropped, 2x-scaled PNG", () => {
    const exported = exportInkPng([stroke([[100, 60], [180, 90]])]);
    expect(exported).not.toBeNull();
    expect(exported!.dataUrl).toBe("data:image/png;base64,INK");
    // Cropped to the ink bounds (~80x30 plus stroke width and padding) at 2x —
    // far smaller than the full 440x160 pad at 2x.
    expect(exported!.width).toBeGreaterThan(160);
    expect(exported!.width).toBeLessThan(300);
    expect(exported!.height).toBeGreaterThan(60);
    expect(exported!.height).toBeLessThan(160);
    expect((context2d as Record<string, unknown>).setTransform).toHaveBeenCalledTimes(1);
    expect((context2d as Record<string, unknown>).fill).toHaveBeenCalledTimes(1);
  });

  it("returns null when nothing was drawn", () => {
    expect(exportInkPng([])).toBeNull();
  });

  it("returns null when no 2D context is available", () => {
    context2d = null;
    expect(exportInkPng([stroke([[10, 10], [40, 20]])])).toBeNull();
  });

  it("returns null when the canvas cannot be serialized or lies about its format", () => {
    toDataUrlThrows = true;
    expect(exportInkPng([stroke([[10, 10], [40, 20]])])).toBeNull();

    toDataUrlThrows = false;
    toDataUrlValue = "data:,";
    expect(exportInkPng([stroke([[10, 10], [40, 20]])])).toBeNull();

    // A PNG data URL without base64 encoding would be dropped by safeImageSrc
    // at render time, so the export must reject it too.
    toDataUrlValue = "data:image/png,RAW";
    expect(exportInkPng([stroke([[10, 10], [40, 20]])])).toBeNull();
  });
});
