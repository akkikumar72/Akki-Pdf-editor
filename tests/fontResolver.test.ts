import { describe, expect, it } from "vitest";
import { StandardFonts } from "pdf-lib";
import {
  buildDetectedCssFontFamily,
  cleanPdfFontName,
  describeDetectedFont,
  describeFallback,
  inferFontWeight,
  inferItalic,
  resolveFont,
  resolvePdfFont,
} from "../src/engine/fontResolver";

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

describe("cleanPdfFontName", () => {
  it("returns empty string for falsy input", () => {
    expect(cleanPdfFontName()).toBe("");
    expect(cleanPdfFontName("")).toBe("");
  });

  it("strips subset prefixes, surrounding quotes, and collapses whitespace", () => {
    expect(cleanPdfFontName("ABCDEF+Roboto")).toBe("Roboto");
    expect(cleanPdfFontName('"Times New Roman"')).toBe("Times New Roman");
    expect(cleanPdfFontName("'Open Sans'")).toBe("Open Sans");
    expect(cleanPdfFontName("Open    Sans")).toBe("Open Sans");
  });
});

describe("inferFontWeight", () => {
  it("returns undefined when there is no usable name", () => {
    expect(inferFontWeight()).toBeUndefined();
    expect(inferFontWeight("")).toBeUndefined();
  });

  it("maps every keyword tier", () => {
    expect(inferFontWeight("Roboto Black")).toBe(800);
    expect(inferFontWeight("Roboto Heavy")).toBe(800);
    expect(inferFontWeight("Roboto ExtraBold")).toBe(800);
    expect(inferFontWeight("Roboto UltraBold")).toBe(800);
    expect(inferFontWeight("Roboto SemiBold")).toBe(600);
    expect(inferFontWeight("Roboto DemiBold")).toBe(600);
    expect(inferFontWeight("Roboto Bold")).toBe(700);
    expect(inferFontWeight("Roboto Medium")).toBe(500);
    expect(inferFontWeight("Roboto Light")).toBe(300);
    expect(inferFontWeight("Roboto Thin")).toBe(300);
    expect(inferFontWeight("Roboto Regular")).toBe(400);
  });
});

describe("inferItalic", () => {
  it("detects italic and oblique, false otherwise", () => {
    expect(inferItalic("Roboto Italic")).toBe(true);
    expect(inferItalic("Helvetica Oblique")).toBe(true);
    expect(inferItalic("Roboto Regular")).toBe(false);
    expect(inferItalic()).toBe(false);
  });
});

describe("resolveFont generic + alias + heuristic branches", () => {
  it("returns the default for empty input", () => {
    expect(resolveFont().label).toBe("Inter");
    expect(resolveFont("").label).toBe("Inter");
  });

  it("maps bare generic families", () => {
    expect(resolveFont("sans-serif").label).toBe("Helvetica");
    expect(resolveFont("serif").label).toBe("Times New Roman");
    expect(resolveFont("monospace").label).toBe("Courier");
  });

  it("matches exact labels and aliases / metric-compatible names", () => {
    expect(resolveFont("Roboto").label).toBe("Roboto");
    expect(resolveFont("Liberation Sans").label).toBe("Liberation Sans");
    // alias path
    expect(resolveFont("Segoe UI").label).toBe("Selawik");
    // metricCompatibleWith exact-match path
    expect(resolveFont("Verdana").label).toBe("DejaVu Sans");
  });

  it("applies family heuristics", () => {
    expect(resolveFont("Calibri Light").label).toBe("Carlito");
    expect(resolveFont("Cambria Math").label).toBe("Caladea");
    expect(resolveFont("Garamond Pro").label).toBe("Times New Roman");
    expect(resolveFont("Menlo Regular").label).toBe("Courier");
    expect(resolveFont("Arial Narrow").label).toBe("Arial");
  });

  it("falls back through includes / alias-includes / lowercase metric matches", () => {
    // compact includes a label name
    expect(resolveFont("MyRobotoVariant").label).toBe("Roboto");
    // metricCompatibleWith lowercase fallback (normalized lowercase equality)
    expect(resolveFont("trebuchet ms").label).toBe("Fira Sans");
  });
});

