import { describe, expect, it } from "vitest";
import { getToolHint } from "../src/editor/toolHints";

describe("toolHints", () => {
  it("returns the reference shape copy for every shape tool", () => {
    for (const tool of ["shape", "shape-ellipse", "shape-line", "shape-arrow"] as const) {
      const hint = getToolHint(tool);
      expect(hint?.armed).toBe("Add a shape by making an area selection on the page");
      expect(hint?.drawing).toBe("Click and drag to draw the shape");
    }
  });

  it("provides an armed-only hint for point tools", () => {
    expect(getToolHint("image")?.armed).toBe("Click a location on the page to add image");
    expect(getToolHint("image")?.drawing).toBeUndefined();
  });

  it("returns undefined for tools without a hint", () => {
    expect(getToolHint("select")).toBeUndefined();
  });
});
