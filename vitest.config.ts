import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    exclude: ["node_modules/**", "dist/**", "tests/e2e/**"],
    globals: true,
    setupFiles: "./tests/setup.ts",
    coverage: {
      provider: "v8",
      include: ["src/**"],
      // The full src/ tree is unit-tested. Genuinely-unreachable defensive code
      // (SSR guards, fallbacks whose left operand is always defined, null guards the
      // runtime always satisfies) is annotated with `/* v8 ignore ... */` so the gate
      // can stay at 100% without contrived tests.
      thresholds: {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
