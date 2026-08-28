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
    x: 82 + font.widthOfTextAtSize(firstWord, size) + 4,
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
  // The box appears instantly with the placeholder
  // fully selected, so typing replaces it without any select-and-delete.
  await expect(page.getByRole("region", { name: "PDF editor canvas" }).getByText("Type your text")).toBeVisible();
  const styledEditor = page
    .getByRole("region", { name: "PDF editor canvas" })
    .locator(".operation--text[contenteditable='true']");
  await styledEditor.pressSequentially("Styled text");
  await expect(page.getByRole("region", { name: "PDF editor canvas" }).getByText("Styled text")).toBeVisible();
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

  await page.setViewportSize({ width: 760, height: 720 });
  const done = inlineToolbar.getByRole("button", { name: "Done" });
  await expect(done).toBeVisible();
  await expect(done).toBeInViewport();

  await inlineToolbar.getByRole("button", { name: "Properties" }).click();
  await expect(page.getByRole("complementary", { name: "Properties" })).toBeVisible();
  await expect(page.locator(".operation--text").last()).toHaveAttribute("contenteditable", "false");
  await expect(inlineToolbar.getByRole("button", { name: "Done" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "Properties" })).toHaveCount(0);
  await expect(page.locator(".page-stage")).toBeFocused();

  await page.locator(".operation--text").last().dblclick();
  await expect(inlineToolbar.getByRole("button", { name: "Done" })).toBeVisible();
  await inlineToolbar.getByRole("button", { name: "Bold" }).focus();
  await page.keyboard.press("Escape");
  await expect(page.locator(".floating-toolbar--contextual")).toBeVisible();
  await expect(inlineToolbar.getByRole("button", { name: "Done" })).toHaveCount(0);
  await expect(page.locator(".page-stage .floating-toolbar")).toHaveCount(0);
  await expect(page.locator(".operation--text").last()).toHaveAttribute("contenteditable", "false");
  await expect(page.locator(".page-stage")).toBeFocused();

  await inlineToolbar.getByRole("button", { name: "Properties" }).click();
  await expect(page.getByRole("complementary", { name: "Properties" })).toBeVisible();
  await page.getByRole("button", { name: "Close properties" }).click();
  await expect(page.getByRole("complementary", { name: "Properties" })).toHaveCount(0);

  await page.getByRole("button", { name: /Apply/i }).click();
  await expect(page.getByText(/PDF exported|Exporting PDF/i)).toBeVisible();
});

test("preserves Shift+Enter line breaks in edited text", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("multiline-text.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/multiline-text\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Text", exact: true }).click();
  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  await canvas.locator(".react-pdf__Page__canvas").click({ position: { x: 320, y: 360 } });
  const editor = canvas.locator(".operation--text[contenteditable='true']");
  await editor.pressSequentially("First line");
  await editor.press("Shift+Enter");
  await editor.pressSequentially("Second line");
  await page.getByRole("toolbar", { name: "Inline edit tools" }).getByRole("button", { name: "Done" }).click();

  const committed = canvas.locator(".operation--text").last();
  await expect(committed).toHaveAttribute("contenteditable", "false");
  expect(await committed.textContent()).toBe("First line\nSecond line");
});

test("keeps every page and view control clickable at tablet width", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("tablet-toolbar.pdf");
  await makeSamplePdf(pdfPath);
  await page.setViewportSize({ width: 1100, height: 760 });

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/tablet-toolbar\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  const editingTools = page.getByRole("toolbar", { name: "Editing tools" });
  await editingTools.getByRole("button", { name: "Text", exact: true }).click();
  await page
    .getByRole("region", { name: "PDF editor canvas" })
    .locator(".react-pdf__Page__canvas")
    .click({ position: { x: 260, y: 320 } });
  await page.locator(".operation--text[contenteditable='true']").pressSequentially("Tablet control");
  await page.getByRole("toolbar", { name: "Inline edit tools" }).getByRole("button", { name: "Done" }).click();

  const controls = page.getByRole("group", { name: "Page and view controls" });
  await controls.getByRole("button", { name: "Remove selected" }).click();
  await expect(page.getByText("Tablet control")).toHaveCount(0);

  await controls.getByRole("button", { name: "Insert blank page" }).click();
  await controls.getByRole("button", { name: "Delete current page" }).click();
  await controls.getByRole("button", { name: "Zoom out" }).click();
  await controls.getByRole("button", { name: "Zoom in" }).click();
  await controls.getByRole("button", { name: "Rotate view" }).click();
  await controls.getByRole("button", { name: "Rotate page permanently" }).click();

  await expect(page.getByRole("region", { name: "PDF editor canvas" })).toBeVisible();
});

