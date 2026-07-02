import type { SignatureOperation } from "../types/editor";
import type { SavedSignature } from "../utils/storage";
import { createId } from "../utils/ids";
import { viewportRectToPdf } from "../utils/coordinates";
import {
  fitImageIntoBox,
  loadImageSize,
  SIGNATURE_PLACEMENT_FALLBACK,
  SIGNATURE_PLACEMENT_MAX,
  type ImageBoxSize,
} from "../utils/imageSizing";
import { rasterizeTypedSignature } from "../utils/signatureRaster";
import { signatureCssFamily } from "./signatureFonts";

/** The signature content the studio or the saved-signature store hands over for placement. */
export type SignatureDraft = Pick<SavedSignature, "mode" | "value" | "color" | "fontFamily">;

/** A placement-ready signature: content plus its natural pixel size (when known). */
export type SignaturePayload = SignatureDraft & {
  naturalSize?: ImageBoxSize | null;
};

/**
 * Resolves a draft into what actually gets placed. Typed signatures are
 * rasterized to a PNG here (see `rasterizeTypedSignature` for why exporting
 * the web-font text directly would not be faithful); when rasterization is
 * unavailable the typed operation is kept as text.
 */
export async function signaturePayloadFromDraft(draft: SignatureDraft): Promise<SignaturePayload> {
  if (draft.mode === "image") {
    return { ...draft, naturalSize: await loadImageSize(draft.value) };
  }
  const raster = rasterizeTypedSignature(draft.value, signatureCssFamily(draft.fontFamily), draft.color);
  if (raster) {
    return {
      mode: "image",
      value: raster.dataUrl,
      color: draft.color,
      fontFamily: draft.fontFamily,
      naturalSize: { width: raster.width, height: raster.height },
    };
  }
  return { ...draft, naturalSize: null };
}

type PlaceSignatureInput = {
  payload: SignaturePayload;
  point: { x: number; y: number };
  pageIndex: number;
  pageHeight: number;
  scale: number;
};

/**
 * Builds a signature operation centered horizontally on the click point, sized
 * aspect-correct from the payload's natural dimensions (image mode) or to a
 * comfortable default (typed fallback).
 */
export function createSignatureOperation({ payload, point, pageIndex, pageHeight, scale }: PlaceSignatureInput): SignatureOperation {
  const size = payload.naturalSize
    ? fitImageIntoBox(
        payload.naturalSize.width,
        payload.naturalSize.height,
        SIGNATURE_PLACEMENT_MAX.width,
        SIGNATURE_PLACEMENT_MAX.height,
        SIGNATURE_PLACEMENT_FALLBACK,
      )
    : { ...SIGNATURE_PLACEMENT_FALLBACK };
  const rect = viewportRectToPdf(
    { left: point.x - size.width / 2, top: point.y - size.height / 2, width: size.width, height: size.height },
    pageHeight,
    scale,
  );
  return {
    id: createId("signature"),
    type: "signature",
    mode: payload.mode,
    pageIndex,
    rect,
    value: payload.value,
    color: payload.color,
    fontFamily: payload.fontFamily ?? "Caveat",
    opacity: 1,
    createdAt: Date.now(),
  };
}
