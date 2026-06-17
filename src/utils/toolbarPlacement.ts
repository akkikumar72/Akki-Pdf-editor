import type { ViewportRect } from "../types/editor";

export const TOOLBAR_GAP_PX = 12;
export const TOOLBAR_FALLBACK_HEIGHT_PX = 34;

export function clampToolbarLeft(left: number, _toolbarWidth: number, _pageWidth: number, _textRect: ViewportRect) {
  // Keep the toolbar left edge aligned with the selected overlay (Sejda-style).
  // Do not re-center or slide the toolbar toward the page edge when it is wider than the text.
  return Math.max(8, left);
}

export function getToolbarPlacement(rect: ViewportRect, toolbarWidth: number, toolbarHeight: number) {
  const shouldPlaceBelow = rect.top < toolbarHeight + TOOLBAR_GAP_PX + 8;
  return {
    left: rect.left,
    top: shouldPlaceBelow ? rect.top + rect.height + TOOLBAR_GAP_PX : rect.top - toolbarHeight - TOOLBAR_GAP_PX,
    placement: shouldPlaceBelow ? "below" : "above",
  };
}
