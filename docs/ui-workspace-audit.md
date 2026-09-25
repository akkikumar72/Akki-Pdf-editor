# Akkivo workspace audit

Verified locally on 25 September 2026.

## Result

The home screen and editor now share the Newsprint visual system, Playfair Display headings and Geist controls, clearer document actions, and responsive navigation. The editor has a persistent navigation rail and a focused sidebar panel. All 34 registered editing tools are available from the sidebar, alongside page management, history, export, help, and view controls.

The audit found that editing tools were crowded into the top ribbon, the sidebar only exposed page thumbnails, recent documents were limited to three visible entries, and the home screen included unavailable cloud-import controls. The new workspace resolves those navigation problems and removes the inactive import choices.

## Sidebar inventory

| Destination   | Available behavior                                                                                                                  | Verification                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Documents     | Return to the local document workspace; open, resume, search, remove, or create documents                                           | Component tests and browser import, blank-document, and session flows                                  |
| All tools     | All 34 tools, searchable by name, description, or category; find and replace; selected-object properties, duplication, and deletion | Exhaustive registry comparison, activation of every tool in Chromium, real editing and selection flows |
| Pages         | Select thumbnails, insert a page, rotate the page, delete a page, crop                                                              | Browser page-count assertions, crop geometry, undo, and last-page guard tests                          |
| Annotate      | Text highlighting, marker, underline, strikeout, notes, callouts, drawing, ink, erasing, and shapes                                 | Browser overlay creation, ink erasing, undo, and existing editor regression tests                      |
| Forms         | Text, multiline, checkbox, radio, dropdown, list box, signature box, date, and button                                               | All nine tools create overlays; exported PDF is parsed for native fields                               |
| Sign          | Signature, stamp, check, and cross                                                                                                  | Browser signature/stamp/check/cross creation and cancellation flows                                    |
| History       | Undo, redo, and restore the state before a selected change                                                                          | Browser checkpoint restoration and component callback tests                                            |
| Export        | PDF, TXT, CSV, and XLSX                                                                                                             | Actual downloads; PDF page count, extracted text, CSV content, and workbook XML checked                |
| Help          | Keyboard shortcuts, local-storage behavior, supported features, and redaction limitations                                           | Content assertions and mobile access                                                                   |
| View controls | Zoom in/out, fit the page, rotate the view                                                                                          | Browser interactions; fit calculations checked for rotation, padding, and scale bounds                 |

### Complete tool groups

- Edit document: Edit text, Text, Image, Links, Whiteout, Crop, Redact text, Redact area.
- Annotate and draw: Highlight text, Marker, Underline, Strike out, Note, Callout, Draw, Ink, Erase.
- Shapes: Rectangle, Ellipse, Line, Arrow.
- Sign and stamp: Signature, Stamp, Check, Cross.
- Form fields: Text field, Multiline, Checkbox, Radio, Dropdown, List box, Signature box, Date, Button.

## Added workspace behavior

- Search every editing tool with Cmd/Ctrl K, including direct access to all form fields.
- Search all recent local sessions rather than hiding documents after the first three.
- Fit a document to the available canvas, accounting for viewport padding and page rotation.
- Use the sidebar as a collapsible drawer on phone and tablet layouts. Selecting a tool returns to the canvas.
- Export each supported format from a dedicated panel with an explanation of the output.

## Validation

| Check                     | Result                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `bun run typecheck`       | Passed                                                                                                       |
| `bun run video:typecheck` | Passed                                                                                                       |
| `bun run lint`            | Passed with no warnings                                                                                      |
| `bun run test:coverage`   | 1,274 tests passed across 74 files; 100% statements, branches, functions, and lines                          |
| `bun run build`           | Passed, including generated attribution and deployed legal-file checks                                       |
| `bun run e2e`             | 36 passed, 1 skipped                                                                                         |
| Visual review             | Home and editor inspected at desktop and phone sizes; sidebar browser tests run at 320, 375, 414, and 768 px |
| Browser errors            | No console errors or uncaught page errors in the final capture session                                       |
| Responsive bounds         | No document overflow on phone; Download PDF and every sidebar panel checked inside the viewport              |

The skipped test requires `VITE_POLAR_SUPPORTER_CHECKOUT_URL` for an external hosted checkout. Local pricing and legal-page tests pass. The build still reports its existing large PDF bundle and PDF.js static/dynamic import warnings.

Local review captures are in the ignored `artifacts/ui-audit/` directory: `home-desktop.png`, `home-mobile.png`, `editor-desktop.png`, `editor-forms.png`, `editor-export.png`, `editor-mobile.png`, and `sidebar-mobile.png`. These screenshots are local review evidence, not committed application assets.

## Known limits

- Redact and whiteout are visual covers. They do not securely remove underlying text. Help explicitly explains this limitation.
- OCR, merging separate PDFs, encryption, and cloud imports are unavailable. The interface does not present inactive controls for these features.
- Text and spreadsheet extraction depend on selectable text in the input PDF. Table structure varies with the source document.
- Drawn signatures and signature-box fields are not cryptographic digital signatures. Field output retains the existing PDF engine behavior.
- PDF content and saved sessions remain in the browser. Interface fonts use Google Fonts, as disclosed under Privacy & legal.

## Implementation map

- `src/components/WorkbenchSidebar.tsx`: navigation, tool search, page actions, history, export, help, selected-object actions, and sidebar view controls.
- `src/editor/workspaceTools.ts`: complete tool grouping and display labels.
- `src/components/ToolHub.tsx`: import and recent-document workspace.
- `src/components/ToolRibbon.tsx`: compact editor header with clear download action.
- `src/routes/EditorRoute.tsx`: sidebar wiring and fit-page calculation.
- `src/styles/studio.css`: home, editor, sidebar, and responsive presentation.
- `src/components/WorkbenchIcon.tsx`: bundled navigation SVGs, attributed in `public/PHOSPHOR_LICENSE.txt` and `THIRD_PARTY_NOTICES.txt`.
- `tests/e2e/workspace.spec.ts`: sidebar functionality, downloads, and responsive regressions.

To review locally, run `bun run dev -- --host 127.0.0.1 --port 5173` and open `http://127.0.0.1:5173/`. Import `pdf/sample-invoice.pdf` or create a blank document.

## Newsprint theme follow-up

The theme now uses salmon paper, burgundy actions, warm ink, a dark navigation rail, and serif display typography. This gives Akkivo a distinct visual identity while preserving the verified editor workflows. The source of truth is [design.md](../design.md), with active overrides in [tokens.css](../tokens.css).

The update replaces hard-coded green values in the workspace stylesheet with semantic tokens, simplifies the paper illustration and rounded surfaces, and updates the favicon. The recent-document index, tool registry, export handlers, and PDF engine behavior are unchanged by the theme pass.

Clean theme-review captures are written to the ignored `artifacts/theme-review/` directory by the browser suite. They use isolated test contexts rather than personal browser sessions.
