import { strToU8, zipSync } from "fflate";
import type { DocumentFonts, EditOperation, ExportFormat, TextItem } from "../types/editor";
import { downloadBlob, safeBaseName } from "../utils/download";
import { PdfEngine, pdfEngine as defaultPdfEngine } from "./pdfEngine";

export type ExportContext = {
  filename: string;
  bytes: Uint8Array;
  operations: EditOperation[];
  textItems: TextItem[];
  fonts?: DocumentFonts;
};

export class ExportPipeline {
  constructor(private readonly engine: PdfEngine = defaultPdfEngine) {}

  async export(format: ExportFormat, context: ExportContext) {
    const base = safeBaseName(context.filename);
    switch (format) {
      case "pdf": {
        const bytes = await this.engine.savePdf(context.bytes, context.operations, context.fonts);
        downloadBlob(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), `${base}-edited.pdf`);
        return;
      }
      case "txt": {
        downloadBlob(new Blob([this.toText(context.textItems)], { type: "text/plain;charset=utf-8" }), `${base}.txt`);
        return;
      }
      case "csv": {
        downloadBlob(new Blob([this.toCsv(context.textItems, context.operations)], { type: "text/csv;charset=utf-8" }), `${base}.csv`);
        return;
      }
      case "xlsx": {
        downloadBlob(
          new Blob([this.toXlsxBytes(context.textItems, context.operations)], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          `${base}.xlsx`,
        );
        return;
      }
      case "docx": {
        downloadBlob(
          new Blob([this.toDocxBytes(context.textItems)], {
            type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          }),
          `${base}.docx`,
        );
        return;
      }
      default: {
        const exhaustive: never = format;
        throw new Error(`Unsupported export format: ${String(exhaustive)}`);
      }
    }
  }

  toText(textItems: TextItem[]) {
    return this.groupRows(textItems)
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
   * Build a minimal valid Word document (OOXML) from the extracted text. Items are
   * grouped by page; each clustered visual line becomes one paragraph and pages are
   * separated by an empty paragraph. All text is XML-escaped. Mirrors the hand-built
   * XLSX writer — no heavy dependency (no `docx`/officegen), just `fflate`.
   */
  toDocxBytes(textItems: TextItem[]) {
    const paragraphs: string[] = [];
    const byPage = new Map<number, TextItem[]>();
    for (const item of textItems) {
      const bucket = byPage.get(item.pageIndex);
      if (bucket) bucket.push(item);
      else byPage.set(item.pageIndex, [item]);
    }
    const pageIndexes = [...byPage.keys()].sort((a, b) => a - b);
    for (let i = 0; i < pageIndexes.length; i += 1) {
      const rows = this.groupRows(byPage.get(pageIndexes[i]) ?? []);
      for (const row of rows) {
        paragraphs.push(row.map((item) => item.str).join(" "));
      }
      // Separate pages with a blank paragraph (except after the last page).
      if (i < pageIndexes.length - 1) paragraphs.push("");
    }
    return createDocxZip(paragraphs.length ? paragraphs : ["No extractable text detected"]);
  }

  private tableRows(textItems: TextItem[], operations: EditOperation[]) {
    const tableRegions = operations.filter((operation) => operation.type === "table-region");
    const source = tableRegions.length
      ? textItems.filter((item) =>
          tableRegions.some((region) =>
            region.pageIndex === item.pageIndex &&
            item.rect.x >= region.rect.x &&
            item.rect.x <= region.rect.x + region.rect.width &&
            item.rect.y >= region.rect.y &&
            item.rect.y <= region.rect.y + region.rect.height,
          ),
        )
      : textItems;

    return this.groupRows(source).map((row) => row.map((item) => item.str));
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

/**
 * Build a minimal valid `.docx` (OOXML WordprocessingML) package: the four parts a
 * Word reader requires — `[Content_Types].xml`, `_rels/.rels`,
 * `word/_rels/document.xml.rels`, and `word/document.xml`. Each input string becomes
 * a `<w:p>` paragraph; text is XML-escaped and wrapped in an `xml:space="preserve"`
 * run so leading/trailing whitespace survives. Like the XLSX writer, this is a
 * dependency-free zip built with `fflate`.
 */
function createDocxZip(paragraphs: string[]) {
  const body = paragraphs
    .map((text) =>
      text
        ? `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`
        : `<w:p/>`,
    )
    .join("");

  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`),
    "word/document.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}</w:body>
</w:document>`),
  };

  return zipSync(files, { level: 6 });
}
