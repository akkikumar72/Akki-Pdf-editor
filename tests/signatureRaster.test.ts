import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rasterizeTypedSignature } from "../src/utils/signatureRaster";

let context2d: Record<string, unknown> | null;
let toDataUrlValue: string;
let toDataUrlThrows: boolean;

beforeEach(() => {
  context2d = {
    measureText: vi.fn(() => ({ width: 150 })),
    fillText: vi.fn(),
  };
  toDataUrlValue = "data:image/png;base64,SIG";
  toDataUrlThrows = false;
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => context2d,
  ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => {
    if (toDataUrlThrows) throw new Error("tainted");
    return toDataUrlValue;
  }) as typeof HTMLCanvasElement.prototype.toDataURL;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("rasterizeTypedSignature", () => {
  it("renders the value with the requested font and color and returns a sized PNG", () => {
    const result = rasterizeTypedSignature("Akki", '"Caveat", cursive', "#333333");
    expect(result).toEqual({
      dataUrl: "data:image/png;base64,SIG",
      // measured 150 + 24px padding either side
      width: 198,
      height: Math.ceil(64 * 1.6),
    });
    expect(context2d?.fillText).toHaveBeenCalledWith("Akki", 24, expect.any(Number));
  });

  it("returns null when no 2D context is available", () => {
    context2d = null;
    expect(rasterizeTypedSignature("Akki", "cursive", "#000")).toBeNull();
  });

  it("returns null when toDataURL throws", () => {
    toDataUrlThrows = true;
    expect(rasterizeTypedSignature("Akki", "cursive", "#000")).toBeNull();
  });

  it("returns null when the canvas produces a non-PNG payload", () => {
    toDataUrlValue = "data:,";
    expect(rasterizeTypedSignature("Akki", "cursive", "#000")).toBeNull();
  });
});
