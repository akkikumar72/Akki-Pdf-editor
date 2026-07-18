import { describe, expect, it } from "vitest";
import { cn } from "../src/lib/utils";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("filters falsy values and conditional objects", () => {
    const showB: boolean = false;
    expect(cn("a", showB && "b", undefined, null, { c: true, d: false })).toBe("a c");
  });

  it("keeps every class verbatim (plain clsx — the repo has no Tailwind to de-conflict)", () => {
    expect(cn("button--primary", "button--sm")).toBe("button--primary button--sm");
  });
});
