import { describe, expect, it } from "vitest";
import { TOOL_BY_ID, TOOL_GROUPS, isRegionTool, toolLabel } from "../src/editor/toolRegistry";
import type { EditorTool } from "../src/types/editor";

describe("tool registry", () => {
  it("indexes tool definitions by id", () => {
    expect(TOOL_BY_ID.select.label).toBe("Edit text");
    expect(TOOL_BY_ID.text.placement).toBe("point");
    expect(TOOL_BY_ID.crop.placement).toBe("crop");
    expect(TOOL_BY_ID.erase.placement).toBe("erase");
    expect(TOOL_BY_ID["freehand-highlight"].placement).toBe("ink");
    expect(TOOL_BY_ID.erase.description).toContain("stroke portions");
    expect(TOOL_BY_ID.redact.description).toContain("remains extractable");
  });

  it("no longer registers the retired table-region tool", () => {
    expect((TOOL_BY_ID as Record<string, unknown>)["table-region"]).toBeUndefined();
    expect(TOOL_GROUPS.map((group) => group.id)).not.toContain("table");
  });

  it("returns the label for a known tool", () => {
    expect(toolLabel("highlight")).toBe("Highlight");
    expect(toolLabel("form-dropdown")).toBe("Dropdown");
  });

  it("falls back to the tool id when the tool is unknown", () => {
    expect(toolLabel("nonexistent-tool" as EditorTool)).toBe("nonexistent-tool");
  });

  it("identifies region placement tools", () => {
    expect(isRegionTool("whiteout")).toBe(true);
    expect(isRegionTool("form-text")).toBe(true);
  });

  it("returns false for non-region and unknown tools", () => {
    expect(isRegionTool("text")).toBe(false);
    expect(isRegionTool("nonexistent-tool" as EditorTool)).toBe(false);
  });

  it("exposes tool groups built from the registry", () => {
    const groupIds = TOOL_GROUPS.map((group) => group.id);
    expect(groupIds).toContain("highlight-text");
    expect(groupIds).toContain("line");
    expect(groupIds).toContain("forms");
    const highlight = TOOL_GROUPS.find((group) => group.id === "highlight-text");
    expect(highlight?.tools.map((tool) => tool.id)).toEqual([
      "highlight",
      "strikeout",
      "underline",
    ]);
    const line = TOOL_GROUPS.find((group) => group.id === "line");
    expect(line?.tools.map((tool) => tool.id)).toEqual([
      "shape-line",
      "shape-arrow",
      "shape",
      "shape-ellipse",
    ]);
    const forms = TOOL_GROUPS.find((group) => group.id === "forms");
    expect(forms?.tools.map((tool) => tool.id)).toEqual([
      "form-text",
      "form-multiline",
      "form-checkbox",
      "form-radio",
      "form-dropdown",
      "form-listbox",
      "form-signature",
      "form-date",
      "form-button",
    ]);
  });

  it("keeps the FormaDoc-style direct tools in toolbar order", () => {
    expect(TOOL_GROUPS.map((group) => group.id).slice(0, 10)).toEqual([
      "crop",
      "select",
      "text",
      "sign",
      "redact",
      "draw",
      "marker",
      "erase",
      "highlight-text",
      "line",
    ]);
    expect(TOOL_GROUPS.find((group) => group.id === "redact")?.tools.map((tool) => tool.id)).toEqual([
      "redact",
      "redact-area",
      "whiteout",
    ]);
  });
});
