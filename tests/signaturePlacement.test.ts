import { describe, expect, it, vi } from "vitest";
import {
  createSignatureOperation,
  signaturePayloadFromDraft,
} from "../src/editor/signaturePlacement";
import { SIGNATURE_FONTS, SIGNATURE_COLORS, signatureCssFamily } from "../src/editor/signatureFonts";
import { loadImageSize } from "../src/utils/imageSizing";
import { rasterizeTypedSignature } from "../src/utils/signatureRaster";

vi.mock("../src/utils/signatureRaster", () => ({
  rasterizeTypedSignature: vi.fn(() => ({ dataUrl: "data:image/png;base64,RASTER", width: 400, height: 160 })),
}));

vi.mock("../src/utils/imageSizing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/imageSizing")>();
  return { ...actual, loadImageSize: vi.fn(async () => ({ width: 600, height: 300 })) };
});

const PLACE = { point: { x: 200, y: 300 }, pageIndex: 1, pageHeight: 792, scale: 1 };

describe("createSignatureOperation", () => {
  it("sizes aspect-correct from the natural dimensions and centers on the click", () => {
    const operation = createSignatureOperation({
      ...PLACE,
      payload: { mode: "image", value: "data:image/png;base64,AAAA", color: "#000", naturalSize: { width: 600, height: 300 } },
    });
    expect(operation.type).toBe("signature");
    expect(operation.mode).toBe("image");
    expect(operation.pageIndex).toBe(1);
    // 600x300 into 260x110 -> scale 110/300 -> 220x110.
    expect(operation.rect.width).toBe(220);
    expect(operation.rect.height).toBe(110);
    // Centered on the viewport click point.
    expect(operation.rect.x).toBe(200 - 110);
    expect(operation.fontFamily).toBe("Caveat");
  });

  it("uses the fallback box when the natural size is unknown", () => {
    const operation = createSignatureOperation({
      ...PLACE,
      payload: { mode: "typed", value: "Akki", color: "#000", fontFamily: "Zeyada", naturalSize: null },
    });
    expect(operation.rect.width).toBe(200);
    expect(operation.rect.height).toBe(64);
    expect(operation.fontFamily).toBe("Zeyada");
  });
});

describe("signaturePayloadFromDraft", () => {
  it("resolves an image draft with its natural size", async () => {
    const payload = await signaturePayloadFromDraft({ mode: "image", value: "data:image/png;base64,AAAA", color: "#000" });
    expect(payload.mode).toBe("image");
    expect(payload.naturalSize).toEqual({ width: 600, height: 300 });
    expect(loadImageSize).toHaveBeenCalled();
  });

  it("rasterizes a typed draft into an image payload", async () => {
    const payload = await signaturePayloadFromDraft({ mode: "typed", value: "Akki", color: "#333", fontFamily: "Caveat" });
    expect(payload.mode).toBe("image");
    expect(payload.value).toBe("data:image/png;base64,RASTER");
    expect(payload.naturalSize).toEqual({ width: 400, height: 160 });
    expect(payload.fontFamily).toBe("Caveat");
  });

  it("keeps the typed draft when rasterization is unavailable", async () => {
    vi.mocked(rasterizeTypedSignature).mockReturnValueOnce(null);
    const payload = await signaturePayloadFromDraft({ mode: "typed", value: "Akki", color: "#333", fontFamily: "Caveat" });
    expect(payload.mode).toBe("typed");
    expect(payload.value).toBe("Akki");
    expect(payload.naturalSize).toBeNull();
  });
});

describe("signature fonts catalog", () => {
  it("resolves css families for known labels and falls back to the first face", () => {
    expect(signatureCssFamily("Dancing Script")).toContain("Dancing Script");
    expect(signatureCssFamily("Not A Font")).toBe(SIGNATURE_FONTS[0].cssFamily);
    expect(signatureCssFamily(undefined)).toBe(SIGNATURE_FONTS[0].cssFamily);
  });

  it("ships the Sejda-parity swatches and at least 8 handwriting faces", () => {
    expect(SIGNATURE_COLORS).toHaveLength(7);
    expect(SIGNATURE_FONTS.length).toBeGreaterThanOrEqual(8);
  });
});
