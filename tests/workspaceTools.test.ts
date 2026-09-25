import { describe, expect, it } from "vitest";
import { WORKSPACE_TOOL_SECTIONS } from "../src/editor/workspaceTools";
import { TOOL_BY_ID } from "../src/editor/toolRegistry";

describe("sidebar tool coverage", () => {
  it("exposes every registered editor tool exactly once", () => {
    const tools = WORKSPACE_TOOL_SECTIONS.flatMap((section) => section.tools);
    expect([...tools].sort()).toEqual(Object.keys(TOOL_BY_ID).sort());
    expect(new Set(tools).size).toBe(tools.length);
  });
});
