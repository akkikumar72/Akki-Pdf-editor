import { StandardFonts } from "pdf-lib";

export type FontChoice = {
  label: string;
  cssFamily: string;
  pdfFont: StandardFonts;
  category: "sans" | "serif" | "mono" | "display" | "arabic";
  metricCompatibleWith?: string;
  aliases?: string[];
  displayAlias?: string;
};

export const FONT_CHOICES: FontChoice[] = [
  { label: "Amiri", cssFamily: "Amiri, Georgia, serif", pdfFont: StandardFonts.TimesRoman, category: "arabic", displayAlias: "Arabic" },
  { label: "Arial", cssFamily: '"Liberation Sans", Arial, sans-serif', pdfFont: StandardFonts.Helvetica, category: "sans", metricCompatibleWith: "Liberation Sans", aliases: ["Liberation Sans", "Helvetica"] },
  { label: "Arimo", cssFamily: "Arimo, Arial, sans-serif", pdfFont: StandardFonts.Helvetica, category: "sans" },
  { label: "Caladea", cssFamily: "Caladea, Cambria, serif", pdfFont: StandardFonts.TimesRoman, category: "serif", metricCompatibleWith: "Cambria" },
  { label: "Carlito", cssFamily: "Carlito, Calibri, sans-serif", pdfFont: StandardFonts.Helvetica, category: "sans", metricCompatibleWith: "Calibri" },
  { label: "Calibri", cssFamily: "Carlito, Calibri, sans-serif", pdfFont: StandardFonts.Helvetica, category: "sans", metricCompatibleWith: "Carlito", aliases: ["Carlito"] },
  { label: "Courier", cssFamily: '"Courier New", Courier, monospace', pdfFont: StandardFonts.Courier, category: "mono", metricCompatibleWith: "Courier New", aliases: ["Liberation Mono", "Courier New"] },
  { label: "DejaVu Sans", cssFamily: '"DejaVu Sans", Verdana, sans-serif', pdfFont: StandardFonts.Helvetica, category: "sans", metricCompatibleWith: "Verdana" },
  { label: "DejaVu Serif", cssFamily: '"DejaVu Serif", Georgia, serif', pdfFont: StandardFonts.TimesRoman, category: "serif", metricCompatibleWith: "Georgia" },
  { label: "Droid Serif", cssFamily: '"Droid Serif", Georgia, serif', pdfFont: StandardFonts.TimesRoman, category: "serif" },
  { label: "EB Garamond", cssFamily: '"EB Garamond", Georgia, serif', pdfFont: StandardFonts.TimesRoman, category: "display" },
  { label: "Fira Sans", cssFamily: '"Fira Sans", "Trebuchet MS", Arial, sans-serif', pdfFont: StandardFonts.Helvetica, category: "sans", metricCompatibleWith: "Trebuchet MS" },
  { label: "Helvetica", cssFamily: "Helvetica, Arial, sans-serif", pdfFont: StandardFonts.Helvetica, category: "sans", aliases: ["Arial", "Liberation Sans"] },
  { label: "Inter", cssFamily: "Inter, Arial, sans-serif", pdfFont: StandardFonts.Helvetica, category: "sans" },
  { label: "Lato", cssFamily: "Lato, Arial, sans-serif", pdfFont: StandardFonts.Helvetica, category: "sans" },
  { label: "Liberation Sans", cssFamily: '"Liberation Sans", Arial, sans-serif', pdfFont: StandardFonts.Helvetica, category: "sans", metricCompatibleWith: "Arial", aliases: ["Arial", "Helvetica"] },
  { label: "Liberation Serif", cssFamily: '"Liberation Serif", "Times New Roman", Times, serif', pdfFont: StandardFonts.TimesRoman, category: "serif", metricCompatibleWith: "Times New Roman", aliases: ["Times", "Times Roman", "Times-Roman"] },
  { label: "Liberation Mono", cssFamily: '"Liberation Mono", "Courier New", Menlo, monospace', pdfFont: StandardFonts.Courier, category: "mono", metricCompatibleWith: "Courier New", aliases: ["Courier"] },
  { label: "Noto Sans", cssFamily: '"Noto Sans", Arial, sans-serif', pdfFont: StandardFonts.Helvetica, category: "sans" },
  { label: "Noto Sans Chakma", cssFamily: '"Noto Sans Chakma", "Noto Sans", Arial, sans-serif', pdfFont: StandardFonts.Helvetica, category: "sans" },
  { label: "Noto Serif", cssFamily: '"Noto Serif", Georgia, serif', pdfFont: StandardFonts.TimesRoman, category: "serif" },
  { label: "Noto Serif Tamil", cssFamily: '"Noto Serif Tamil", "Noto Serif", Georgia, serif', pdfFont: StandardFonts.TimesRoman, category: "serif" },
  { label: "Open Sans", cssFamily: '"Open Sans", Arial, sans-serif', pdfFont: StandardFonts.Helvetica, category: "sans" },
  { label: "Open Sans Condensed", cssFamily: '"Open Sans Condensed", "Open Sans", Arial, sans-serif', pdfFont: StandardFonts.Helvetica, category: "sans" },
  { label: "Oranienbaum", cssFamily: "Oranienbaum, Georgia, serif", pdfFont: StandardFonts.TimesRoman, category: "display" },
  { label: "Poppins", cssFamily: "Poppins, Arial, sans-serif", pdfFont: StandardFonts.Helvetica, category: "display" },
  { label: "PT Sans", cssFamily: '"PT Sans", Arial, sans-serif', pdfFont: StandardFonts.Helvetica, category: "sans" },
  { label: "PT Sans Caption", cssFamily: '"PT Sans Caption", "PT Sans", Arial, sans-serif', pdfFont: StandardFonts.Helvetica, category: "sans" },
  { label: "PT Sans Narrow", cssFamily: '"PT Sans Narrow", "PT Sans", Arial, sans-serif', pdfFont: StandardFonts.Helvetica, category: "sans" },
  { label: "PT Serif", cssFamily: '"PT Serif", Georgia, serif', pdfFont: StandardFonts.TimesRoman, category: "serif" },
  { label: "PT Serif Caption", cssFamily: '"PT Serif Caption", "PT Serif", Georgia, serif', pdfFont: StandardFonts.TimesRoman, category: "serif" },
  { label: "Scheherazade New", cssFamily: '"Scheherazade New", Scheherazade, Georgia, serif', pdfFont: StandardFonts.TimesRoman, category: "arabic", displayAlias: "Arabic", aliases: ["Scheherazade"] },
  { label: "Selawik", cssFamily: "Selawik, 'Segoe UI', Arial, sans-serif", pdfFont: StandardFonts.Helvetica, category: "sans", metricCompatibleWith: "Segoe UI", aliases: ["Segoe UI"] },
  { label: "Roboto", cssFamily: "Roboto, Arial, sans-serif", pdfFont: StandardFonts.Helvetica, category: "sans" },
  { label: "Times New Roman", cssFamily: '"Times New Roman", "Liberation Serif", Times, serif', pdfFont: StandardFonts.TimesRoman, category: "serif", aliases: ["Times", "Times-Roman", "Times Roman", "Liberation Serif"] },
];

