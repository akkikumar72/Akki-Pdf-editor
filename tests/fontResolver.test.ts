import { describe, expect, it } from "vitest";
import { StandardFonts } from "pdf-lib";
import { buildDetectedCssFontFamily, cleanPdfFontName, describeDetectedFont, describeFallback, inferFontWeight, inferItalic, resolveFont, resolvePdfFont } from "../src/engine/fontResolver";

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

  it("prioritizes embedded PDF font handles before generic families", () => {
    expect(resolveFont("sans-serif g_d1_f1").label).toBe("Helvetica");
    expect(buildDetectedCssFontFamily("sans-serif", "g_d1_f1").startsWith("\"g_d1_f1\", sans-serif")).toBe(true);
    expect(buildDetectedCssFontFamily("sans-serif", "g_d1_f1")).toContain("Helvetica");
    expect(describeDetectedFont("g_d1_f1", "sans-serif", "Helvetica")).toContain("embedded PDF font");
  });
});

describe("font resolver — full branch coverage", () => {
  it("cleanPdfFontName strips subset prefixes, quotes and whitespace", () => {
    expect(cleanPdfFontName()).toBe("");
    expect(cleanPdfFontName("ABCDEF+Roboto")).toBe("Roboto");
    expect(cleanPdfFontName('"Times New   Roman"')).toBe("Times New Roman");
  });

  it("resolveFont handles generic families and subset ids", () => {
    expect(resolveFont()).toMatchObject({ label: "Inter" }); // no input -> default
    expect(resolveFont("sans-serif g_d0_f0").label).toBe("Helvetica"); // sansserif + subset
    expect(resolveFont("sans-serif").label).toBe("Helvetica");
    expect(resolveFont("serif").label).toBe("Times New Roman");
    expect(resolveFont("monospace").label).toBe("Courier");
  });

  it("resolveFont matches exact labels, aliases and metric-compatible names", () => {
    expect(resolveFont("Inter").label).toBe("Inter"); // exact
    expect(resolveFont("Cambria").label).toBe("Caladea"); // alias via metricCompatibleWith
  });

  it("resolveFont applies family regex heuristics", () => {
    expect(resolveFont("Calibri Light").label).toBe("Carlito"); // calibri/carlito
    expect(resolveFont("Caladea Bold").label).toBe("Caladea"); // cambria/caladea
    expect(resolveFont("EB Garamond Display").label).toBe("Times New Roman"); // times/garamond
    expect(resolveFont("Consolas Mono").label).toBe("Courier"); // courier/mono/consolas
    expect(resolveFont("UberMove Heavy").label).toBe("Arial"); // helvetica/arial/ubermove
  });

  it("resolveFont uses the substring/alias/metric fallbacks before defaulting", () => {
    expect(resolveFont("the roboto poster").label).toBe("Roboto"); // includes a label
    expect(resolveFont("my segoeui theme").label).toBe("Selawik"); // includes an alias
    expect(resolveFont("Verdana").label).toBe("DejaVu Sans"); // metricCompatibleWith equals input
    expect(resolveFont("zzzznotarealfont").label).toBe("Inter"); // final default
  });

  it("inferFontWeight covers every weight bucket", () => {
    expect(inferFontWeight()).toBeUndefined();
    expect(inferFontWeight("Font Black")).toBe(800);
    expect(inferFontWeight("Font SemiBold")).toBe(600);
    expect(inferFontWeight("Font Bold")).toBe(700);
    expect(inferFontWeight("Font Medium")).toBe(500);
    expect(inferFontWeight("Font Light")).toBe(300);
    expect(inferFontWeight("Font Regular")).toBe(400);
  });

  it("resolvePdfFont selects the right standard font face per family and style", () => {
    expect(resolvePdfFont("Courier", { bold: true, italic: true })).toBe(StandardFonts.CourierBoldOblique);
    expect(resolvePdfFont("Courier", { bold: true })).toBe(StandardFonts.CourierBold);
    expect(resolvePdfFont("Courier", { italic: true })).toBe(StandardFonts.CourierOblique);
    expect(resolvePdfFont("Courier")).toBe(StandardFonts.Courier);

    expect(resolvePdfFont("Times New Roman", { bold: true, italic: true })).toBe(StandardFonts.TimesRomanBoldItalic);
    expect(resolvePdfFont("Times New Roman", { bold: true })).toBe(StandardFonts.TimesRomanBold);
    expect(resolvePdfFont("Times New Roman", { fontStyle: "italic" })).toBe(StandardFonts.TimesRomanItalic);
    expect(resolvePdfFont("Times New Roman")).toBe(StandardFonts.TimesRoman);

    expect(resolvePdfFont("Helvetica", { bold: true, italic: true })).toBe(StandardFonts.HelveticaBoldOblique);
    expect(resolvePdfFont("Helvetica", { italic: true })).toBe(StandardFonts.HelveticaOblique);
    expect(resolvePdfFont("Helvetica")).toBe(StandardFonts.Helvetica);
  });

  it("buildDetectedCssFontFamily orders exact names ahead of generic ones", () => {
    const css = buildDetectedCssFontFamily("Helvetica", "serif");
    expect(css.startsWith('"Helvetica"')).toBe(true);
    expect(css).toContain("serif");
    // de-duplicates repeated names
    expect(buildDetectedCssFontFamily("Arial", "Arial")).toContain('"Arial"');
  });

  it("buildDetectedCssFontFamily works with no fallback name", () => {
    expect(buildDetectedCssFontFamily("Helvetica")).toContain('"Helvetica"');
  });

  it("describeDetectedFont resolves the embedded-font fallback without an explicit replacement", () => {
    // detected name is an internal subset id and css is generic -> embedded branch,
    // no replacement provided -> resolveFont(`${css} ${detected}`).label is used.
    expect(describeDetectedFont("g_d1_f1", "sans-serif")).toContain("embedded PDF font");
  });

  it("describeDetectedFont and describeFallback report the resolved face", () => {
    expect(describeDetectedFont("Roboto-Bold")).toContain("Detected Roboto-Bold");
    expect(describeDetectedFont(undefined, "Helvetica")).toContain("Detected Helvetica");
    expect(describeDetectedFont(undefined, undefined)).toBe("Exact editor font");
    expect(describeFallback()).toBe("Exact editor font");
    expect(describeFallback("Inter")).toBe("Exact editor font");
    expect(describeFallback("Totally Unknown")).toContain("Closest match");
  });
});
