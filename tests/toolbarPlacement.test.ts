import { describe, expect, it } from "vitest";
import {
  clampToolbarLeft,
  getToolbarPlacement,
  TOOLBAR_EDGE_MARGIN_PX,
  TOOLBAR_GAP_PX,
} from "../src/utils/toolbarPlacement";

const rect = { left: 0, top: 200, width: 160, height: 42 };

describe("clampToolbarLeft", () => {
  const stageWidth = 722; // 612 * 1.18, the app's default zoom
  const toolbarWidth = 413; // measured width of the text toolbar

  it("keeps the toolbar left-aligned with the overlay when it fits inside the page", () => {
    expect(clampToolbarLeft(120, toolbarWidth, stageWidth, rect)).toBe(120);
  });

  it("slides the toolbar inward so its right edge stays inside the page", () => {
    const left = clampToolbarLeft(520, toolbarWidth, stageWidth, rect);
    expect(left + toolbarWidth).toBeLessThanOrEqual(stageWidth - TOOLBAR_EDGE_MARGIN_PX);
    expect(left).toBe(stageWidth - toolbarWidth - TOOLBAR_EDGE_MARGIN_PX);
  });

  it("never lets the toolbar cross the left edge of the page", () => {
    expect(clampToolbarLeft(-50, toolbarWidth, stageWidth, rect)).toBe(TOOLBAR_EDGE_MARGIN_PX);
  });

  it("pins to the left margin when the toolbar is wider than the page", () => {
    expect(clampToolbarLeft(300, 900, stageWidth, rect)).toBe(TOOLBAR_EDGE_MARGIN_PX);
  });
});

describe("getToolbarPlacement", () => {
  it("places the toolbar above the overlay when there is room", () => {
    const placement = getToolbarPlacement({ left: 40, top: 300, width: 160, height: 42 }, 413, 34);
    expect(placement.placement).toBe("above");
    expect(placement.top).toBe(300 - 34 - TOOLBAR_GAP_PX);
  });

  it("flips below the overlay when it is too close to the top edge", () => {
    const overlay = { left: 40, top: 10, width: 160, height: 42 };
    const placement = getToolbarPlacement(overlay, 413, 34);
    expect(placement.placement).toBe("below");
    expect(placement.top).toBe(overlay.top + overlay.height + TOOLBAR_GAP_PX);
  });
});
