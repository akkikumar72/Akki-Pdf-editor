import { expect, test } from "@playwright/test";

test("pricing is honest about the free editor and exposes deployed legal files", async ({ page, request }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  await page.goto("/pricing");

  await expect(page.getByRole("heading", { name: "The editor stays free." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the editor" }).first()).toHaveAttribute("href", "/");
  if (process.env.VITE_POLAR_SUPPORTER_CHECKOUT_URL) {
    await expect(page.getByRole("link", { name: "Continue to Polar" })).toHaveAttribute(
      "href",
      process.env.VITE_POLAR_SUPPORTER_CHECKOUT_URL,
    );
  } else {
    await expect(page.getByRole("button", { name: "Polar checkout opening soon" })).toBeDisabled();
  }
  await expect(page.getByRole("button", { name: "Not for sale yet" })).toBeDisabled();
  await expect(page.getByText("A contribution does not unlock Pro features.")).toBeVisible();
  const expectedLicenceUrl = process.env.VITE_SOURCE_COMMIT_SHA
    ? new RegExp(`/blob/${process.env.VITE_SOURCE_COMMIT_SHA}/LICENSE$`)
    : "/LICENSE.txt";
  await expect(page.getByRole("link", { name: "Licence" })).toHaveAttribute("href", expectedLicenceUrl);
  await expect(page.getByRole("link", { name: "Third-party notices" })).toHaveAttribute(
    "href",
    "/THIRD_PARTY_NOTICES.txt",
  );

  const licenceResponse = await request.get("/LICENSE.txt");
  expect(licenceResponse.ok()).toBe(true);
  expect(await licenceResponse.text()).toContain("GNU AFFERO GENERAL PUBLIC LICENSE");
  const noticeResponse = await request.get("/THIRD_PARTY_NOTICES.txt");
  expect(noticeResponse.ok()).toBe(true);
  expect(await noticeResponse.text()).toContain("Solar by 480 Design under CC BY 4.0");

  if (process.env.VITE_SOURCE_COMMIT_SHA) {
    await expect(page.getByRole("link", { name: "Corresponding source" })).toHaveAttribute(
      "href",
      new RegExp(`/tree/${process.env.VITE_SOURCE_COMMIT_SHA}$`),
    );
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(consoleErrors).toEqual([]);
});

test("pricing success explains that Polar owns payment confirmation", async ({ page }) => {
  await page.goto("/pricing/success");

  await expect(page.getByRole("heading", { name: "Thank you for supporting AkkiPDF." })).toBeVisible();
  await expect(page.getByText(/Polar receipt is the confirmation of payment/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "Open the editor" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View source" })).toHaveCount(0);
});

test("pricing stays within a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/pricing");

  await expect(page.getByRole("heading", { name: "The editor stays free." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
