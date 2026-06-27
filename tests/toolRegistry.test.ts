import { describe, expect, it } from "vitest";
import { TOOL_BY_ID, TOOL_GROUPS, isRegionTool, toolLabel } from "../src/editor/toolRegistry";
import type { EditorTool } from "../src/types/editor";

describe("tool registry", () => {
  it("exposes a definition for every tool referenced in groups", () => {
    for (const group of TOOL_GROUPS) {
      expect(TOOL_BY_ID[group.primary]).toBeDefined();
      for (const tool of group.tools) {
        expect(tool).toBeDefined();
        expect(TOOL_BY_ID[tool.id]).toBe(tool);
      }
    }
  });

  it("returns the label for a known tool and echoes an unknown id", () => {
    expect(toolLabel("select")).toBe("Select");
    expect(toolLabel("whiteout")).toBe("Whiteout");
    expect(toolLabel("totally-unknown" as EditorTool)).toBe("totally-unknown");
  });

  it("identifies region-placement tools", () => {
    expect(isRegionTool("whiteout")).toBe(true);
    expect(isRegionTool("highlight")).toBe(true);
    expect(isRegionTool("select")).toBe(false);
    expect(isRegionTool("text")).toBe(false);
    expect(isRegionTool("does-not-exist" as EditorTool)).toBe(false);
  });
});
