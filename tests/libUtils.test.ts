import { describe, expect, it } from "vitest";
import { cn } from "../src/lib/utils";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b")).toBe("a b");
  });

  it("filters falsy values and conditional objects", () => {
    expect(cn("a", false && "b", undefined, null, { c: true, d: false })).toBe("a c");
  });

  it("merges conflicting tailwind classes via twMerge", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
