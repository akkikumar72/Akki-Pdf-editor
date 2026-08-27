import { strToU8, zipSync } from "fflate";
import type { DocumentFonts, EditOperation, ExportFormat, PdfRect, TextItem } from "../types/editor";
import { downloadBlob, safeBaseName } from "../utils/download";
import { isTextRectSignificantlyCovered, replacementCoverRect } from "../utils/textSearch";
import { PdfEngine, pdfEngine as defaultPdfEngine } from "./pdfEngine";

export type ExportContext = {
  filename: string;
  bytes: Uint8Array;
  operations: EditOperation[];
  textItems: TextItem[];
  fonts?: DocumentFonts;
  /** Original /Link annotation ids mirrored as imported link operations — stripped from the PDF export to avoid duplicates. */
  suppressLinkAnnotationIds?: string[];
};

export type ExportResult = {
  /** Operations the PDF writer could not render (e.g. unencodable characters); the export completed without them. */
  skippedOperations: EditOperation[];
};

export class ExportPipeline {
  constructor(private readonly engine: PdfEngine = defaultPdfEngine) {}

  async export(format: ExportFormat, context: ExportContext): Promise<ExportResult> {
    const base = safeBaseName(context.filename);
    const skippedOperations: EditOperation[] = [];
    switch (format) {
      case "pdf": {
        const bytes = await this.engine.savePdf(context.bytes, context.operations, context.fonts, {
          suppressLinkAnnotationIds: context.suppressLinkAnnotationIds,
          onOperationError: (operation) => skippedOperations.push(operation),
        });
        downloadBlob(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), `${base}-edited.pdf`);
        return { skippedOperations };
      }
      case "txt": {
        downloadBlob(
          new Blob([this.toText(context.textItems, context.operations)], { type: "text/plain;charset=utf-8" }),
          `${base}.txt`,
        );
        return { skippedOperations };
      }
      case "csv": {
        downloadBlob(new Blob([this.toCsv(context.textItems, context.operations)], { type: "text/csv;charset=utf-8" }), `${base}.csv`);
        return { skippedOperations };
      }
      case "xlsx": {
        downloadBlob(
          new Blob([this.toXlsxBytes(context.textItems, context.operations)], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          `${base}.xlsx`,
        );
        return { skippedOperations };
      }
      default: {
        const exhaustive: never = format;
        throw new Error(`Unsupported export format: ${String(exhaustive)}`);
      }
    }
  }

  toText(textItems: TextItem[], operations: EditOperation[] = []) {
    return this.groupRows(this.effectiveTextItems(textItems, operations))
      .map((row) => row.map((item) => item.str).join(" "))
      .join("\n");
  }

