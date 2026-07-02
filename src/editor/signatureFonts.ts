/**
 * Handwriting faces for the signature studio (reference parity with Sejda's
 * Type tab). Served through the existing Google Fonts import in tokens.css —
 * the deployed CSP already allows fonts.googleapis.com / fonts.gstatic.com.
 * Typed signatures are rasterized to PNG at placement time (see
 * `rasterizeTypedSignature`), so these faces never need to embed in pdf-lib.
 */
export type SignatureFontChoice = {
  label: string;
  cssFamily: string;
};

export const SIGNATURE_FONTS: SignatureFontChoice[] = [
  { label: "Caveat", cssFamily: '"Caveat", cursive' },
  { label: "Dancing Script", cssFamily: '"Dancing Script", cursive' },
  { label: "Satisfy", cssFamily: '"Satisfy", cursive' },
  { label: "Norican", cssFamily: '"Norican", cursive' },
  { label: "Cedarville Cursive", cssFamily: '"Cedarville Cursive", cursive' },
  { label: "Reenie Beanie", cssFamily: '"Reenie Beanie", cursive' },
  { label: "Kristi", cssFamily: '"Kristi", cursive' },
  { label: "Zeyada", cssFamily: '"Zeyada", cursive' },
  { label: "Over the Rainbow", cssFamily: '"Over the Rainbow", cursive' },
  { label: "Give You Glory", cssFamily: '"Give You Glory", cursive' },
];

/** Sejda's seven signature ink swatches, in their menu order. */
export const SIGNATURE_COLORS = ["#4d6de6", "#2b4ea1", "#3524fe", "#0000FF", "#555555", "#333333", "#000000"];

export function signatureCssFamily(label?: string): string {
  return SIGNATURE_FONTS.find((font) => font.label === label)?.cssFamily ?? SIGNATURE_FONTS[0].cssFamily;
}