test("keeps grouped tool pickers compact and anchored at tablet width", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("compact-tool-picker.pdf");
  await makeSamplePdf(pdfPath);
  await page.setViewportSize({ width: 1100, height: 760 });

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/compact-tool-picker\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  const editingTools = page.getByRole("toolbar", { name: "Editing tools" });
  const drawButton = editingTools.getByRole("button", { name: "Draw", exact: true });
  const trigger = editingTools.getByRole("button", { name: /Choose Draw tool/ });
  await trigger.click();

  const menu = page.getByRole("menu", { name: "Draw tools" });
  await expect(menu).toBeVisible();
  const [drawBox, triggerBox, menuBox, itemBoxes] = await Promise.all([
    drawButton.boundingBox(),
    trigger.boundingBox(),
    menu.boundingBox(),
    menu.getByRole("menuitemradio").evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height)),
  ]);

  expect(drawBox).not.toBeNull();
  expect(triggerBox).not.toBeNull();
  expect(menuBox).not.toBeNull();
  expect(menuBox!.width).toBeGreaterThanOrEqual(184);
  expect(menuBox!.width).toBeLessThanOrEqual(202);
  expect(Math.abs(menuBox!.x - drawBox!.x)).toBeLessThanOrEqual(2);
  expect(menuBox!.y - (triggerBox!.y + triggerBox!.height)).toBeGreaterThanOrEqual(4);
  expect(menuBox!.y - (triggerBox!.y + triggerBox!.height)).toBeLessThanOrEqual(8);
  for (const height of itemBoxes) {
    expect(height).toBeGreaterThanOrEqual(34);
    expect(height).toBeLessThanOrEqual(38);
  }
});

test("scopes direct-touch handling to canvas gesture targets", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("touch-gestures.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/touch-gestures\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  const editingTools = page.getByRole("toolbar", { name: "Editing tools" });
  await editingTools.getByRole("button", { name: "Crop", exact: true }).click();
  const stage = page.locator(".page-stage");
  await expect(stage).toHaveCSS("touch-action", "none");
  const stageBox = await stage.boundingBox();
  expect(stageBox).not.toBeNull();
  await page.mouse.move(stageBox!.x + 100, stageBox!.y + 100);
  await page.mouse.down();
  await page.mouse.move(stageBox!.x + 300, stageBox!.y + 300);
  await page.mouse.up();
  await expect(page.locator(".crop-handle").first()).toHaveCSS("touch-action", "none");
  await page.getByRole("button", { name: "Cancel crop" }).click();

  await editingTools.getByRole("button", { name: "Callout", exact: true }).click();
  await page.mouse.move(stageBox!.x + 180, stageBox!.y + 220);
  await page.mouse.down();
  await page.mouse.move(stageBox!.x + 380, stageBox!.y + 310);
  await page.mouse.up();

  await expect(page.locator(".operation--annotation-callout")).toHaveCSS("touch-action", "none");
  await expect(page.locator(".resize-handle").first()).toHaveCSS("touch-action", "none");
  await expect(page.locator(".callout-point-handle").first()).toHaveCSS("touch-action", "none");
});

test("draws a sampled freehand stroke and restores it through keyboard history", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("draw-stroke.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/draw-stroke\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  const editingTools = page.getByRole("toolbar", { name: "Editing tools" });
  await editingTools.getByRole("button", { name: "Draw", exact: true }).click();

  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  const pageCanvas = canvas.locator(".react-pdf__Page__canvas");
  const box = await pageCanvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 90, box!.y + 90);
  await page.mouse.down();
  await page.mouse.move(box!.x + 150, box!.y + 130, { steps: 4 });
  await page.mouse.move(box!.x + 220, box!.y + 100, { steps: 4 });
  await page.mouse.up();

  const stroke = canvas.locator(".operation--ink");
  await expect(stroke).toHaveCount(1);
  const pointList = await stroke.locator("polyline").getAttribute("points");
  expect(pointList?.trim().split(/\s+/).length).toBeGreaterThanOrEqual(3);

  await page.keyboard.press("Control+z");
  await expect(stroke).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  await expect(stroke).toHaveCount(1);

  await page.getByRole("button", { name: /Apply/i }).click();
  await expect(page.getByText(/PDF exported|Exporting PDF/i)).toBeVisible();
});

