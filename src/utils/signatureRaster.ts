export type RasterizedSignature = { dataUrl: string; width: number; height: number };

const FONT_SIZE = 64;
const PADDING = 24;

/**
 * Renders a typed signature to a PNG data URL. The handwriting faces are
 * web fonts with no embeddable TTF in the bundle, so exporting the typed text
 * through pdf-lib would silently substitute a standard font; rasterizing at
 * placement time keeps the exported PDF pixel-identical to the preview.
 * Returns null when the canvas 2D pipeline is unavailable, in which case the
 * caller falls back to a `mode: "typed"` operation.
 */
export function rasterizeTypedSignature(value: string, cssFamily: string, color: string): RasterizedSignature | null {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;
  const font = `${FONT_SIZE}px ${cssFamily}`;
  context.font = font;
  const width = Math.max(1, Math.ceil(context.measureText(value).width) + PADDING * 2);
  const height = Math.ceil(FONT_SIZE * 1.6);
  canvas.width = width;
  canvas.height = height;
  // Resizing the canvas resets the context state, so the text style must be reapplied.
  context.font = font;
  context.fillStyle = color;
  context.textBaseline = "middle";
  context.fillText(value, PADDING, height / 2);
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL("image/png");
  } catch {
    return null;
  }
  if (!/^data:image\/png/i.test(dataUrl)) return null;
  return { dataUrl, width, height };
}
