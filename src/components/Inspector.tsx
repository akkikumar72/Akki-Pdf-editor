import { AlignCenter, AlignLeft, AlignRight, FileSpreadsheet, FileText, SlidersHorizontal } from "lucide-react";
import type { EditOperation, ExportFormat, TextAlign, TextItem } from "../types/editor";
import { FONT_CHOICES, describeDetectedFont, describeFallback } from "../engine/fontResolver";
import { sanitizeUrl } from "../utils/url";
import { Button } from "./ui/button";

type InspectorProps = {
  operation?: EditOperation;
  operationCount: number;
  pageTextItems: TextItem[];
  onExport: (format: ExportFormat) => void;
  onUpdate: (id: string, patch: Partial<EditOperation>) => void;
};

const fieldLabel = "flex flex-col gap-1.5 text-muted-foreground text-xs font-medium";
const fieldInput =
  "h-9 w-full rounded-lg border bg-background px-2.5 text-foreground text-sm shadow-xs/5 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8";
const sectionHeading =
  "flex items-center justify-between px-4 py-2.5 text-muted-foreground text-xs uppercase tracking-wide";

export function Inspector({ operation, operationCount, pageTextItems, onExport, onUpdate }: InspectorProps) {
  const update = (patch: Partial<EditOperation>) => {
    /* v8 ignore next -- update() is only bound inside the operation-present branch */
    if (operation) onUpdate(operation.id, patch);
  };

  return (
    <div className="flex flex-col divide-y text-sm">
      <div className="flex items-center justify-between px-4 py-3 font-heading font-semibold text-foreground [&_svg]:size-4 [&_svg]:text-muted-foreground">
        <span>Inspector</span>
        <SlidersHorizontal aria-hidden="true" />
      </div>

      {!operation ? (
        <div className="flex flex-col gap-1 p-4">
          <strong className="font-medium">No selection</strong>
          <p className="text-muted-foreground text-xs">
            Select an overlay or choose a tool, then click the page to add an edit.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
            <span className="text-muted-foreground text-xs capitalize">{operation.type.replace("-", " ")}</span>
            <strong className="text-xs">Page {operation.pageIndex + 1}</strong>
          </div>

          {"text" in operation && operation.type === "text" ? (
            <>
              <label className={fieldLabel}>
                Text
                <textarea
                  className={`${fieldInput} h-auto min-h-16 resize-y py-2`}
                  value={operation.text}
                  onChange={(event) => update({ text: event.currentTarget.value } as Partial<EditOperation>)}
                />
              </label>
              <label className={fieldLabel}>
                Font
                <select
                  className={fieldInput}
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
              <p className="text-muted-foreground text-xs">
                {operation.embeddedFontKey
                  ? `Matched the original embedded font${operation.detectedFontName ? ` (${operation.detectedFontName})` : ""}`
                  : operation.detectedFontName || operation.cssFontFamily
                    ? describeDetectedFont(operation.detectedFontName, operation.cssFontFamily, operation.fontFamily)
                    : describeFallback(operation.fontFamily)}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <label className={fieldLabel}>
                  Size
                  <input
                    type="number"
                    min={6}
                    max={96}
                    step={1}
                    className={fieldInput}
                    value={Math.round(operation.fontSize)}
                    onChange={(event) => {
                      const parsed = Number(event.currentTarget.value);
                      /* v8 ignore next -- a number input only yields a finite float or "" (0) */
                      if (!Number.isFinite(parsed)) return;
                      const clamped = Math.min(96, Math.max(6, Math.round(parsed)));
                      update({ fontSize: clamped } as Partial<EditOperation>);
                    }}
                  />
                </label>
                <label className={fieldLabel}>
                  Color
                  <input
                    type="color"
                    className="h-9 w-full cursor-pointer rounded-lg border bg-background p-1 sm:h-8"
                    value={operation.color}
                    onChange={(event) => update({ color: event.currentTarget.value } as Partial<EditOperation>)}
                  />
                </label>
              </div>
              <div className="inline-flex rounded-lg border p-0.5" aria-label="Text alignment">
                {([
                  ["left", AlignLeft],
                  ["center", AlignCenter],
                  ["right", AlignRight],
                ] as Array<[TextAlign, typeof AlignLeft]>).map(([align, Icon]) => (
                  <button
                    key={align}
                    type="button"
                    aria-pressed={operation.align === align}
                    onClick={() => update({ align } as Partial<EditOperation>)}
                    className={`flex flex-1 cursor-pointer items-center justify-center rounded-md py-1.5 [&_svg]:size-4 ${
                      operation.align === align ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    <Icon aria-hidden="true" />
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={operation.whiteout}
                  onChange={(event) => update({ whiteout: event.currentTarget.checked } as Partial<EditOperation>)}
                />
                Whiteout behind text
              </label>
              {operation.whiteout ? (
                <label className={fieldLabel}>
                  Background
                  <input
                    type="color"
                    className="h-9 w-full cursor-pointer rounded-lg border bg-background p-1 sm:h-8"
                    value={operation.whiteoutColor ?? "#ffffff"}
                    onChange={(event) => update({ whiteoutColor: event.currentTarget.value } as Partial<EditOperation>)}
                  />
                </label>
              ) : null}
            </>
          ) : null}

          {"opacity" in operation ? (
            <label className={fieldLabel}>
              Opacity
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                className="w-full accent-primary"
                value={operation.opacity ?? 1}
                onChange={(event) => update({ opacity: Number(event.currentTarget.value) } as Partial<EditOperation>)}
              />
            </label>
          ) : null}

          {operation.type === "shape" ? (
            <>
              <label className={fieldLabel}>
                Stroke
                <input type="color" className="h-9 w-full cursor-pointer rounded-lg border bg-background p-1 sm:h-8" value={operation.stroke} onChange={(event) => update({ stroke: event.currentTarget.value } as Partial<EditOperation>)} />
              </label>
              <label className={fieldLabel}>
                Stroke width
                <input type="number" min={1} max={12} className={fieldInput} value={operation.strokeWidth} onChange={(event) => update({ strokeWidth: Number(event.currentTarget.value) } as Partial<EditOperation>)} />
              </label>
            </>
          ) : null}

          {operation.type === "link" ? (
            <label className={fieldLabel}>
              URL
              <input
                className={fieldInput}
                value={operation.href}
                onChange={(event) => update({ href: event.currentTarget.value } as Partial<EditOperation>)}
                onBlur={(event) => {
                  update({ href: sanitizeUrl(event.currentTarget.value) ?? "" } as Partial<EditOperation>);
                }}
              />
            </label>
          ) : null}
        </div>
      )}

      <section>
        <div className={sectionHeading}>
          <span>Export</span>
          <strong className="text-foreground normal-case">{operationCount} edits</strong>
        </div>
        <div className="grid grid-cols-2 gap-2 px-4 pb-4">
          <Button variant="outline" size="sm" onClick={() => onExport("pdf")}><FileText aria-hidden="true" /> PDF</Button>
          <Button variant="outline" size="sm" onClick={() => onExport("txt")}><FileText aria-hidden="true" /> TXT</Button>
          <Button variant="outline" size="sm" onClick={() => onExport("csv")}><FileSpreadsheet aria-hidden="true" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => onExport("xlsx")}><FileSpreadsheet aria-hidden="true" /> XLSX</Button>
        </div>
      </section>

      <section>
        <div className={sectionHeading}>
          <span>Page text</span>
          <strong className="text-foreground normal-case">{pageTextItems.length}</strong>
        </div>
        <div className="flex flex-wrap gap-1.5 px-4 pb-4">
          {pageTextItems.slice(0, 18).map((item, index) => (
            <span
              key={`${item.str}-${index}`}
              className="max-w-full truncate rounded-md border bg-muted/50 px-1.5 py-0.5 text-muted-foreground text-xs"
            >
              {item.str}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
