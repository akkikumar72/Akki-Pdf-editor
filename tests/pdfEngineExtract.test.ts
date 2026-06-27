import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const REAL_TTF = readFileSync(
  path.resolve(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf"),
);
const REAL_TTF_ITALIC = readFileSync(
  path.resolve(process.cwd(), "node_modules/pdfjs-dist/standard_fonts/LiberationSans-Italic.ttf"),
);

const hoisted = vi.hoisted(() => ({ pdf: null as unknown }));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: () => ({ promise: Promise.resolve(hoisted.pdf) }),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setPdf(pdf: any) {
  hoisted.pdf = pdf;
}

async function importEngine() {
  return (await import("../src/engine/pdfEngine")).pdfEngine;
}

function file() {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "doc.pdf", { type: "application/pdf" });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PdfEngine.loadDocument (mocked pdfjs)", () => {
  it("returns metadata with a fingerprint from the fingerprints array", async () => {
    setPdf({ numPages: 3, fingerprints: ["fp-123"], destroy: () => Promise.resolve() });
    const engine = await importEngine();
    const loaded = await engine.loadDocument(file(), "pw");
    expect(loaded.pageCount).toBe(3);
    expect(loaded.fingerprint).toBe("fp-123");
    expect(loaded.name).toBe("doc.pdf");
  });

  it("falls back to undefined when fingerprints is empty or missing, tolerating destroy errors", async () => {
    setPdf({ numPages: 1, fingerprints: [undefined], destroy: () => Promise.reject(new Error("x")) });
    const engine = await importEngine();
    expect((await engine.loadDocument(file())).fingerprint).toBeUndefined();

    setPdf({ numPages: 1, fingerprints: undefined, destroy: () => Promise.resolve() });
    expect((await engine.loadDocument(file())).fingerprint).toBeUndefined();
  });
});

describe("PdfEngine.extractTextAndFonts (mocked pdfjs)", () => {
  it("walks every page and item shape, resolving font metadata across commonObjs variants", async () => {
    const page0CommonObjs = {
      has: (id: string) => id === "Helv" || id === "RealFont" || id === "ItalicFont" || id === "BoldName",
      get: (id: string) => {
        if (id === "Helv") return { name: "ABCDEF+Roboto", bold: true, italic: true, data: new Uint8Array([1, 2, 3, 4]), mimetype: "font/ttf" };
        if (id === "RealFont") return { name: "Liberation Sans", bold: false, italic: false, data: new Uint8Array(REAL_TTF), mimetype: "font/ttf" };
        if (id === "ItalicFont") return { name: "Liberation Sans Italic", data: new Uint8Array(REAL_TTF_ITALIC) };
        if (id === "BoldName") return { name: "Helvetica-Bold", data: [1, 2, 3] }; // Array -> toUint8Array Array branch
        return null;
      },
    };
    const page0 = {
      getOperatorList: () => Promise.resolve(),
      commonObjs: page0CommonObjs,
      getTextContent: () =>
        Promise.resolve({
          styles: { Helv: { fontFamily: "Helvetica" }, NoStyle: {} },
          items: [
            {}, // no "str" -> continue
            { str: "   " }, // blank -> continue
            { str: "Hello", transform: [2, 0, 0, 2, 40, 700], fontName: "Helv", width: 30, height: 12 },
            { str: "World", fontName: "Helv" }, // cache hit, no width/height/transform
            { str: "Real", fontName: "RealFont", transform: [3, 0, 0, 3, 10, 600] },
            { str: "Slanted", fontName: "ItalicFont" },
            { str: "Bolded", fontName: "BoldName" }, // name infers weight 700 (nameWeight !== 400 path)
            { str: "Missing", fontName: "AbsentKey" }, // has() false -> meta undefined
            { str: "Zero", transform: [0, 0, 0, 0, 0, 0], fontName: "NoStyle" }, // fontSize fallback to 12
            { str: "Anon", fontName: 123 }, // non-string fontName -> no key
          ],
        }),
    };
    const page1 = {
      getOperatorList: () => Promise.resolve(),
      commonObjs: {
        // no `has` method -> available defaults to true
        get: (id: string) => {
          if (id === "AB") return { name: 999, bold: 0, italic: 0, data: new ArrayBuffer(4), mimetype: 42 }; // non-string name/mimetype, ArrayBuffer data
          if (id === "STR") return { name: "Named", data: "not-bytes" }; // data string -> toUint8Array undefined
          if (id === "NULLOBJ") return null; // obj falsy
          throw new Error("boom"); // get throws -> catch
        },
      },
      getTextContent: () =>
        Promise.resolve({
          styles: {},
          items: [
            { str: "ab", fontName: "AB", transform: [1, 0, 0, 1] }, // transform[4]/[5] undefined -> ?? 0
            { str: "s", fontName: "STR" },
            { str: "n", fontName: "NULLOBJ" },
            { str: "t", fontName: "THROWS" },
          ],
        }),
    };
    const page2 = {
      getOperatorList: () => Promise.reject(new Error("no oplist")), // -> commonObjs null
      commonObjs: { has: () => true, get: () => ({ name: "ignored" }) },
      getTextContent: () => Promise.resolve({ styles: {}, items: [{ str: "p2", fontName: "Whatever" }] }),
    };

    setPdf({
      numPages: 3,
      getPage: (n: number) => Promise.resolve([page0, page1, page2][n - 1]),
      destroy: () => Promise.reject(new Error("destroy")), // exercise the destroy().catch
    });

    const engine = await importEngine();
    const { items, fonts } = await engine.extractTextAndFonts(new Uint8Array([1]));

    expect(items.find((i) => i.str === "Hello")).toMatchObject({ pageIndex: 0, fontWeight: 700, italic: true });
    expect(items.find((i) => i.str === "Real")?.fontName).toBe("Liberation Sans");
    expect(items.find((i) => i.str === "Bolded")?.fontWeight).toBe(700);
    expect(items.find((i) => i.str === "Zero")?.fontSize).toBe(12);
    expect(items.find((i) => i.str === "p2")).toBeTruthy();
    // RealFont program parsed by fontkit -> family metadata captured.
    expect(fonts.RealFont?.familyName).toBeTruthy();
    expect(fonts.RealFont?.weight).toBeTypeOf("number");
    expect(fonts.ItalicFont?.italic).toBe(true);
  });

  it("extracts a single requested page only", async () => {
    const page = {
      getOperatorList: () => Promise.resolve(),
      commonObjs: { has: () => false, get: () => null },
      getTextContent: () => Promise.resolve({ styles: {}, items: [{ str: "only", fontName: "F" }] }),
    };
    setPdf({
      numPages: 5,
      getPage: (n: number) => {
        expect(n).toBe(3); // pageIndex 2 -> page 3
        return Promise.resolve(page);
      },
      destroy: () => Promise.resolve(),
    });
    const engine = await importEngine();
    const { items } = await engine.extractTextAndFonts(new Uint8Array([1]), 2);
    expect(items).toHaveLength(1);
    expect(items[0].pageIndex).toBe(2);
  });
});
