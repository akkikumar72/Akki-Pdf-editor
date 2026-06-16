import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { pdfEngine } from "../src/engine/pdfEngine";
import type { EditOperation } from "../src/types/editor";

async function blankPdfBytes(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.addPage([612, 792]);
  return new Uint8Array(await pdf.save());
}

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
        href: "https://example.com",
        opacity: 1,
        createdAt: 1,
      },
      {
        id: "link_danger",
        type: "link",
        pageIndex: 0,
        rect: { x: 40, y: 560, width: 160, height: 28 },
        href: "javascript:alert(1)",
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
