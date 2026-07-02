import type { PointerEvent as ReactPointerEvent } from "react";
import type { ViewportRect } from "../types/editor";

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

type HandleConfig = {
  key: ResizeHandle;
  cursor: string;
  left: string;
  top: string;
};

const HANDLES: HandleConfig[] = [
  { key: "nw", cursor: "nwse-resize", left: "0%", top: "0%" },
  { key: "n", cursor: "ns-resize", left: "50%", top: "0%" },
  { key: "ne", cursor: "nesw-resize", left: "100%", top: "0%" },
  { key: "e", cursor: "ew-resize", left: "100%", top: "50%" },
  { key: "se", cursor: "nwse-resize", left: "100%", top: "100%" },
  { key: "s", cursor: "ns-resize", left: "50%", top: "100%" },
  { key: "sw", cursor: "nesw-resize", left: "0%", top: "100%" },
  { key: "w", cursor: "ew-resize", left: "0%", top: "50%" },
];

// Below this edge length (viewport px) the midpoint handle on that edge is
// dropped: on small overlays (checkbox marks, small shapes) eight 12px handles
// collapse into a 3x3 grid that completely hides the element being edited.
// Corners alone keep the element visible and still allow resizing on both axes.
const EDGE_HANDLE_MIN_SPAN_PX = 36;

// Below this size (either axis, viewport px) the corner handles move fully
// OUTSIDE the frame so a checkbox-sized overlay is ringed by its grips instead
// of buried under them.
const COMPACT_FRAME_MAX_PX = 28;

type ResizeHandlesProps = {
  rect: ViewportRect;
  /** True while the user drags/resizes the overlay: handles hide (reference
   *  behavior) so the content stays visible; the frame outline keeps showing
   *  the live bounds. */
  interacting?: boolean;
  onResizeStart: (handle: ResizeHandle, event: ReactPointerEvent<HTMLDivElement>) => void;
};

function visibleHandles(rect: ViewportRect): HandleConfig[] {
  const showTopBottomMidpoints = rect.width >= EDGE_HANDLE_MIN_SPAN_PX;
  const showLeftRightMidpoints = rect.height >= EDGE_HANDLE_MIN_SPAN_PX;
  return HANDLES.filter((handle) => {
    if (handle.key === "n" || handle.key === "s") return showTopBottomMidpoints;
    if (handle.key === "e" || handle.key === "w") return showLeftRightMidpoints;
    return true;
  });
}

export function ResizeHandles({ rect, interacting = false, onResizeStart }: ResizeHandlesProps) {
  const compact = rect.width < COMPACT_FRAME_MAX_PX || rect.height < COMPACT_FRAME_MAX_PX;
  const frameClass = `resize-frame${compact ? " is-compact" : ""}${interacting ? " is-interacting" : ""}`;
  return (
    <div
      className={frameClass}
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      aria-hidden="true"
    >
      {visibleHandles(rect).map((handle) => (
        <div
          key={handle.key}
          className="resize-handle"
          data-handle={handle.key}
          style={{ left: handle.left, top: handle.top, cursor: handle.cursor }}
          onPointerDown={(event) => {
            event.stopPropagation();
            onResizeStart(handle.key, event);
          }}
        />
      ))}
    </div>
  );
}
