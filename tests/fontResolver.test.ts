import { describe, expect, it } from "vitest";
import { StandardFonts } from "pdf-lib";
import { describeFallback, inferFontWeight, inferItalic, resolveFont, resolvePdfFont } from "../src/engine/fontResolver";

describe("font resolver", () => {
  it("maps metric-compatible fonts to export fonts", () => {
    expect(resolveFont("Carlito").metricCompatibleWith).toBe("Calibri");
    expect(resolveFont("Unknown PDF Font").label).toBe("Inter");
    expect(describeFallback("Unknown PDF Font")).toContain("Closest match");
    expect(resolveFont("Times-Roman").label).toBe("Liberation Serif");
    expect(resolveFont("Calibri").label).toBe("Calibri");
    expect(resolveFont("Scheherazade").label).toBe("Scheherazade New");
  });

  it("infers embedded PDF font styles for replacement overlays", () => {
    expect(resolveFont("ABCDEE+UberMoveText-Bold").label).toBe("Arial");
    expect(inferFontWeight("ABCDEE+UberMoveText-Bold")).toBe(700);
    expect(inferItalic("Helvetica-Oblique")).toBe(true);
    expect(resolvePdfFont("Helvetica", { fontWeight: 700 })).toBe(StandardFonts.HelveticaBold);
  });
});