test("Edit text selects source text first, then edits it on the second click", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("sample.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/sample\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await expect(page.getByRole("button", { name: /^edit text$/i })).toHaveAttribute("aria-pressed", "true");
  const sourceText = page
    .getByRole("region", { name: "PDF editor canvas" })
    .locator(".text-hit-layer.is-active .text-hit[title='Replace: Invoice total']");
  await sourceText.click();

  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  const replacement = canvas.locator(".operation--text").filter({ hasText: "Invoice total" });
  await expect(replacement).toHaveCount(0);
  await expect(sourceText).toHaveAttribute("aria-pressed", "true");
  await expect(sourceText).toHaveCSS("outline-style", "solid");
  await expect(page.getByRole("toolbar", { name: "Inline edit tools" })).toHaveCount(0);

  await sourceText.click();
  await expect(replacement).toBeVisible();
  await expect(replacement).toHaveAttribute("contenteditable", "true");
  await expect(page.getByRole("toolbar", { name: "Inline edit tools" })).toBeVisible();
  const inlineEditor = canvas.locator(".operation--text[contenteditable='true']");
  const stageBox = await canvas.locator(".page-stage").boundingBox();
  expect(stageBox).not.toBeNull();
  const typography = await inlineEditor.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      family: style.fontFamily,
      size: Number.parseFloat(style.fontSize),
      weight: style.fontWeight,
      fontStyle: style.fontStyle,
    };
  });
  expect(typography.family).toMatch(/Helvetica|Arial/);
  expect(typography.size).toBeCloseTo(20 * (stageBox!.width / 612), 1);
  expect(typography.weight).toBe("400");
  expect(typography.fontStyle).toBe("normal");
  await inlineEditor.fill("Invoice subtotal");
  await inlineEditor.press("Enter");
  await expect(canvas.locator(".operation--text").filter({ hasText: "Invoice subtotal" })).toBeVisible();
});

