import type { TextOperation } from "../types/editor";

/** Clears derived font metadata when the user picks a catalog family. */
export function fontFamilyPatch(fontFamily: string): Partial<TextOperation> {
  return {
    fontFamily,
    cssFontFamily: undefined,
    detectedFontName: undefined,
    embeddedFontKey: undefined,
  };
}
