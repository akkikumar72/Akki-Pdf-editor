import { afterEach, describe, expect, it, vi } from "vitest";
import { cssFamilyForFontKey } from "../src/engine/fontRegistry";

describe("font registry — key derivation", () => {
  it("derives a stable, CSS-safe family name from a font key", () => {
    expect(cssFamilyForFontKey("g_d0_f4")).toBe("akkiembed-g_d0_f4");
    expect(cssFamilyForFontKey("UberMove-Bold")).toBe("akkiembed-UberMove-Bold");
    expect(cssFamilyForFontKey("ABCDEF+Font Name,Bold")).toBe("akkiembed-ABCDEF-Font-Name-Bold");
  });
});

// registerEmbeddedFont keeps a module-level cache, so each scenario imports a
// fresh copy of the module after stubbing the FontFace/document.fonts globals.
async function freshRegister() {
  vi.resetModules();
  return (await import("../src/engine/fontRegistry")).registerEmbeddedFont;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("registerEmbeddedFont", () => {
  it("ignores missing keys or empty byte buffers", async () => {
    const registerEmbeddedFont = await freshRegister();
    expect(registerEmbeddedFont(undefined, new Uint8Array([1, 2, 3]))).toBeUndefined();
    expect(registerEmbeddedFont("k", undefined)).toBeUndefined();
    expect(registerEmbeddedFont("k", new Uint8Array(0))).toBeUndefined();
  });

  it("returns undefined when FontFace is unavailable", async () => {
    vi.stubGlobal("FontFace", undefined);
    const registerEmbeddedFont = await freshRegister();
    expect(registerEmbeddedFont("k", new Uint8Array([1]))).toBeUndefined();
  });

  it("registers a face, adds it once loaded, and caches the result", async () => {
    const add = vi.fn();
    let resolveLoad: (face: unknown) => void = () => undefined;
    class FakeFontFace {
      family: string;
      constructor(family: string) {
        this.family = family;
      }
      load() {
        return new Promise((resolve) => {
          resolveLoad = resolve;
        });
      }
    }
    vi.stubGlobal("FontFace", FakeFontFace);
    vi.stubGlobal("document", { fonts: { add } });

    const registerEmbeddedFont = await freshRegister();
    const family = registerEmbeddedFont("key1", new Uint8Array([1, 2]));
    expect(family).toBe("akkiembed-key1");

    // Second call for the same key returns the cached family without re-registering.
    expect(registerEmbeddedFont("key1", new Uint8Array([1, 2]))).toBe("akkiembed-key1");

    resolveLoad({ family: "akkiembed-key1" });
    await Promise.resolve();
    await Promise.resolve();
    expect(add).toHaveBeenCalledOnce();
  });

  it("marks the key as failed and returns undefined on later lookups when loading rejects", async () => {
    let rejectLoad: (reason?: unknown) => void = () => undefined;
    class FailingFontFace {
      constructor(_family: string, _source: unknown) {
        void _family;
        void _source;
      }
      load() {
        return new Promise((_resolve, reject) => {
          rejectLoad = reject;
        });
      }
    }
    vi.stubGlobal("FontFace", FailingFontFace);
    vi.stubGlobal("document", { fonts: { add: vi.fn() } });

    const registerEmbeddedFont = await freshRegister();
    expect(registerEmbeddedFont("key2", new Uint8Array([1]))).toBe("akkiembed-key2");
    rejectLoad(new Error("load failed"));
    await Promise.resolve();
    await Promise.resolve();
    // After the failed load the cache holds "", so subsequent calls yield undefined.
    expect(registerEmbeddedFont("key2", new Uint8Array([1]))).toBeUndefined();
  });

  it("returns undefined when constructing the FontFace throws", async () => {
    class ThrowingFontFace {
      constructor() {
        throw new Error("bad font");
      }
    }
    vi.stubGlobal("FontFace", ThrowingFontFace);
    vi.stubGlobal("document", { fonts: { add: vi.fn() } });

    const registerEmbeddedFont = await freshRegister();
    expect(registerEmbeddedFont("key3", new Uint8Array([1]))).toBeUndefined();
    // Cached "" -> still undefined on the next call.
    expect(registerEmbeddedFont("key3", new Uint8Array([1]))).toBeUndefined();
  });
});
