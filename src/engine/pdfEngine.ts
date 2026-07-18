import { PDFDocument, PDFFont, PDFName, PDFRef, degrees } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type {
  DocumentFontInfo,
  DocumentFonts,
  EditOperation,
  ImportedLinkAnnotation,
  LinkTarget,
  LoadedPdf,
  TextItem,
} from "../types/editor";
import { sanitizeEmailToMailto, sanitizeTel, sanitizeUrl } from "../utils/url";
import { cleanPdfFontName, inferFontWeight, inferItalic, resolvePdfFont } from "./fontResolver";
import {
  type WriterContext,
  writeAnnotation,
  writeFormField,
  writeFormMark,
  writeImage,
  writeInk,
  writeLink,
  writeShape,
  writeSignature,
  writeStamp,
  writeText,
  writeWhiteoutMask,
} from "./operationWriters";

type PdfFontMeta = { name?: string; bold?: boolean; italic?: boolean; data?: Uint8Array; mimetype?: string };

type PdfCommonObjs = {
  has?: (id: string) => boolean;
  get: (
    id: string,
  ) => { name?: unknown; bold?: unknown; italic?: unknown; data?: unknown; mimetype?: unknown } | null | undefined;
};

type FontkitFont = {
  familyName?: string;
  subfamilyName?: string;
  italicAngle?: number;
  ["OS/2"]?: { usWeightClass?: number; usWidthClass?: number; fsSelection?: number };
  hasGlyphForCodePoint?: (codePoint: number) => boolean;
};

function toUint8Array(value: unknown): Uint8Array | undefined {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  return undefined;
}

/**
 * Parse the embedded font program (extracted from pdf.js) with fontkit to read the
 * exact family, weight (OS/2.usWeightClass), italic and width-class so replacement
 * text can match the original precisely. Falls back to name-only info when the
 * program is missing or unsupported (Type3/bitmap fonts).
 */
function buildDocumentFontInfo(
  key: string,
  meta: PdfFontMeta | undefined,
  postScriptName: string | undefined,
): DocumentFontInfo {
  const info: DocumentFontInfo = { key, postScriptName, bytes: meta?.data, mimetype: meta?.mimetype };
  if (meta?.data && meta.data.byteLength > 0) {
    try {
      const font = fontkit.create(meta.data as Buffer) as unknown as FontkitFont;
      /* v8 ignore start -- the parseable font fixtures always expose typed name/OS-2 fields, so the `: undefined`/numeric-fsSelection fallbacks here are only hit by malformed programs that fontkit rejects (caught below) */
      info.familyName = typeof font.familyName === "string" ? font.familyName : undefined;
      info.subfamilyName = typeof font.subfamilyName === "string" ? font.subfamilyName : undefined;
      const os2 = font["OS/2"];
      info.weight = typeof os2?.usWeightClass === "number" ? os2.usWeightClass : undefined;
      info.widthClass = typeof os2?.usWidthClass === "number" ? os2.usWidthClass : undefined;
      const fsItalic = typeof os2?.fsSelection === "number" ? (os2.fsSelection & 0x01) !== 0 : false;
      /* v8 ignore stop */
      info.italic = fsItalic || (typeof font.italicAngle === "number" && font.italicAngle !== 0);
    } catch {
      // Unsupported/Type3/bitmap program: keep name-based info and let export fall back.
    }
  }
  return info;
}

/**
 * pdf.js text items reference fonts by a subset/internal id (e.g. `g_d0_f4`) that
 * carries no weight/style. The real PostScript name (e.g. `Roboto-Medium`) only
 * becomes available on `page.commonObjs` after `getOperatorList()` runs. This reads
 * that name plus the translated font's bold/italic flags so click-to-edit can match
 * the original family + weight instead of guessing from a meaningless id.
 */
