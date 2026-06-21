import { describe, expect, it } from "vitest";
import { TOOL_BY_ID, TOOL_GROUPS, isRegionTool, toolLabel } from "../src/editor/toolRegistry";
import type { EditorTool } from "../src/types/editor";

describe("tool registry", () => {
  it("indexes tool definitions by id", () => {
    expect(TOOL_BY_ID.select.label).toBe("Select");
    expect(TOOL_BY_ID.text.placement).toBe("point");
    expect(TOOL_BY_ID["table-region"].group).toBe("export");
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
    expect(groupIds).toContain("forms");
    expect(groupIds).toContain("shapes");
    const forms = TOOL_GROUPS.find((group) => group.id === "forms");
    expect(forms?.tools.map((tool) => tool.id)).toEqual([
      "form-text",
      "form-multiline",
      "form-dropdown",
      "form-radio",
      "form-checkbox",
      "form-signature",
    ]);
  });
});
