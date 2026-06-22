import { afterEach, describe, expect, it, vi } from "vitest";
import { createId } from "../src/utils/ids";

describe("createId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses the default 'op' prefix", () => {
    expect(createId()).toMatch(/^op_/);
  });

  it("honors a custom prefix", () => {
    expect(createId("text")).toMatch(/^text_/);
  });

  it("produces unique ids on successive calls", () => {
    const ids = new Set(Array.from({ length: 100 }, () => createId("x")));
    expect(ids.size).toBe(100);
  });

  it("uses crypto.randomUUID when available", () => {
    const spy = vi.spyOn(crypto, "randomUUID").mockReturnValue("11111111-1111-1111-1111-111111111111");
    expect(createId("op")).toBe("op_11111111-1111-1111-1111-111111111111");
    expect(spy).toHaveBeenCalled();
  });

  it("falls back to Math.random/Date when crypto is unavailable", () => {
    vi.stubGlobal("crypto", undefined);
    const id = createId("fallback");
    expect(id).toMatch(/^fallback_[a-z0-9]+_[a-z0-9]+$/);
  });
});