describe("resolvePdfFont style combinations", () => {
  it("covers Courier variants", () => {
    expect(resolvePdfFont("Courier")).toBe(StandardFonts.Courier);
    expect(resolvePdfFont("Courier", { bold: true })).toBe(StandardFonts.CourierBold);
    expect(resolvePdfFont("Courier", { italic: true })).toBe(StandardFonts.CourierOblique);
    expect(resolvePdfFont("Courier", { bold: true, italic: true })).toBe(StandardFonts.CourierBoldOblique);
  });

  it("covers Times variants", () => {
    expect(resolvePdfFont("Times New Roman")).toBe(StandardFonts.TimesRoman);
    expect(resolvePdfFont("Times New Roman", { bold: true })).toBe(StandardFonts.TimesRomanBold);
    expect(resolvePdfFont("Times New Roman", { fontStyle: "italic" })).toBe(StandardFonts.TimesRomanItalic);
    expect(resolvePdfFont("Times New Roman", { bold: true, italic: true })).toBe(StandardFonts.TimesRomanBoldItalic);
  });

  it("covers Helvetica variants and weight threshold", () => {
    expect(resolvePdfFont("Helvetica")).toBe(StandardFonts.Helvetica);
    expect(resolvePdfFont("Helvetica", { bold: true })).toBe(StandardFonts.HelveticaBold);
    expect(resolvePdfFont("Helvetica", { italic: true })).toBe(StandardFonts.HelveticaOblique);
    expect(resolvePdfFont("Helvetica", { bold: true, italic: true })).toBe(StandardFonts.HelveticaBoldOblique);
    expect(resolvePdfFont("Helvetica", { fontWeight: 599 })).toBe(StandardFonts.Helvetica);
    expect(resolvePdfFont("Helvetica", { fontWeight: 600 })).toBe(StandardFonts.HelveticaBold);
    expect(resolvePdfFont()).toBe(StandardFonts.Helvetica);
  });
});

describe("describeFallback / describeDetectedFont", () => {
  it("reports exact editor font when requested matches the chosen label", () => {
    expect(describeFallback()).toBe("Exact editor font");
    expect(describeFallback("Inter")).toBe("Exact editor font");
  });

  it("describes a detected real font name and a css family name", () => {
    expect(describeDetectedFont("Roboto-Bold")).toContain("Detected Roboto-Bold");
    expect(describeDetectedFont("Roboto-Bold", undefined, "Custom")).toContain("Custom");
    // detected is internal -> falls through to css name branch
    expect(describeDetectedFont("g_d0_f1", "Georgia")).toContain("Detected Georgia");
  });

  it("falls back to describeFallback when nothing usable is detected", () => {
    expect(describeDetectedFont()).toBe("Exact editor font");
    expect(describeDetectedFont("", "")).toBe("Exact editor font");
  });

  it("resolves a replacement when none is provided in the embedded branch", () => {
    // detected is internal + css is generic -> embedded branch, no explicit replacement.
    const text = describeDetectedFont("g_d0_f1", "sans-serif");
    expect(text).toContain("Using embedded PDF font");
    expect(text).toContain("Helvetica");
  });
});

describe("buildDetectedCssFontFamily", () => {
  it("orders exact names before generic and dedupes", () => {
    const css = buildDetectedCssFontFamily("Roboto", "Arial");
    expect(css).toContain('"Arial"');
    expect(css).toContain('"Roboto"');
    // dedupe: same name passed twice appears once
    const deduped = buildDetectedCssFontFamily("Roboto", "Roboto");
    expect(deduped.match(/"Roboto"/g)?.length).toBe(1);
  });

  it("keeps generic family tokens unquoted", () => {
    const css = buildDetectedCssFontFamily("serif", "Georgia");
    expect(css).toContain('"Georgia"');
    expect(css).toMatch(/(^|, )serif/);
  });

  it("handles a missing fallback argument", () => {
    const css = buildDetectedCssFontFamily("Roboto");
    expect(css).toContain('"Roboto"');
  });
});
