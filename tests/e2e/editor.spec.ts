import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

function parseRgb(value: string) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) throw new Error(`Expected CSS rgb() color, received ${value}`);
  return {
    red: Number.parseInt(match[1], 10),
    green: Number.parseInt(match[2], 10),
    blue: Number.parseInt(match[3], 10),
  };
}

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

async function makeDarkBackgroundPdf(path: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawRectangle({ x: 68, y: 656, width: 260, height: 52, color: rgb(0.05, 0.08, 0.13) });
  page.drawText("White foreground text", { x: 82, y: 674, size: 20, font, color: rgb(1, 1, 1) });
  const bytes = await pdf.save();
  await import("node:fs/promises").then((fs) => fs.writeFile(path, bytes));
}

async function makeSplitTextRunPdf(path: string) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const size = 20;
  const firstWord = "Technical";
  page.drawRectangle({ x: 68, y: 656, width: 260, height: 52, color: rgb(0.05, 0.08, 0.13) });
  page.drawText(firstWord, { x: 82, y: 674, size, font, color: rgb(1, 1, 1) });
  page.drawText("Expertise", { x: 82 + font.widthOfTextAtSize(firstWord, size) + 4, y: 674, size, font, color: rgb(1, 1, 1) });
  const bytes = await pdf.save();
  await import("node:fs/promises").then((fs) => fs.writeFile(path, bytes));
}

test("imports a PDF and adds a text overlay", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("sample.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /lighter touch/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /dropbox/i })).toBeDisabled();

  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/sample\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Text", exact: true }).click();
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
  const replacement = canvas.locator(".operation--text").filter({ hasText: "Invoice total" });
  await expect(replacement).toBeVisible();
  await expect(replacement).toHaveAttribute("contenteditable", "true");
  await expect(page.getByRole("toolbar", { name: "Inline edit tools" })).toBeVisible();
  const inlineEditor = canvas.locator(".operation--text[contenteditable='true']");
  await inlineEditor.fill("Invoice subtotal");
  await inlineEditor.press("Enter");
  await expect(canvas.locator(".operation--text").filter({ hasText: "Invoice subtotal" })).toBeVisible();
});

test("local save restores the PDF session after reload and can return home", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("local-save.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/local-save\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("region", { name: "PDF editor canvas" }).locator(".react-pdf__Page__canvas").click({ position: { x: 320, y: 360 } });
  await expect(page.locator(".operation--text").filter({ hasText: "New text" })).toBeVisible();

  await page.waitForTimeout(900);

  await page.reload();
  await expect(page.getByText(/local-save\.pdf restored from this browser/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".operation--text").filter({ hasText: "New text" })).toBeVisible();

  await page.getByTitle("Back to home").click();
  await expect(page.getByRole("heading", { name: /lighter touch/i })).toBeVisible();
  const recentSessions = page.getByLabel("Recent local sessions");
  const resumeLocalSave = recentSessions.getByRole("button", { name: /^local-save\.pdf/i });
  const removeLocalSave = recentSessions.getByRole("button", { name: /^remove local-save\.pdf/i });
  await expect(resumeLocalSave).toBeVisible();
  await expect(recentSessions.getByRole("button", { name: /remove local-save\.pdf/i })).toBeVisible();

  await resumeLocalSave.click();
  await expect(page.getByText(/local-save\.pdf restored from this browser/i)).toBeVisible({ timeout: 15_000 });

  await page.getByTitle("Back to home").click();
  await removeLocalSave.click();
  await expect(recentSessions.getByRole("button", { name: /^local-save\.pdf/i })).toHaveCount(0);

  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/local-save\.pdf opened/i)).toBeVisible({ timeout: 15_000 });
  await page.getByTitle("Back to home").click();
  await expect(recentSessions.getByRole("button", { name: /^local-save\.pdf/i })).toBeVisible();
  await recentSessions.getByRole("button", { name: /clear all/i }).click();
  await expect(page.getByLabel("Recent local sessions")).toHaveCount(0);
});

