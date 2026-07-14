---
name: verify-akki-ui
description: Verify Akki PDF Editor's UI in a real browser using the agent-browser CLI. Use after an /improve run or any non-trivial feature/bug-fix (anything beyond a one-line tweak) to confirm core flows did not regress — tool switching, overlay selection (inline toolbar + Inspector), undo/redo, and at least one export path (CSV). Drives the local Vite dev server and captures before/after screenshots as evidence. This is the executable companion to the `.cursor/rules/verify-ui-after-changes.mdc` rule and works for any agent (Cursor, Claude Code, Codex, ...).
allowed-tools: Bash(agent-browser:*), Bash(npx agent-browser:*), Bash(bun:*), Bash(curl:*)
---

# Control UI — Akki PDF Editor

Drive the running app in a real Chromium via the `agent-browser` CLI and prove the
core editor flows still work. Prefer accessibility refs over coordinate clicks.
Do not consider larger work "done" until this pass is green.

## 0. Prerequisites (one-time)

```bash
npm i -g agent-browser && agent-browser install   # if not already installed
agent-browser skills get core                      # ALWAYS read this first — exact command syntax
```

`agent-browser` is the harness. The snapshot-and-ref loop is:
`open` → `snapshot -i` → act on `@eN` refs → re-snapshot (refs go stale on any page change).

## 1. Reuse or start the dev server

The app is served by Vite at **`http://localhost:5173/pdf-editor`**.

1. Check the terminals folder for an already-running `bun run dev`; reuse it if present.
2. Only if nothing is serving, start it (it stays running):

```bash
bun run dev          # serves http://localhost:5173/pdf-editor
```

3. Confirm it answers before driving the browser:

```bash
curl -fsS -o /dev/null -w "%{http_code}\n" http://localhost:5173/pdf-editor   # expect 200
```

## 2. Open and health-check

Routing note: `/pdf-editor` only renders the editor when a document is loaded or a local
session can be restored; otherwise it **redirects to `/`** (the landing route, which hosts
the **Import PDF** control). So start at the landing route for a clean run:

```bash
agent-browser open http://localhost:5173/            # landing (Import PDF + recent sessions)
agent-browser screenshot artifacts/control-ui-before.png      # baseline evidence
agent-browser get count "#root *"                              # React root mounted (> 0)
agent-browser snapshot -i -c                                   # see landmarks/controls
```

Pass criteria: `#root` has mounted children, the landing shell renders, and there is
**no Vite error overlay** and **no console exception**. Inspect logs/errors with:

```bash
agent-browser console                 # console logs; expect no uncaught errors
agent-browser errors                  # page errors/exceptions; expect none
```

`artifacts/` is gitignored — keep all screenshots there. For a visual regression check
you can also baseline/compare with `agent-browser diff screenshot --baseline`.

## 3. Load a document

A committed fixture lives at `pdf/sample-invoice.pdf` (2-page invoice). Import it through
the **Import PDF** control (`aria-label="Import PDF"`, a file input on the landing route).
A successful import navigates to `/pdf-editor` automatically:

```bash
agent-browser snapshot -i             # find the "Import PDF" input ref
agent-browser upload @eN pdf/sample-invoice.pdf
agent-browser wait --load networkidle
agent-browser get url                 # should now be .../pdf-editor
agent-browser snapshot -i -c          # editor canvas + page rail should now render
```

Confirm the PDF canvas renders (the `PDF editor canvas` region shows page(s), page rail
shows 2 pages).

## 4. Exercise the core flows

Re-snapshot (`snapshot -i`) before each ref interaction. Use these real anchors:

| Flow | How to drive it | Expected result |
|---|---|---|
| **Tool switching** | In the `Editing tools` toolbar (`role="toolbar" aria-label="Editing tools"`), click Select, then Text | Active tool changes; cursor/affordances update, no console error |
| **Add + select an overlay** | With Text tool, click on the canvas to add text; switch to Select and click the overlay | The **Inline edit tools** toolbar (`aria-label="Inline edit tools"`: Bold/Italic/Font/Move/Duplicate/Delete) appears AND the **Inspector** (`aria-label="Inspector"`) populates with that operation's props |
| **Undo / redo** | Trigger undo then redo (toolbar buttons in `History and page controls`, or `press Control+z` / `Control+Shift+z`) | The overlay disappears on undo and returns on redo |
| **Export (CSV)** | In the Inspector `Export` grid click the **CSV** button (or pick CSV in the `Export format` select) | A CSV download is produced with no error |

Capture an after screenshot:

```bash
agent-browser screenshot artifacts/control-ui-after.png
```

If the change under test touched a specific area (fonts, resize handles, text editing,
page ops, export), additionally smoke-test that area directly with the same loop.

## 5. Restore state and clean up

```bash
# Undo any test edits so the document is left clean, then:
agent-browser close            # or `agent-browser close --all`
```

If you started the dev server yourself, stop it when finished.

## 6. Reporting

Summarize what was exercised, embed `artifacts/control-ui-before.png` and
`artifacts/control-ui-after.png`, and explicitly state what was **NOT** covered:
byte-level export correctness and per-fix math stay covered by the unit suite
(`bun run test` / `bun run test:coverage`) and `bun run e2e`. Automated suites are
necessary but not sufficient — this interactive pass is required for larger changes.

## Selector cheat-sheet (stable anchors in this app)

- App root: `#root`; canvas region: `#editor-canvas` / `aria-label="PDF editor canvas"`
- Import: `aria-label="Import PDF"`
- Tools toolbar: `role="toolbar" aria-label="Editing tools"`
- Inline overlay toolbar: `aria-label="Inline edit tools"` (Bold/Italic/Move/Duplicate/Delete)
- Inspector panel: `aria-label="Inspector"`; export buttons read `PDF` / `TXT` / `CSV` / `XLSX`
- Export group / format: `aria-label="Export"`, `aria-label="Export format"`
- Page rail: `aria-label="Pages"`

## Guardrails

- Prefer accessibility roles/labels and `@eN` refs over coordinate clicks; if you must click
  by coordinates, take a fresh screenshot immediately before.
- Refs are stale after any navigation/re-render — always re-snapshot first.
- Keep test data local and disposable; leave the document state restored.
- Don't hard-code another repo's ports/selectors; the anchors above are this app's.
