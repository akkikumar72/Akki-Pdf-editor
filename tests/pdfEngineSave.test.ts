import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFString, decodePDFRawStream } from "pdf-lib";
import { pdfEngine, PdfEngine } from "../src/engine/pdfEngine";
import type { DocumentFonts, EditOperation, LinkOperation } from "../src/types/editor";

async function blankPdfBytes(pages = 1): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) pdf.addPage([612, 792]);
  return new Uint8Array(await pdf.save());
}

/**
 * Decodes a reloaded page's raw content stream operators to text so tests can
 * assert on *what* was drawn (e.g. the `cm` translate before a rectangle path)
 * instead of only that `savePdf` produced loadable bytes.
 */
function decodePageContentText(pdf: PDFDocument, page: ReturnType<PDFDocument["getPage"]>): string {
  const contents = page.node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
  return refs
    .map((ref) => new TextDecoder().decode(decodePDFRawStream(pdf.context.lookup(ref) as PDFRawStream).decode()))
    .join("\n");
}

// A real, fully-parseable TTF with broad Latin coverage; used to exercise the
// reuse-embedded-font path (embeddedCovers === true).
const LIBERATION_SANS = new Uint8Array(
  readFileSync("node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf"),
);

// An icon font (bundled with playwright) that fontkit parses and exposes
// hasGlyphForCodePoint on, but which lacks ASCII letter glyphs. Used to drive the
// embeddedCovers "missing glyph" branch while the standard fallback font can still
// encode the (ASCII) replacement text.
function loadGlyphLimitedFont(): Uint8Array {
  const dir = "node_modules/playwright-core/lib/vite/traceViewer";
  const file = readdirSync(dir).find((name) => /^codicon.*\.ttf$/i.test(name));
  if (!file) throw new Error("codicon font fixture not found");
  return new Uint8Array(readFileSync(join(dir, file)));
}
const GLYPH_LIMITED_FONT = loadGlyphLimitedFont();

const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
// Hand-built minimal baseline JPEG (1x1) accepted by pdf-lib's embedJpg.
const JPEG_DATA_URL = "data:image/jpeg;base64,/9j/wAALCAABAAEBAREA/9k=";

const baseRect = { x: 40, y: 400, width: 200, height: 30 };

