import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(projectRoot, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    exclude: ["node_modules/**", "dist/**", "tests/e2e/**"],
    globals: true,
    setupFiles: "./tests/setup.ts",
    // v8 coverage has a coverage/.tmp worker race on the default pool;
    // forks keeps each worker's tmp output isolated. Run coverage once,
    // foreground — never run concurrent vitest.
    pool: "forks",
    coverage: {
      provider: "v8",
      include: ["src/**"],
      thresholds: {
        lines: 100,
        functions: 100,
        branches: 100,
        statements: 100,
      },
      // Composition/non-runtime roots + vendored coss primitives the app
      // never imports. Keep coverage only on the ui primitives the app uses
      // (button, badge, card, dialog, scroll-area, spinner).
      exclude: [
        "src/main.tsx",
        "src/App.tsx",
        "src/routes/**",
        "src/types/**",
        "src/hooks/use-media-query.ts",
        "src/components/ui/!(button|badge|card|dialog|scroll-area|spinner).tsx",
      ],
    },
  },
});