const DEFAULT_FONT = FONT_CHOICES.find((font) => font.label === "Inter") ?? FONT_CHOICES[0];

function normalizeFontName(requested?: string) {
  return cleanPdfFontName(requested).toLowerCase().replace(/[\s_-]+/g, "");
}

export function cleanPdfFontName(requested?: string) {
  if (!requested) return "";
  return requested
    .replace(/^[A-Z]{6}\+/, "")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferFontWeight(fontName?: string) {
  const normalized = normalizeFontName(fontName);
  if (!normalized) return undefined;
  if (/(black|heavy|extrabold|ultrabold)/.test(normalized)) return 800;
  if (/(semibold|demibold)/.test(normalized)) return 600;
  if (/(bold)/.test(normalized)) return 700;
  if (/(medium)/.test(normalized)) return 500;
  if (/(light|thin)/.test(normalized)) return 300;
  return 400;
}

export function inferItalic(fontName?: string) {
  return /(italic|oblique)/i.test(cleanPdfFontName(fontName));
}

export function resolveFont(requested?: string) {
  if (!requested) return DEFAULT_FONT;
  const normalized = requested.toLowerCase();
  const compact = normalizeFontName(requested);
  const exact = FONT_CHOICES.find((font) => normalizeFontName(font.label) === compact);
  if (exact) return exact;

  const alias = FONT_CHOICES.find((font) =>
    font.aliases?.some((name) => normalizeFontName(name) === compact) ||
    normalizeFontName(font.metricCompatibleWith) === compact
  );
  if (alias) return alias;

  if (/(calibri|carlito)/.test(compact)) return FONT_CHOICES.find((font) => font.label === "Carlito") ?? DEFAULT_FONT;
  if (/(cambria|caladea)/.test(compact)) return FONT_CHOICES.find((font) => font.label === "Caladea") ?? DEFAULT_FONT;
  if (/(times|timesroman|garamond|georgia|liberationserif)/.test(compact)) return FONT_CHOICES.find((font) => font.label === "Times New Roman") ?? DEFAULT_FONT;
  if (/(courier|mono|menlo|consolas|liberationmono)/.test(compact)) return FONT_CHOICES.find((font) => font.label === "Courier") ?? DEFAULT_FONT;
  if (/(helvetica|arial|liberationsans|ubermove|ubermovetext)/.test(compact)) return FONT_CHOICES.find((font) => font.label === "Arial") ?? DEFAULT_FONT;
  return (
    FONT_CHOICES.find((font) => compact.includes(normalizeFontName(font.label))) ??
    FONT_CHOICES.find((font) => font.aliases?.some((name) => compact.includes(normalizeFontName(name)))) ??
    FONT_CHOICES.find((font) => font.metricCompatibleWith?.toLowerCase() === normalized) ??
    DEFAULT_FONT
  );
}

export function buildDetectedCssFontFamily(detected?: string, fallback?: string) {
  const choice = resolveFont(fallback ?? detected);
  const names = [cleanPdfFontName(detected), fallback ? cleanPdfFontName(fallback) : ""]
    .filter(Boolean)
    .filter((name, index, list) => list.indexOf(name) === index)
    .map((name) => (/^(serif|sans-serif|monospace|cursive|fantasy)$/i.test(name) ? name : `"${name.replace(/"/g, "")}"`));
  return [...names, choice.cssFamily].join(", ");
}

export function resolvePdfFont(fontFamily?: string, style?: { bold?: boolean; italic?: boolean; fontWeight?: number; fontStyle?: "normal" | "italic" }) {
  const choice = resolveFont(fontFamily);
  const bold = Boolean(style?.bold || (style?.fontWeight ?? 400) >= 600);
  const italic = Boolean(style?.italic || style?.fontStyle === "italic");

  if (choice.pdfFont === StandardFonts.Courier) {
    if (bold && italic) return StandardFonts.CourierBoldOblique;
    if (bold) return StandardFonts.CourierBold;
    if (italic) return StandardFonts.CourierOblique;
    return StandardFonts.Courier;
  }

  if (choice.pdfFont === StandardFonts.TimesRoman) {
    if (bold && italic) return StandardFonts.TimesRomanBoldItalic;
    if (bold) return StandardFonts.TimesRomanBold;
    if (italic) return StandardFonts.TimesRomanItalic;
    return StandardFonts.TimesRoman;
  }

  if (bold && italic) return StandardFonts.HelveticaBoldOblique;
  if (bold) return StandardFonts.HelveticaBold;
  if (italic) return StandardFonts.HelveticaOblique;
  return StandardFonts.Helvetica;
}

export function describeFallback(requested?: string) {
  const choice = resolveFont(requested);
  if (!requested || requested.toLowerCase() === choice.label.toLowerCase()) return "Exact editor font";
  return `Closest match for ${requested}: ${choice.label}`;
}
