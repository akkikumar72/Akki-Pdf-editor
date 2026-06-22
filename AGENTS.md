# AGENTS.md

Repo-specific guidance for AI agents and contributors working on Akki PDF Editor.

## What this is

A local-first, fully client-side PDF editor (no backend). Imported PDFs stay in the
browser; edits are modeled as overlay operations and only written into PDF bytes on export.

## Stack & commands

- React 18 + Vite + TypeScript (strict). Package manager: **bun only** (Node 20+). Never
  add `package-lock.json`/`yarn.lock`/`pnpm-lock.yaml` — a single `bun.lock` is the source
  of truth.
- Install: `bun install` (use `bun install --frozen-lockfile --ignore-scripts` in CI).
- Quality gates (all must pass before merge/deploy):
  - `bun run typecheck` — `tsc -b`, exit 0
  - `bun run lint` — ESLint flat config, exit 0
  - `bun run test` — Vitest unit suite
  - `bun run build` — `tsc -b && vite build`
  - `bun run e2e` — Playwright (needs a Chromium install)
- Real-browser smoke test (not a merge gate): `bun run smoke` boots the dev server and
  drives a headless Chromium via [agent-browser](https://agent-browser.dev) to upload the
  committed `pdf/sample-invoice.pdf` fixture and assert the editor renders it. Screenshots
  are written to `artifacts/smoke/`. Point it at a specific Chromium with
  `AGENT_BROWSER_EXECUTABLE_PATH`, or pass another file: `scripts/smoke-test.sh path/to.pdf`.

## Commit attribution

- Commits carry only the repo owner's authorship — no AI co-authorship trailers. A tracked
  `commit-msg` hook in `.githooks/` strips any `Co-Authored-By:` / `Claude-Session:` lines
  from every commit message, whoever (or whatever) wrote them.
- `bun install` runs a `postinstall` that points `core.hooksPath` at `.githooks/`, so the
  hook self-activates on a fresh clone. To enable it by hand: `git config core.hooksPath .githooks`.
- Set your own `git config user.name` / `user.email` so commits land under your identity.

## Architecture / layer map

- `src/engine/` — PDF loading, page sizing, text extraction, writing/export, font
  resolution. The boundary that hides `pdf-lib` and PDF.js. UI must not reach past it.
- `src/state/` — `editModel.ts` reducer: operations, selection, undo/redo. The reducer's
  `default` branch is exhaustive (`never`) — adding an `EditAction` variant must be handled.
- `src/editor/` — operation factories, page operations, selection behavior, tool registry.
- `src/components/` — workbench UI (tool hub, ribbon, canvas, rail, inspector, status bar,
  inline toolbar).
- `src/utils/` — shared helpers (`coordinates`, `download`, `url`, `fileValidation`, `ids`,
  `storage`).
- `src/styles/` — `tokens.css` + `app.css` design system (Plus Jakarta Sans).

## Conventions & invariants

- The operation set (`EditOperation` union in `src/types/editor.ts`) is dispatched in
  lockstep across the factory, overlay renderer, PDF writer, and inspector. Adding an
  operation type means touching all four.
- Security (enforced; keep it that way):
  - Link URLs go through `sanitizeUrl` (`src/utils/url.ts`) at create, edit, and export.
    Only `http`/`https`/`mailto` survive; `javascript:`/`data:` are rejected.
  - Imported files are validated by size + magic bytes (`src/utils/fileValidation.ts`)
    before parsing.
  - CSV/XLSX cells starting with `= + - @` are formula-neutralized in `exportPipeline.ts`.
  - `<img>` overlays only render `data:image/(png|jpeg)` sources.
- PDF.js documents opened in `pdfEngine` are destroyed in a `finally` block.

## Static assets / deploy

- PDF.js `cmaps`, `standard_fonts`, and `wasm` are copied to `dist/pdfjs/` by
  `vite-plugin-static-copy` and referenced as root-absolute `/pdfjs/*` URLs. A root-domain
  Vercel deploy serves them correctly; a subpath deploy would require a `base` change.
- `vercel.json` defines build/output, the CSP (must keep `worker-src 'self' blob:` and
  `script-src 'wasm-unsafe-eval'` for PDF.js), and `/pdfjs/*` caching.
- No runtime environment variables are required. The only optional one is
  `PLAYWRIGHT_CHROME_EXECUTABLE_PATH` for e2e.

## Plans

Implementation plans live in `plans/` with an index at `plans/README.md`. Read it before
starting larger work and update the status table when a plan lands.
