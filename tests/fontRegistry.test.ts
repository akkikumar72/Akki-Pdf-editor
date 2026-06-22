import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cssFamilyForFontKey,
  ensureEmbeddedFontLoaded,
  registerEmbeddedFont,
} from "../src/engine/fontRegistry";

const bytes = (n = 8) => new Uint8Array(Array.from({ length: n }, (_, i) => i + 1));

// Helpers to install/remove a fake FontFace + document.fonts so the load path
// (which jsdom does not provide) can be exercised deterministically.
function installFontFace(loadImpl: () => Promise<unknown>) {
  const added: unknown[] = [];
  class FakeFontFace {
    constructor(
      public family: string,
      public source: unknown,
    ) {}
    load = loadImpl;
  }
  (globalThis as Record<string, unknown>).FontFace = FakeFontFace as unknown;
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { add: (f: unknown) => added.push(f) },
  });
  return added;
}

function uninstallFontFace() {
  delete (globalThis as Record<string, unknown>).FontFace;
  // jsdom has no own "fonts" prop by default; deleting the one we defined restores that.
  delete (document as unknown as Record<string, unknown>).fonts;
}

afterEach(() => {
  uninstallFontFace();
  vi.restoreAllMocks();
});

describe("font registry", () => {
  it("derives a stable, CSS-safe family name from a font key", () => {
    expect(cssFamilyForFontKey("g_d0_f4")).toBe("akkiembed-g_d0_f4");
    expect(cssFamilyForFontKey("UberMove-Bold")).toBe("akkiembed-UberMove-Bold");
    expect(cssFamilyForFontKey("ABCDEF+Font Name,Bold")).toBe("akkiembed-ABCDEF-Font-Name-Bold");
  });

  it("ignores missing keys or empty byte buffers (registerEmbeddedFont)", () => {
    expect(registerEmbeddedFont(undefined, bytes())).toBeUndefined();
    expect(registerEmbeddedFont("k", undefined)).toBeUndefined();
    expect(registerEmbeddedFont("k", new Uint8Array(0))).toBeUndefined();
  });

  it("ignores missing keys or empty byte buffers (ensureEmbeddedFontLoaded)", async () => {
    await expect(ensureEmbeddedFontLoaded(undefined, bytes())).resolves.toBeUndefined();
    await expect(ensureEmbeddedFontLoaded("k", undefined)).resolves.toBeUndefined();
    await expect(ensureEmbeddedFontLoaded("k", new Uint8Array(0))).resolves.toBeUndefined();
  });

  it("returns undefined when FontFace is unavailable (jsdom default)", async () => {
    // No FontFace installed here.
    await expect(ensureEmbeddedFontLoaded("no-fontface-key", bytes())).resolves.toBeUndefined();
  });

  it("registers a font on successful FontFace load and caches it", async () => {
    const loaded = {};
    const added = installFontFace(() => Promise.resolve(loaded));
    const key = "ok-key-1";
    const family = cssFamilyForFontKey(key);

    // Optimistic return without awaiting load.
    expect(registerEmbeddedFont(key, bytes())).toBe(family);
    // Awaiting resolves to the same family.
    await expect(ensureEmbeddedFontLoaded(key, bytes())).resolves.toBe(family);
    expect(added).toContain(loaded);

    // Cached: a subsequent register returns the family without re-loading.
    expect(registerEmbeddedFont(key, bytes())).toBe(family);
    await expect(ensureEmbeddedFontLoaded(key, bytes())).resolves.toBe(family);
  });

  it("caches a failed load as unusable", async () => {
    installFontFace(() => Promise.reject(new Error("bad font")));
    const key = "fail-key-1";

    await expect(ensureEmbeddedFontLoaded(key, bytes())).resolves.toBeUndefined();
    // Cached failure ("" in the registry) -> still undefined, both entry points.
    await expect(ensureEmbeddedFontLoaded(key, bytes())).resolves.toBeUndefined();
    expect(registerEmbeddedFont(key, bytes())).toBeUndefined();
  });

  it("shares a single in-flight promise for concurrent loads of the same key", async () => {
    let resolveLoad: (v: unknown) => void = () => {};
    let calls = 0;
    installFontFace(() => {
      calls += 1;
      return new Promise((res) => {
        resolveLoad = res;
      });
    });
    const key = "concurrent-key-1";

    const p1 = ensureEmbeddedFontLoaded(key, bytes());
    const p2 = ensureEmbeddedFontLoaded(key, bytes());
    resolveLoad({});
    const [r1, r2] = await Promise.all([p1, p2]);
    const family = cssFamilyForFontKey(key);
    expect(r1).toBe(family);
    expect(r2).toBe(family);
    // The FontFace.load constructor path ran only once for the shared promise.
    expect(calls).toBe(1);
  });
});
