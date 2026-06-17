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

type ResizeHandlesProps = {
  rect: ViewportRect;
  onResizeStart: (handle: ResizeHandle, event: ReactPointerEvent<HTMLDivElement>) => void;
};

export function ResizeHandles({ rect, onResizeStart }: ResizeHandlesProps) {
  return (
    <div
      className="resize-frame"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
      aria-hidden="true"
      data-export-ignore=""
    >
      {HANDLES.map((handle) => (
        <div
          key={handle.key}
          className="resize-handle"
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
