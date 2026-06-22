import type { EditorTool } from "../types/editor";
import { getToolHint } from "../editor/toolHints";

type CanvasHintBannerProps = {
  tool: EditorTool;
  drawing: boolean;
  offPage?: boolean;
};

/**
 * Sejda-style in-page activation banner. Pinned to the top of the page stage,
 * it tells the user how to perform the current tool's action and switches copy
 * once they start a drag-to-draw. Driven purely by active-tool + drag state.
 */
export function CanvasHintBanner({ tool, drawing, offPage = false }: CanvasHintBannerProps) {
  const hint = getToolHint(tool);
  if (!hint) return null;

  const message = offPage
    ? "Looks like you clicked outside the page? Please try clicking a location inside the page"
    : drawing && hint.drawing
      ? hint.drawing
      : hint.armed;

  return (
    <div className="canvas-hint" role="status" aria-live="polite" data-drawing={drawing ? "true" : undefined}>
      <span className="canvas-hint__message">{message}</span>
      {drawing ? <span className="canvas-hint__esc">Press ESC to cancel</span> : null}
    </div>
  );
}