function readPdfFontMeta(
  commonObjs: PdfCommonObjs | null,
  fontName: string | undefined,
  cache: Map<string, PdfFontMeta | undefined>,
): PdfFontMeta | undefined {
  if (!fontName || !commonObjs) return undefined;
  if (cache.has(fontName)) return cache.get(fontName);
  let meta: PdfFontMeta | undefined;
  try {
    const available = typeof commonObjs.has === "function" ? commonObjs.has(fontName) : true;
    if (available) {
      const obj = commonObjs.get(fontName);
      if (obj) {
        meta = {
          name: typeof obj.name === "string" ? obj.name : undefined,
          bold: Boolean(obj.bold),
          italic: Boolean(obj.italic),
          data: toUint8Array(obj.data),
          mimetype: typeof obj.mimetype === "string" ? obj.mimetype : undefined,
        };
      }
    }
  } catch {
    meta = undefined;
  }
  cache.set(fontName, meta);
  return meta;
}

const PDF_JS_OPTIONS = {
  cMapUrl: "/pdfjs/cmaps/",
  standardFontDataUrl: "/pdfjs/standard_fonts/",
  wasmUrl: "/pdfjs/wasm/",
};

export type SavePdfOptions = {
  /** PDF.js annotation ids (e.g. "13R") of imported /Link annotations to strip before writing operations. */
  suppressLinkAnnotationIds?: string[];
  /**
   * Called for every operation that could not be written (e.g. text the
   * resolved font cannot encode). The export continues without that operation
   * instead of losing the whole document.
   */
  onOperationError?: (operation: EditOperation, error: unknown) => void;
};

/**
 * PDF.js formats annotation ids as `${num}R` (generation 0) or `${num}R${gen}`.
 * Parse one into a `num:gen` key comparable against pdf-lib PDFRefs, or `null`
 * for ids that are not object references.
 */
function refKeyFromPdfJsId(id: string): string | null {
  const match = /^(\d+)R(\d*)$/.exec(id);
  return match ? `${match[1]}:${match[2] || "0"}` : null;
}

type PdfJsDestinationResolver = {
  getDestination: (name: string) => Promise<unknown>;
  getPageIndex: (ref: unknown) => Promise<number>;
};

/**
 * Classify a PDF.js /Link annotation into a sanitized LinkTarget: URI actions
 * become url/email/phone by scheme, GoTo destinations (inline array or named)
 * resolve to an internal page index. Returns `null` for unsafe URIs and
 * destination shapes we do not support (e.g. remote GoToR).
 */
async function resolveLinkAnnotationTarget(
  pdf: PdfJsDestinationResolver,
  annotation: Record<string, unknown>,
): Promise<LinkTarget | null> {
  const url = typeof annotation.url === "string" ? annotation.url : undefined;
  if (url) {
    if (/^mailto:/i.test(url)) {
      const href = sanitizeEmailToMailto(url);
      return href ? { kind: "email", href } : null;
    }
    if (/^tel:/i.test(url)) {
      const href = sanitizeTel(url);
      return href ? { kind: "phone", href } : null;
    }
    const href = sanitizeUrl(url);
    return href ? { kind: "url", href } : null;
  }
  try {
    const dest = typeof annotation.dest === "string" ? await pdf.getDestination(annotation.dest) : annotation.dest;
    if (!Array.isArray(dest) || dest[0] === undefined || dest[0] === null) return null;
    const pageIndex = await pdf.getPageIndex(dest[0]);
    return Number.isInteger(pageIndex) && pageIndex >= 0 ? { kind: "page", pageIndex } : null;
  } catch {
    return null;
  }
}

export class PdfEngine {
  private async getPdfJs() {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;
    return pdfjs;
  }

