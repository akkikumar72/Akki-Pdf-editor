import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, MAX_PDF_BYTES, validateImageFile, validatePdfFile } from "../src/utils/fileValidation";

function fileFromBytes(bytes: number[], name: string, type: string) {
  return new File([new Uint8Array(bytes)], name, { type });
}

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

describe("validatePdfFile", () => {
  it("accepts a file with the %PDF- signature", async () => {
    const result = await validatePdfFile(fileFromBytes([...PDF_MAGIC, 0x31], "ok.pdf", "application/pdf"));
    expect(result.ok).toBe(true);
  });

  it("rejects a spoofed-MIME non-PDF", async () => {
    const result = await validatePdfFile(fileFromBytes([0x50, 0x4b, 0x03, 0x04, 0x00], "fake.pdf", "application/pdf"));
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("not a valid PDF") });
  });

  it("rejects an empty file", async () => {
    const result = await validatePdfFile(fileFromBytes([], "empty.pdf", "application/pdf"));
    expect(result.ok).toBe(false);
  });

  it("rejects a file over the size limit", async () => {
    const oversized = new File(["x"], "big.pdf", { type: "application/pdf" });
    Object.defineProperty(oversized, "size", { value: MAX_PDF_BYTES + 1 });
    const result = await validatePdfFile(oversized);
    expect(result).toEqual({ ok: false, reason: expect.stringContaining("limit") });
  });
});

describe("validateImageFile", () => {
  it("accepts PNG and JPEG", async () => {
    expect((await validateImageFile(fileFromBytes(PNG_MAGIC, "a.png", "image/png"))).ok).toBe(true);
    expect((await validateImageFile(fileFromBytes([...JPEG_MAGIC, 0x00], "a.jpg", "image/jpeg"))).ok).toBe(true);
  });

  it("rejects a non-image payload", async () => {
    const result = await validateImageFile(fileFromBytes([0x25, 0x50, 0x44, 0x46, 0x2d], "x.png", "image/png"));
    expect(result.ok).toBe(false);
  });

  it("rejects an oversized image", async () => {
    const oversized = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(oversized, "size", { value: MAX_IMAGE_BYTES + 1 });
    expect((await validateImageFile(oversized)).ok).toBe(false);
  });
});
