import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { PdfEngine, pdfEngine } from "../src/engine/pdfEngine";
import type { EditOperation } from "../src/types/editor";

const REAL_TTF = new Uint8Array(
  readFileSync(path.resolve(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf")),
);

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
const JPEG_B64 =
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/2wBDAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQH/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAAAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AfwAH/9k=";

async function blankPdfBytes(pages = 1): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) pdf.addPage([612, 792]);
  return new Uint8Array(await pdf.save());
}

describe("PdfEngine page operations (pdf-lib)", () => {
  it("creates a blank document with defaults and a custom size", async () => {
    const a = await pdfEngine.createBlankDocument();
    expect(a.pageCount).toBe(1);
    expect(a.name).toBe("blank-document.pdf");
    expect(a.fingerprint).toContain("blank-document.pdf");
    const sizes = await pdfEngine.getPageSizes(a.bytes);
    expect(sizes[0]).toEqual({ width: 612, height: 792 });

    const b = await pdfEngine.createBlankDocument("custom.pdf", [200, 300]);
    expect((await pdfEngine.getPageSizes(b.bytes))[0]).toEqual({ width: 200, height: 300 });
  });

  it("inserts a blank page after the given index", async () => {
    const out = await pdfEngine.insertBlankPage(await blankPdfBytes(2), 0);
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(3);
  });

  it("clamps the insert index to the page range", async () => {
    const out = await pdfEngine.insertBlankPage(await blankPdfBytes(1), 99);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(2);
  });

  it("deletes a page but refuses to delete the only page", async () => {
    const out = await pdfEngine.deletePage(await blankPdfBytes(2), 1);
    expect((await PDFDocument.load(out)).getPageCount()).toBe(1);
    await expect(pdfEngine.deletePage(await blankPdfBytes(1), 0)).rejects.toThrow(/only page/);
  });

  it("rotates a page by the default and a custom amount", async () => {
    const once = await pdfEngine.rotatePage(await blankPdfBytes(1), 0);
    expect((await PDFDocument.load(once)).getPage(0).getRotation().angle).toBe(90);
    const twice = await pdfEngine.rotatePage(once, 0, 270);
    expect((await PDFDocument.load(twice)).getPage(0).getRotation().angle).toBe(0);
  });

  it("exposes a default singleton and a constructable class", () => {
    expect(pdfEngine).toBeInstanceOf(PdfEngine);
    expect(new PdfEngine()).toBeInstanceOf(PdfEngine);
  });
});

