import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (hoisted; isolated to this file) -------------------------------
// The worker URL import is a static side-effect import in pdfEngine.ts.
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker-src" }));

// getDocument is reassigned per-test through this mutable holder so each test can
// shape the fake document/pages it needs.
const state: {
  getDocument: ReturnType<typeof vi.fn>;
  workerOptions: { workerSrc?: string };
} = {
  getDocument: vi.fn(),
  workerOptions: {},
};

vi.mock("pdfjs-dist", () => ({
  get GlobalWorkerOptions() {
    return state.workerOptions;
  },
  getDocument: (...args: unknown[]) => (state.getDocument as (...a: unknown[]) => unknown)(...args),
}));

import { PdfEngine } from "../src/engine/pdfEngine";

const REAL_FONT = new Uint8Array(
  readFileSync("node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf"),
);

function fakeFile(bytes = new Uint8Array([1, 2, 3, 4]), name = "doc.pdf"): File {
  return {
    name,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  } as unknown as File;
}

afterEach(() => {
  vi.clearAllMocks();
  state.getDocument = vi.fn();
  state.workerOptions = {};
});

describe("PdfEngine.loadDocument", () => {
  let engine: PdfEngine;
  beforeEach(() => {
    engine = new PdfEngine();
  });

  it("returns metadata with a fingerprint and sets the worker source", async () => {
    const destroy = vi.fn(async () => undefined);
    const fakePdf = { numPages: 4, fingerprints: ["abc123", "def"], destroy };
    state.getDocument.mockReturnValue({ promise: Promise.resolve(fakePdf) });

    const result = await engine.loadDocument(fakeFile(), "secret");
    expect(result).toMatchObject({ name: "doc.pdf", pageCount: 4, fingerprint: "abc123" });
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(state.workerOptions.workerSrc).toBe("worker-src");
    expect(destroy).toHaveBeenCalled();
    // Password forwarded to getDocument.
    expect(state.getDocument.mock.calls[0][0]).toMatchObject({ password: "secret" });
  });

  it("returns an undefined fingerprint when fingerprints is not an array", async () => {
    const fakePdf = { numPages: 1, fingerprints: null, destroy: vi.fn(async () => undefined) };
    state.getDocument.mockReturnValue({ promise: Promise.resolve(fakePdf) });
    const result = await engine.loadDocument(fakeFile());
    expect(result.fingerprint).toBeUndefined();
  });

  it("swallows a rejected destroy() in the finally block", async () => {
    const fakePdf = {
      numPages: 2,
      fingerprints: [],
      destroy: vi.fn(() => Promise.reject(new Error("destroy failed"))),
    };
    state.getDocument.mockReturnValue({ promise: Promise.resolve(fakePdf) });
    const result = await engine.loadDocument(fakeFile());
    expect(result.pageCount).toBe(2);
    // fingerprints is an empty array -> fingerprints[0] ?? undefined
    expect(result.fingerprint).toBeUndefined();
  });

  it("propagates pdf.js's rejection for a structurally corrupt document", async () => {
    // A truncated PDF passes the %PDF- magic-byte validation but fails the
    // real parse; that rejection must reach the caller so the UI can report it.
    state.getDocument.mockReturnValue({ promise: Promise.reject(new Error("Invalid PDF structure")) });
    await expect(engine.loadDocument(fakeFile())).rejects.toThrow("Invalid PDF structure");
  });
});

// --- extractTextAndFonts --------------------------------------------------

type ItemSpec = Record<string, unknown>;

function makePage(opts: {
  items: ItemSpec[];
  styles?: Record<string, Record<string, unknown>>;
  operatorListThrows?: boolean;
  commonObjs?: unknown;
  annotations?: ItemSpec[];
  annotationsThrow?: boolean;
}) {
  return {
    getTextContent: async () => ({ items: opts.items, styles: opts.styles ?? {} }),
    getAnnotations: async () => {
      if (opts.annotationsThrow) throw new Error("annotations unavailable");
      return opts.annotations ?? [];
    },
    getOperatorList: async () => {
      if (opts.operatorListThrows) throw new Error("no op list");
      return {};
    },
    commonObjs: opts.commonObjs ?? { has: () => false, get: () => null },
  };
}

