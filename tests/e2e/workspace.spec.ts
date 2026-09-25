import { test, expect, type Page } from "@playwright/test";
import { PDFDocument } from "pdf-lib";
import { readFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import { WORKSPACE_TOOL_SECTIONS } from "../../src/editor/workspaceTools";

async function blank(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Blank PDF", exact: true }).click();
  await expect(page.locator(".page-stage canvas")).toBeVisible();
}
async function panel(page: Page, name: string) {
  await page.getByRole("navigation", { name: "Workspace tools" }).getByRole("button", { name, exact: true }).click();
}
async function draw(page: Page) {
  const box = await page.locator(".page-stage").boundingBox();
  if (!box) throw new Error("No page stage");
  await page.mouse.move(box.x + 100, box.y + 120);
  await page.mouse.down();
  await page.mouse.move(box.x + 260, box.y + 200, { steps: 6 });
  await page.mouse.up();
}

test("all registered tools are reachable and activate from the sidebar", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "artifacts/theme-review/home-desktop.png", fullPage: true });
  await blank(page);
  const tools = WORKSPACE_TOOL_SECTIONS.flatMap((section) => section.tools);
  expect(new Set(tools).size).toBe(tools.length);
  await expect(page.locator("[data-tool]")).toHaveCount(tools.length);
  for (const tool of tools) {
    await page.locator(`[data-tool="${tool}"]`).click();
    if (tool === "mark-cross") {
      await expect(page.locator(".operation--form-mark")).toHaveCount(1);
    } else {
      await expect(page.locator(`[data-tool="${tool}"]`)).toHaveAttribute("aria-pressed", "true");
      if (tool === "mark-check") {
        await page.locator(".page-stage canvas").click({ position: { x: 180, y: 200 } });
        await expect(page.locator(".operation--form-mark")).toHaveCount(1);
        await page.getByRole("button", { name: "Undo", exact: true }).click();
      }
    }
  }
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("textbox", { name: "Search tools" })).toBeFocused();
  await page.getByRole("textbox", { name: "Search tools" }).fill("nothing-matches-this");
  await expect(page.getByText("No matching tools")).toBeVisible();
  await page.getByRole("button", { name: "Show all tools" }).click();
  await expect(page.locator("[data-tool]")).toHaveCount(tools.length);
});

test("sidebar drawing and annotation tools create real editable objects", async ({ page }) => {
  await blank(page);
  for (const tool of [
    "whiteout",
    "redact",
    "redact-area",
    "highlight",
    "freehand-highlight",
    "underline",
    "strikeout",
    "callout",
    "draw",
    "ink",
    "shape",
    "shape-ellipse",
    "shape-line",
    "shape-arrow",
  ]) {
    await page.locator(`[data-tool="${tool}"]`).click();
    await draw(page);
    await expect(page.locator(".page-stage .operation")).toHaveCount(1);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.locator(".page-stage .operation")).toHaveCount(0);
  }
});

test("all nine form tools place fields and export a readable PDF", async ({ page }, testInfo) => {
  await blank(page);
  await panel(page, "Forms");
  const formTools = WORKSPACE_TOOL_SECTIONS.find((section) => section.label === "Form fields")!.tools;
  for (const [index, tool] of formTools.entries()) {
    await page.locator(`[data-tool="${tool}"]`).click();
    const canvas = page.locator(".page-stage canvas");
    await canvas.click({ position: { x: 80 + (index % 3) * 210, y: 100 + Math.floor(index / 3) * 180 } });
    const dialog = page.getByRole("dialog", { name: "Add form field" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Field name").fill(`field_${index}`);
    if (await dialog.getByLabel("Choices").count()) await dialog.getByLabel("Choices").fill("First, Second");
    await dialog.getByRole("button", { name: "Add field", exact: true }).click();
    await expect(page.locator(".operation--form-field")).toHaveCount(index + 1);
  }
  await panel(page, "Export");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Edited PDF Your document/ }).click();
  const download = await downloadPromise;
  const file = testInfo.outputPath("fields.pdf");
  await download.saveAs(file);
  const pdf = await PDFDocument.load(await readFile(file));
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getForm().getFields().length).toBeGreaterThanOrEqual(7);
});

