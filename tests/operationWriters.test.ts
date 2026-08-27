import type { PDFFont, PDFPage } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { writeText, type WriterContext } from "../src/engine/operationWriters";
import type { TextOperation } from "../src/types/editor";

describe("operationWriters", () => {
  it("keeps narrow single-line text unwrapped so export matches the canvas", async () => {
    const drawText = vi.fn();
    const page = { drawText } as unknown as PDFPage;
    const font = { widthOfTextAtSize: vi.fn(() => 240) } as unknown as PDFFont;
    const context: WriterContext = {
      getFont: async () => font,
      getReusedFont: async () => null,
      embeddedCovers: () => false,
    };
    const operation: TextOperation = {
      id: "text-1",
      type: "text",
      pageIndex: 0,
      rect: { x: 40, y: 700, width: 32, height: 14 },
      text: "This stays on one line",
      fontFamily: "Helvetica",
      fontSize: 12,
      color: "#111827",
      align: "left",
      opacity: 1,
      createdAt: 1,
    };

    await writeText(page, operation, 1, context);

    expect(drawText).toHaveBeenCalledOnce();
    const options = drawText.mock.calls[0][1] as Record<string, unknown>;
    expect(options).not.toHaveProperty("maxWidth");
    expect(options.lineHeight).toBe(12);
  });
});
