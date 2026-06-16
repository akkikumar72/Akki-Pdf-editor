import { AlignCenter, AlignLeft, AlignRight, FileSpreadsheet, FileText, ImageDown, SlidersHorizontal } from "lucide-react";
import type { EditOperation, ExportFormat, TextAlign, TextItem } from "../types/editor";
import { FONT_CHOICES, describeDetectedFont, describeFallback } from "../engine/fontResolver";
import { sanitizeUrl } from "../utils/url";

type InspectorProps = {
  operation?: EditOperation;
  operationCount: number;
  pageTextItems: TextItem[];
  onExport: (format: ExportFormat) => void;
  onUpdate: (id: string, patch: Partial<EditOperation>) => void;
};

export function Inspector({ operation, operationCount, pageTextItems, onExport, onUpdate }: InspectorProps) {
  const update = (patch: Partial<EditOperation>) => {
    if (operation) onUpdate(operation.id, patch);
  };

  return (
    <div className="inspector__inner">
      <div className="panel-heading">
        <span>Inspector</span>
        <SlidersHorizontal aria-hidden="true" />
      </div>

      {!operation ? (
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
                    } as Partial<EditOperation>)}
                >
                  {FONT_CHOICES.map((font) => (
                    <option key={font.label} value={font.label}>{font.label}</option>
                  ))}
                </select>
              </label>
              <p className="helper-text">
                {operation.detectedFontName || operation.cssFontFamily
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
                      if (!Number.isFinite(parsed)) return;
                      const clamped = Math.min(96, Math.max(6, Math.round(parsed)));
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
            <label>
              URL
              <input
                value={operation.href}
                onChange={(event) => update({ href: event.currentTarget.value } as Partial<EditOperation>)}
                onBlur={(event) => {
                  const safe = sanitizeUrl(event.currentTarget.value);
                  if (safe) update({ href: safe } as Partial<EditOperation>);
                }}
              />
            </label>
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
          <button onClick={() => onExport("png")}><ImageDown aria-hidden="true" /> PNG</button>
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