test("page organization, zoom, fit, history, help and every export format work from the sidebar", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByLabel("Choose PDF file").setInputFiles("pdf/sample-invoice.pdf");
  await expect(page.locator(".page-stage canvas")).toBeVisible();
  await page.getByRole("button", { name: "Fit page", exact: true }).click();
  await expect(page.locator(".react-pdf__Page__textContent")).toContainText("Sample Invoice");
  await page.screenshot({ path: "artifacts/theme-review/editor-desktop.png" });
  await panel(page, "Pages");
  await expect(page.locator(".thumbnail-button")).toHaveCount(2);
  await page.locator(".thumbnail-button").nth(1).click();
  await expect(page.locator(".thumbnail-button").nth(1)).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Add page", exact: true }).click();
  await expect(page.locator(".thumbnail-button")).toHaveCount(3);
  await page.getByRole("button", { name: "Rotate page", exact: true }).click();
  await expect(page.locator(".page-stage canvas")).toBeVisible();
  await page.getByRole("button", { name: "Delete page", exact: true }).click();
  await expect(page.locator(".thumbnail-button")).toHaveCount(2);
  await page.getByRole("button", { name: "Zoom out from sidebar" }).click();
  await page.getByRole("button", { name: "Zoom in from sidebar" }).click();
  await page.getByRole("button", { name: "Rotate view from sidebar" }).click();
  await page.getByRole("button", { name: "Fit page from sidebar" }).click();
  await panel(page, "History");
  await expect(page.locator(".workspace-history li")).toHaveCount(3);
  await page.getByRole("button", { name: "Undo change", exact: true }).click();
  await page.getByRole("button", { name: "Redo change", exact: true }).click();
  await page.locator(".workspace-history button").last().click();
  await expect(page.getByText("A fresh start")).toBeVisible();
  await panel(page, "Help");
  await expect(page.getByText(/original text remains extractable/)).toBeVisible();
  await panel(page, "Export");
  for (const [format, label] of [
    ["pdf", /Edited PDF Your document/],
    ["txt", /Plain text Extract/],
    ["csv", /CSV spreadsheet Extract/],
    ["xlsx", /Excel workbook Table/],
  ] as const) {
    const promise = page.waitForEvent("download");
    await page.getByRole("button", { name: label }).click();
    const download = await promise;
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${format}$`));
    const file = testInfo.outputPath(`export.${format}`);
    await download.saveAs(file);
    const bytes = await readFile(file);
    expect(bytes.length).toBeGreaterThan(20);
    if (format === "pdf") expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2);
    if (format === "txt") expect(bytes.toString()).toContain("Sample Invoice");
    if (format === "csv") expect(bytes.toString()).toContain("Design services");
    if (format === "xlsx") expect(strFromU8(unzipSync(bytes)["xl/worksheets/sheet1.xml"])).toContain("Design services");
  }
});

for (const width of [320, 375, 414, 768]) {
  test(`every sidebar destination stays usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Your document desk." })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const homeNav = page.getByRole("navigation", { name: "Home navigation" });
    for (const button of await homeNav.getByRole("button").all()) {
      await expect(button).toBeInViewport({ ratio: 1 });
    }
    await page.screenshot({ path: `artifacts/theme-review/home-${width}.png`, fullPage: true });
    await blank(page);
    await expect(page.getByRole("button", { name: "Download PDF", exact: true })).toBeInViewport({ ratio: 1 });
    for (const destination of ["All tools", "Pages", "Annotate", "Forms", "Sign", "History", "Export", "Help"]) {
      await panel(page, destination);
      await expect(page.getByRole("region", { name: `${destination} panel`, exact: true })).toBeVisible();
      const box = await page.locator(".workspace-panel").boundingBox();
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      await page.getByRole("button", { name: "Collapse sidebar" }).click();
      await expect(page.locator(".workspace-panel")).toHaveCount(0);
    }
    await panel(page, "All tools");
    await page.locator('[data-tool="text"]').click();
    await expect(page.locator(".workspace-panel")).toHaveCount(0);
    await page.getByRole("button", { name: "Fit page", exact: true }).click();
    await page.screenshot({ path: `artifacts/theme-review/editor-${width}.png` });
    await page.locator(".page-stage canvas").click({ position: { x: 100, y: 100 } });
    await page.locator('.operation--text[contenteditable="true"]').fill("Mobile edit");
    await page.keyboard.press("Escape");
    await expect(page.locator(".operation--text")).toContainText("Mobile edit");
    await panel(page, "Export");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Edited PDF Your document/ }).click();
    expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test("notes, stamps, signatures and local images create visible overlays", async ({ page }, testInfo) => {
  test.setTimeout(60_000);
  await blank(page);
  const canvas = page.locator(".page-stage canvas");
  await page.locator('[data-tool="annotate-text"]').click();
  await canvas.click({ position: { x: 130, y: 170 } });
  const note = page.getByRole("dialog", { name: "Annotation note" });
  await note.getByLabel("Note", { exact: true }).fill("Review the final amount");
  await note.getByRole("button", { name: "Add note" }).click();
  await expect(page.locator(".page-stage .operation")).toContainText("Review the final amount");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.locator('[data-tool="stamp"]').click();
  await canvas.click({ position: { x: 130, y: 170 } });
  const stamp = page.getByRole("dialog", { name: "Add stamp", exact: true });
  await stamp.getByLabel("Subject").fill("Reviewed");
  await stamp.getByRole("button", { name: "Add stamp", exact: true }).click();
  await expect(page.locator(".operation--stamp")).toContainText("Reviewed");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await panel(page, "Sign");
  await page.locator('[data-tool="signature"]').click();
  await canvas.click({ position: { x: 150, y: 200 } });
  const signature = page.getByRole("dialog", { name: "Create signature" });
  await signature.getByPlaceholder("Your name").fill("Morgan Ellis");
  await signature.getByRole("button", { name: "Save signature", exact: true }).click();
  await expect(page.locator(".operation--signature")).toHaveCount(1);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await panel(page, "All tools");
  await page.locator('[data-tool="image"]').click();
  const chooser = page.waitForEvent("filechooser");
  await canvas.click({ position: { x: 140, y: 180 } });
  const imageData = await page.evaluate(() => {
    const image = document.createElement("canvas");
    image.width = 120;
    image.height = 80;
    const context = image.getContext("2d")!;
    context.fillStyle = "#376b53";
    context.fillRect(0, 0, 120, 80);
    return image.toDataURL().split(",")[1];
  });
  await (
    await chooser
  ).setFiles({ name: "local.png", mimeType: "image/png", buffer: Buffer.from(imageData, "base64") });
  await expect(page.locator(".image-ghost")).toBeVisible();
  await canvas.click({ position: { x: 250, y: 290 } });
  await expect(page.locator(".operation--image img")).toBeVisible();
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF", exact: true }).click();
  const file = testInfo.outputPath("image.pdf");
  await (await promise).saveAs(file);
  expect((await PDFDocument.load(await readFile(file))).getPageCount()).toBe(1);
});

test("crop and ink erasing change the page and support undo", async ({ page }) => {
  await blank(page);
  await page.locator('[data-tool="crop"]').click();
  await draw(page);
  await page.getByRole("button", { name: "Crop current page", exact: true }).click();
  await expect(page.locator(".page-stage canvas")).toBeVisible();
  await expect.poll(async () => (await page.locator(".page-stage canvas").boundingBox())!.width).toBeLessThan(300);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect
    .poll(async () => (await page.locator(".page-stage canvas").boundingBox())?.width ?? 0)
    .toBeGreaterThan(600);
  await page.locator('[data-tool="draw"]').click();
  await draw(page);
  await expect(page.locator(".operation--ink")).toHaveCount(1);
  await page.locator('[data-tool="erase"]').click();
  await draw(page);
  await expect(page.locator(".operation--ink")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator(".operation--ink")).toHaveCount(1);
});
