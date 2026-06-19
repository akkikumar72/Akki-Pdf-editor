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
  page.drawText("Expertise", {
    x: 400,
    y: 674,
    size,
    font,
    color: rgb(1, 1, 1),
  });
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
  await page
    .getByRole("region", { name: "PDF editor canvas" })
    .locator(".react-pdf__Page__canvas")
    .click({ position: { x: 320, y: 360 } });
  await expect(page.getByRole("region", { name: "PDF editor canvas" }).getByText("New text")).toBeVisible();
  const inlineToolbar = page.getByRole("toolbar", { name: "Inline edit tools" });
  await expect(inlineToolbar).toBeVisible();
  await inlineToolbar.getByRole("button", { name: "Bold" }).click();
  await expect(inlineToolbar.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
  await inlineToolbar.getByRole("button", { name: /font size 14/i }).click();
  await page
    .getByRole("menu", { name: /font size options/i })
    .getByRole("menuitemradio", { name: "24" })
    .click();
  await expect(inlineToolbar.getByRole("button", { name: /font size 24/i })).toBeVisible();
  const fontCombobox = inlineToolbar.getByRole("combobox", { name: /font family/i });
  await fontCombobox.click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page
    .locator(".font-select__option")
    .filter({ hasText: /^Noto Serif$/ })
    .hover();
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
  // Run-level hit targets the full extracted phrase.
  await page
    .getByRole("region", { name: "PDF editor canvas" })
    .locator(".text-hit-layer.is-active .text-hit[title='Replace: Invoice total']")
    .click();

  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  const replacement = canvas.locator(".operation--text").filter({ hasText: "Invoice" });
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
  await page
    .getByRole("region", { name: "PDF editor canvas" })
    .locator(".react-pdf__Page__canvas")
    .click({ position: { x: 320, y: 360 } });
  await expect(page.locator(".operation--text").filter({ hasText: "New text" })).toBeVisible();

  await page.waitForTimeout(900);

  await page.reload();
  await expect(page.getByText(/local-save\.pdf restored from this browser/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".operation--text").filter({ hasText: "New text" })).toBeVisible();

  await page.getByRole("button", { name: "AkkiPDF home" }).click();
  await expect(page.getByRole("heading", { name: /lighter touch/i })).toBeVisible();
  const recentSessions = page.getByLabel("Recent local sessions");
  const resumeLocalSave = recentSessions.getByRole("button", { name: /^local-save\.pdf/i });
  const removeLocalSave = recentSessions.getByRole("button", { name: /^remove local-save\.pdf/i });
  await expect(resumeLocalSave).toBeVisible();
  await expect(recentSessions.getByRole("button", { name: /remove local-save\.pdf/i })).toBeVisible();

  await resumeLocalSave.click();
  await expect(page.getByText(/local-save\.pdf restored from this browser/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "AkkiPDF home" }).click();
  await removeLocalSave.click();
  await expect(recentSessions.getByRole("button", { name: /^local-save\.pdf/i })).toHaveCount(0);

  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/local-save\.pdf opened/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "AkkiPDF home" }).click();
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

  await page
    .getByRole("region", { name: "PDF editor canvas" })
    .locator(".text-hit-layer.is-active .text-hit[title='Replace: Invoice total']")
    .click();
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

  await expect(canvas.locator(".operation--text").filter({ hasText: "Invoice" })).toBeVisible();
  await expect(canvas.locator(".operation--text").filter({ hasText: "Invoice subtotal" })).toHaveCount(0);
});

test("replacement text overlays sample the existing PDF background", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("colored-background.pdf");
  await makeColoredBackgroundPdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/colored-background\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await page
    .getByRole("region", { name: "PDF editor canvas" })
    .locator(".text-hit-layer.is-active .text-hit[title='Replace: Colored background text']")
    .click();

  await expect(page.locator(".operation--text")).toHaveCSS("background-color", "rgb(199, 230, 255)");
  await expect(page.getByRole("toolbar", { name: "Inline edit tools" })).toBeVisible();
});

