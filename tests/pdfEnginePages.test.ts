import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { pdfEngine } from "../src/engine/pdfEngine";

async function makePdf(pageCount: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pageCount; i += 1) {
    const page = pdf.addPage([612, 792]);
    // Give each page a unique width so we can track identity after reorders.
    page.setWidth(600 + i);
  }
  return new Uint8Array(await pdf.save());
}

async function widths(bytes: Uint8Array): Promise<number[]> {
  const sizes = await pdfEngine.getPageSizes(bytes);
  return sizes.map((size) => Math.round(size.width));
}

describe("PdfEngine page operations", () => {
  it("inserts a blank page after the given index", async () => {
    const bytes = await makePdf(2);
    const out = await pdfEngine.insertBlankPage(bytes, 0);
    expect((await pdfEngine.getPageSizes(out)).length).toBe(3);
  });

  it("deletes a page and refuses to delete the only page", async () => {
    const bytes = await makePdf(2);
    const out = await pdfEngine.deletePage(bytes, 0);
    expect(await widths(out)).toEqual([601]);
    const single = await makePdf(1);
    await expect(pdfEngine.deletePage(single, 0)).rejects.toThrow(/only page/i);
  });

  it("duplicates a page right after the source", async () => {
    const bytes = await makePdf(3);
    const out = await pdfEngine.duplicatePage(bytes, 1);
    expect(await widths(out)).toEqual([600, 601, 601, 602]);
  });

  it("moves a page forward", async () => {
    const bytes = await makePdf(3);
    const out = await pdfEngine.movePage(bytes, 0, 2);
    expect(await widths(out)).toEqual([601, 602, 600]);
  });

  it("moves a page backward", async () => {
    const bytes = await makePdf(3);
    const out = await pdfEngine.movePage(bytes, 2, 0);
    expect(await widths(out)).toEqual([602, 600, 601]);
  });

  it("extracts a subset of pages into a new PDF", async () => {
    const bytes = await makePdf(4);
    const out = await pdfEngine.extractPages(bytes, [3, 1]);
    // Order follows the indices array as passed.
    expect(await widths(out)).toEqual([603, 601]);
  });

  it("throws when extracting no valid pages", async () => {
    const bytes = await makePdf(2);
    await expect(pdfEngine.extractPages(bytes, [9, 10])).rejects.toThrow(/no valid pages/i);
  });

  it("merges another PDF at the given index", async () => {
    const base = await makePdf(2);
    const incoming = await makePdf(1);
    const out = await pdfEngine.mergePdf(base, incoming, 1);
    expect(await widths(out)).toEqual([600, 600, 601]);
  });

  it("appends a merged PDF when no index is given", async () => {
    const base = await makePdf(2);
    const incoming = await makePdf(2);
    const out = await pdfEngine.mergePdf(base, incoming);
    expect((await pdfEngine.getPageSizes(out)).length).toBe(4);
  });
});
