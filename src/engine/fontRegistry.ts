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

// key -> css family once load succeeded, "" once load failed.
const registered = new Map<string, string>();
const loadPromises = new Map<string, Promise<string | undefined>>();

export function cssFamilyForFontKey(key: string): string {
  return `${FAMILY_PREFIX}${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function canRegisterFont(): boolean {
  return typeof FontFace !== "undefined" && typeof document !== "undefined";
}

async function loadEmbeddedFont(key: string, bytes: Uint8Array): Promise<string | undefined> {
  if (!canRegisterFont()) return undefined;

  const existing = registered.get(key);
  if (existing !== undefined) return existing || undefined;

  const pending = loadPromises.get(key);
  if (pending) return pending;

  const cssFamily = cssFamilyForFontKey(key);
  const promise = (async () => {
    try {
      const face = new FontFace(cssFamily, bytes as BufferSource);
      const loaded = await face.load();
      document.fonts.add(loaded);
      registered.set(key, cssFamily);
      return cssFamily;
    } catch {
      registered.set(key, "");
      return undefined;
    } finally {
      // Drop the in-flight entry once settled; the result is cached in `registered`,
      // so the map only holds genuinely pending loads instead of growing forever.
      loadPromises.delete(key);
    }
  })();
  loadPromises.set(key, promise);
  return promise;
}

/**
 * Kick off (once) loading the embedded font for a key. Safe to call repeatedly and
 * during effects. Returns the css family name optimistically, or undefined when it
 * cannot be used. Does not wait for FontFace.load() to finish.
 */
export function registerEmbeddedFont(key: string | undefined, bytes: Uint8Array | undefined): string | undefined {
  if (!key || !bytes || bytes.byteLength === 0) return undefined;

  const existing = registered.get(key);
  if (existing !== undefined) return existing || undefined;

  void loadEmbeddedFont(key, bytes);
  return cssFamilyForFontKey(key);
}

/** Await embedded font registration; resolves to the CSS family or undefined. */
export async function ensureEmbeddedFontLoaded(
  key: string | undefined,
  bytes: Uint8Array | undefined,
): Promise<string | undefined> {
  if (!key || !bytes || bytes.byteLength === 0) return undefined;
  return loadEmbeddedFont(key, bytes);
}