test("replacement text overlays sample the existing PDF text color", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("dark-background.pdf");
  await makeDarkBackgroundPdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/dark-background\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await page
    .getByRole("region", { name: "PDF editor canvas" })
    .locator(".text-hit-layer.is-active .text-hit[title='Replace: White foreground text']")
    .click();

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

  const sourceHit = page
    .getByRole("region", { name: "PDF editor canvas" })
    .locator(".text-hit-layer.is-active .text-hit[title='Replace: White foreground text']");
  const sourceBox = await sourceHit.boundingBox();
  expect(sourceBox).not.toBeNull();
  if (!sourceBox) throw new Error("Expected source text hit box");

  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Text", exact: true }).click();
  // Click just left of the run hit target so this adds new text (not a
  // replacement) that inherits the line's white-on-dark style.
  await page.mouse.click(sourceBox.x - 24, sourceBox.y + sourceBox.height / 2);

  const newText = page.locator(".operation--text").filter({ hasText: "New text" });
  await expect(newText).toBeVisible();
  await expect(newText).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const textColor = parseRgb(await newText.evaluate((node) => getComputedStyle(node).color));
  expect(textColor.red).toBeGreaterThan(235);
  expect(textColor.green).toBeGreaterThan(235);
  expect(textColor.blue).toBeGreaterThan(235);
});

test("left and right runs on the same line stay independently selectable", async ({
  page,
}, testInfo) => {
  const pdfPath = testInfo.outputPath("split-text-run.pdf");
  await makeSplitTextRunPdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/split-text-run\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  await expect(canvas.locator(".text-hit[title='Replace: Technical']")).toHaveCount(1);
  await expect(canvas.locator(".text-hit[title='Replace: Expertise']")).toHaveCount(1);
  await canvas.locator(".text-hit-layer.is-active .text-hit[title='Replace: Technical']").click();

  const replacement = page.locator(".operation--text");
  await expect(replacement).toHaveText("Technical");
  await expect(replacement).toHaveCSS("background-color", "rgb(13, 20, 33)");
  await expect(replacement).toHaveCSS("font-weight", "700");
  await expect(replacement).toHaveCSS("font-family", /Helvetica|Arial/);
  const textColor = parseRgb(await replacement.evaluate((node) => getComputedStyle(node).color));
  expect(textColor.red).toBeGreaterThan(235);
  expect(textColor.green).toBeGreaterThan(235);
  expect(textColor.blue).toBeGreaterThan(235);

  await expect(canvas.locator(".text-hit[title='Replace: Expertise']")).toHaveCount(1);
});

test("hovering a PDF text run shows a dashed accent outline", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("hover-outline.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/hover-outline\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  const hit = canvas.locator(".text-hit-layer.is-active .text-hit[title='Replace: Invoice total']");
  await hit.hover();
  const outlineStyle = await hit.evaluate((node) => getComputedStyle(node).outlineStyle);
  expect(outlineStyle).toBe("dashed");
});

test("aligns the inline toolbar with text and supports drag move with guides", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("move-sample.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/move-sample\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Text", exact: true }).click();
  // Place the text where the (wider) toolbar still fits, so left-alignment holds.
  // Right-edge clamping has its own dedicated test below.
  await canvas.locator(".react-pdf__Page__canvas").click({ position: { x: 140, y: 420 } });
  const textOverlay = canvas.locator(".operation--text").last();
  await expect(textOverlay).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(textOverlay).not.toHaveClass(/is-editing/);

  const inlineToolbar = page.getByRole("toolbar", { name: "Inline edit tools" });
  await expect(inlineToolbar).toBeVisible();
  await expect(canvas.locator(".resize-frame")).toHaveCount(0);

  const placement = await textOverlay.evaluate((node) => {
    const textRect = node.getBoundingClientRect();
    const toolbar = document.querySelector(".floating-toolbar");
    const toolbarRect = toolbar?.getBoundingClientRect();
    return {
      horizontalOffset: toolbarRect ? Math.round(toolbarRect.left - textRect.left) : null,
      verticalGap: toolbarRect ? Math.round(textRect.top - toolbarRect.bottom) : null,
    };
  });
  expect(placement.horizontalOffset).not.toBeNull();
  expect(Math.abs(placement.horizontalOffset ?? 999)).toBeLessThanOrEqual(8);
  expect(placement.verticalGap).toBeGreaterThanOrEqual(8);
  expect(placement.verticalGap).toBeLessThanOrEqual(20);

  // Move-drag lives in the Select tool; with the Text tool active a click would edit instead.
  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Select", exact: true }).click();

  const startBox = await textOverlay.boundingBox();
  expect(startBox).not.toBeNull();
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y - 60, { steps: 8 });
  await expect(canvas.locator(".guides-layer .guide")).not.toHaveCount(0);
  await expect(inlineToolbar).toHaveCount(0);
  await page.mouse.up();
  await expect(canvas.locator(".guides-layer .guide")).toHaveCount(0);
  await expect(inlineToolbar).toBeVisible();

  const endBox = await textOverlay.boundingBox();
  expect(endBox).not.toBeNull();
  expect(startBox!.y - endBox!.y).toBeGreaterThan(20);
});

