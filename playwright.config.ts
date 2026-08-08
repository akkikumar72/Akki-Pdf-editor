import { defineConfig, devices } from "@playwright/test";

const chromeExecutablePath = process.env.PLAYWRIGHT_CHROME_EXECUTABLE_PATH;
const port = process.env.PLAYWRIGHT_PORT ?? "5173";
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL,
    launchOptions: chromeExecutablePath ? { executablePath: chromeExecutablePath } : undefined,
    trace: "on-first-retry",
  },
  webServer: {
    command: `bun run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
