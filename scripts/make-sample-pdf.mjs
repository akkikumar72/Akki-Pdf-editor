// Generates the sample PDF fixture used by the browser smoke test
// (scripts/smoke-test.sh). Run with: bun run scripts/make-sample-pdf.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);

const page1 = doc.addPage([612, 792]);
page1.drawText("Acme Corp", { x: 72, y: 720, size: 24, font: bold, color: rgb(0.1, 0.12, 0.16) });
page1.drawText("Sample Invoice", { x: 72, y: 690, size: 14, font, color: rgb(0.3, 0.33, 0.4) });
page1.drawText("Invoice #: 1024", { x: 72, y: 650, size: 12, font });
page1.drawText("Date: 2026-06-22", { x: 72, y: 632, size: 12, font });
page1.drawText("Bill to: Jane Doe", { x: 72, y: 614, size: 12, font });
page1.drawText("Description            Qty      Amount", { x: 72, y: 560, size: 12, font: bold });
page1.drawText("Design services         10     $1,200.00", { x: 72, y: 540, size: 12, font });
page1.drawText("Development             20     $4,000.00", { x: 72, y: 522, size: 12, font });
page1.drawText("Total                          $5,200.00", { x: 72, y: 490, size: 12, font: bold });

const page2 = doc.addPage([612, 792]);
page2.drawText("Terms & Conditions", { x: 72, y: 720, size: 18, font: bold });
page2.drawText("Payment is due within 30 days of the invoice date.", { x: 72, y: 680, size: 12, font });
page2.drawText("Thank you for your business.", { x: 72, y: 660, size: 12, font });

const bytes = await doc.save();
mkdirSync(new URL("../pdf/", import.meta.url), { recursive: true });
const out = new URL("../pdf/sample-invoice.pdf", import.meta.url);
writeFileSync(out, bytes);
console.log(`Wrote ${out.pathname} (${bytes.length} bytes)`);