test("timestamped undo history can restore a selected edit checkpoint", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("history.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/history\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("region", { name: "PDF editor canvas" }).locator(".text-hit-layer.is-active .text-hit[title='Replace: Invoice total']").click();
  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  const inlineEditor = canvas.locator(".operation--text[contenteditable='true']");
  await inlineEditor.fill("Invoice subtotal");
  await inlineEditor.press("Enter");
  await expect(canvas.locator(".operation--text").filter({ hasText: "Invoice subtotal" })).toBeVisible();

  await page.getByTitle("Undo history").click();
  const dialog = page.getByRole("dialog", { name: "Undo changes" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Text edit", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Revert selected" }).click();

  await expect(canvas.locator(".operation--text").filter({ hasText: "Invoice total" })).toBeVisible();
  await expect(canvas.locator(".operation--text").filter({ hasText: "Invoice subtotal" })).toHaveCount(0);
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

test("replacement text overlays sample the existing PDF text color", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("dark-background.pdf");
  await makeDarkBackgroundPdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/dark-background\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("region", { name: "PDF editor canvas" }).locator(".text-hit-layer.is-active .text-hit[title='Replace: White foreground text']").click();

  await expect(page.locator(".operation--text")).toHaveCSS("background-color", "rgb(13, 20, 33)");
  const textColor = parseRgb(await page.locator(".operation--text").evaluate((node) => getComputedStyle(node).color));
  expect(textColor.red).toBeGreaterThan(235);
  expect(textColor.green).toBeGreaterThan(235);
  expect(textColor.blue).toBeGreaterThan(235);
  await expect(page.getByRole("toolbar", { name: "Inline edit tools" })).toBeVisible();
});

test("new text added near an existing line inherits that line style", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("same-line-style.pdf");
  await makeDarkBackgroundPdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/same-line-style\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  const sourceHit = page.getByRole("region", { name: "PDF editor canvas" }).locator(".text-hit-layer.is-active .text-hit[title='Replace: White foreground text']");
  const sourceBox = await sourceHit.boundingBox();
  expect(sourceBox).not.toBeNull();
  if (!sourceBox) throw new Error("Expected source text hit box");

  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Text", exact: true }).click();
  await page.mouse.click(sourceBox.x + sourceBox.width + 24, sourceBox.y + sourceBox.height / 2);

  const newText = page.locator(".operation--text").filter({ hasText: "New text" });
  await expect(newText).toBeVisible();
  await expect(newText).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const textColor = parseRgb(await newText.evaluate((node) => getComputedStyle(node).color));
  expect(textColor.red).toBeGreaterThan(235);
  expect(textColor.green).toBeGreaterThan(235);
  expect(textColor.blue).toBeGreaterThan(235);
});

test("replacement text groups adjacent same-line PDF fragments into one color-consistent run", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("split-text-run.pdf");
  await makeSplitTextRunPdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/split-text-run\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("region", { name: "PDF editor canvas" }).locator(".text-hit-layer.is-active .text-hit[title='Replace: Technical Expertise']").click();

  const replacement = page.locator(".operation--text");
  await expect(replacement).toHaveText("Technical Expertise");
  await expect(replacement).toHaveCSS("background-color", "rgb(13, 20, 33)");
  await expect(replacement).toHaveCSS("white-space", "pre");
  await expect(replacement).toHaveCSS("font-weight", "700");
  await expect(replacement).toHaveCSS("font-family", /Helvetica|Arial/);
  const textWidth = await replacement.evaluate((node) => {
    const range = document.createRange();
    range.selectNodeContents(node);
    return {
      boxWidth: node.getBoundingClientRect().width,
      textWidth: range.getBoundingClientRect().width,
    };
  });
  expect(textWidth.boxWidth).toBeGreaterThanOrEqual(textWidth.textWidth - 1);
  const textColor = parseRgb(await replacement.evaluate((node) => getComputedStyle(node).color));
  expect(textColor.red).toBeGreaterThan(235);
  expect(textColor.green).toBeGreaterThan(235);
  expect(textColor.blue).toBeGreaterThan(235);
});

test("creates a blank document from the tool hub", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("PDF editor preview").getByRole("button", { name: "Blank PDF" }).click();

  await expect(page.getByText(/Blank PDF created/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Apply/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Forms/i })).toBeVisible();
});