describe("PdfEngine.savePdf", () => {
  it("writes a text overlay and returns a loadable single-page PDF", async () => {
    const original = await blankPdfBytes();
    const operations: EditOperation[] = [
      {
        id: "text_1",
        type: "text",
        pageIndex: 0,
        rect: { x: 72, y: 700, width: 200, height: 24 },
        text: "Hello world",
        fontFamily: "Helvetica",
        fontSize: 14,
        color: "#101010",
        align: "left",
        createdAt: 1,
      },
    ];
    const out = await pdfEngine.savePdf(original, operations);
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(1);
  });

  it("does not throw when a shape has a transparent fill", async () => {
    const original = await blankPdfBytes();
    const operations: EditOperation[] = [
      {
        id: "shape_1",
        type: "shape",
        kind: "rectangle",
        pageIndex: 0,
        rect: { x: 50, y: 50, width: 140, height: 70 },
        stroke: "#111827",
        fill: "transparent",
        strokeWidth: 1.5,
        opacity: 1,
        createdAt: 1,
      },
    ];
    await expect(pdfEngine.savePdf(original, operations)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("keeps safe link annotations and drops dangerous-scheme links", async () => {
    const original = await blankPdfBytes();
    const operations: EditOperation[] = [
      {
        id: "link_safe",
        type: "link",
        pageIndex: 0,
        rect: { x: 40, y: 600, width: 160, height: 28 },
        target: { kind: "url", href: "https://example.com" },
        opacity: 1,
        createdAt: 1,
      },
      {
        id: "link_danger",
        type: "link",
        pageIndex: 0,
        rect: { x: 40, y: 560, width: 160, height: 28 },
        target: { kind: "url", href: "javascript:alert(1)" },
        opacity: 1,
        createdAt: 2,
      },
    ];
    const out = await pdfEngine.savePdf(original, operations);
    const reloaded = await PDFDocument.load(out);
    const annots = reloaded.getPage(0).node.Annots();
    expect(annots?.size() ?? 0).toBe(1);
  });

  it("skips operations whose pageIndex is out of range", async () => {
    const original = await blankPdfBytes();
    const operations: EditOperation[] = [
      {
        id: "orphan",
        type: "whiteout",
        pageIndex: 5,
        rect: { x: 0, y: 0, width: 10, height: 10 },
        color: "#ffffff",
        createdAt: 1,
      },
    ];
    await expect(pdfEngine.savePdf(original, operations)).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe("PdfEngine.savePdf – text operations", () => {
  it("draws text with whiteout + sourceCoverRect, and aligns left/center/right", async () => {
    const original = await blankPdfBytes();
    const operations: EditOperation[] = [
      {
        id: "t_left",
        type: "text",
        pageIndex: 0,
        rect: { ...baseRect, y: 700 },
        text: "Left",
        fontFamily: "Helvetica",
        fontSize: 14,
        color: "#000000",
        align: "left",
        whiteout: true,
        whiteoutColor: "#fefefe",
        sourceCoverRect: { x: 10, y: 690, width: 220, height: 40 },
        createdAt: 1,
      },
      {
        id: "t_center",
        type: "text",
        pageIndex: 0,
        rect: { ...baseRect, y: 650 },
        text: "Center",
        fontFamily: "Helvetica",
        fontSize: 14,
        color: "#000000",
        align: "center",
        whiteout: true,
        createdAt: 2,
      },
      {
        id: "t_right",
        type: "text",
        pageIndex: 0,
        rect: { ...baseRect, y: 600 },
        text: "Right",
        fontFamily: "Helvetica",
        fontSize: 14,
        color: "#000000",
        align: "right",
        createdAt: 3,
      },
    ];
    const out = await pdfEngine.savePdf(original, operations);
    const reloaded = await PDFDocument.load(out);
    const content = decodePageContentText(reloaded, reloaded.getPage(0));
    // t_left's whiteout mask must be anchored to sourceCoverRect (10, 690), not
    // the editable rect (40, 700) -- the mask must stay put while dragged text moves.
    expect(content).toContain("1 0 0 1 10 690 cm");
    expect(content).not.toContain("1 0 0 1 40 700 cm");
    // t_center has no sourceCoverRect, so its mask falls back to its own rect.
    expect(content).toContain("1 0 0 1 40 650 cm");
    // Encoded as hex strings in the Tj operator.
    expect(content).toContain(Buffer.from("Left", "latin1").toString("hex").toUpperCase());
    expect(content).toContain(Buffer.from("Center", "latin1").toString("hex").toUpperCase());
    expect(content).toContain(Buffer.from("Right", "latin1").toString("hex").toUpperCase());
  });

  it("reuses the embedded font when it covers every glyph", async () => {
    const original = await blankPdfBytes();
    const fonts: DocumentFonts = {
      lib: { key: "lib", bytes: LIBERATION_SANS },
    };
    const operations: EditOperation[] = [
      {
        id: "t_embed",
        type: "text",
        pageIndex: 0,
        rect: { ...baseRect, y: 500 },
        text: "Reuse me",
        fontFamily: "Roboto",
        embeddedFontKey: "lib",
        fontSize: 14,
        color: "#222222",
        align: "left",
        createdAt: 1,
      },
      // Second op with same key exercises the reusedFonts cache hit branch.
      {
        id: "t_embed2",
        type: "text",
        pageIndex: 0,
        rect: { ...baseRect, y: 460 },
        text: "Reuse again",
        fontFamily: "Roboto",
        embeddedFontKey: "lib",
        fontSize: 14,
        color: "#222222",
        align: "left",
        createdAt: 2,
      },
    ];
    await expect(pdfEngine.savePdf(original, operations, fonts)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("falls back to a standard font when the embedded font lacks a glyph", async () => {
    const original = await blankPdfBytes();
    const fonts: DocumentFonts = {
      icon: { key: "icon", bytes: GLYPH_LIMITED_FONT },
    };
    const operations: EditOperation[] = [
      {
        id: "t_missing_glyph",
        type: "text",
        pageIndex: 0,
        rect: { ...baseRect, y: 420 },
        // ASCII letters are absent from the icon font -> embeddedCovers returns false
        // on the missing-glyph branch; the standard fallback still renders the text.
        text: "Hello",
        fontFamily: "Helvetica",
        embeddedFontKey: "icon",
        fontSize: 14,
        color: "#000000",
        align: "left",
        createdAt: 1,
      },
    ];
    await expect(pdfEngine.savePdf(original, operations, fonts)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("falls back when the embedded font bytes are unparseable (fontkit throws)", async () => {
    const original = await blankPdfBytes();
    const fonts: DocumentFonts = {
      garbage: { key: "garbage", bytes: new Uint8Array([1, 2, 3, 4, 5]) },
      empty: { key: "empty" }, // no bytes -> embeddedCovers early return false
    };
    const operations: EditOperation[] = [
      {
        id: "t_garbage",
        type: "text",
        pageIndex: 0,
        rect: { ...baseRect, y: 380 },
        text: "Garbage font",
        fontFamily: "Helvetica",
        embeddedFontKey: "garbage",
        fontSize: 14,
        color: "#000000",
        align: "left",
        createdAt: 1,
      },
      {
        id: "t_nobytes",
        type: "text",
        pageIndex: 0,
        rect: { ...baseRect, y: 340 },
        text: "No bytes",
        fontFamily: "Helvetica",
        embeddedFontKey: "empty",
        fontSize: 14,
        color: "#000000",
        align: "left",
        createdAt: 2,
      },
    ];
    await expect(pdfEngine.savePdf(original, operations, fonts)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("uses getReusedFont catch branch when bytes pass coverage but fail embedFont", async () => {
    // A TTF that fontkit parses for coverage (hasGlyphForCodePoint works) but that
    // pdf-lib's embedFont rejects forces the getReusedFont catch -> embedded=null,
    // then a re-use of the same key hits the reusedFonts cache returning null.
    // We approximate by truncating the valid TTF: fontkit may still report glyphs
    // for ASCII while pdf-lib subset embedding fails. If both succeed the result
    // is still a valid Uint8Array, which is all we assert.
    const original = await blankPdfBytes();
    const truncated = LIBERATION_SANS.slice(0, Math.floor(LIBERATION_SANS.length / 2));
    const fonts: DocumentFonts = { trunc: { key: "trunc", bytes: truncated } };
    const operations: EditOperation[] = [
      {
        id: "t_trunc",
        type: "text",
        pageIndex: 0,
        rect: { ...baseRect, y: 300 },
        text: "Trunc",
        fontFamily: "Helvetica",
        embeddedFontKey: "trunc",
        fontSize: 14,
        color: "#000000",
        align: "left",
        createdAt: 1,
      },
      // Second use of the same key: coverage passes again, getReusedFont returns the
      // cached null (the `?? null` reuse branch), forcing the standard fallback.
      {
        id: "t_trunc2",
        type: "text",
        pageIndex: 0,
        rect: { ...baseRect, y: 270 },
        text: "Trunc",
        fontFamily: "Helvetica",
        embeddedFontKey: "trunc",
        fontSize: 14,
        color: "#000000",
        align: "left",
        createdAt: 2,
      },
    ];
    await expect(pdfEngine.savePdf(original, operations, fonts)).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe("PdfEngine.savePdf – annotations", () => {
  it("draws highlight, strikeout, underline, note-with-text and note-without-text", async () => {
    const original = await blankPdfBytes();
    const operations: EditOperation[] = [
      {
        id: "a_highlight",
        type: "annotation",
        kind: "highlight",
        pageIndex: 0,
        rect: { ...baseRect, y: 700 },
        color: "#ffe600",
        createdAt: 1,
      },
      {
        id: "a_strike",
        type: "annotation",
        kind: "strikeout",
        pageIndex: 0,
        rect: { ...baseRect, y: 660 },
        color: "#ff0000",
        strokeWidth: 2,
        createdAt: 2,
      },
      {
        id: "a_underline",
        type: "annotation",
        kind: "underline",
        pageIndex: 0,
        rect: { ...baseRect, y: 620 },
        color: "#0000ff",
        createdAt: 3,
      },
      {
        id: "a_note_text",
        type: "annotation",
        kind: "note",
        pageIndex: 0,
        rect: { ...baseRect, y: 560, height: 60 },
        color: "#333333",
        text: "A note with text",
        createdAt: 4,
      },
      {
        id: "a_note_empty",
        type: "annotation",
        kind: "note",
        pageIndex: 0,
        rect: { ...baseRect, y: 500, height: 60 },
        color: "#333333",
        createdAt: 5,
      },
    ];
    await expect(pdfEngine.savePdf(original, operations)).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe("PdfEngine.savePdf – shapes and ink", () => {
  it("draws ellipse, line, arrow and rectangle with fill variants", async () => {
    const original = await blankPdfBytes();
    const operations: EditOperation[] = [
      {
        id: "s_ellipse",
        type: "shape",
        kind: "ellipse",
        pageIndex: 0,
        rect: { ...baseRect, y: 700 },
        stroke: "#000000",
        fill: "#abc", // valid 3-digit
        strokeWidth: 2,
        createdAt: 1,
      },
      {
        id: "s_line",
        type: "shape",
        kind: "line",
        pageIndex: 0,
        rect: { ...baseRect, y: 660 },
        stroke: "#123456", // valid 6-digit
        strokeWidth: 2,
        createdAt: 2,
      },
      {
        id: "s_arrow",
        type: "shape",
        kind: "arrow",
        pageIndex: 0,
        rect: { ...baseRect, y: 620 },
        stroke: "#0a0a0a",
        strokeWidth: 2,
        createdAt: 3,
      },
      {
        id: "s_rect_invalid",
        type: "shape",
        kind: "rectangle",
        pageIndex: 0,
        rect: { ...baseRect, y: 560 },
        stroke: "#000000",
        fill: "not-a-hex", // invalid -> undefined fill
        strokeWidth: 1.5,
        createdAt: 4,
      },
      {
        id: "s_rect_undef_fill",
        type: "shape",
        kind: "rectangle",
        pageIndex: 0,
        rect: { ...baseRect, y: 520 },
        stroke: "#000000",
        strokeWidth: 1.5,
        createdAt: 5,
      },
    ];
    await expect(pdfEngine.savePdf(original, operations)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("draws ink with multiple points and skips ink with one point", async () => {
    const original = await blankPdfBytes();
    const operations: EditOperation[] = [
      {
        id: "ink_multi",
        type: "ink",
        pageIndex: 0,
        rect: { ...baseRect, y: 400 },
        points: [
          { x: 50, y: 50 },
          { x: 60, y: 70 },
          { x: 80, y: 60 },
        ],
        stroke: "#ff00ff",
        strokeWidth: 2,
        createdAt: 1,
      },
      {
        id: "ink_single",
        type: "ink",
        pageIndex: 0,
        rect: { ...baseRect, y: 360 },
        points: [{ x: 50, y: 50 }],
        stroke: "#ff00ff",
        strokeWidth: 2,
        createdAt: 2,
      },
    ];
    await expect(pdfEngine.savePdf(original, operations)).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe("PdfEngine.savePdf – images, signatures and stamps", () => {
  it("embeds png images and image-mode signatures", async () => {
    const original = await blankPdfBytes();
    const operations: EditOperation[] = [
      {
        id: "img_png",
        type: "image",
        pageIndex: 0,
        rect: { ...baseRect, y: 700, width: 60, height: 60 },
        dataUrl: PNG_DATA_URL,
        mimeType: "image/png",
        createdAt: 1,
      },
      {
        id: "img_jpeg",
        type: "image",
        pageIndex: 0,
        rect: { ...baseRect, y: 620, width: 60, height: 60 },
        dataUrl: JPEG_DATA_URL,
        mimeType: "image/jpeg",
        createdAt: 2,
      },
      {
        id: "sig_image",
        type: "signature",
        mode: "image",
        pageIndex: 0,
        rect: { ...baseRect, y: 540, width: 120, height: 50 },
        value: PNG_DATA_URL,
        color: "#000000",
        fontFamily: "Helvetica",
        createdAt: 3,
      },
      {
        id: "img_no_mime",
        type: "image",
        pageIndex: 0,
        rect: { ...baseRect, y: 460, width: 40, height: 40 },
        // No ";mime" segment -> dataUrlMimeType falls back to image/png.
        dataUrl: `data:,${PNG_DATA_URL.split(",")[1]}`,
        mimeType: "image/png",
        createdAt: 4,
      },
    ];
    const out = await pdfEngine.savePdf(original, operations);
    const reloaded = await PDFDocument.load(out);
    const xObjects = reloaded.getPage(0).node.Resources()?.lookup(PDFName.of("XObject"), PDFDict);
    // One embedded image XObject per drawImage call (2 image ops + 1 image-mode
    // signature + 1 no-mime-segment image) -- not just "the bytes reload".
    expect(xObjects?.keys()).toHaveLength(4);
  });

  it("draws a typed signature and a stamp", async () => {
    const original = await blankPdfBytes();
    const operations: EditOperation[] = [
      {
        id: "sig_typed",
        type: "signature",
        mode: "typed",
        pageIndex: 0,
        rect: { ...baseRect, y: 500, width: 160, height: 50 },
        value: "Akki",
        color: "#0033aa",
        fontFamily: "Times New Roman",
        createdAt: 1,
      },
      {
        id: "stamp_1",
        type: "stamp",
        pageIndex: 0,
        rect: { ...baseRect, y: 440, width: 140, height: 40 },
        label: "approved",
        color: "#aa0000",
        borderColor: "#aa0000",
        createdAt: 2,
      },
    ];
    await expect(pdfEngine.savePdf(original, operations)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("draws a two-line stamp when a subline is present", async () => {
    const original = await blankPdfBytes();
    const operations: EditOperation[] = [
      {
        id: "stamp_sub",
        type: "stamp",
        pageIndex: 0,
        rect: { ...baseRect, y: 400, width: 180, height: 58 },
        label: "Approved",
        subline: "By Akki at 1:15PM, Feb 3, 2025",
        color: "#2b5329",
        borderColor: "#2b5329",
        createdAt: 1,
      },
    ];
    const out = await pdfEngine.savePdf(original, operations);
    const reloaded = await PDFDocument.load(out);
    const content = decodePageContentText(reloaded, reloaded.getPage(0));
    expect(content).toContain(Buffer.from("APPROVED", "latin1").toString("hex").toUpperCase());
    expect(content).toContain(Buffer.from("By Akki at 1:15PM, Feb 3, 2025", "latin1").toString("hex").toUpperCase());
  });
});

describe("PdfEngine.savePdf – form marks and fields", () => {
  it("draws check, cross and dot form marks", async () => {
    const original = await blankPdfBytes();
    const operations: EditOperation[] = [
      {
        id: "mark_check",
        type: "form-mark",
        mark: "check",
        pageIndex: 0,
        rect: { x: 40, y: 700, width: 20, height: 20 },
        color: "#111111",
        createdAt: 1,
      },
      {
        id: "mark_cross",
        type: "form-mark",
        mark: "cross",
        pageIndex: 0,
        rect: { x: 70, y: 700, width: 20, height: 20 },
        color: "#111111",
        createdAt: 2,
      },
      {
        id: "mark_dot",
        type: "form-mark",
        mark: "dot",
        pageIndex: 0,
        rect: { x: 100, y: 700, width: 20, height: 20 },
        color: "#111111",
        createdAt: 3,
      },
    ];
    await expect(pdfEngine.savePdf(original, operations)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("draws radio (checked/unchecked), signature and text fields", async () => {
    const original = await blankPdfBytes();
    const operations: EditOperation[] = [
      {
        id: "f_radio_on",
        type: "form-field",
        kind: "radio",
        name: "pick",
        checked: true,
        pageIndex: 0,
        rect: { x: 40, y: 620, width: 30, height: 20 },
        createdAt: 3,
      },
      {
        id: "f_radio_off",
        type: "form-field",
        kind: "radio",
        name: "pick2",
        checked: false,
        pageIndex: 0,
        rect: { x: 40, y: 580, width: 30, height: 20 },
        createdAt: 4,
      },
      {
        id: "f_sig",
        type: "form-field",
        kind: "signature",
        name: "sign",
        pageIndex: 0,
        rect: { x: 40, y: 540, width: 120, height: 24 },
        createdAt: 5,
      },
      {
        id: "f_text_value",
        type: "form-field",
        kind: "text",
        name: "fullName",
        value: "Akki",
        pageIndex: 0,
        rect: { x: 40, y: 500, width: 120, height: 24 },
        createdAt: 6,
      },
      {
        id: "f_text_empty",
        type: "form-field",
        kind: "text",
        name: "placeholderName",
        pageIndex: 0,
        rect: { x: 40, y: 460, width: 120, height: 24 },
        createdAt: 7,
      },
    ];
    await expect(pdfEngine.savePdf(original, operations)).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe("PdfEngine.savePdf – links Annots branches", () => {
  it("creates the Annots array when absent and pushes when present", async () => {
    const original = await blankPdfBytes();
    const operations: EditOperation[] = [
      // First safe link: page has no Annots -> set() branch.
      {
        id: "link_first",
        type: "link",
        pageIndex: 0,
        rect: { x: 40, y: 700, width: 120, height: 24 },
        target: { kind: "url", href: "https://example.com" },
        createdAt: 1,
      },
      // Second safe link: Annots now exists -> push() branch.
      {
        id: "link_second",
        type: "link",
        pageIndex: 0,
        rect: { x: 40, y: 660, width: 120, height: 24 },
        target: { kind: "email", href: "mailto:akki@example.com" },
        createdAt: 2,
      },
      // Dangerous scheme -> dropped (continue).
      {
        id: "link_bad",
        type: "link",
        pageIndex: 0,
        rect: { x: 40, y: 620, width: 120, height: 24 },
        target: { kind: "url", href: "javascript:alert(1)" },
        createdAt: 3,
      },
    ];
    const out = await pdfEngine.savePdf(original, operations);
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPage(0).node.Annots()?.size() ?? 0).toBe(2);
  });
});

describe("PdfEngine.savePdf – link target kinds", () => {
  it("writes a GoTo action with an explicit XYZ destination for internal-page links", async () => {
    const original = await blankPdfBytes(3);
    const operations: EditOperation[] = [
      {
        id: "link_page",
        type: "link",
        pageIndex: 0,
        rect: { x: 40, y: 700, width: 120, height: 24 },
        target: { kind: "page", pageIndex: 2 },
        createdAt: 1,
      },
    ];
    const out = await pdfEngine.savePdf(original, operations);
    const reloaded = await PDFDocument.load(out);
    const annots = reloaded.getPage(0).node.Annots();
    expect(annots?.size()).toBe(1);
    const annotation = annots!.lookup(0, PDFDict);
    const action = annotation.lookup(PDFName.of("A"), PDFDict);
    expect(action.get(PDFName.of("S"))).toEqual(PDFName.of("GoTo"));
    const dest = action.lookup(PDFName.of("D"), PDFArray);
    expect(dest.size()).toBe(5);
    expect(reloaded.context.lookup(dest.get(0))).toBe(reloaded.getPage(2).node);
    expect(dest.get(1)).toEqual(PDFName.of("XYZ"));
  });

  it("skips an internal-page link whose target page is out of range", async () => {
    const original = await blankPdfBytes(2);
    const operations: EditOperation[] = [
      {
        id: "link_gone",
        type: "link",
        pageIndex: 0,
        rect: { x: 40, y: 700, width: 120, height: 24 },
        target: { kind: "page", pageIndex: 7 },
        createdAt: 1,
      },
    ];
    const out = await pdfEngine.savePdf(original, operations);
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
  });

  it("writes a tel: URI action for phone links", async () => {
    const original = await blankPdfBytes();
    const operations: EditOperation[] = [
      {
        id: "link_phone",
        type: "link",
        pageIndex: 0,
        rect: { x: 40, y: 700, width: 120, height: 24 },
        target: { kind: "phone", href: "+1 (555) 000-1234" },
        createdAt: 1,
      },
    ];
    const out = await pdfEngine.savePdf(original, operations);
    const reloaded = await PDFDocument.load(out);
    const annotation = reloaded.getPage(0).node.Annots()!.lookup(0, PDFDict);
    const action = annotation.lookup(PDFName.of("A"), PDFDict);
    expect(action.get(PDFName.of("S"))).toEqual(PDFName.of("URI"));
    expect(String(action.get(PDFName.of("URI")))).toContain("tel:+15550001234");
  });

  it("writes imported links without painting the editor's visible frame", async () => {
    const original = await blankPdfBytes();
    const importedOp: LinkOperation = {
      id: "link_imported",
      type: "link",
      pageIndex: 0,
      rect: { x: 40, y: 700, width: 120, height: 24 },
      target: { kind: "url", href: "https://example.com" },
      imported: true,
      annotationRef: "99R",
      createdAt: 1,
    };
    // The editor's visible frame strokes a 0.75pt border; its absence means no ink was added.
    const importedOut = await PDFDocument.load(await pdfEngine.savePdf(original, [importedOp]));
    expect(importedOut.getPage(0).node.Annots()?.size()).toBe(1);
    expect(decodePageContentText(importedOut, importedOut.getPage(0))).not.toContain("0.75 w");

    const fresh: LinkOperation = { ...importedOp, imported: undefined, annotationRef: undefined };
    const freshOut = await PDFDocument.load(await pdfEngine.savePdf(original, [fresh]));
    expect(decodePageContentText(freshOut, freshOut.getPage(0))).toContain("0.75 w");
  });
});

describe("PdfEngine.savePdf – imported link annotation suppression", () => {
  async function pdfWithLinkAnnotations(): Promise<{ bytes: Uint8Array; ids: string[] }> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const makeAnnotation = (url: string) =>
      pdf.context.obj({
        Type: "Annot",
        Subtype: "Link",
        Rect: [10, 10, 100, 30],
        Border: [0, 0, 0],
        A: { Type: "Action", S: "URI", URI: PDFString.of(url) },
      });
    const refA = pdf.context.register(makeAnnotation("https://a.example"));
    const refB = pdf.context.register(makeAnnotation("https://b.example"));
    page.node.set(PDFName.of("Annots"), pdf.context.obj([refA, refB]));
    const bytes = new Uint8Array(await pdf.save({ useObjectStreams: false }));
    return { bytes, ids: [refA, refB].map((ref) => `${ref.objectNumber}R${ref.generationNumber === 0 ? "" : ref.generationNumber}`) };
  }

  it("strips suppressed imported link annotations and keeps unmatched ones", async () => {
    const { bytes, ids } = await pdfWithLinkAnnotations();
    const out = await pdfEngine.savePdf(bytes, [], undefined, { suppressLinkAnnotationIds: [ids[0]] });
    const reloaded = await PDFDocument.load(out);
    const annots = reloaded.getPage(0).node.Annots();
    expect(annots?.size()).toBe(1);
    const survivor = annots!.lookup(0, PDFDict);
    const action = survivor.lookup(PDFName.of("A"), PDFDict);
    expect(String(action.get(PDFName.of("URI")))).toContain("b.example");
  });

  it("suppresses originals while their re-emitted operations are written back", async () => {
    const { bytes, ids } = await pdfWithLinkAnnotations();
    const operations: EditOperation[] = [
      {
        id: "link_reemitted",
        type: "link",
        pageIndex: 0,
        rect: { x: 10, y: 10, width: 90, height: 20 },
        target: { kind: "url", href: "https://a-edited.example" },
        imported: true,
        annotationRef: ids[0],
        createdAt: 1,
      },
    ];
    const out = await pdfEngine.savePdf(bytes, operations, undefined, { suppressLinkAnnotationIds: ids });
    const reloaded = await PDFDocument.load(out);
    const annots = reloaded.getPage(0).node.Annots();
    // Both originals stripped, one edited copy re-emitted.
    expect(annots?.size()).toBe(1);
    const survivor = annots!.lookup(0, PDFDict);
    const action = survivor.lookup(PDFName.of("A"), PDFDict);
    expect(String(action.get(PDFName.of("URI")))).toContain("a-edited.example");
  });

  it("leaves pages untouched when no suppressed id matches and skips pages without Annots", async () => {
    const { bytes } = await pdfWithLinkAnnotations();
    const twoPage = await PDFDocument.load(bytes);
    twoPage.addPage([612, 792]);
    const twoPageBytes = new Uint8Array(await twoPage.save({ useObjectStreams: false }));
    // "garbage" is not an object-reference id (dropped), "5R2" exercises the
    // explicit-generation form, "12345R" parses but matches nothing.
    const out = await pdfEngine.savePdf(twoPageBytes, [], undefined, {
      suppressLinkAnnotationIds: ["garbage", "5R2", "12345R"],
    });
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPage(0).node.Annots()?.size()).toBe(2);
    expect(reloaded.getPage(1).node.Annots()).toBeUndefined();
  });
});

describe("PdfEngine.savePdf – hexToRgb color forms", () => {
  it("handles 3-char, 6-char and short (padded) hex via whiteout colors", async () => {
    const original = await blankPdfBytes();
    const operations: EditOperation[] = [
      {
        id: "w_3",
        type: "whiteout",
        pageIndex: 0,
        rect: { x: 10, y: 700, width: 40, height: 20 },
        color: "#abc",
        createdAt: 1,
      },
      {
        id: "w_6",
        type: "whiteout",
        pageIndex: 0,
        rect: { x: 10, y: 660, width: 40, height: 20 },
        color: "#aabbcc",
        createdAt: 2,
      },
      {
        id: "w_pad",
        type: "whiteout",
        pageIndex: 0,
        // 4-char normalized -> padEnd branch in hexToRgb
        rect: { x: 10, y: 620, width: 40, height: 20 },
        color: "#ab",
        createdAt: 3,
      },
    ];
    await expect(pdfEngine.savePdf(original, operations)).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe("PdfEngine.savePdf – export validity (writer registry regression)", () => {
  it("writes text, highlight, shape, stamp, form-field and link operations to a loadable, page-count-preserved PDF", async () => {
    const original = await blankPdfBytes(2);
    const operations: EditOperation[] = [
      {
        id: "text_1",
        type: "text",
        pageIndex: 0,
        rect: { x: 72, y: 700, width: 200, height: 24 },
        text: "Hello world",
        fontFamily: "Helvetica",
        fontSize: 14,
        color: "#101010",
        align: "left",
        createdAt: 1,
      },
      {
        id: "highlight_1",
        type: "annotation",
        kind: "highlight",
        pageIndex: 0,
        rect: { x: 72, y: 640, width: 160, height: 20 },
        color: "#facc15",
        createdAt: 2,
      },
      {
        id: "shape_1",
        type: "shape",
        kind: "rectangle",
        pageIndex: 0,
        rect: { x: 72, y: 580, width: 100, height: 60 },
        stroke: "#1d4ed8",
        strokeWidth: 2,
        createdAt: 3,
      },
      {
        id: "stamp_1",
        type: "stamp",
        pageIndex: 1,
        rect: { x: 72, y: 500, width: 120, height: 30 },
        label: "approved",
        color: "#166534",
        borderColor: "#166534",
        createdAt: 4,
      },
      {
        id: "form_field_1",
        type: "form-field",
        kind: "text",
        name: "fullName",
        value: "Akki",
        pageIndex: 1,
        rect: { x: 72, y: 440, width: 160, height: 24 },
        createdAt: 5,
      },
      {
        id: "link_1",
        type: "link",
        pageIndex: 1,
        rect: { x: 72, y: 400, width: 120, height: 24 },
        target: { kind: "url", href: "https://example.com" },
        createdAt: 6,
      },
    ];
    const out = await pdfEngine.savePdf(original, operations);
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(2);
    expect(reloaded.getPage(1).node.Annots()?.size()).toBe(1);
  });
});

describe("PdfEngine page operations (pdf-lib only)", () => {
  const engine = new PdfEngine();

  it("creates a blank document with defaults and custom args", async () => {
    const def = await engine.createBlankDocument();
    expect(def.pageCount).toBe(1);
    expect(def.name).toBe("blank-document.pdf");
    const custom = await engine.createBlankDocument("custom.pdf", [200, 300]);
    expect(custom.name).toBe("custom.pdf");
    const sizes = await engine.getPageSizes(custom.bytes);
    expect(Math.round(sizes[0].width)).toBe(200);
  });

  it("inserts a blank page clamped at start, middle and end", async () => {
    const original = await blankPdfBytes(2);
    for (const index of [-5, 0, 1, 50]) {
      const out = await engine.insertBlankPage(original, index);
      const reloaded = await PDFDocument.load(out);
      expect(reloaded.getPageCount()).toBe(3);
    }
  });

  it("deletes a page and throws on the only page", async () => {
    const two = await blankPdfBytes(2);
    const out = await engine.deletePage(two, 0);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);

    const one = await blankPdfBytes(1);
    await expect(engine.deletePage(one, 0)).rejects.toThrow(/only page/);
  });

  it("accumulates rotation modulo 360", async () => {
    const original = await blankPdfBytes(1);
    let bytes = await engine.rotatePage(original, 0, 270);
    bytes = await engine.rotatePage(bytes, 0, 180); // 450 % 360 = 90
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPage(0).getRotation().angle).toBe(90);

    const def = await engine.rotatePage(original, 0); // default 90
    expect((await PDFDocument.load(def)).getPage(0).getRotation().angle).toBe(90);
  });

  it("returns the sizes of every page", async () => {
    const original = await blankPdfBytes(2);
    const sizes = await engine.getPageSizes(original);
    expect(sizes).toHaveLength(2);
    expect(sizes[0]).toEqual({ width: 612, height: 792 });
  });
});
