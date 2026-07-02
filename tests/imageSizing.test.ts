import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fitImageIntoBox,
  IMAGE_PLACEMENT_FALLBACK,
  IMAGE_PLACEMENT_MAX,
  loadImageSize,
} from "../src/utils/imageSizing";

const FALLBACK = { width: 180, height: 120 };

describe("fitImageIntoBox", () => {
  it("scales a large landscape image down preserving aspect", () => {
    expect(fitImageIntoBox(640, 480, 320, 240, FALLBACK)).toEqual({ width: 320, height: 240 });
    expect(fitImageIntoBox(1000, 250, 320, 240, FALLBACK)).toEqual({ width: 320, height: 80 });
  });

  it("scales a tall portrait image by the height constraint", () => {
    expect(fitImageIntoBox(300, 900, 320, 240, FALLBACK)).toEqual({ width: 80, height: 240 });
  });

  it("never upscales a small image", () => {
    expect(fitImageIntoBox(100, 50, 320, 240, FALLBACK)).toEqual({ width: 100, height: 50 });
  });

  it("clamps rounded dimensions to at least 1px", () => {
    expect(fitImageIntoBox(1, 1000, 320, 240, FALLBACK)).toEqual({ width: 1, height: 240 });
  });

  it("falls back for unusable dimensions", () => {
    expect(fitImageIntoBox(0, 480, 320, 240, FALLBACK)).toEqual(FALLBACK);
    expect(fitImageIntoBox(640, -1, 320, 240, FALLBACK)).toEqual(FALLBACK);
    expect(fitImageIntoBox(Number.NaN, 480, 320, 240, FALLBACK)).toEqual(FALLBACK);
    expect(fitImageIntoBox(640, Number.POSITIVE_INFINITY, 320, 240, FALLBACK)).toEqual(FALLBACK);
  });

  it("exports the placement constants used by the canvas", () => {
    expect(IMAGE_PLACEMENT_MAX.width).toBeGreaterThan(0);
    expect(IMAGE_PLACEMENT_FALLBACK).toEqual({ width: 180, height: 120 });
  });
});

describe("loadImageSize", () => {
  const OriginalImage = globalThis.Image;

  afterEach(() => {
    globalThis.Image = OriginalImage;
    vi.restoreAllMocks();
  });

  it("resolves natural dimensions on load", async () => {
    globalThis.Image = class {
      naturalWidth = 800;
      naturalHeight = 600;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    } as unknown as typeof Image;
    await expect(loadImageSize("data:image/png;base64,AAAA")).resolves.toEqual({ width: 800, height: 600 });
  });

  it("resolves null on error", async () => {
    globalThis.Image = class {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    } as unknown as typeof Image;
    await expect(loadImageSize("data:image/png;base64,broken")).resolves.toBeNull();
  });
});
