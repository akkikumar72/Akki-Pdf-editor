import path from "node:path";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { defineConfig, normalizePath } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

const require = createRequire(import.meta.url);
const pdfjsDistPath = path.dirname(require.resolve("pdfjs-dist/package.json"));

const copyPdfAsset = (dir: string) => ({
  src: normalizePath(path.join(pdfjsDistPath, dir)),
  dest: "pdfjs",
});

const pdfTargets = ["cmaps", "standard_fonts", "wasm"]
  .filter((dir) => existsSync(path.join(pdfjsDistPath, dir)))
  .map(copyPdfAsset);

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: pdfTargets,
    }),
  ],
});
