import type { EditorTool } from "../types/editor";
import { getToolHint } from "../editor/toolHints";

type CanvasHintBannerProps = {
  tool: EditorTool;
  drawing?: boolean;
  offPage?: boolean;
};

/**
 * In-page activation banner pinned to the bottom-centre of the canvas. Tells the
 * user how to perform the current tool's action (and switches copy once a
 * drag-to-draw starts). Styled on coss tokens; driven purely by the active tool.
 */
export function CanvasHintBanner({ tool, drawing = false, offPage = false }: CanvasHintBannerProps) {
  const hint = getToolHint(tool);
  if (!hint) return null;

  const message = offPage
    ? "Looks like you clicked outside the page? Please try clicking a location inside the page"
    : drawing && hint.drawing
      ? hint.drawing
      : hint.armed;

  return (
    <div
      className="pointer-events-none absolute bottom-6 left-1/2 z-30 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-foreground/90 px-3.5 py-1.5 font-medium text-background text-xs shadow-lg backdrop-blur"
      role="status"
      aria-live="polite"
      data-drawing={drawing ? "true" : undefined}
    >
      <span>{message}</span>
      {drawing ? <span className="border-background/30 border-l pl-2.5 font-normal opacity-85">Press ESC to cancel</span> : null}
    </div>
  );
}
