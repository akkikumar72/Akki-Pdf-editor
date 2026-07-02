/** Viewport-pixel bounding box a freshly placed image is scaled into. */
export const IMAGE_PLACEMENT_MAX = { width: 320, height: 240 };
/** Fallback size when an image's natural dimensions cannot be read. */
export const IMAGE_PLACEMENT_FALLBACK = { width: 180, height: 120 };

/** Bounding box a placed signature is scaled into. */
export const SIGNATURE_PLACEMENT_MAX = { width: 260, height: 110 };
export const SIGNATURE_PLACEMENT_FALLBACK = { width: 200, height: 64 };

export type ImageBoxSize = { width: number; height: number };

/**
 * Scales natural pixel dimensions into a max box preserving aspect ratio.
 * Never upscales (a small icon stays its natural size); unusable dimensions
 * resolve to the provided fallback.
 */
export function fitImageIntoBox(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number,
  maxHeight: number,
  fallback: ImageBoxSize,
): ImageBoxSize {
  if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) || naturalWidth <= 0 || naturalHeight <= 0) {
    return { ...fallback };
  }
  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  };
}

/** Reads an image's natural dimensions from a (data) URL; null when it cannot load. */
export function loadImageSize(src: string): Promise<ImageBoxSize | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = src;
  });
}