  toCsv(textItems: TextItem[], operations: EditOperation[]) {
    const rows = this.tableRows(textItems, operations);
    return rows
      .map((row) => row.map((cell) => `"${neutralizeFormula(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");
  }

  toXlsxBytes(textItems: TextItem[], operations: EditOperation[]) {
    const rows = this.tableRows(textItems, operations);
    return createWorkbookZip(rows.length ? rows : [["No table-like text detected"]]);
  }

  /**
   * Merges the original PDF text extraction with in-editor edits so data
   * exports (txt/csv/xlsx) reflect what the user sees, not stale source
   * text: drops original runs a `whiteout`, `redaction`, or replacement `text` op covers,
   * and appends each visible `text` op (replacement or newly added) as a
   * synthetic run positioned by its own rect. A later `whiteout` or
   * `redaction` suppresses synthetic text beneath it, while text added after
   * the cover stays visible.
   */
  private effectiveTextItems(textItems: TextItem[], operations: EditOperation[]): TextItem[] {
    const sourceCoverRects: Array<{ pageIndex: number; rect: PdfRect }> = [];
    const orderedCoverRects: Array<{ pageIndex: number; rect: PdfRect; operationIndex: number }> = [];
    const additions: Array<{ item: TextItem; operationIndex: number }> = [];

    operations.forEach((operation, operationIndex) => {
      if (operation.type === "whiteout" || operation.type === "redaction") {
        const cover = { pageIndex: operation.pageIndex, rect: operation.rect };
        sourceCoverRects.push(cover);
        orderedCoverRects.push({ ...cover, operationIndex });
      } else if (operation.type === "text") {
        // Shared with Find (see replacementCoverRect's own doc comment for
        // why this deliberately differs from the PDF writer's paint condition).
        const coverRect = replacementCoverRect(operation);
        if (coverRect) {
          const cover = { pageIndex: operation.pageIndex, rect: coverRect };
          sourceCoverRects.push(cover);
          orderedCoverRects.push({ ...cover, operationIndex });
        }
        additions.push({
          item: { str: operation.text, pageIndex: operation.pageIndex, rect: operation.rect },
          operationIndex,
        });
      }
    });

    const remaining = textItems.filter(
      (item) =>
        !sourceCoverRects.some(
          (cover) =>
            cover.pageIndex === item.pageIndex && isTextRectSignificantlyCovered(item.rect, cover.rect),
        ),
    );
    const visibleAdditions = additions
      .filter(
        ({ item, operationIndex }) =>
          !orderedCoverRects.some(
            (cover) =>
              cover.operationIndex > operationIndex &&
              cover.pageIndex === item.pageIndex &&
              isTextRectSignificantlyCovered(item.rect, cover.rect),
          ),
      )
      .map(({ item }) => item);

    return [...remaining, ...visibleAdditions];
  }

  private tableRows(textItems: TextItem[], operations: EditOperation[]) {
    return this.groupRows(this.effectiveTextItems(textItems, operations)).map((row) => row.map((item) => item.str));
  }

  private groupRows(textItems: TextItem[]) {
    const sorted = [...textItems].sort((a, b) => a.pageIndex - b.pageIndex || b.rect.y - a.rect.y || a.rect.x - b.rect.x);
    const rows: TextItem[][] = [];
    // Items arrive page-by-page in descending y, so each page's row heads are
    // also in descending y. Every head sits at or above the current item, which
    // reduces the original linear "first matching row" scan to a binary search
    // for the first head with y <= item.y + tolerance — O(n log n) overall
    // instead of O(n²) on text-dense documents.
    let pageRows: TextItem[][] = [];
    let currentPage = -1;
    for (const item of sorted) {
      if (item.pageIndex !== currentPage) {
        currentPage = item.pageIndex;
        pageRows = [];
      }
      const limit = item.rect.y + Math.max(4, item.rect.height * 0.6);
      let low = 0;
      let high = pageRows.length;
      while (low < high) {
        const mid = (low + high) >> 1;
        if (pageRows[mid][0].rect.y <= limit) high = mid;
        else low = mid + 1;
      }
      if (low < pageRows.length) {
        pageRows[low].push(item);
      } else {
        const row = [item];
        pageRows.push(row);
        rows.push(row);
      }
    }
    return rows.map((row) => row.sort((a, b) => a.rect.x - b.rect.x));
  }
}

export const exportPipeline = new ExportPipeline();

/**
 * Neutralize spreadsheet formula injection (CSV/XLSX). A cell is prefixed
 * with a single quote — so Excel/Calc treat it as literal text — when either:
 * it starts with a tab/CR/LF (some spreadsheet apps strip those before
 * evaluating a cell, CWE-1236, so `"\n=cmd"` must still be caught), or its
 * first *non-whitespace* character can start a formula (`= + - @`), which
 * catches `" =1+1"` without also quoting benign cells like `" hello"` that
 * merely happen to start with a plain space.
 */
function neutralizeFormula(cell: string) {
  return /^[\t\r\n]|^\s*[=+\-@]/.test(cell) ? `'${cell}` : cell;
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function columnName(index: number) {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function createWorkbookZip(rows: string[][]) {
  const sheetRows = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(neutralizeFormula(cell))}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Extracted" sheetId="1" r:id="rId1"/></sheets>
</workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`),
  };

  return zipSync(files, { level: 6 });
}