test("keeps the inline toolbar inside the page when the overlay is near the right edge", async ({
  page,
}, testInfo) => {
  const pdfPath = testInfo.outputPath("right-edge.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/right-edge\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Text", exact: true }).click();

  // Drop a text overlay hard against the right edge so the (wider) toolbar would
  // overflow the page unless it is clamped back inside.
  const stageBox = await page.locator(".page-stage").boundingBox();
  expect(stageBox).not.toBeNull();
  await canvas.locator(".react-pdf__Page__canvas").click({ position: { x: stageBox!.width - 12, y: 360 } });
  await expect(canvas.locator(".operation--text").last()).toBeVisible();
  await page.keyboard.press("Escape");

  const inlineToolbar = page.getByRole("toolbar", { name: "Inline edit tools" });
  await expect(inlineToolbar).toBeVisible();

  const bounds = await page.evaluate(() => {
    const stage = document.querySelector(".page-stage");
    const toolbar = document.querySelector(".floating-toolbar");
    const s = stage?.getBoundingClientRect();
    const t = toolbar?.getBoundingClientRect();
    if (!s || !t) return null;
    return {
      overflowRight: Math.round(t.right - s.right),
      overflowLeft: Math.round(s.left - t.left),
      fitsWidth: t.width <= s.width,
    };
  });
  expect(bounds).not.toBeNull();
  // Allow a 1px rounding slack on each edge.
  expect(bounds!.overflowRight).toBeLessThanOrEqual(1);
  expect(bounds!.overflowLeft).toBeLessThanOrEqual(1);
});

test("moving a replacement keeps the original PDF text masked at its source", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("mask-sample.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/mask-sample\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  await canvas.locator(".text-hit-layer.is-active .text-hit[title='Replace: Invoice total']").click();
  const replacement = canvas.locator(".operation--text").filter({ hasText: "Invoice" });
  await expect(replacement).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(replacement).not.toHaveClass(/is-editing/);

  // A fixed source mask is rendered and the replaced run can no longer be re-hit (no duplicates).
  await expect(canvas.locator(".operation--source-cover")).toHaveCount(1);
  await expect(canvas.locator(".text-hit[title='Replace: Invoice total']")).toHaveCount(0);

  const coverBefore = await canvas.locator(".operation--source-cover").boundingBox();
  expect(coverBefore).not.toBeNull();

  const startBox = await replacement.boundingBox();
  expect(startBox).not.toBeNull();
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y - 90, { steps: 8 });
  await page.mouse.up();

  const endBox = await replacement.boundingBox();
  expect(endBox).not.toBeNull();
  expect(startBox!.y - endBox!.y).toBeGreaterThan(20);

  // The mask stays anchored at the original source position even after the text moves.
  const coverAfter = await canvas.locator(".operation--source-cover").boundingBox();
  expect(coverAfter).not.toBeNull();
  expect(Math.abs(coverAfter!.y - coverBefore!.y)).toBeLessThanOrEqual(1);
});

test("text tool click on existing PDF text replaces and edits immediately", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("text-tool-replace.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/text-tool-replace\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Text", exact: true }).click();
  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  await canvas.locator(".text-hit-layer.is-active .text-hit[title='Replace: Invoice total']").click();

  const replacement = canvas.locator(".operation--text").filter({ hasText: "Invoice" });
  await expect(replacement).toBeVisible();
  await expect(replacement).toHaveAttribute("contenteditable", "true");
  await expect(page.getByRole("toolbar", { name: "Inline edit tools" })).toBeVisible();
});

test("text tool click on a text overlay edits it in place without moving", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("text-tool-edit.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/text-tool-edit\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Text", exact: true }).click();
  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  await canvas.locator(".react-pdf__Page__canvas").click({ position: { x: 320, y: 420 } });
  const overlay = canvas.locator(".operation--text").last();
  await expect(overlay).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(overlay).not.toHaveClass(/is-editing/);

  const before = await overlay.boundingBox();
  expect(before).not.toBeNull();
  await overlay.click();
  await expect(overlay).toHaveClass(/is-editing/);
  const after = await overlay.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs(after!.x - before!.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
});

test("creates a blank document from the tool hub", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("PDF editor preview").getByRole("button", { name: "Blank PDF" }).click();

  await expect(page.getByText(/Blank PDF created/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Apply/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /Forms/i })).toBeVisible();
});
