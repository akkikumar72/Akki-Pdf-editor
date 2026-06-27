import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "../src/utils/ids";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createId", () => {
  it("uses crypto.randomUUID when available and applies the default prefix", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "1111-2222" });
    expect(createId()).toBe("op_1111-2222");
    expect(createId("text")).toBe("text_1111-2222");
  });

  it("falls back to Math.random when crypto lacks randomUUID", () => {
    vi.stubGlobal("crypto", {});
    const id = createId("history");
    expect(id.startsWith("history_")).toBe(true);
    expect(id).not.toContain("undefined");
  });

  it("falls back when crypto is entirely undefined", () => {
    vi.stubGlobal("crypto", undefined);
    const id = createId("op");
    expect(id.startsWith("op_")).toBe(true);
  });
});
