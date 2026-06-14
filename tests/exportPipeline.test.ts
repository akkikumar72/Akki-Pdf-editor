import { describe, expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { ExportPipeline } from "../src/engine/exportPipeline";
import type { TextItem } from "../src/types/editor";

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
});
