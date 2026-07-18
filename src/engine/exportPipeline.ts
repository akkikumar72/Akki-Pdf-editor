import { strToU8, zipSync } from "fflate";
import type { DocumentFonts, EditOperation, ExportFormat, PdfRect, TextItem } from "../types/editor";
import { downloadBlob, safeBaseName } from "../utils/download";
import { PdfEngine, pdfEngine as defaultPdfEngine } from "./pdfEngine";

function rectOverlapArea(a: PdfRect, b: PdfRect) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

/**
 * An original PDF text run counts as replaced once a cover rect (a `whiteout`
 * op, or a replacement `text` op's `sourceCoverRect`) overlaps at least half
 * its area -- matching how `savePdf` paints over it.
 */
function isSignificantlyCovered(itemRect: PdfRect, coverRect: PdfRect) {
  const itemArea = itemRect.width * itemRect.height;
  if (itemArea <= 0) return false;
  return rectOverlapArea(itemRect, coverRect) / itemArea >= 0.5;
}

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
   * text: drops original runs a `whiteout` or replacement `text` op covers,
   * and appends every `text` op (replacement or newly added) as a
   * synthetic run positioned by its own rect.
   */
  private effectiveTextItems(textItems: TextItem[], operations: EditOperation[]): TextItem[] {
    const coverRects: Array<{ pageIndex: number; rect: PdfRect }> = [];
    const additions: TextItem[] = [];

    for (const operation of operations) {
      if (operation.type === "whiteout") {
        coverRects.push({ pageIndex: operation.pageIndex, rect: operation.rect });
      } else if (operation.type === "text") {
        if (operation.sourceCoverRect) {
          coverRects.push({ pageIndex: operation.pageIndex, rect: operation.sourceCoverRect });
        }
        additions.push({ str: operation.text, pageIndex: operation.pageIndex, rect: operation.rect });
      }
    }

    const remaining = textItems.filter(
      (item) =>
        !coverRects.some((cover) => cover.pageIndex === item.pageIndex && isSignificantlyCovered(item.rect, cover.rect)),
    );

    return [...remaining, ...additions];
  }

  private tableRows(textItems: TextItem[], operations: EditOperation[]) {
    return this.groupRows(this.effectiveTextItems(textItems, operations)).map((row) => row.map((item) => item.str));
  }

  private groupRows(textItems: TextItem[]) {
    const sorted = [...textItems].sort((a, b) => a.pageIndex - b.pageIndex || b.rect.y - a.rect.y || a.rect.x - b.rect.x);
    const rows: TextItem[][] = [];
    for (const item of sorted) {
      const row = rows.find((candidate) =>
        candidate[0]?.pageIndex === item.pageIndex &&
        Math.abs(candidate[0].rect.y - item.rect.y) <= Math.max(4, item.rect.height * 0.6),
      );
      if (row) row.push(item);
      else rows.push([item]);
    }
    return rows.map((row) => row.sort((a, b) => a.rect.x - b.rect.x));
  }
}

export const exportPipeline = new ExportPipeline();

/**
 * Neutralize spreadsheet formula injection (CSV/XLSX). Cells whose first
 * character can start a formula (`= + - @`) or a control char (tab/CR/LF) are
 * prefixed with a single quote so Excel/Calc treat them as literal text.
 * The leading line-feed is included because some spreadsheet apps strip
 * leading whitespace/newlines before evaluating a cell (CWE-1236).
 */
function neutralizeFormula(cell: string) {
  return /^[=+\-@\t\r\n]/.test(cell) ? `'${cell}` : cell;
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
