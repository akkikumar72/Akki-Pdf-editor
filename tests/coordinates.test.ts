import { describe, expect, it } from "vitest";
import { pdfRectToViewport, viewportRectToPdf } from "../src/utils/coordinates";

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
});