describe("PdfEngine.savePdf — every operation branch", () => {
  it("draws every operation type and reloads as a valid PDF", async () => {
    const original = await blankPdfBytes(1);
    const operations = ([
      // standalone whiteout (no explicit opacity -> ?? 1)
      { id: "w1", type: "whiteout", pageIndex: 0, rect: { x: 10, y: 760, width: 50, height: 16 }, color: "#ffffff" },
      // replacement text: center aligned, masked, 3-char hex color, embeddedFontKey with no fonts map
      {
        id: "t-center",
        type: "text",
        pageIndex: 0,
        rect: { x: 60, y: 720, width: 200, height: 18 },
        text: "Centered",
        fontFamily: "Helvetica",
        fontSize: 12,
        color: "#abc",
        align: "center",
        whiteout: true,
        whiteoutColor: "#eee",
        sourceCoverRect: { x: 60, y: 720, width: 120, height: 18 },
        embeddedFontKey: "g_d0_f1",
        opacity: 1,
        createdAt: 1,
      },
      {
        id: "t-right",
        type: "text",
        pageIndex: 0,
        rect: { x: 60, y: 700, width: 200, height: 18 },
        text: "Right",
        fontFamily: "Times New Roman",
        fontSize: 12,
        color: "#222222",
        align: "right",
        createdAt: 1,
      },
      // masked text without sourceCoverRect/whiteoutColor -> default mask rect + #ffffff
      {
        id: "t-mask-default",
        type: "text",
        pageIndex: 0,
        rect: { x: 60, y: 710, width: 100, height: 16 },
        text: "Masked",
        fontFamily: "Helvetica",
        fontSize: 12,
        color: "#000000",
        align: "left",
        whiteout: true,
        createdAt: 1,
      },
      // annotation highlight without opacity (-> ?? 0.28)
      { id: "h1", type: "annotation", kind: "highlight", pageIndex: 0, rect: { x: 10, y: 680, width: 80, height: 14 }, color: "#fc0" },
      { id: "s1", type: "annotation", kind: "strikeout", pageIndex: 0, rect: { x: 10, y: 660, width: 80, height: 12 }, color: "#ef4444", strokeWidth: 2, opacity: 1 },
      { id: "u1", type: "annotation", kind: "underline", pageIndex: 0, rect: { x: 10, y: 640, width: 80, height: 12 }, color: "#ef4444", opacity: 1 },
      { id: "n1", type: "annotation", kind: "note", pageIndex: 0, rect: { x: 10, y: 600, width: 90, height: 30 }, color: "#2563eb", text: "Note body", opacity: 1 },
      { id: "n2", type: "annotation", kind: "note", pageIndex: 0, rect: { x: 110, y: 600, width: 90, height: 30 }, color: "#2563eb", opacity: 1 },
      // shapes: ellipse (valid fill), line, arrow, rect (no fill -> undefined), rect (invalid hex -> undefined)
      { id: "sh-e", type: "shape", kind: "ellipse", pageIndex: 0, rect: { x: 10, y: 540, width: 60, height: 40 }, stroke: "#111827", fill: "#00ff00", strokeWidth: 1.5, opacity: 1 },
      { id: "sh-l", type: "shape", kind: "line", pageIndex: 0, rect: { x: 80, y: 540, width: 60, height: 40 }, stroke: "#111827", strokeWidth: 1.5, opacity: 1 },
      { id: "sh-a", type: "shape", kind: "arrow", pageIndex: 0, rect: { x: 150, y: 540, width: 60, height: 40 }, stroke: "#111827", strokeWidth: 1.5, opacity: 1 },
      { id: "sh-r", type: "shape", kind: "rectangle", pageIndex: 0, rect: { x: 220, y: 540, width: 60, height: 40 }, stroke: "#111827", strokeWidth: 1.5, opacity: 1 },
      { id: "sh-bad", type: "shape", kind: "rectangle", pageIndex: 0, rect: { x: 300, y: 540, width: 60, height: 40 }, stroke: "#111827", fill: "not-a-color", strokeWidth: 1.5, opacity: 1 },
      // ink: multi-point draws, single-point is skipped
      { id: "ink1", type: "ink", pageIndex: 0, rect: { x: 10, y: 500, width: 100, height: 20 }, points: [{ x: 10, y: 500 }, { x: 60, y: 520 }, { x: 110, y: 500 }], stroke: "#111827", strokeWidth: 2, opacity: 1 },
      { id: "ink0", type: "ink", pageIndex: 0, rect: { x: 10, y: 480, width: 1, height: 1 }, points: [{ x: 10, y: 480 }], stroke: "#111827", strokeWidth: 2, opacity: 1 },
      // images: default-mime png (no ";"), jpeg, png signature
      { id: "img-png", type: "image", pageIndex: 0, rect: { x: 10, y: 440, width: 20, height: 20 }, dataUrl: `data:base64,${PNG_B64}`, mimeType: "image/png", opacity: 1 },
      { id: "img-jpg", type: "image", pageIndex: 0, rect: { x: 40, y: 440, width: 20, height: 20 }, dataUrl: `data:image/jpeg;base64,${JPEG_B64}`, mimeType: "image/jpeg", opacity: 1 },
      { id: "sig-img", type: "signature", mode: "image", pageIndex: 0, rect: { x: 70, y: 440, width: 20, height: 20 }, value: `data:image/png;base64,${PNG_B64}`, color: "#111827", fontFamily: "Inter", opacity: 1 },
      // typed signature
      { id: "sig-typed", type: "signature", mode: "typed", pageIndex: 0, rect: { x: 100, y: 440, width: 120, height: 40 }, value: "Akki", color: "#111827", fontFamily: "EB Garamond", opacity: 1 },
      // stamp
      { id: "stamp1", type: "stamp", pageIndex: 0, rect: { x: 10, y: 400, width: 90, height: 30 }, label: "approved", color: "#b91c1c", borderColor: "#b91c1c", opacity: 0.9 },
      // form-marks
      { id: "fm-c", type: "form-mark", mark: "check", pageIndex: 0, rect: { x: 10, y: 370, width: 16, height: 16 }, color: "#111827", opacity: 1 },
      { id: "fm-x", type: "form-mark", mark: "cross", pageIndex: 0, rect: { x: 30, y: 370, width: 16, height: 16 }, color: "#111827", opacity: 1 },
      { id: "fm-d", type: "form-mark", mark: "dot", pageIndex: 0, rect: { x: 50, y: 370, width: 16, height: 16 }, color: "#111827", opacity: 1 },
      // form-fields
      { id: "ff-cb1", type: "form-field", kind: "checkbox", pageIndex: 0, rect: { x: 10, y: 330, width: 30, height: 16 }, name: "cb1", checked: true, opacity: 1 },
      { id: "ff-cb0", type: "form-field", kind: "checkbox", pageIndex: 0, rect: { x: 50, y: 330, width: 30, height: 16 }, name: "cb0", checked: false, opacity: 1 },
      { id: "ff-r1", type: "form-field", kind: "radio", pageIndex: 0, rect: { x: 90, y: 330, width: 30, height: 16 }, name: "r1", checked: true, opacity: 1 },
      { id: "ff-r0", type: "form-field", kind: "radio", pageIndex: 0, rect: { x: 130, y: 330, width: 30, height: 16 }, name: "r0", checked: false, opacity: 1 },
      { id: "ff-sig", type: "form-field", kind: "signature", pageIndex: 0, rect: { x: 170, y: 330, width: 90, height: 24 }, name: "sig", opacity: 1 },
      { id: "ff-tv", type: "form-field", kind: "text", pageIndex: 0, rect: { x: 10, y: 300, width: 90, height: 22 }, name: "tv", value: "typed", opacity: 1 },
      { id: "ff-tn", type: "form-field", kind: "text", pageIndex: 0, rect: { x: 110, y: 300, width: 90, height: 22 }, name: "placeholder", opacity: 1 },
      // links: first creates Annots, second pushes to existing, third dropped (unsafe)
      { id: "lk1", type: "link", pageIndex: 0, rect: { x: 10, y: 260, width: 120, height: 20 }, href: "https://example.com", opacity: 1 },
      { id: "lk2", type: "link", pageIndex: 0, rect: { x: 10, y: 230, width: 120, height: 20 }, href: "https://example.org", opacity: 1 },
      { id: "lk3", type: "link", pageIndex: 0, rect: { x: 10, y: 200, width: 120, height: 20 }, href: "javascript:alert(1)", opacity: 1 },
      // page out of range -> skipped
      { id: "oob", type: "whiteout", pageIndex: 9, rect: { x: 0, y: 0, width: 5, height: 5 }, color: "#fff" },
    ] as const).map((o) => ({ createdAt: 1, ...o })) as unknown as EditOperation[];
    const out = await pdfEngine.savePdf(original, operations);
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getPageCount()).toBe(1);
    expect(reloaded.getPage(0).node.Annots()?.size()).toBe(2);
  });

  it("ignores embeddedFontKey when the font program bytes cannot be parsed", async () => {
    const original = await blankPdfBytes(1);
    const operations: EditOperation[] = [
      {
        id: "t-badfont",
        type: "text",
        pageIndex: 0,
        rect: { x: 10, y: 700, width: 100, height: 18 },
        text: "Hi",
        fontFamily: "Helvetica",
        fontSize: 12,
        color: "#000000",
        align: "left",
        embeddedFontKey: "g_d0_f9",
        createdAt: 1,
      },
    ];
    // fonts map carries unparseable bytes -> embeddedCovers fontkit.create throws -> false.
    const fonts = { g_d0_f9: { key: "g_d0_f9", bytes: new Uint8Array([1, 2, 3, 4]) } };
    await expect(pdfEngine.savePdf(original, operations, fonts)).resolves.toBeInstanceOf(Uint8Array);
  });

  it("reuses the document's embedded font when it covers the replacement text", async () => {
    const original = await blankPdfBytes(1);
    const mk = (id: string): EditOperation => ({
      id,
      type: "text",
      pageIndex: 0,
      rect: { x: 10, y: 700, width: 120, height: 18 },
      text: "Hi there",
      fontFamily: "Helvetica",
      fontSize: 12,
      color: "#000000",
      align: "left",
      embeddedFontKey: "lib",
      createdAt: 1,
    });
    // Two ops with the same key exercise both the fontkit and reused-font caches.
    const out = await pdfEngine.savePdf(original, [mk("r1"), mk("r2")], { lib: { key: "lib", bytes: REAL_TTF } });
    expect(out).toBeInstanceOf(Uint8Array);
  });

  it("rejects when a glyph is missing from the embedded font and the fallback cannot encode it", async () => {
    const original = await blankPdfBytes(1);
    // LiberationSans lacks CJK glyphs -> embeddedCovers returns false -> fallback
    // Helvetica (WinAnsi) cannot encode the characters -> drawText throws.
    const op: EditOperation = {
      id: "cjk",
      type: "text",
      pageIndex: 0,
      rect: { x: 10, y: 700, width: 120, height: 18 },
      text: "你好",
      fontFamily: "Helvetica",
      fontSize: 12,
      color: "#000000",
      align: "left",
      embeddedFontKey: "lib",
      createdAt: 1,
    };
    await expect(pdfEngine.savePdf(original, [op], { lib: { key: "lib", bytes: REAL_TTF } })).rejects.toThrow(/WinAnsi/);
  });
});
