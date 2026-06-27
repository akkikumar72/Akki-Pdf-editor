// Tracks the most recent pointer-down location so a text overlay that starts
// editing can drop its caret where the user clicked (reference parity), rather than
// always collapsing to the start of the run. The initiating click is always the
// last pointer-down before editing begins, so a single global listener covers
// every entry point (text-hit click, overlay click, double-click).

type Point = { x: number; y: number };

let lastPointerDownPoint: Point | null = null;

if (typeof window !== "undefined") {
  window.addEventListener(
    "pointerdown",
    (event) => {
      lastPointerDownPoint = { x: event.clientX, y: event.clientY };
    },
    true,
  );
}

export function getLastPointerDownPoint(): Point | null {
  return lastPointerDownPoint;
}

type CaretPositionLike = { offsetNode: Node; offset: number };

type DocumentWithCaret = Document & {
  caretPositionFromPoint?: (x: number, y: number) => CaretPositionLike | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

/** Resolve a collapsed Range at viewport coordinates, spanning both the
 *  standard (`caretPositionFromPoint`) and WebKit/Blink (`caretRangeFromPoint`)
 *  APIs. Returns null when neither is available or the point hits nothing. */
export function caretRangeFromClientPoint(x: number, y: number): Range | null {
  const doc = document as DocumentWithCaret;
  if (typeof doc.caretRangeFromPoint === "function") {
    return doc.caretRangeFromPoint(x, y);
  }
  if (typeof doc.caretPositionFromPoint === "function") {
    const position = doc.caretPositionFromPoint(x, y);
    if (!position) return null;
    const range = document.createRange();
    range.setStart(position.offsetNode, position.offset);
    range.collapse(true);
    return range;
  }
  return null;
}
