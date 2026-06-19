import type { ViewportRect } from "../types/editor";

export const TOOLBAR_GAP_PX = 12;
export const TOOLBAR_FALLBACK_HEIGHT_PX = 34;
export const TOOLBAR_EDGE_MARGIN_PX = 8;

export function clampToolbarLeft(left: number, toolbarWidth: number, stageWidth: number, _textRect: ViewportRect) {
  // Prefer aligning the toolbar's left edge with the selected overlay (Sejda-style)
  // and never re-center it just because it is wider than the text. But the toolbar
  // must stay inside the page: when it would spill past the right (or left) edge,
  // slide it inward so its full width remains within the page bounds.
  const margin = TOOLBAR_EDGE_MARGIN_PX;
  const maxLeft = stageWidth - toolbarWidth - margin;
  // Toolbar is wider than the page (very small page / large zoom-out): pin to the left.
  if (maxLeft <= margin) return margin;
  return Math.min(Math.max(margin, left), maxLeft);
}

export function getToolbarPlacement(rect: ViewportRect, toolbarWidth: number, toolbarHeight: number) {
  const shouldPlaceBelow = rect.top < toolbarHeight + TOOLBAR_GAP_PX + 8;
  return {
    left: rect.left,
    top: shouldPlaceBelow ? rect.top + rect.height + TOOLBAR_GAP_PX : rect.top - toolbarHeight - TOOLBAR_GAP_PX,
    placement: shouldPlaceBelow ? "below" : "above",
  };
}
