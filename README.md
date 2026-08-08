# Akki PDF Editor

Local-first PDF editor workbench with an import, edit, apply, and export flow. Files stay in the browser; edits are modeled as overlays until export so the original PDF bytes are preserved during the editing session.

<img width="3248" height="1784" alt="AkkiPdf" src="https://github.com/user-attachments/assets/a37ee4c6-7ec2-4d77-93cc-34712342f2c1" />

## Features

- Import PDFs from disk or create a blank document.
- Render pages with PDF.js and keep page thumbnails, zoom, rotation, and page controls in one workbench.
- Add overlay edits: text, whiteout, links, forms, images, signatures, annotations, and shapes.
- Click existing PDF text in Select mode to create a replacement overlay with closest-match font styling.
- Inline floating toolbar for selected objects, including searchable font family picker with keyboard support.
- Export edited PDF, TXT, CSV, and XLSX locally.

## Tech Stack

- React + Vite + TypeScript
- PDF rendering: `react-pdf` / PDF.js
- PDF writing: `pdf-lib` + `@pdf-lib/fontkit`
- Spreadsheet export: minimal OOXML writer built with `fflate` (no SheetJS dependency)
- UI icons: `lucide-react`
- Font picker: `react-select`
- Tests: Vitest + Playwright
- Lint/format: ESLint + Prettier

## Run Locally

This project uses **bun** (Node 20+). Do not mix package managers.

```bash
bun install
bun run dev
```

Open [http://localhost:5173](http://localhost:5173).

## Test And Build

```bash
bun run typecheck
bun run lint
bun run test
bun run build
bun run e2e
```

## Deploy

Deployed as a static SPA on Vercel. `vercel.json` sets the build command (`bun run build`),
output directory (`dist`), security headers (including a Content-Security-Policy tuned for
the PDF.js worker/WASM), and long-lived caching for the copied `/pdfjs/*` assets. The Node
version is pinned via `.nvmrc` / the `engines` field. The build copies the canonical licence,
generates complete production-dependency notices, and injects Vercel's commit SHA so the
in-app source link points at the deployed version rather than the moving `main` branch.

Forks must set `VITE_SOURCE_REPOSITORY_URL` to their public GitHub repository. In Vercel Project Settings, enable
**Automatically expose System Environment Variables** so the build receives `VERCEL_GIT_COMMIT_SHA`. Other build
systems should set `VITE_SOURCE_COMMIT_SHA` to the exact 7-to-40-character Git commit being deployed.

## Payments

AkkiPDF uses a public [Polar Checkout Link](https://polar.sh/docs/features/checkout/links) for optional Supporter
payments. The static app never receives a Polar API token.

Copy `.env.example` to `.env.local` and set the public Checkout Link created in the Polar dashboard:

```bash
VITE_POLAR_SUPPORTER_CHECKOUT_URL=https://buy.polar.sh/polar_cl_REPLACE_ME
```

Use a `sandbox-api.polar.sh` Checkout Link during acceptance testing, then replace it with the production link before
deployment.

Follow the complete [Polar sandbox and production runbook](docs/polar-checkout.md) before enabling the checkout CTA.

Configure the Checkout Link's return URL as `https://akki-pdf-editor.vercel.app/pricing` and its success URL as
`https://akki-pdf-editor.vercel.app/pricing/success`. Never put a Polar organization access token, webhook secret,
or AI-provider secret in a `VITE_*` variable.

## Project Shape

- `src/engine/` hides PDF loading, page sizing, text extraction, writing, and export adapters.
- `src/state/` contains the edit reducer for operations, selection, undo, and redo.
- `src/editor/` contains operation factories, page operation helpers, selection behavior, and tool registry.
- `src/components/` contains the workbench UI: tool hub, ribbon, canvas, thumbnails, inspector, status bar, and inline toolbar.
- `src/styles/tokens.css` and `src/styles/app.css` define the Hallmark-audited workbench design system.

## Notes

V1 uses professional overlay replacement instead of fragile direct rewriting of arbitrary PDF text streams. When an original embedded font cannot be reused, the app resolves the closest available family and exports with that replacement.

## License

The AkkiPDF Community edition is licensed under [GNU AGPL v3.0 only](LICENSE). You may use, modify, and distribute it
under those terms, including for commercial purposes. If you modify AkkiPDF and let users interact with that modified
version remotely over a network, AGPL Section 13 requires the version to prominently offer those users its
Corresponding Source. See the licence for complete terms.

Commercial licences with alternative terms may be available under a separate written agreement. Open a
[licensing inquiry](https://github.com/akkikumar72/Akki-Pdf-editor/issues) to discuss that option. Third-party
dependencies and assets retain their own licence terms. See [THIRD_PARTY_NOTICES.txt](THIRD_PARTY_NOTICES.txt) and
[CONTRIBUTING.md](CONTRIBUTING.md). Copyright © 2026 Akash Kumar Pathak.

The Remotion video toolchain uses a separate, non-OSI licence and is not included in the deployed browser app. Do not
describe the complete development toolchain as entirely open source while those dependencies remain in this repository.
