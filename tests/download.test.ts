import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dataUrlToBytes, downloadBlob, safeBaseName } from "../src/utils/download";

describe("downloadBlob", () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();
    URL.createObjectURL = vi.fn(() => "blob:mock-url");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    vi.restoreAllMocks();
  });

  it("creates an anchor, triggers a download, and revokes the URL after a tick", () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const appendSpy = vi.spyOn(document.body, "append");
    const blob = new Blob(["hello"], { type: "text/plain" });

    downloadBlob(blob, "out.txt");

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(appendSpy).toHaveBeenCalled();
    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.href).toContain("blob:mock-url");
    expect(anchor.download).toBe("out.txt");
    expect(anchor.rel).toBe("noopener");
    expect(clickSpy).toHaveBeenCalledTimes(1);
    // Anchor removed synchronously.
    expect(anchor.isConnected).toBe(false);

    // Revocation is deferred to a later tick.
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:mock-url");
  });
});

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
