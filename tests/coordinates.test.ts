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

  it("round trips a viewport point through PDF coordinates", () => {
    const point = { x: 90, y: 120 };
    const pdf = viewportPointToPdf(point, 792, 2);
    expect(pdf).toEqual({ x: 45, y: 792 - 60 });
    const back = pdfPointToViewport(pdf, 792, 2);
    expect(back.x).toBeCloseTo(point.x);
    expect(back.y).toBeCloseTo(point.y);
  });

  it("clamps a rect inside the page bounds", () => {
    const clamped = clampRect({ x: -10, y: -20, width: 50, height: 60 }, 100, 200);
    expect(clamped).toEqual({ x: 0, y: 0, width: 50, height: 60 });
  });

  it("clamps oversized rects to the page size and floors dimensions at 1", () => {
    const clamped = clampRect({ x: 9999, y: 9999, width: 9999, height: 9999 }, 100, 200);
    expect(clamped.width).toBe(100);
    expect(clamped.height).toBe(200);
    expect(clamped.x).toBe(0);
    expect(clamped.y).toBe(0);
  });

  it("floors width and height at a minimum of 1", () => {
    const clamped = clampRect({ x: 5, y: 5, width: 0, height: -3 }, 100, 200);
    expect(clamped.width).toBe(1);
    expect(clamped.height).toBe(1);
    expect(clamped.x).toBe(5);
    expect(clamped.y).toBe(5);
  });
});
