/**
 * Registers a document's extracted embedded font programs as live CSS faces so the
 * editor overlay can render replacement text with the original glyphs. The CSS family
 * name is deterministic from the font key, so styles can reference it before the
 * FontFace finishes loading; the browser swaps in the real glyphs once ready and
 * falls back to the bundled stack for any glyph the (often subsetted) font lacks.
 *
 * Bytes are passed directly as a BufferSource (no blob/data URL), so this does not
 * trigger any CSP font-src fetch.
 */

const FAMILY_PREFIX = "akkiembed-";

// key -> registration status: a css family string once attempted, "" if it failed.
const registered = new Map<string, string>();

export function cssFamilyForFontKey(key: string): string {
  return `${FAMILY_PREFIX}${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

/**
 * Kick off (once) loading the embedded font for a key. Safe to call repeatedly and
 * during effects. Returns the css family name, or undefined when it cannot be used.
 */
export function registerEmbeddedFont(key: string | undefined, bytes: Uint8Array | undefined): string | undefined {
  if (!key || !bytes || bytes.byteLength === 0) return undefined;
  if (typeof FontFace === "undefined" || typeof document === "undefined") return undefined;

  const existing = registered.get(key);
  if (existing !== undefined) return existing || undefined;

  const cssFamily = cssFamilyForFontKey(key);
  try {
    const face = new FontFace(cssFamily, bytes as BufferSource);
    registered.set(key, cssFamily);
    face
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
      })
      .catch(() => {
        registered.set(key, "");
      });
    return cssFamily;
  } catch {
    registered.set(key, "");
    return undefined;
  }
}
