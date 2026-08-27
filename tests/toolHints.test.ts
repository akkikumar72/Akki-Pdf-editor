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

  it("describes the new crop, redaction, eraser, marker, callout, Cross, and form gestures", () => {
    expect(getToolHint("crop")?.drawing).toContain("area to keep");
    expect(getToolHint("redact")?.armed).toContain("redact");
    expect(getToolHint("redact-area")?.drawing).toContain("redact");
    expect(getToolHint("erase")?.armed).toContain("added ink");
    expect(getToolHint("freehand-highlight")?.drawing).toContain("freehand");
    expect(getToolHint("callout")?.drawing).toContain("callout");
    expect(getToolHint("mark-cross")?.armed).toContain("page center");
    for (const tool of ["form-listbox", "form-checkbox", "form-button", "form-date"] as const) {
      expect(getToolHint(tool)?.armed).toBeTruthy();
      expect(getToolHint(tool)?.drawing).toContain("Click and drag");
    }
  });

  it("returns undefined for tools without a hint", () => {
    expect(getToolHint("select")).toBeUndefined();
  });
});
