import { AlignCenter, AlignLeft, AlignRight, Check, Circle, Copy, FileSpreadsheet, FileText, SlidersHorizontal, Trash2, X } from "lucide-react";
import type { EditOperation, ExportFormat, FormMarkOperation, LinkTarget, TextAlign, TextItem } from "../types/editor";
import { FONT_CHOICES, describeDetectedFont, describeFallback } from "../engine/fontResolver";
import { sanitizeEmailToMailto, sanitizeTel, sanitizeUrl } from "../utils/url";

type InspectorProps = {
  operation?: EditOperation;
  operationCount: number;
  pageCount?: number;
  pageTextItems: TextItem[];
  /** How many operations are selected; >1 swaps the per-field editor for group actions. */
  selectedCount: number;
  onDuplicateSelected: () => void;
  onExport: (format: ExportFormat) => void;
  onRemoveSelected: () => void;
  onUpdate: (id: string, patch: Partial<EditOperation>) => void;
};

export function Inspector({
  operation,
  operationCount,
  pageCount = 1,
  pageTextItems,
  selectedCount,
  onDuplicateSelected,
  onExport,
  onRemoveSelected,
  onUpdate,
}: InspectorProps) {
  const update = (patch: Partial<EditOperation>) => {
    /* v8 ignore next -- every `update` caller renders only inside the `operation`-present block, so the guard's false branch is unreachable */
    if (operation) onUpdate(operation.id, patch);
  };

  return (
    <div className="inspector__inner">
      <div className="panel-heading">
        <span>Inspector</span>
        <SlidersHorizontal aria-hidden="true" />
      </div>

      {selectedCount > 1 ? (
        <div className="field-stack">
          <div className="inspector-summary">
            <span>Multi-select</span>
            <strong>Selected {selectedCount} objects</strong>
          </div>
          <div className="group-actions">
            <button onClick={onDuplicateSelected}>
              <Copy aria-hidden="true" /> Duplicate all
            </button>
            <button onClick={onRemoveSelected}>
              <Trash2 aria-hidden="true" /> Delete all
            </button>
          </div>
        </div>
      ) : !operation ? (
        <div className="empty-panel">
          <strong>No selection</strong>
          <p>Select an overlay or choose a tool, then click the page to add an edit.</p>
        </div>
      ) : (
        <div className="field-stack">
          <div className="inspector-summary">
            <span>{operation.type.replace("-", " ")}</span>
            <strong>Page {operation.pageIndex + 1}</strong>
          </div>

          {"text" in operation && operation.type === "text" ? (
            <>
              <label>
                Text
                <textarea
                  value={operation.text}
                  onChange={(event) => update({ text: event.currentTarget.value } as Partial<EditOperation>)}
                />
              </label>
              <label>
                Font
                <select
                  value={operation.fontFamily}
                  onChange={(event) =>
                    update({
                      fontFamily: event.currentTarget.value,
                      cssFontFamily: undefined,
                      detectedFontName: undefined,
                      embeddedFontKey: undefined,
                    } as Partial<EditOperation>)}
                >
                  {FONT_CHOICES.map((font) => (
                    <option key={font.label} value={font.label}>{font.label}</option>
                  ))}
                </select>
              </label>
              <p className="helper-text">
                {operation.embeddedFontKey
                  ? `Matched the original embedded font${operation.detectedFontName ? ` (${operation.detectedFontName})` : ""}`
                  : operation.detectedFontName || operation.cssFontFamily
                    ? describeDetectedFont(operation.detectedFontName, operation.cssFontFamily, operation.fontFamily)
                    : describeFallback(operation.fontFamily)}
              </p>
              <div className="field-grid">
                <label>
                  Size
                  <input
                    type="number"
                    min={6}
                    max={96}
                    step={1}
                    value={Math.round(operation.fontSize)}
                    onChange={(event) => {
                      const parsed = Number(event.currentTarget.value);
                      /* v8 ignore next -- the control is type="number"; the DOM coerces any entry to a finite value (Number("")===0), so the non-finite guard is unreachable */
                      if (!Number.isFinite(parsed)) return;
                      // Clamping here (rather than only on blur) would round-trip through the
                      // controlled `value` on every keystroke, so typing a two-digit size below
                      // the minimum (e.g. "24") gets its first digit force-corrected up to 6
                      // before the second digit lands — turning "24" into "64". Clamp only once
                      // the user is done editing.
                      update({ fontSize: Math.round(parsed) } as Partial<EditOperation>);
                    }}
                    onBlur={(event) => {
                      const parsed = Number(event.currentTarget.value);
                      /* v8 ignore next -- the control is type="number"; the DOM coerces any entry (including empty) to a finite value, so the non-finite fallback is unreachable */
                      const clamped = Number.isFinite(parsed) ? Math.min(96, Math.max(6, Math.round(parsed))) : 6;
                      update({ fontSize: clamped } as Partial<EditOperation>);
                    }}
                  />
                </label>
                <label>
                  Color
                  <input
                    type="color"
                    value={operation.color}
                    onChange={(event) => update({ color: event.currentTarget.value } as Partial<EditOperation>)}
                  />
                </label>
              </div>
              <div className="segmented" aria-label="Text alignment">
                {([
                  ["left", AlignLeft],
                  ["center", AlignCenter],
                  ["right", AlignRight],
                ] as Array<[TextAlign, typeof AlignLeft]>).map(([align, Icon]) => (
                  <button
                    key={align}
                    aria-pressed={operation.align === align}
                    onClick={() => update({ align } as Partial<EditOperation>)}
                  >
                    <Icon aria-hidden="true" />
                  </button>
                ))}
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={operation.whiteout}
                  onChange={(event) => update({ whiteout: event.currentTarget.checked } as Partial<EditOperation>)}
                />
                Whiteout behind text
              </label>
              {operation.whiteout ? (
                <label>
                  Background
                  <input
                    type="color"
                    value={operation.whiteoutColor ?? "#ffffff"}
                    onChange={(event) => update({ whiteoutColor: event.currentTarget.value } as Partial<EditOperation>)}
                  />
                </label>
              ) : null}
            </>
          ) : null}

          {"opacity" in operation ? (
            <label>
              Opacity
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={operation.opacity ?? 1}
                onChange={(event) => update({ opacity: Number(event.currentTarget.value) } as Partial<EditOperation>)}
              />
            </label>
          ) : null}

          {operation.type === "shape" ? (
            <>
              <label>
                Stroke
                <input type="color" value={operation.stroke} onChange={(event) => update({ stroke: event.currentTarget.value } as Partial<EditOperation>)} />
              </label>
              <label>
                Stroke width
                <input type="number" min={1} max={12} value={operation.strokeWidth} onChange={(event) => update({ strokeWidth: Number(event.currentTarget.value) } as Partial<EditOperation>)} />
              </label>
            </>
          ) : null}

          {operation.type === "link" ? (
            <>
              <label>
                Link type
                <select
                  value={operation.target.kind}
                  onChange={(event) => {
                    const kind = event.currentTarget.value as LinkTarget["kind"];
                    update({
                      target: kind === "page" ? { kind: "page", pageIndex: 0 } : { kind, href: "" },
                    } as Partial<EditOperation>);
                  }}
                >
                  <option value="url">External URL</option>
                  <option value="email">Email address</option>
                  <option value="phone">Phone number</option>
                  <option value="page">Internal page</option>
                </select>
              </label>
              {operation.target.kind === "url" ? (
                <label>
                  URL
                  <input
                    value={operation.target.href}
                    onChange={(event) => update({ target: { kind: "url", href: event.currentTarget.value } } as Partial<EditOperation>)}
                    onBlur={(event) => {
                      // Never leave an unsafe URL in the edit model. sanitizeUrl returns the
                      // safe form (http/https/mailto) or null; on null, clear the field rather
                      // than keeping the raw value the onChange already wrote.
                      update({ target: { kind: "url", href: sanitizeUrl(event.currentTarget.value) ?? "" } } as Partial<EditOperation>);
                    }}
                  />
                </label>
              ) : null}
              {operation.target.kind === "email" ? (
                <label>
                  Email
                  <input
                    value={operation.target.href.replace(/^mailto:/i, "")}
                    onChange={(event) => update({ target: { kind: "email", href: event.currentTarget.value } } as Partial<EditOperation>)}
                    onBlur={(event) => {
                      update({ target: { kind: "email", href: sanitizeEmailToMailto(event.currentTarget.value) ?? "" } } as Partial<EditOperation>);
                    }}
                  />
                </label>
              ) : null}
              {operation.target.kind === "phone" ? (
                <label>
                  Phone
                  <input
                    value={operation.target.href.replace(/^tel:/i, "")}
                    onChange={(event) => update({ target: { kind: "phone", href: event.currentTarget.value } } as Partial<EditOperation>)}
                    onBlur={(event) => {
                      update({ target: { kind: "phone", href: sanitizeTel(event.currentTarget.value) ?? "" } } as Partial<EditOperation>);
                    }}
                  />
                </label>
              ) : null}
              {operation.target.kind === "page" ? (
                <label>
                  Page
                  <input
                    type="number"
                    min={1}
                    max={pageCount}
                    value={operation.target.pageIndex + 1}
                    onChange={(event) => {
                      const parsed = Number.parseInt(event.currentTarget.value, 10);
                      const clamped = Number.isInteger(parsed) ? Math.min(pageCount, Math.max(1, parsed)) : 1;
                      update({ target: { kind: "page", pageIndex: clamped - 1 } } as Partial<EditOperation>);
                    }}
                  />
                </label>
              ) : null}
            </>
          ) : null}

          {operation.type === "stamp" ? (
            <>
              <label>
                Subject
                <input
                  value={operation.label}
                  onChange={(event) => update({ label: event.currentTarget.value } as Partial<EditOperation>)}
                />
              </label>
              <label>
                Detail line
                <input
                  value={operation.subline ?? ""}
                  placeholder="By Author at date"
                  onChange={(event) =>
                    update({ subline: event.currentTarget.value || undefined } as Partial<EditOperation>)}
                />
              </label>
              <label>
                Color
                <input
                  type="color"
                  value={operation.color}
                  onChange={(event) =>
                    update({
                      color: event.currentTarget.value,
                      borderColor: event.currentTarget.value,
                    } as Partial<EditOperation>)}
                />
              </label>
            </>
          ) : null}

          {operation.type === "signature" && operation.mode === "typed" ? (
            <label>
              Color
              <input
                type="color"
                value={operation.color}
                onChange={(event) => update({ color: event.currentTarget.value } as Partial<EditOperation>)}
              />
            </label>
          ) : null}

          {operation.type === "form-mark" ? (
            <>
              <div className="segmented" aria-label="Mark style">
                {([
                  ["check", Check],
                  ["cross", X],
                  ["dot", Circle],
                ] as Array<[FormMarkOperation["mark"], typeof Check]>).map(([mark, Icon]) => (
                  <button
                    key={mark}
                    aria-pressed={operation.mark === mark}
                    onClick={() => update({ mark } as Partial<EditOperation>)}
                  >
                    <Icon aria-hidden="true" />
                  </button>
                ))}
              </div>
              <label>
                Color
                <input type="color" value={operation.color} onChange={(event) => update({ color: event.currentTarget.value } as Partial<EditOperation>)} />
              </label>
            </>
          ) : null}
        </div>
      )}

      <section className="inspector-section">
        <div className="panel-heading panel-heading--small">
          <span>Export</span>
          <strong>{operationCount} edits</strong>
        </div>
        <div className="export-grid">
          <button onClick={() => onExport("pdf")}><FileText aria-hidden="true" /> PDF</button>
          <button onClick={() => onExport("txt")}><FileText aria-hidden="true" /> TXT</button>
          <button onClick={() => onExport("csv")}><FileSpreadsheet aria-hidden="true" /> CSV</button>
          <button onClick={() => onExport("xlsx")}><FileSpreadsheet aria-hidden="true" /> XLSX</button>
        </div>
      </section>

      <section className="inspector-section">
        <div className="panel-heading panel-heading--small">
          <span>Page text</span>
          <strong>{pageTextItems.length}</strong>
        </div>
        <div className="text-sample">
          {pageTextItems.slice(0, 18).map((item, index) => (
            <span key={`${item.str}-${index}`}>{item.str}</span>
          ))}
        </div>
      </section>
    </div>
  );
}
