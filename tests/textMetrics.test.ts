import { describe, expect, it } from "vitest";
import {
  padReplacementCoverRect,
  replacementCoverPadding,
  textBaselineDrawY,
  textBaselineTopPaddingPx,
  viewportRectsOverlap,
} from "../src/utils/textMetrics";

describe("textMetrics", () => {
  it("pads cover rects downward in viewport space", () => {
    const rect = { x: 72, y: 700, width: 30, height: 14 };
    const padded = padReplacementCoverRect(rect, 14);
    const pad = replacementCoverPadding(14);

    expect(padded.y).toBeLessThan(rect.y);
    expect(padded.height).toBeGreaterThan(rect.height);
    expect(padded.y).toBe(rect.y - pad * 1.2);
    expect(padded.height).toBe(rect.height + pad * 0.8);
  });

  it("computes baseline draw y from the bottom of the PDF rect", () => {
    const rect = { x: 10, y: 100, width: 40, height: 14 };
    expect(textBaselineDrawY(rect, 14)).toBe(100 + 14 * 0.22);
  });

  it("clamps baseline top padding to zero when the box is not taller than the em-box", () => {
    // Regression: deriving the box height from fontSize made this always return 0.
    expect(textBaselineTopPaddingPx(14, 14, 1)).toBe(0);
  });

  it("adds top padding proportional to how much taller the box is than the em-box", () => {
    const boxHeightPx = 20;
    const fontSize = 14;
    const scale = 1;
    const pad = textBaselineTopPaddingPx(boxHeightPx, fontSize, scale);
    expect(pad).toBeGreaterThan(0);
    expect(pad).toBeCloseTo(boxHeightPx - fontSize * 0.22 * scale - fontSize * 0.88 * scale, 6);
  });

  it("scales baseline padding with the render scale", () => {
    expect(textBaselineTopPaddingPx(40, 14, 2)).toBeCloseTo(40 - 14 * 0.22 * 2 - 14 * 0.88 * 2, 6);
  });

  it("detects viewport overlap for text-layer suppression", () => {
    expect(
      viewportRectsOverlap(
        { left: 0, top: 0, width: 20, height: 14 },
        { left: 5, top: 2, width: 20, height: 14 },
      ),
    ).toBe(true);
    expect(
      viewportRectsOverlap(
        { left: 0, top: 0, width: 10, height: 10 },
        { left: 100, top: 100, width: 10, height: 10 },
      ),
    ).toBe(false);
  });
});