test("replacement hides overlapping PDF.js text-layer spans", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("text-layer-hide.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/text-layer-hide\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  await canvas.locator(".text-hit-layer.is-active .text-hit[title='Replace: Invoice total']").dblclick();
  await expect(canvas.locator(".operation--text").filter({ hasText: "Invoice total" })).toBeVisible();

  await expect
    .poll(async () => canvas.locator(".react-pdf__Page__textContent span[data-akki-suppressed='true']").count())
    .toBeGreaterThan(0);
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
  const savedEditor = page.locator(".operation--text[contenteditable='true']");
  await savedEditor.pressSequentially("Saved note");
  await page.keyboard.press("Enter");
  await expect(page.locator(".operation--text").filter({ hasText: "Saved note" })).toBeVisible();

  await page.waitForTimeout(900);

  await page.reload();
  await expect(page.getByText(/local-save\.pdf restored from this browser/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.locator(".operation--text").filter({ hasText: "Saved note" })).toBeVisible();

  await page.getByRole("button", { name: "Akkivo home" }).click();
  await expect(page.getByRole("heading", { name: /lighter touch/i })).toBeVisible();
  const recentSessions = page.getByLabel("Recent local sessions");
  const resumeLocalSave = recentSessions.getByRole("button", { name: /^local-save\.pdf/i });
  const removeLocalSave = recentSessions.getByRole("button", { name: /^remove local-save\.pdf/i });
  await expect(resumeLocalSave).toBeVisible();
  await expect(recentSessions.getByRole("button", { name: /remove local-save\.pdf/i })).toBeVisible();

  await resumeLocalSave.click();
  await expect(page.getByText(/local-save\.pdf restored from this browser/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Akkivo home" }).click();
  await removeLocalSave.click();
  await expect(recentSessions.getByRole("button", { name: /^local-save\.pdf/i })).toHaveCount(0);

  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/local-save\.pdf opened/i)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Akkivo home" }).click();
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
    .dblclick();
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

  await page
    .getByRole("region", { name: "PDF editor canvas" })
    .locator(".text-hit-layer.is-active .text-hit[title='Replace: Colored background text']")
    .dblclick();

  // The sampled page background lives on the dedicated mask, not the editable run
  // (the run itself is transparent so it never clips neighboring lines).
  await expect(page.locator(".operation--source-cover")).toHaveCSS("background-color", "rgb(199, 230, 255)");
  await expect(page.locator(".operation--text")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
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
    .dblclick();

  await expect(page.locator(".operation--source-cover")).toHaveCSS("background-color", "rgb(13, 20, 33)");
  await expect(page.locator(".operation--text")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
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
  await page.mouse.click(sourceBox.x + sourceBox.width + 24, sourceBox.y + sourceBox.height / 2);

  const newText = page.locator(".operation--text").filter({ hasText: "Type your text" });
  await expect(newText).toBeVisible();
  await expect(newText).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const textColor = parseRgb(await newText.evaluate((node) => getComputedStyle(node).color));
  expect(textColor.red).toBeGreaterThan(235);
  expect(textColor.green).toBeGreaterThan(235);
  expect(textColor.blue).toBeGreaterThan(235);
});

test("replacement text groups adjacent same-line PDF fragments into one color-consistent run", async ({
  page,
}, testInfo) => {
  const pdfPath = testInfo.outputPath("split-text-run.pdf");
  await makeSplitTextRunPdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/split-text-run\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await page
    .getByRole("region", { name: "PDF editor canvas" })
    .locator(".text-hit-layer.is-active .text-hit[title='Replace: Technical Expertise']")
    .dblclick();

  const replacement = page.locator(".operation--text");
  await expect(replacement).toHaveText("Technical Expertise");
  await expect(page.locator(".operation--source-cover")).toHaveCSS("background-color", "rgb(13, 20, 33)");
  await expect(replacement).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
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

test("keeps selection tools in the contextual row while drag move shows guides", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("move-sample.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/move-sample\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Text", exact: true }).click();
  await canvas.locator(".react-pdf__Page__canvas").click({ position: { x: 140, y: 420 } });
  const textOverlay = canvas.locator(".operation--text").last();
  await expect(textOverlay).toBeVisible();
  // An untouched placeholder box is discarded on commit,
  // so give it real content before ending the edit session.
  await canvas.locator(".operation--text[contenteditable='true']").pressSequentially("Guides anchor");
  await page.keyboard.press("Escape");
  await expect(textOverlay).not.toHaveClass(/is-editing/);

  const inlineToolbar = page.getByRole("toolbar", { name: "Inline edit tools" });
  await expect(inlineToolbar).toBeVisible();
  const textResizeFrame = canvas.locator(".resize-frame--text");
  await expect(textResizeFrame).toHaveCount(1);
  await expect(textResizeFrame.locator(".resize-handle")).toHaveCount(2);
  await expect(canvas.locator(".contextual-toolbar-shell").getByRole("toolbar", { name: "Inline edit tools" })).toBeVisible();
  await expect(canvas.locator(".page-stage .floating-toolbar")).toHaveCount(0);

  // Move-drag lives in the Edit text tool; with the Text tool active a click would edit instead.
  await page
    .getByRole("toolbar", { name: "Editing tools" })
    .getByRole("button", { name: "Edit text", exact: true })
    .click();

  const startBox = await textOverlay.boundingBox();
  expect(startBox).not.toBeNull();
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y + startBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(startBox!.x + startBox!.width / 2, startBox!.y - 60, { steps: 8 });
  await expect(canvas.locator(".guides-layer .guide")).not.toHaveCount(0);
  await expect(inlineToolbar).toBeVisible();
  await page.mouse.up();
  await expect(canvas.locator(".guides-layer .guide")).toHaveCount(0);
  await expect(inlineToolbar).toBeVisible();

  const endBox = await textOverlay.boundingBox();
  expect(endBox).not.toBeNull();
  expect(startBox!.y - endBox!.y).toBeGreaterThan(20);
});

test("keeps the contextual toolbar inside the editor when selection is near the right edge", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("right-edge.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/right-edge\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Text", exact: true }).click();

  // Drop a text overlay hard against the right edge. The stable contextual row
  // must remain bounded by the editor instead of following the object off-page.
  const stageBox = await page.locator(".page-stage").boundingBox();
  expect(stageBox).not.toBeNull();
  await canvas.locator(".react-pdf__Page__canvas").click({ position: { x: stageBox!.width - 12, y: 360 } });
  await expect(canvas.locator(".operation--text").last()).toBeVisible();
  await canvas.locator(".operation--text[contenteditable='true']").pressSequentially("Edge text");
  await page.keyboard.press("Escape");

  const inlineToolbar = page.getByRole("toolbar", { name: "Inline edit tools" });
  await expect(inlineToolbar).toBeVisible();

  const bounds = await page.evaluate(() => {
    const shell = document.querySelector(".contextual-toolbar-shell");
    const toolbar = document.querySelector(".floating-toolbar--contextual");
    const s = shell?.getBoundingClientRect();
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
  await canvas.locator(".text-hit-layer.is-active .text-hit[title='Replace: Invoice total']").dblclick();
  const replacement = canvas.locator(".operation--text").filter({ hasText: "Invoice total" });
  await expect(replacement).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(replacement).not.toHaveClass(/is-editing/);

  // A fixed source mask is rendered and the run can no longer be re-hit (no duplicates).
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

test("Add Text stays separate from existing source text", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("text-tool-replace.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/text-tool-replace\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  const sourceBox = await canvas
    .locator(".text-hit-layer.is-active .text-hit[title='Replace: Invoice total']")
    .boundingBox();
  expect(sourceBox).not.toBeNull();

  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Text", exact: true }).click();
  await expect(canvas.locator(".text-hit-layer.is-active")).toHaveCount(0);
  await page.mouse.click(sourceBox!.x + sourceBox!.width / 2, sourceBox!.y + sourceBox!.height / 2);

  const addedText = canvas.locator(".operation--text").filter({ hasText: "Type your text" });
  await expect(addedText).toBeVisible();
  await expect(addedText).toHaveAttribute("contenteditable", "true");
  await expect(canvas.locator(".operation--source-cover")).toHaveCount(0);
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
  await canvas.locator(".operation--text[contenteditable='true']").pressSequentially("Anchored");
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
  await expect(page.getByRole("button", { name: "Forms", exact: true })).toBeVisible();
});

test("opens the Forms dropdown and places a dropdown field through the inline popover", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("forms-dropdown.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/forms-dropdown\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await page
    .getByRole("toolbar", { name: "Editing tools" })
    .getByRole("button", { name: /Choose Forms tool/ })
    .click();
  await page.getByRole("menu").getByRole("menuitemradio", { name: "Dropdown" }).click();

  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  await canvas.locator(".react-pdf__Page__canvas").click({ position: { x: 320, y: 360 } });

  const popover = page.getByRole("dialog", { name: "Add form field" });
  await expect(popover).toBeVisible();
  await popover.getByLabel("Field name").fill("status");
  await popover.getByLabel("Choices").fill("Paid, Pending");
  await popover.getByRole("button", { name: "Add field" }).click();

  await expect(popover).not.toBeVisible();
  await expect(canvas.locator(".operation--form-field")).toBeVisible();
});

test("editing a selected link through the link properties dialog", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("edit-link.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/edit-link\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await page.getByRole("toolbar", { name: "Editing tools" }).getByRole("button", { name: "Links" }).click();
  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  await canvas.locator(".react-pdf__Page__canvas").click({ position: { x: 320, y: 360 } });

  const createDialog = page.getByRole("dialog", { name: "Add link" });
  await expect(createDialog.getByRole("radio", { name: "Link to external URL" })).toBeChecked();
  await createDialog.getByRole("textbox", { name: "External URL" }).fill("https://example.com");
  await createDialog.getByRole("button", { name: "Add link" }).click();
  await expect(canvas.locator(".operation--link")).toContainText("example.com");

  const inlineToolbar = page.getByRole("toolbar", { name: "Inline edit tools" });
  await inlineToolbar.getByRole("button", { name: "Add link" }).click();
  const editDialog = page.getByRole("dialog", { name: "Edit link" });
  await expect(editDialog.getByRole("textbox", { name: "External URL" })).toHaveValue("https://example.com/");
  await editDialog.getByRole("radio", { name: "Link to email address" }).click();
  await editDialog.getByRole("textbox", { name: "Email address" }).fill("you@example.com");
  await editDialog.getByRole("button", { name: "Save link" }).click();

  await expect(editDialog).not.toBeVisible();
  await expect(canvas.locator(".operation--link")).toContainText("you@example.com");
});

test("canceling a stamp input leaves the page unchanged", async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath("cancel-stamp.pdf");
  await makeSamplePdf(pdfPath);

  await page.goto("/");
  await page.getByLabel("Import PDF").locator("input[type=file]").setInputFiles(pdfPath);
  await expect(page.getByText(/cancel-stamp\.pdf opened/i)).toBeVisible({ timeout: 15_000 });

  await page
    .getByRole("toolbar", { name: "Editing tools" })
    .getByRole("button", { name: "Stamp", exact: true })
    .click();

  const canvas = page.getByRole("region", { name: "PDF editor canvas" });
  await canvas.locator(".react-pdf__Page__canvas").click({ position: { x: 320, y: 360 } });

  const popover = page.getByRole("dialog", { name: "Add stamp" });
  await expect(popover).toBeVisible();
  await popover.getByRole("button", { name: "Cancel" }).click();

  await expect(popover).not.toBeVisible();
  await expect(canvas.locator(".operation--stamp")).toHaveCount(0);
});
