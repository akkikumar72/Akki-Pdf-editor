import { describe, expect, it } from "vitest";
import { dataUrlToBytes, safeBaseName } from "../src/utils/download";

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
