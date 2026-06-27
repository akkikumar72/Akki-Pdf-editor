import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import type { EditOperation } from "../src/types/editor";

// A configurable fontkit.create driven by the first byte of the program, so each
// scenario can return a precisely-shaped font object (or a throwing proxy).
function fakeFont(tag: number): unknown {
  switch (tag) {
    case 1:
      return {
        familyName: "Fam",
        subfamilyName: "Sub",
        "OS/2": { usWeightClass: 600, usWidthClass: 5, fsSelection: 0x01 },
        italicAngle: 0,
      };
    case 2:
      return {
        familyName: 123, // non-string -> undefined
        subfamilyName: 123,
        "OS/2": undefined, // no OS/2 -> weight/widthClass undefined, fsItalic false
        italicAngle: -15, // number !== 0 -> italic via the right side of the OR
      };
    case 3:
      return {
        "OS/2": { usWeightClass: "x", usWidthClass: "y", fsSelection: "z" }, // non-number fields
        italicAngle: "q", // non-number -> italic false
      };
    case 7:
      // hasGlyphForCodePoint works, but any other access (used by pdf-lib's
      // embedder) throws -> getReusedFont's embed catch.
      return new Proxy(
        { hasGlyphForCodePoint: () => true },
        {
          get(target, prop) {
            if (prop === "hasGlyphForCodePoint") return target.hasGlyphForCodePoint;
            throw new Error("mock fontkit: cannot embed");
          },
        },
      );
    case 9:
      return {}; // no hasGlyphForCodePoint -> embeddedCovers bails
    default:
      throw new Error("mock fontkit: unparseable");
  }
}

vi.mock("@pdf-lib/fontkit", () => ({
  default: { create: (bytes: Uint8Array) => fakeFont(bytes[0]) },
}));

const hoisted = vi.hoisted(() => ({ pdf: null as unknown }));
vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: () => ({ promise: Promise.resolve(hoisted.pdf) }),
}));

async function importEngine() {
  return (await import("../src/engine/pdfEngine")).pdfEngine;
}

describe("buildDocumentFontInfo metadata branches (mocked fontkit)", () => {
  it("captures, defaults, and ignores OS/2 metadata per font program shape", async () => {
    const page = {
      getOperatorList: () => Promise.resolve(),
      commonObjs: {
        has: () => true,
        get: (id: string) => {
          if (id === "full") return { name: "Full", data: new Uint8Array([1]) };
          if (id === "partial") return { name: "Partial", data: new Uint8Array([2]) };
          return { name: "Nonnumeric", data: new Uint8Array([3]) };
        },
      },
      getTextContent: () =>
        Promise.resolve({
          styles: {},
          items: [
            { str: "a", fontName: "full" },
            { str: "b", fontName: "partial" },
            { str: "c", fontName: "nonnum" },
          ],
        }),
    };
    hoisted.pdf = { numPages: 1, getPage: () => Promise.resolve(page), destroy: () => Promise.resolve() };

    const engine = await importEngine();
    const { fonts } = await engine.extractTextAndFonts(new Uint8Array([0]));

    expect(fonts.full).toMatchObject({ familyName: "Fam", subfamilyName: "Sub", weight: 600, widthClass: 5, italic: true });
    expect(fonts.partial.familyName).toBeUndefined();
    expect(fonts.partial.weight).toBeUndefined();
    expect(fonts.partial.italic).toBe(true); // italicAngle !== 0
    expect(fonts.nonnum.weight).toBeUndefined();
    expect(fonts.nonnum.widthClass).toBeUndefined();
    expect(fonts.nonnum.italic).toBe(false);
  });
});

describe("savePdf reused-font branches (mocked fontkit)", () => {
  async function save(ops: EditOperation[], fonts: Record<string, { key: string; bytes: Uint8Array }>) {
    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]);
    const bytes = new Uint8Array(await pdf.save());
    const engine = await importEngine();
    return engine.savePdf(bytes, ops, fonts);
  }

  function textOp(key: string): EditOperation {
    return {
      id: `t-${key}`,
      type: "text",
      pageIndex: 0,
      rect: { x: 10, y: 700, width: 100, height: 18 },
      text: "Hi",
      fontFamily: "Helvetica",
      fontSize: 12,
      color: "#000000",
      align: "left",
      embeddedFontKey: key,
      createdAt: 1,
    };
  }

  it("falls back to a standard font when the embedded font cannot be embedded", async () => {
    // tag 7: embeddedCovers returns true, but pdf.embedFont throws -> getReusedFont catch.
    const out = await save([textOp("reuse"), textOp("reuse")], {
      reuse: { key: "reuse", bytes: new Uint8Array([7]) },
    });
    expect(out).toBeInstanceOf(Uint8Array);
  });

  it("falls back when the parsed font exposes no glyph-coverage method", async () => {
    // tag 9: fontkit.create returns an object without hasGlyphForCodePoint.
    const out = await save([textOp("nomethod")], { nomethod: { key: "nomethod", bytes: new Uint8Array([9]) } });
    expect(out).toBeInstanceOf(Uint8Array);
  });
});
