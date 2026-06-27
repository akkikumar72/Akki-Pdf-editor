import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { ExportPipeline, type ExportContext } from "../src/engine/exportPipeline";
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

  it("filters CSV by table region operations", () => {
    const csv = new ExportPipeline().toCsv(items, [{
      id: "table_1",
      type: "table-region",
      label: "Table 1",
      pageIndex: 0,
      rect: { x: 0, y: 650, width: 220, height: 40 },
      createdAt: 1,
    }]);
    expect(csv).toContain("Akki");
    expect(csv).not.toContain("Name");
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

  it("neutralizes XLSX formula-injection payloads", () => {
    const bytes = new ExportPipeline().toXlsxBytes(
      [{ str: "=HYPERLINK(1)", pageIndex: 0, rect: { x: 10, y: 700, width: 80, height: 12 } }],
      [],
    );
    const sheet = strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain("&apos;=HYPERLINK(1)");
  });

  it("falls back to a placeholder row when no table-like text exists", () => {
    const sheet = strFromU8(unzipSync(new ExportPipeline().toXlsxBytes([], []))["xl/worksheets/sheet1.xml"]);
    expect(sheet).toContain("No table-like text detected");
  });

  it("joins grouped rows into plain text", () => {
    expect(new ExportPipeline().toText(items)).toBe("Name Amount\nAkki $42");
  });
});

describe("export() dispatch", () => {
  const downloads: Array<{ blob: Blob; name: string }> = [];

  beforeEach(() => {
    downloads.length = 0;
    vi.useFakeTimers();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      // record the most recent object URL target so we can assert per-format wiring
      downloads.push({ blob: new Blob(), name: this.download });
    });
  });

  afterEach(() => {
    vi.runAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function context(): ExportContext {
    return {
      filename: "Report.final.pdf",
      bytes: new Uint8Array([1, 2, 3]),
      operations: [],
      textItems: items,
    };
  }

  it("routes pdf exports through the engine.savePdf hook", async () => {
    const savePdf = vi.fn(async () => new Uint8Array([9, 9]));
    const pipeline = new ExportPipeline({ savePdf } as never);
    await pipeline.export("pdf", context());
    expect(savePdf).toHaveBeenCalledOnce();
    expect(downloads.at(-1)?.name).toBe("Report-final-edited.pdf");
  });

  it("routes txt, csv, and xlsx exports to their serializers", async () => {
    const pipeline = new ExportPipeline();
    await pipeline.export("txt", context());
    expect(downloads.at(-1)?.name).toBe("Report-final.txt");
    await pipeline.export("csv", context());
    expect(downloads.at(-1)?.name).toBe("Report-final.csv");
    await pipeline.export("xlsx", context());
    expect(downloads.at(-1)?.name).toBe("Report-final.xlsx");
  });

  it("throws on an unsupported format", async () => {
    await expect(new ExportPipeline().export("bogus" as ExportFormat, context())).rejects.toThrow(/Unsupported export format/);
  });
});
