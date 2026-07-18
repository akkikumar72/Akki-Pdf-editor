import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { ExportPipeline, exportPipeline } from "../src/engine/exportPipeline";
import { PdfEngine } from "../src/engine/pdfEngine";
import * as download from "../src/utils/download";
import type { ExportFormat, TextItem } from "../src/types/editor";

const items: TextItem[] = [
  { str: "Name", pageIndex: 0, rect: { x: 10, y: 700, width: 40, height: 12 } },
  { str: "Amount", pageIndex: 0, rect: { x: 160, y: 700, width: 54, height: 12 } },
  { str: "Akki", pageIndex: 0, rect: { x: 10, y: 680, width: 40, height: 12 } },
  { str: "$42", pageIndex: 0, rect: { x: 160, y: 680, width: 28, height: 12 } },
];

describe("export pipeline", () => {
  it("clusters text into CSV rows", () => {
    const csv = new ExportPipeline().toCsv(items, []);
    expect(csv).toContain('"Name","Amount"');
    expect(csv).toContain('"Akki","$42"');
  });

  it("exports every text row and ignores non-text/non-whiteout operations", () => {
    const csv = new ExportPipeline().toCsv(items, [
      {
        id: "shape_1",
        type: "shape",
        kind: "rectangle",
        pageIndex: 0,
        rect: { x: 0, y: 650, width: 220, height: 40 },
        stroke: "#111827",
        strokeWidth: 1,
        createdAt: 1,
      },
    ]);
    expect(csv).toContain("Akki");
    expect(csv).toContain("Name");
  });

  it("writes a minimal XLSX workbook with escaped inline strings", () => {
    const bytes = new ExportPipeline().toXlsxBytes([
      ...items,
      { str: "A&B <test>", pageIndex: 0, rect: { x: 10, y: 640, width: 80, height: 12 } },
    ], []);
    const files = unzipSync(bytes);
    const sheet = strFromU8(files["xl/worksheets/sheet1.xml"]);

    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    expect(sheet).toContain("Name");
    expect(sheet).toContain("A&amp;B &lt;test&gt;");
  });

  it("neutralizes CSV formula-injection payloads", () => {
    const dangerous: TextItem[] = [
      { str: "=cmd|'/c calc'!A0", pageIndex: 0, rect: { x: 10, y: 700, width: 80, height: 12 } },
      { str: "+1+2", pageIndex: 0, rect: { x: 160, y: 700, width: 40, height: 12 } },
      { str: "@SUM(A1)", pageIndex: 0, rect: { x: 10, y: 680, width: 80, height: 12 } },
      { str: "-2+3", pageIndex: 0, rect: { x: 160, y: 680, width: 40, height: 12 } },
    ];
    const csv = new ExportPipeline().toCsv(dangerous, []);
    expect(csv).toContain("\"'=cmd|'/c calc'!A0\"");
    expect(csv).toContain("\"'+1+2\"");
    expect(csv).toContain("\"'@SUM(A1)\"");
    expect(csv).toContain("\"'-2+3\"");
    expect(csv).not.toMatch(/"=cmd/);
  });

  it("neutralizes formula payloads prefixed with a leading newline or tab", () => {
    const dangerous: TextItem[] = [
      { str: "\n=cmd", pageIndex: 0, rect: { x: 10, y: 700, width: 80, height: 12 } },
      { str: "\t=SUM(A1)", pageIndex: 0, rect: { x: 160, y: 700, width: 80, height: 12 } },
    ];
    const csv = new ExportPipeline().toCsv(dangerous, []);
    expect(csv).toContain("'\n=cmd");
    expect(csv).toContain("'\t=SUM(A1)");
    expect(csv).not.toMatch(/"\n=cmd/);
  });

  it("neutralizes formula payloads hidden behind a leading space (CWE-1236)", () => {
    const dangerous: TextItem[] = [
      { str: " =1+1", pageIndex: 0, rect: { x: 10, y: 700, width: 80, height: 12 } },
    ];
    const csv = new ExportPipeline().toCsv(dangerous, []);
    expect(csv).toContain("\"' =1+1\"");
  });

  it("does not corrupt benign cells that merely start with whitespace", () => {
    // The leading-space formula guard must only fire when a formula starter
    // follows the whitespace — not for ordinary text/values with padding.
    const benign: TextItem[] = [
      { str: " hello", pageIndex: 0, rect: { x: 10, y: 700, width: 80, height: 12 } },
      { str: "  42", pageIndex: 0, rect: { x: 160, y: 700, width: 40, height: 12 } },
    ];
    const csv = new ExportPipeline().toCsv(benign, []);
    expect(csv).toContain('" hello"');
    expect(csv).toContain('"  42"');
    expect(csv).not.toContain("'");
  });

  it("neutralizes XLSX formula-injection payloads", () => {
    const bytes = new ExportPipeline().toXlsxBytes(
      [{ str: "=HYPERLINK(1)", pageIndex: 0, rect: { x: 10, y: 700, width: 80, height: 12 } }],
      [],
    );
    const sheet = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain("&apos;=HYPERLINK(1)");
  });

  it("falls back to a placeholder row when no table-like text is detected", () => {
    const sheet = strFromU8(unzipSync(new ExportPipeline().toXlsxBytes([], []))["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain("No table-like text detected");
  });

  it("merges into the highest row within tolerance when two rows qualify (first-match semantics)", () => {
    // Heads at y=100 and y=90 (12pt tall → tolerance 7.2). An item at y=94 is
    // within tolerance of both; the original linear scan picked the earliest
    // (highest) row, and the binary-search rewrite must preserve that.
    const overlapping: TextItem[] = [
      { str: "top", pageIndex: 0, rect: { x: 10, y: 100, width: 20, height: 12 } },
      { str: "bottom", pageIndex: 0, rect: { x: 10, y: 90, width: 20, height: 12 } },
      { str: "mid", pageIndex: 0, rect: { x: 50, y: 94, width: 20, height: 12 } },
    ];
    expect(new ExportPipeline().toText(overlapping)).toBe("top mid\nbottom");
  });

  it("clusters multi-page text and sorts within rows (toText)", () => {
    const multi: TextItem[] = [
      { str: "B", pageIndex: 0, rect: { x: 50, y: 700, width: 10, height: 12 } },
      { str: "A", pageIndex: 0, rect: { x: 10, y: 700, width: 10, height: 12 } },
      { str: "Page2", pageIndex: 1, rect: { x: 10, y: 700, width: 30, height: 12 } },
    ];
    expect(new ExportPipeline().toText(multi)).toBe("A B\nPage2");
  });

  it("exports a default singleton instance", () => {
    expect(exportPipeline).toBeInstanceOf(ExportPipeline);
  });
});

describe("export pipeline – edit-aware data export", () => {
  it("emits a replacement text op's value instead of the original overlapping item", () => {
    const csv = new ExportPipeline().toCsv(items, [
      {
        id: "replace_amount",
        type: "text",
        pageIndex: 0,
        rect: { x: 160, y: 680, width: 40, height: 12 },
        sourceCoverRect: { x: 160, y: 680, width: 28, height: 12 },
        text: "$50",
        fontFamily: "Helvetica",
        fontSize: 12,
        color: "#000000",
        align: "left",
        whiteout: true,
        createdAt: 1,
      },
    ]);
    expect(csv).toContain("$50");
    expect(csv).not.toContain("$42");
  });

  it("drops an original item covered by a manually-whiteouted text op (no sourceCoverRect)", () => {
    // Inspector's "Whiteout behind text" checkbox creates this state: the PDF
    // export masks under the op's own rect, so the data exports must treat
    // the covered original as redacted too — otherwise CSV leaks it.
    const csv = new ExportPipeline().toCsv(items, [
      {
        id: "manual_redaction",
        type: "text",
        pageIndex: 0,
        rect: { x: 10, y: 700, width: 40, height: 12 },
        text: "XXXX",
        fontFamily: "Helvetica",
        fontSize: 12,
        color: "#000000",
        align: "left",
        whiteout: true,
        createdAt: 1,
      },
    ]);
    expect(csv).not.toContain("Name");
    expect(csv).toContain("XXXX");
    expect(csv).toContain("Amount");
  });

  it("drops an original item covered by a replacement's sourceCoverRect even when whiteout is off", () => {
    // Matches the editor's on-canvas preview, which suppresses the original
    // text layer under sourceCoverRect regardless of whiteout — whiteout
    // only controls whether the exported PDF *bytes* paint an opaque mask.
    const csv = new ExportPipeline().toCsv(items, [
      {
        id: "replace_no_whiteout",
        type: "text",
        pageIndex: 0,
        rect: { x: 160, y: 680, width: 40, height: 12 },
        sourceCoverRect: { x: 160, y: 680, width: 28, height: 12 },
        text: "$50",
        fontFamily: "Helvetica",
        fontSize: 12,
        color: "#000000",
        align: "left",
        whiteout: false,
        createdAt: 1,
      },
    ]);
    expect(csv).toContain("$50");
    expect(csv).not.toContain("$42");
  });

  it("drops an original item covered by a whiteout op", () => {
    const csv = new ExportPipeline().toCsv(items, [
      {
        id: "hide_name_header",
        type: "whiteout",
        pageIndex: 0,
        rect: { x: 10, y: 700, width: 40, height: 12 },
        color: "#ffffff",
        createdAt: 1,
      },
    ]);
    expect(csv).not.toContain("Name");
    expect(csv).toContain("Amount");
  });

  it("includes a newly added text op with no overlap as its own cell", () => {
    const csv = new ExportPipeline().toCsv(items, [
      {
        id: "new_note",
        type: "text",
        pageIndex: 0,
        rect: { x: 10, y: 620, width: 60, height: 12 },
        text: "Reviewed",
        fontFamily: "Helvetica",
        fontSize: 12,
        color: "#000000",
        align: "left",
        createdAt: 1,
      },
    ]);
    expect(csv).toContain("Reviewed");
    expect(csv).toContain("Name");
    expect(csv).toContain("Akki");
  });

  it("neutralizes formula-injection payloads from an edit-aware synthetic cell", () => {
    const csv = new ExportPipeline().toCsv(items, [
      {
        id: "injected",
        type: "text",
        pageIndex: 0,
        rect: { x: 10, y: 620, width: 60, height: 12 },
        text: "=cmd|'/c calc'!A0",
        fontFamily: "Helvetica",
        fontSize: 12,
        color: "#000000",
        align: "left",
        createdAt: 1,
      },
    ]);
    expect(csv).toContain("\"'=cmd|'/c calc'!A0\"");
    expect(csv).not.toMatch(/"=cmd/);
  });

  it("reflects edits in toText and toXlsxBytes too", () => {
    const editOps = [
      {
        id: "replace_amount",
        type: "text" as const,
        pageIndex: 0,
        rect: { x: 160, y: 680, width: 40, height: 12 },
        sourceCoverRect: { x: 160, y: 680, width: 28, height: 12 },
        text: "$50",
        fontFamily: "Helvetica",
        fontSize: 12,
        color: "#000000",
        align: "left" as const,
        whiteout: true,
        createdAt: 1,
      },
    ];
    expect(new ExportPipeline().toText(items, editOps)).toContain("$50");
    expect(new ExportPipeline().toText(items, editOps)).not.toContain("$42");

    const sheet = strFromU8(
      unzipSync(new ExportPipeline().toXlsxBytes(items, editOps))["xl/worksheets/sheet1.xml"],
    );
    expect(sheet).toContain("$50");
    expect(sheet).not.toContain("$42");
  });

  it("keeps a zero-area text item instead of treating it as covered (avoids a divide-by-zero)", () => {
    const zeroArea: TextItem[] = [
      { str: "Ghost", pageIndex: 0, rect: { x: 10, y: 700, width: 0, height: 0 } },
    ];
    const csv = new ExportPipeline().toCsv(zeroArea, [
      {
        id: "hide_everything",
        type: "whiteout",
        pageIndex: 0,
        rect: { x: 0, y: 0, width: 1000, height: 1000 },
        color: "#ffffff",
        createdAt: 1,
      },
    ]);
    expect(csv).toContain("Ghost");
  });
});

describe("export pipeline – export() dispatch", () => {
  const fakeEngine = {
    savePdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
  } as unknown as PdfEngine;
  let downloadSpy: ReturnType<typeof vi.spyOn>;

  function makePipeline() {
    return new ExportPipeline(fakeEngine);
  }

  const context = {
    filename: "My Report.pdf",
    bytes: new Uint8Array([0]),
    operations: [],
    textItems: items,
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    downloadSpy = vi.spyOn(download, "downloadBlob").mockImplementation(() => undefined);
  });

  it("routes to savePdf and downloads a pdf", async () => {
    const result = await makePipeline().export("pdf", context);
    expect(fakeEngine.savePdf).toHaveBeenCalledWith(
      context.bytes,
      context.operations,
      undefined,
      expect.objectContaining({ suppressLinkAnnotationIds: undefined, onOperationError: expect.any(Function) }),
    );
    expect(downloadSpy).toHaveBeenCalledWith(expect.any(Blob), "My-Report-edited.pdf");
    expect(result.skippedOperations).toEqual([]);
  });

  it("forwards imported-link suppression ids to savePdf", async () => {
    await makePipeline().export("pdf", { ...context, suppressLinkAnnotationIds: ["7R"] });
    expect(fakeEngine.savePdf).toHaveBeenCalledWith(
      context.bytes,
      context.operations,
      undefined,
      expect.objectContaining({ suppressLinkAnnotationIds: ["7R"] }),
    );
  });

  it("surfaces operations the PDF writer reported as failed", async () => {
    const failing = {
      id: "bad_text",
      type: "text",
      pageIndex: 0,
      rect: { x: 0, y: 0, width: 10, height: 10 },
      text: "日本語",
      fontFamily: "Helvetica",
      fontSize: 12,
      color: "#000000",
      align: "left",
      createdAt: 1,
    } as const;
    const reportingEngine = {
      savePdf: vi.fn(async (_bytes, operations, _fonts, options) => {
        options?.onOperationError?.(operations[0], new Error("WinAnsi cannot encode"));
        return new Uint8Array([1]);
      }),
    } as unknown as PdfEngine;
    const result = await new ExportPipeline(reportingEngine).export("pdf", { ...context, operations: [failing] });
    expect(result.skippedOperations).toEqual([failing]);
  });

  it("downloads txt, csv and xlsx with safe base names and reports no skips", async () => {
    const txt = await makePipeline().export("txt", context);
    expect(downloadSpy).toHaveBeenLastCalledWith(expect.any(Blob), "My-Report.txt");
    expect(txt.skippedOperations).toEqual([]);
    const csv = await makePipeline().export("csv", context);
    expect(downloadSpy).toHaveBeenLastCalledWith(expect.any(Blob), "My-Report.csv");
    expect(csv.skippedOperations).toEqual([]);
    const xlsx = await makePipeline().export("xlsx", context);
    expect(downloadSpy).toHaveBeenLastCalledWith(expect.any(Blob), "My-Report.xlsx");
    expect(xlsx.skippedOperations).toEqual([]);
  });

  it("throws on an unsupported export format", async () => {
    await expect(makePipeline().export("docx" as ExportFormat, context)).rejects.toThrow(
      /Unsupported export format/,
    );
  });
});
