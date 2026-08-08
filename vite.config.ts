import path from "node:path";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { defineConfig, loadEnv, normalizePath } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

const require = createRequire(import.meta.url);
const pdfjsDistPath = path.dirname(require.resolve("pdfjs-dist/package.json"));

const copyPdfAsset = (dir: string) => ({
  src: normalizePath(path.join(pdfjsDistPath, dir, "**/*")),
  dest: `pdfjs/${dir}`,
  rename: { stripBase: true as const },
});

const pdfTargets = ["cmaps", "standard_fonts", "wasm"]
  .filter((dir) => existsSync(path.join(pdfjsDistPath, dir)))
  .map(copyPdfAsset);

const legalTargets = [
  { src: "LICENSE", dest: ".", rename: "LICENSE.txt" },
  { src: "THIRD_PARTY_NOTICES.txt", dest: "." },
];

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const sourceCommitSha = env.VITE_SOURCE_COMMIT_SHA || process.env.VERCEL_GIT_COMMIT_SHA || "";

  return {
    define: {
      "import.meta.env.VITE_SOURCE_COMMIT_SHA": JSON.stringify(sourceCommitSha),
    },
    plugins: [
      react(),
      viteStaticCopy({
        targets: [...pdfTargets, ...legalTargets],
      }),
    ],
  };
});
