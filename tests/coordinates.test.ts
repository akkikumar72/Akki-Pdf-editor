import { describe, expect, it } from "vitest";
import {
  clampRect,
  pdfPointToViewport,
  pdfRectToViewport,
  viewportPointToPdf,
  viewportRectToPdf,
} from "../src/utils/coordinates";

describe("coordinate conversion", () => {
  it("round trips viewport rects through PDF coordinates", () => {
    const viewport = { left: 120, top: 80, width: 240, height: 42 };
    const pdf = viewportRectToPdf(viewport, 792, 1.5);
    const actual = pdfRectToViewport(pdf, 792, 1.5);
    expect(actual.left).toBeCloseTo(viewport.left);
    expect(actual.top).toBeCloseTo(viewport.top);
    expect(actual.width).toBeCloseTo(viewport.width);
    expect(actual.height).toBeCloseTo(viewport.height);
  });

  it("round trips points through PDF coordinates", () => {
    const point = { x: 50, y: 120 };
    const pdf = viewportPointToPdf(point, 792, 2);
    expect(pdf).toEqual({ x: 25, y: 792 - 60 });
    const back = pdfPointToViewport(pdf, 792, 2);
    expect(back.x).toBeCloseTo(point.x);
    expect(back.y).toBeCloseTo(point.y);
  });

  it("clamps a rect within the page bounds and minimum size", () => {
    const clamped = clampRect({ x: -10, y: -20, width: 5000, height: 6000 }, 612, 792);
    expect(clamped).toEqual({ x: 0, y: 0, width: 612, height: 792 });
  });

  it("slides an off-edge rect back inside without resizing it", () => {
    const clamped = clampRect({ x: 600, y: 780, width: 100, height: 100 }, 612, 792);
    expect(clamped.x).toBe(612 - 100);
    expect(clamped.y).toBe(792 - 100);
    expect(clamped.width).toBe(100);
    expect(clamped.height).toBe(100);
  });
});