  async loadDocument(file: File, password?: string): Promise<LoadedPdf> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pdfjs = await this.getPdfJs();
    const task = pdfjs.getDocument({
      data: bytes.slice(),
      password,
      ...PDF_JS_OPTIONS,
    });
    const pdf = await task.promise;
    try {
      return {
        name: file.name,
        bytes,
        pageCount: pdf.numPages,
        fingerprint: Array.isArray(pdf.fingerprints) ? (pdf.fingerprints[0] ?? undefined) : undefined,
      };
    } finally {
      void pdf.destroy().catch(() => undefined);
    }
  }

  async createBlankDocument(name = "blank-document.pdf", size: [number, number] = [612, 792]): Promise<LoadedPdf> {
    const pdf = await PDFDocument.create();
    pdf.addPage(size);
    const bytes = new Uint8Array(await pdf.save({ useObjectStreams: false }));
    return {
      name,
      bytes,
      pageCount: 1,
      fingerprint: `${name}-${Date.now()}`,
    };
  }

  async insertBlankPage(originalBytes: Uint8Array, index: number) {
    const pdf = await PDFDocument.load(originalBytes);
    const pages = pdf.getPages();
    /* v8 ignore next -- pdf-lib never round-trips a 0-page document, so the page lookup always resolves and the size fallback is unreachable */
    const currentSize = pages[Math.max(0, Math.min(index, pages.length - 1))]?.getSize() ?? { width: 612, height: 792 };
    pdf.insertPage(Math.max(0, Math.min(index + 1, pages.length)), [currentSize.width, currentSize.height]);
    return new Uint8Array(await pdf.save({ useObjectStreams: false }));
  }

  async deletePage(originalBytes: Uint8Array, index: number) {
    const pdf = await PDFDocument.load(originalBytes);
    if (pdf.getPageCount() <= 1) throw new Error("Cannot delete the only page.");
    pdf.removePage(index);
    return new Uint8Array(await pdf.save({ useObjectStreams: false }));
  }

  async rotatePage(originalBytes: Uint8Array, index: number, amount = 90) {
    const pdf = await PDFDocument.load(originalBytes);
    const page = pdf.getPage(index);
    const current = page.getRotation().angle;
    page.setRotation(degrees((current + amount) % 360));
    return new Uint8Array(await pdf.save({ useObjectStreams: false }));
  }

  async extractTextAndFonts(
    bytes: Uint8Array,
    pageIndex?: number,
  ): Promise<{ items: TextItem[]; fonts: DocumentFonts; links: ImportedLinkAnnotation[] }> {
    const pdfjs = await this.getPdfJs();
    // fontExtraProperties exposes the embedded font program bytes (`.data`) on commonObjs,
    // which pdf.js otherwise drops to save memory. Required to reuse the original font.
    const pdf = await pdfjs.getDocument({ data: bytes.slice(), fontExtraProperties: true, ...PDF_JS_OPTIONS }).promise;
    const items: TextItem[] = [];
    const fonts: DocumentFonts = {};
    const links: ImportedLinkAnnotation[] = [];

    try {
      const pageIndexes =
        pageIndex === undefined ? Array.from({ length: pdf.numPages }, (_, index) => index) : [pageIndex];

      for (const currentPageIndex of pageIndexes) {
        const page = await pdf.getPage(currentPageIndex + 1);
        // Surface existing /Link annotations as editable overlays. Failures here
        // (malformed annotation dictionaries) must not break text extraction.
        try {
          const annotations = (await page.getAnnotations()) as Array<Record<string, unknown>>;
          for (const annotation of annotations) {
            if (annotation.subtype !== "Link") continue;
            const rectArray = Array.isArray(annotation.rect) ? (annotation.rect as number[]) : undefined;
            if (!rectArray || rectArray.length < 4) continue;
            const target = await resolveLinkAnnotationTarget(pdf as unknown as PdfJsDestinationResolver, annotation);
            if (!target) continue;
            links.push({
              pageIndex: currentPageIndex,
              // PDF.js annotation rects are [x1, y1, x2, y2] in PDF user space
              // (bottom-left origin, unrotated), matching our PdfRect space.
              rect: {
                x: Math.min(rectArray[0], rectArray[2]),
                y: Math.min(rectArray[1], rectArray[3]),
                width: Math.abs(rectArray[2] - rectArray[0]),
                height: Math.abs(rectArray[3] - rectArray[1]),
              },
              target,
              annotationRef: typeof annotation.id === "string" ? annotation.id : undefined,
            });
          }
        } catch {
          // Annotations unavailable for this page: links simply are not imported.
        }
        const textContent = await page.getTextContent();
        const styles = textContent.styles as Record<string, Record<string, unknown>>;
        let commonObjs: PdfCommonObjs | null = null;
        try {
          await page.getOperatorList();
          commonObjs = page.commonObjs as unknown as PdfCommonObjs;
        } catch {
          commonObjs = null;
        }
        const fontMetaCache = new Map<string, PdfFontMeta | undefined>();
        for (const item of textContent.items as Array<Record<string, unknown>>) {
          if (!("str" in item) || !String(item.str).trim()) continue;
          const str = String(item.str);
          const transform = Array.isArray(item.transform) ? (item.transform as number[]) : [1, 0, 0, 12, 0, 0];
          const x = transform[4] ?? 0;
          const y = transform[5] ?? 0;
          const fontSize = Math.hypot(transform[2], transform[3]) || Math.abs(transform[0]) || 12;
          const subsetFontName = typeof item.fontName === "string" ? item.fontName : undefined;
          const style = subsetFontName ? styles[subsetFontName] : undefined;
          const cssFontFamily = typeof style?.fontFamily === "string" ? style.fontFamily : undefined;
          const fontMeta = readPdfFontMeta(commonObjs, subsetFontName, fontMetaCache);
          const realFontName = fontMeta?.name ? cleanPdfFontName(fontMeta.name) : undefined;
          const fontName = realFontName || subsetFontName;
          const fontKey = subsetFontName || realFontName;
          if (fontKey && !fonts[fontKey]) {
            fonts[fontKey] = buildDocumentFontInfo(fontKey, fontMeta, realFontName);
          }
          const fontInfo = fontKey ? fonts[fontKey] : undefined;
          const styleDescriptor = [fontName, cssFontFamily].filter(Boolean).join(" ");
          const nameWeight = inferFontWeight(styleDescriptor) ?? 400;
          // The embedded font's OS/2 weight is authoritative; the name heuristic only fills in.
          const fontWeight = fontInfo?.weight ?? (nameWeight === 400 && fontMeta?.bold ? 700 : nameWeight);
          const italic = Boolean(fontInfo?.italic) || inferItalic(styleDescriptor) || Boolean(fontMeta?.italic);
          items.push({
            str,
            pageIndex: currentPageIndex,
            rect: {
              x,
              y,
              width: typeof item.width === "number" ? item.width : str.length * fontSize * 0.5,
              height: typeof item.height === "number" ? item.height : fontSize,
            },
            fontName,
            fontKey,
            cssFontFamily,
            fontSize,
            fontWeight,
            italic,
          });
        }
      }
    } finally {
      void pdf.destroy().catch(() => undefined);
    }

    return { items, fonts, links };
  }

  async getPageSizes(bytes: Uint8Array) {
    const pdf = await PDFDocument.load(bytes);
    return pdf.getPages().map((page) => page.getSize());
  }

  async savePdf(
    originalBytes: Uint8Array,
    operations: EditOperation[],
    fonts?: DocumentFonts,
    options?: SavePdfOptions,
  ) {
    const pdf = await PDFDocument.load(originalBytes);
    pdf.registerFontkit(fontkit);
    const pages = pdf.getPages();

    // Imported link annotations are re-emitted from their (possibly edited)
    // operations by writeLink; removing the originals here keeps the exported
    // page from carrying two live copies of the same link — and lets a deleted
    // imported link actually disappear.
    const suppressed = new Set(
      (options?.suppressLinkAnnotationIds ?? [])
        .map(refKeyFromPdfJsId)
        .filter((key): key is string => key !== null),
    );
    if (suppressed.size > 0) {
      for (const page of pages) {
        const annotations = page.node.Annots();
        if (!annotations) continue;
        const kept = annotations
          .asArray()
          .filter((entry) => !(entry instanceof PDFRef && suppressed.has(`${entry.objectNumber}:${entry.generationNumber}`)));
        if (kept.length !== annotations.size()) {
          page.node.set(PDFName.of("Annots"), pdf.context.obj(kept));
        }
      }
    }
    const embeddedFonts = new Map<string, PDFFont>();
    const reusedFonts = new Map<string, PDFFont | null>();
    const fontkitByKey = new Map<string, FontkitFont | null>();

    const getFont = async (
      fontFamily?: string,
      style?: { bold?: boolean; italic?: boolean; fontWeight?: number; fontStyle?: "normal" | "italic" },
    ) => {
      const key = resolvePdfFont(fontFamily, style);
      if (!embeddedFonts.has(key)) {
        embeddedFonts.set(key, await pdf.embedFont(key));
      }
      return embeddedFonts.get(key)!;
    };

    // Reuse the document's actual embedded font for a true replica, but only when it
    // contains every glyph in the replacement string (subset fonts often don't).
    const embeddedCovers = (key: string, text: string): boolean => {
      const info = fonts?.[key];
      if (!info?.bytes) return false;
      let fk = fontkitByKey.get(key);
      if (fk === undefined) {
        try {
          fk = fontkit.create(info.bytes as Buffer) as unknown as FontkitFont;
        } catch {
          fk = null;
        }
        fontkitByKey.set(key, fk);
      }
      if (!fk || typeof fk.hasGlyphForCodePoint !== "function") return false;
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        if (cp !== undefined && !fk.hasGlyphForCodePoint(cp)) return false;
      }
      return true;
    };

    const getReusedFont = async (key: string) => {
      if (reusedFonts.has(key)) return reusedFonts.get(key) ?? null;
      const info = fonts?.[key];
      let embedded: PDFFont | null = null;
      if (info?.bytes) {
        try {
          embedded = await pdf.embedFont(info.bytes, { subset: true });
        } catch {
          embedded = null;
        }
      }
      reusedFonts.set(key, embedded);
      return embedded;
    };

    const ctx: WriterContext = { getFont, getReusedFont, embeddedCovers };

    for (const operation of operations) {
      const page = pages[operation.pageIndex];
      if (!page) continue;
      const opacity = operation.opacity ?? 1;

      // One failing operation (e.g. characters the resolved font cannot
      // encode) must not abort the whole export; it is reported and skipped.
      try {
        switch (operation.type) {
          case "whiteout":
            writeWhiteoutMask(page, operation.rect, operation.color, opacity);
            break;
          case "text":
            await writeText(page, operation, opacity, ctx);
            break;
          case "annotation":
            await writeAnnotation(page, operation, opacity, ctx);
            break;
          case "shape":
            writeShape(page, operation, opacity);
            break;
          case "ink":
            writeInk(page, operation, opacity);
            break;
          case "image":
            await writeImage(pdf, page, operation, opacity);
            break;
          case "signature":
            await writeSignature(pdf, page, operation, opacity, ctx);
            break;
          case "stamp":
            await writeStamp(page, operation, opacity, ctx);
            break;
          case "form-mark":
            writeFormMark(page, operation, opacity);
            break;
          case "form-field":
            await writeFormField(page, operation, opacity, ctx);
            break;
          case "link":
            writeLink(pdf, page, operation);
            break;
          /* v8 ignore next 4 -- exhaustiveness guard: the EditOperation union has no member left unhandled above, so this branch is unreachable at runtime and only guards against a future variant being missed at compile time */
          default: {
            const exhaustive: never = operation;
            void exhaustive;
          }
        }
      } catch (error) {
        // The failure isn't always an encoding problem (image decode errors,
        // pdf-lib internal issues, etc. can throw here too) — log the real
        // cause for diagnosability rather than letting the caller guess it.
        console.error(`savePdf: skipping operation ${operation.id} (${operation.type})`, error);
        options?.onOperationError?.(operation, error);
      }
    }

    return pdf.save({ useObjectStreams: false });
  }
}

export const pdfEngine = new PdfEngine();
export { PDF_JS_OPTIONS };
