import { expect, test } from "@playwright/test";

const checkoutUrl = process.env.VITE_POLAR_SUPPORTER_CHECKOUT_URL;

test.describe("configured Polar Supporter Checkout Link", () => {
  test.skip(!checkoutUrl, "Set VITE_POLAR_SUPPORTER_CHECKOUT_URL to verify a real persistent Checkout Link");

  test("opens a fresh hosted checkout for the Supporter product", async ({ page }) => {
    await page.goto("/pricing");

    const checkout = page.getByRole("link", { name: "Continue to Polar" });
    await expect(checkout).toHaveAttribute("href", checkoutUrl!);

    await Promise.all([
      page.waitForURL((url) => ["buy.polar.sh", "polar.sh", "sandbox.polar.sh"].includes(url.hostname), {
        timeout: 20_000,
      }),
      checkout.click(),
    ]);

    await expect(page).toHaveTitle(/AkkiPDF|Polar/i);
    await expect(page.getByText(/AkkiPDF Supporter/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
