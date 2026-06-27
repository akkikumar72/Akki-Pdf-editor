import { afterEach, describe, expect, it, vi } from "vitest";
import { dataUrlToBytes, downloadBlob, safeBaseName } from "../src/utils/download";

describe("dataUrlToBytes", () => {
  it("decodes a valid base64 data URL", () => {
    // "PDF" encoded as base64 is "UERG"
    const bytes = dataUrlToBytes("data:image/png;base64,UERG");
    expect(Array.from(bytes)).toEqual([0x50, 0x44, 0x46]);
  });

  it("throws on a non-data URL", () => {
    expect(() => dataUrlToBytes("https://example.com/x.png")).toThrow(/Malformed data URL/);
  });

  it("throws on a malformed base64 payload", () => {
    expect(() => dataUrlToBytes("data:image/png;base64,@@@not-base64@@@")).toThrow(/Malformed data URL/);
  });
});

describe("safeBaseName", () => {
  it("strips extension and unsafe characters", () => {
    expect(safeBaseName("My File.final.pdf")).toBe("My-File-final");
  });

  it("falls back to document when empty", () => {
    expect(safeBaseName("***.pdf")).toBe("document");
  });
});

describe("downloadBlob", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("creates an object URL, clicks an anchor, and defers revocation", () => {
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:fake");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    downloadBlob(new Blob(["hi"], { type: "text/plain" }), "out.txt");

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    // Anchor is removed synchronously; revocation only happens after the timer fires.
    expect(document.querySelector("a[download]")).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");

    vi.unstubAllGlobals();
  });
});
