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

  it("writes document metadata that round-trips when read back", async () => {
    const original = await blankPdfBytes();
    const metadata = {
      title: "Quarterly Report",
      author: "Akki",
      subject: "Finance",
      keywords: "report, finance, q3",
      producer: "Akki PDF Editor",
      creator: "Akki",
    };
    const out = await pdfEngine.savePdf(original, [], undefined, { metadata });
    const readBack = await pdfEngine.getMetadata(out);
    expect(readBack.title).toBe(metadata.title);
    expect(readBack.author).toBe(metadata.author);
    expect(readBack.subject).toBe(metadata.subject);
    expect(readBack.keywords).toBe(metadata.keywords);
    expect(readBack.producer).toBe(metadata.producer);
    expect(readBack.creator).toBe(metadata.creator);
  });

  it("getMetadata returns empty strings for a document without info fields", async () => {
    const original = await blankPdfBytes();
    const metadata = await pdfEngine.getMetadata(original);
    expect(metadata.title).toBe("");
    expect(metadata.author).toBe("");
  });

  it("flattens form fields so the saved PDF has no fillable fields", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const form = pdf.getForm();
    const textField = form.createTextField("contact.name");
    textField.setText("Akki");
    textField.addToPage(page, { x: 72, y: 700, width: 200, height: 24 });
    const checkbox = form.createCheckBox("contact.subscribed");
    checkbox.addToPage(page, { x: 72, y: 660, width: 16, height: 16 });
    const withForm = new Uint8Array(await pdf.save());

    // Sanity check: the source document is fillable before flatten.
    const beforeDoc = await PDFDocument.load(withForm);
    expect(beforeDoc.getForm().getFields().length).toBe(2);

    const out = await pdfEngine.savePdf(withForm, [], undefined, { flatten: true });
    const flattened = await PDFDocument.load(out);
    expect(flattened.getForm().getFields().length).toBe(0);
  });

  it("leaves form fields fillable when flatten is not requested", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]);
    const field = pdf.getForm().createTextField("plain.field");
    field.addToPage(page, { x: 72, y: 700, width: 200, height: 24 });
    const withForm = new Uint8Array(await pdf.save());

    const out = await pdfEngine.savePdf(withForm, []);
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getForm().getFields().length).toBe(1);
  });
});
