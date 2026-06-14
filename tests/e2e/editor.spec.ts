import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function makeSamplePdf(path: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("Invoice total", { x: 72, y: 700, size: 20, font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText("Amount $42", { x: 72, y: 660, size: 14, font, color: rgb(0.1, 0.1, 0.1) });
  const bytes = await pdf.save();
  await import("node:fs/promises").then((fs) => fs.writeFile(path, bytes));
}

async function makeColoredBackgroundPdf(path: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 68, y: 656, width: 250, height: 52, color: rgb(0.78, 0.9, 1) });
  page.drawText("Colored background text", { x: 82, y: 674, size: 20, font, color: rgb(0.05, 0.08, 0.13) });
  const bytes = await pdf.save();
  await import("node:fs/promises").then((fs) => fs.writeFile(path, bytes));
}

test("imports a PDF and adds a text overlay", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("sample.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /pdf tasks/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /dropbox/i })).toBeDisabled();

  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/sample\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: /text/i }).click();
  await page.getByRole("region", { name: "PDF editor canvas" }).locator(".react-pdf__Page__canvas").click({ position: { x: 320, y: 360 } });
  await expect(page.getByRole("region", { name: "PDF editor canvas" }).getByText("New text")).toBeVisible();
  const inlineToolbar = page.getByRole("toolbar", { name: "Inline edit tools" });
  await expect(inlineToolbar).toBeVisible();
  await inlineToolbar.getByRole("button", { name: "Bold" }).click();
  await expect(inlineToolbar.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await inlineToolbar.getByRole("button", { name: /font size 14/i }).click();
  await page.getByRole("menu", { name: /font size options/i }).getByRole("menuitemradio", { name: "24" }).click();
  await expect(inlineToolbar.getByRole("button", { name: /font size 24/i })).toBeVisible();
  const fontCombobox = inlineToolbar.getByRole("combobox", { name: /font family/i });
  await fontCombobox.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.locator(".font-select__option").filter({ hasText: /^Noto Serif$/ }).hover();
  await expect(page.locator(".operation--text")).toHaveCSS("font-family", /Noto Serif/);
  await fontCombobox.fill("Times New Roman");
  await expect(page.locator(".font-select__option").filter({ hasText: /^Times New Roman$/ })).toBeVisible();
  await fontCombobox.press("Enter");
  await expect(page.locator(".operation--text")).toHaveCSS("font-family", /Times New Roman|Liberation Serif/);
  await expect(inlineToolbar.getByRole("button", { name: /font size 24\b/i })).toBeVisible();

  await page.getByRole("button", { name: /Apply/i }).click();
  await expect(page.getByText(/PDF exported|Exporting PDF/i)).toBeVisible();
});

test("select mode can click existing PDF text to create a replacement overlay", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("sample.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/sample\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await expect(page.getByRole("button", { name: /^select$/i })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("region", { name: "PDF editor canvas" }).locator(".text-hit-layer.is-active .text-hit[title='Replace: Invoice total']").click();

  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  await expect(canvas.locator(".operation--text").filter({ hasText: "Invoice total" })).toBeVisible();
  await expect(page.getByRole("toolbar", { name: "Inline edit tools" })).toBeVisible();
});

test("replacement text overlays sample the existing PDF background", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("colored-background.pdf");
  await makeColoredBackgroundPdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/colored-background\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("region", { name: "PDF editor canvas" }).locator(".text-hit-layer.is-active .text-hit[title='Replace: Colored background text']").click();

  await expect(page.locator(".operation--text")).toHaveCSS("background-color", "rgb(199, 230, 255)");
  await expect(page.getByRole("toolbar", { name: "Inline edit tools" })).toBeVisible();
});

test("creates a blank document from the tool hub", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /blank document/i }).click();

  await expect(page.getByText(/Blank PDF created/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Apply/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Forms/i })).toBeVisible();
});