function makePdf(
  pages: ReturnType<typeof makePage>[],
  opts: {
    getDestination?: (name: string) => Promise<unknown>;
    getPageIndex?: (ref: unknown) => Promise<number>;
  } = {},
) {
  return {
    numPages: pages.length,
    destroy: vi.fn(async () => undefined),
    getPage: async (n: number) => pages[n - 1],
    getDestination: opts.getDestination ?? (async () => null),
    getPageIndex: opts.getPageIndex ?? (async () => 0),
  };
}

describe("PdfEngine.extractTextAndFonts", () => {
  let engine: PdfEngine;
  beforeEach(() => {
    engine = new PdfEngine();
  });

  it("extracts items across all pages, computing width/height when absent", async () => {
    const page = makePage({
      items: [
        // full transform, width/height present, with a css style
        {
          str: "Hello",
          transform: [12, 0, 0, 12, 100, 200],
          fontName: "f1",
          width: 50,
          height: 12,
        },
        // no transform array -> default transform; no width/height -> computed
        { str: "World", fontName: "f1" },
        // skipped: no str
        { transform: [1, 0, 0, 1, 0, 0], fontName: "f1" },
        // skipped: blank str
        { str: "   ", fontName: "f1" },
      ],
      styles: { f1: { fontFamily: "Arial" } },
    });
    state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page])) });

    const { items, fonts } = await engine.extractTextAndFonts(new Uint8Array([1, 2]));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ str: "Hello", pageIndex: 0, fontName: "f1" });
    expect(items[0].rect).toMatchObject({ x: 100, y: 200, width: 50, height: 12 });
    // Computed width/height for the item lacking them.
    expect(items[1].rect.width).toBeGreaterThan(0);
    expect(items[1].rect.height).toBeGreaterThan(0);
    expect(fonts.f1).toBeDefined();
  });

  it("reads only the requested page index", async () => {
    const page0 = makePage({ items: [{ str: "P0", fontName: "a" }] });
    const page1 = makePage({ items: [{ str: "P1", fontName: "b" }] });
    state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page0, page1])) });
    const { items } = await engine.extractTextAndFonts(new Uint8Array([1]), 1);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ str: "P1", pageIndex: 1 });
  });

  it("uses real font metadata: OS/2 weight, real PostScript name and italic flags", async () => {
    const commonObjs = {
      has: () => true,
      get: () => ({
        name: "ABCDEF+Roboto-Italic",
        bold: false,
        italic: true,
        data: REAL_FONT,
        mimetype: "font/ttf",
      }),
    };
    const page = makePage({
      items: [{ str: "Styled", transform: [10, 0, 0, 10, 5, 5], fontName: "sub1", width: 40, height: 10 }],
      styles: { sub1: { fontFamily: "Roboto" } },
      commonObjs,
    });
    state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page])) });

    const { items, fonts } = await engine.extractTextAndFonts(new Uint8Array([1]));
    expect(items[0].fontName).toBe("Roboto-Italic"); // cleaned real name
    expect(items[0].italic).toBe(true);
    // fontKey is the subset name; font info built from parsed bytes.
    const info = fonts.sub1;
    expect(info).toBeDefined();
    expect(typeof info.weight === "number" || info.weight === undefined).toBe(true);
    expect(info.familyName).toBeTruthy();
  });

  it("uses the bold-name fallback weight when the program cannot be parsed", async () => {
    const commonObjs = {
      has: () => true,
      // unparseable bytes -> buildDocumentFontInfo catch -> no weight; bold flag drives 700
      get: () => ({ name: "g_d0_f9", bold: true, italic: false, data: new Uint8Array([9, 9, 9]) }),
    };
    const page = makePage({
      items: [{ str: "BoldByFlag", transform: [10, 0, 0, 10, 0, 0], fontName: "sub2" }],
      commonObjs,
    });
    state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page])) });
    const { items } = await engine.extractTextAndFonts(new Uint8Array([1]));
    // name heuristic yields 400 (internal id), fontMeta.bold pushes it to 700.
    expect(items[0].fontWeight).toBe(700);
  });

  it("infers weight from the font name when no metadata is present", async () => {
    const page = makePage({
      items: [{ str: "Heavy", transform: [10, 0, 0, 10, 0, 0], fontName: "Roboto-Bold" }],
    });
    state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page])) });
    const { items } = await engine.extractTextAndFonts(new Uint8Array([1]));
    expect(items[0].fontWeight).toBe(700);
  });

  it("treats a thrown getOperatorList as no commonObjs (name-only path)", async () => {
    const page = makePage({
      items: [{ str: "NoMeta", transform: [10, 0, 0, 10, 0, 0], fontName: "subX" }],
      operatorListThrows: true,
    });
    state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page])) });
    const { items, fonts } = await engine.extractTextAndFonts(new Uint8Array([1]));
    expect(items[0].fontName).toBe("subX");
    expect(fonts.subX).toBeDefined();
    expect(fonts.subX.bytes).toBeUndefined();
  });

  it("handles items without a fontName (no font key registered)", async () => {
    const page = makePage({
      items: [{ str: "Anon", transform: [10, 0, 0, 10, 0, 0] }],
    });
    state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page])) });
    const { items, fonts } = await engine.extractTextAndFonts(new Uint8Array([1]));
    expect(items[0].fontName).toBeUndefined();
    expect(Object.keys(fonts)).toHaveLength(0);
  });

  it("caches font metadata reads and tolerates a throwing commonObjs.get", async () => {
    let getCalls = 0;
    const commonObjs = {
      has: () => true,
      get: () => {
        getCalls += 1;
        throw new Error("boom");
      },
    };
    const page = makePage({
      items: [
        { str: "One", transform: [10, 0, 0, 10, 0, 0], fontName: "dup" },
        { str: "Two", transform: [10, 0, 0, 10, 0, 0], fontName: "dup" },
      ],
      commonObjs,
    });
    state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page])) });
    const { items } = await engine.extractTextAndFonts(new Uint8Array([1]));
    expect(items).toHaveLength(2);
    // Second lookup served from cache -> get() called only once.
    expect(getCalls).toBe(1);
  });

  it("normalizes font program bytes from ArrayBuffer, number[] and unknown sources", async () => {
    const realArrayBuffer = REAL_FONT.buffer.slice(
      REAL_FONT.byteOffset,
      REAL_FONT.byteOffset + REAL_FONT.byteLength,
    );
    const cases: Array<{ key: string; data: unknown }> = [
      { key: "ab", data: realArrayBuffer },
      { key: "arr", data: [1, 2, 3, 4] },
      { key: "str", data: "not-bytes" },
    ];
    for (const { key, data } of cases) {
      const commonObjs = {
        has: () => true,
        get: () => ({ name: key, bold: false, italic: false, data }),
      };
      const page = makePage({
        items: [{ str: "X", transform: [10, 0, 0, 10, 0, 0], fontName: key }],
        commonObjs,
      });
      state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page])) });
      const { fonts } = await engine.extractTextAndFonts(new Uint8Array([1]));
      if (key === "ab") expect(fonts[key].bytes).toBeInstanceOf(Uint8Array);
      if (key === "arr") expect(fonts[key].bytes).toBeInstanceOf(Uint8Array);
      if (key === "str") expect(fonts[key].bytes).toBeUndefined();
    }
  });

  it("handles a commonObjs without a has() function and a null object", async () => {
    // has missing -> available defaults true; get returns null -> meta undefined.
    const page = makePage({
      items: [{ str: "NoHas", transform: [10, 0, 0, 10, 0, 0], fontName: "nh" }],
      commonObjs: { get: () => null },
    });
    state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page])) });
    const { items } = await engine.extractTextAndFonts(new Uint8Array([1]));
    expect(items[0].fontName).toBe("nh");
  });

  it("coerces non-string name/mimetype font fields to undefined", async () => {
    const commonObjs = {
      has: () => true,
      // name and mimetype are non-strings -> typeof checks fall to undefined.
      get: () => ({ name: 123, bold: 0, italic: 0, data: new Uint8Array(0), mimetype: 5 }),
    };
    const page = makePage({
      items: [{ str: "Coerce", transform: [10, 0, 0, 10, 0, 0], fontName: "co" }],
      commonObjs,
    });
    state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page])) });
    const { items, fonts } = await engine.extractTextAndFonts(new Uint8Array([1]));
    // realFontName undefined -> falls back to the subset name.
    expect(items[0].fontName).toBe("co");
    expect(fonts.co.mimetype).toBeUndefined();
    // Zero-length data -> buildDocumentFontInfo skips parsing.
    expect(fonts.co.bytes?.byteLength ?? 0).toBe(0);
  });

  it("defaults x/y and computes font size when transform slots are missing", async () => {
    const page = makePage({
      items: [
        // transform present but x/y (indices 4,5) undefined, and [2],[3] zero so
        // hypot is 0 -> falls through to abs(transform[0]) -> 8.
        { str: "Comp", transform: [8, 0, 0, 0], fontName: "c1" },
      ],
    });
    state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page])) });
    const { items } = await engine.extractTextAndFonts(new Uint8Array([1]));
    expect(items[0].rect.x).toBe(0);
    expect(items[0].rect.y).toBe(0);
    expect(items[0].fontSize).toBe(8);
  });

  it("falls back font size to 12 when the whole transform is degenerate", async () => {
    const page = makePage({
      items: [{ str: "Zero", transform: [0, 0, 0, 0, 0, 0], fontName: "z1" }],
    });
    state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page])) });
    const { items } = await engine.extractTextAndFonts(new Uint8Array([1]));
    expect(items[0].fontSize).toBe(12);
  });

  it("swallows a rejected destroy() in extractTextAndFonts finally", async () => {
    const page = makePage({ items: [{ str: "Bye", transform: [10, 0, 0, 10, 0, 0], fontName: "b" }] });
    const pdf = {
      numPages: 1,
      destroy: vi.fn(() => Promise.reject(new Error("destroy boom"))),
      getPage: async () => page,
    };
    state.getDocument.mockReturnValue({ promise: Promise.resolve(pdf) });
    const { items } = await engine.extractTextAndFonts(new Uint8Array([1]));
    expect(items).toHaveLength(1);
  });
});

