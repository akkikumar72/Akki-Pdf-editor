import { describe, expect, it } from "vitest";
import { cssFamilyForFontKey, registerEmbeddedFont } from "../src/engine/fontRegistry";

describe("font registry", () => {
  it("derives a stable, CSS-safe family name from a font key", () => {
    expect(cssFamilyForFontKey("g_d0_f4")).toBe("akkiembed-g_d0_f4");
    expect(cssFamilyForFontKey("UberMove-Bold")).toBe("akkiembed-UberMove-Bold");
    // Unsafe characters in PostScript names are normalised so the value is a valid family.
    expect(cssFamilyForFontKey("ABCDEF+Font Name,Bold")).toBe("akkiembed-ABCDEF-Font-Name-Bold");
  });

  it("ignores missing keys or empty byte buffers", () => {
    expect(registerEmbeddedFont(undefined, new Uint8Array([1, 2, 3]))).toBeUndefined();
    expect(registerEmbeddedFont("k", undefined)).toBeUndefined();
    expect(registerEmbeddedFont("k", new Uint8Array(0))).toBeUndefined();
  });
});