describe("PdfEngine.extractTextAndFonts – link annotation import", () => {
  let engine: PdfEngine;
  beforeEach(() => {
    engine = new PdfEngine();
  });

  it("imports URI /Link annotations classified by scheme, skipping unsafe and malformed ones", async () => {
    const page = makePage({
      items: [],
      annotations: [
        { subtype: "Link", id: "13R", rect: [10, 20, 110, 50], url: "https://example.com" },
        { subtype: "Link", id: "14R", rect: [10, 60, 110, 90], url: "MAILTO:a@b.dev" },
        { subtype: "Link", id: "15R", rect: [10, 100, 110, 130], url: "tel:+1 234-567" },
        // Unnormalized rect corners + non-string id -> ref undefined.
        { subtype: "Link", id: 7, rect: [110, 150, 10, 120], url: "https://swapped.example" },
        // Skipped: wrong subtype, missing/short rect, unsafe or invalid values.
        { subtype: "Widget", rect: [0, 0, 1, 1], url: "https://widget.example" },
        { subtype: "Link", url: "https://norect.example" },
        { subtype: "Link", rect: [0, 0], url: "https://shortrect.example" },
        { subtype: "Link", rect: [0, 0, 1, 1], url: "javascript:alert(1)" },
        { subtype: "Link", rect: [0, 0, 1, 1], url: "mailto:not-an-email" },
        { subtype: "Link", rect: [0, 0, 1, 1], url: "tel:abc" },
      ],
    });
    state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page])) });
    const { links } = await engine.extractTextAndFonts(new Uint8Array([1]));
    expect(links).toEqual([
      {
        pageIndex: 0,
        rect: { x: 10, y: 20, width: 100, height: 30 },
        target: { kind: "url", href: "https://example.com/" },
        annotationRef: "13R",
      },
      {
        pageIndex: 0,
        rect: { x: 10, y: 60, width: 100, height: 30 },
        target: { kind: "email", href: "mailto:a@b.dev" },
        annotationRef: "14R",
      },
      {
        pageIndex: 0,
        rect: { x: 10, y: 100, width: 100, height: 30 },
        target: { kind: "phone", href: "tel:+1234567" },
        annotationRef: "15R",
      },
      {
        pageIndex: 0,
        rect: { x: 10, y: 120, width: 100, height: 30 },
        target: { kind: "url", href: "https://swapped.example/" },
        annotationRef: undefined,
      },
    ]);
  });

  it("imports GoTo destinations from inline arrays and named destinations", async () => {
    const refA = { num: 3, gen: 0 };
    const refB = { num: 5, gen: 0 };
    const page = makePage({
      items: [],
      annotations: [
        { subtype: "Link", id: "1R", rect: [0, 0, 10, 10], dest: [refA, { name: "XYZ" }, null, null, null] },
        { subtype: "Link", id: "2R", rect: [0, 20, 10, 30], dest: "namedDest" },
        // Skipped: named dest that does not resolve, missing dest, dest[0] null.
        { subtype: "Link", rect: [0, 40, 10, 50], dest: "missingDest" },
        { subtype: "Link", rect: [0, 60, 10, 70] },
        { subtype: "Link", rect: [0, 80, 10, 90], dest: [null] },
      ],
    });
    const getDestination = vi.fn(async (name: string) => (name === "namedDest" ? [refB] : null));
    const getPageIndex = vi.fn(async (ref: unknown) => (ref === refA ? 1 : 2));
    state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page], { getDestination, getPageIndex })) });
    const { links } = await engine.extractTextAndFonts(new Uint8Array([1]));
    expect(links.map((link) => link.target)).toEqual([
      { kind: "page", pageIndex: 1 },
      { kind: "page", pageIndex: 2 },
    ]);
  });

  it("skips GoTo links whose page index cannot be resolved or is bogus", async () => {
    const page = makePage({
      items: [],
      annotations: [
        { subtype: "Link", rect: [0, 0, 10, 10], dest: [{ num: 1, gen: 0 }] },
        { subtype: "Link", rect: [0, 20, 10, 30], dest: [{ num: 2, gen: 0 }] },
        { subtype: "Link", rect: [0, 40, 10, 50], dest: [{ num: 3, gen: 0 }] },
      ],
    });
    const getPageIndex = vi
      .fn()
      .mockRejectedValueOnce(new Error("unresolvable"))
      .mockResolvedValueOnce(-1)
      .mockResolvedValueOnce(1.5);
    state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page], { getPageIndex })) });
    const { links } = await engine.extractTextAndFonts(new Uint8Array([1]));
    expect(links).toEqual([]);
  });

  it("continues text extraction when getAnnotations rejects", async () => {
    const page = makePage({
      items: [{ str: "Still here", transform: [10, 0, 0, 10, 0, 0], fontName: "a" }],
      annotationsThrow: true,
    });
    state.getDocument.mockReturnValue({ promise: Promise.resolve(makePdf([page])) });
    const { items, links } = await engine.extractTextAndFonts(new Uint8Array([1]));
    expect(items).toHaveLength(1);
    expect(links).toEqual([]);
  });
});
