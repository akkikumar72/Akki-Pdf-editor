import { memo } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  Circle,
  Copy,
  FileSpreadsheet,
  FileText,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import type {
  AnnotationOperation,
  EditOperation,
  EditOperationPatch,
  ExportFormat,
  FormBorderStyle,
  FormFieldKind,
  FormFieldOperation,
  FormMarkOperation,
  FormRotation,
  InkOperation,
  LinkTarget,
  RedactionOperation,
  TextAlign,
  TextItem,
  TextOperation,
} from "../types/editor";
import { describeDetectedFont, describeFallback } from "../engine/fontResolver";
import {
  DEFAULT_FORM_FIELD_APPEARANCE,
  FORM_FIELD_LABELS,
  normalizeFormFieldOptions,
  reformatDateFieldValue,
} from "../editor/formField";
import { useTextPreview, useTextPreviewDispatch } from "../state/textPreviewContext";
import { sanitizeEmailToMailto, sanitizeTel, sanitizeUrl } from "../utils/url";
import { FontFamilySelect } from "./FontFamilySelect";

/** Helper copy under Font — follows live preview when browsing the picker. */
function TextFontHelper({ operation }: { operation: TextOperation }) {
  const textPreview = useTextPreview();
  const fontSource = textPreview?.id === operation.id ? { ...operation, ...textPreview.patch } : operation;
  if (fontSource.embeddedFontKey) {
    return (
      <>
        Matched the original embedded font
        {fontSource.detectedFontName ? ` (${fontSource.detectedFontName})` : ""}
      </>
    );
  }
  if (fontSource.detectedFontName || fontSource.cssFontFamily) {
    return <>{describeDetectedFont(fontSource.detectedFontName, fontSource.cssFontFamily, fontSource.fontFamily)}</>;
  }
  return <>{describeFallback(fontSource.fontFamily)}</>;
}

type OperationUpdater = (patch: EditOperationPatch) => void;

const FORM_KINDS: FormFieldKind[] = [
  "text",
  "multiline",
  "dropdown",
  "listbox",
  "radio",
  "checkbox",
  "button",
  "date",
  "signature",
];

function OpacityControl({ value, update }: { value: number | undefined; update: OperationUpdater }) {
  return (
    <label>
      Opacity
      <input
        type="range"
        min={0.1}
        max={1}
        step={0.05}
        value={value ?? 1}
        onChange={(event) => update({ opacity: Number(event.currentTarget.value) })}
      />
    </label>
  );
}

function InkControls({ operation, update }: { operation: InkOperation; update: OperationUpdater }) {
  const isHighlighter = operation.variant === "freehand-highlight";
  return (
    <>
      <label>
        Stroke color
        <input
          type="color"
          value={operation.stroke}
          onChange={(event) => update({ stroke: event.currentTarget.value })}
        />
      </label>
      <label>
        Stroke width
        <input
          type="number"
          min={1}
          max={72}
          step={1}
          value={operation.strokeWidth}
          onChange={(event) => update({ strokeWidth: Number(event.currentTarget.value) })}
        />
      </label>
      {isHighlighter ? (
        <p className="helper-text">Marker strokes blend with the page so text stays readable underneath.</p>
      ) : null}
    </>
  );
}

function RedactionControls({ operation, update }: { operation: RedactionOperation; update: OperationUpdater }) {
  return (
    <>
      <div className="field-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <label>
          Fill color
          <input
            type="color"
            value={operation.fillColor}
            onChange={(event) => update({ fillColor: event.currentTarget.value })}
          />
        </label>
        <label>
          Border color
          <input
            type="color"
            value={operation.borderColor ?? operation.fillColor}
            onChange={(event) => update({ borderColor: event.currentTarget.value })}
          />
        </label>
      </div>
      <label>
        Border width
        <input
          type="number"
          min={0}
          max={12}
          step={0.5}
          value={operation.borderWidth ?? 0}
          onChange={(event) => update({ borderWidth: Number(event.currentTarget.value) })}
        />
      </label>
      <label>
        Overlay text
        <input
          value={operation.overlayText ?? ""}
          placeholder="REDACTED"
          onChange={(event) => update({ overlayText: event.currentTarget.value || undefined })}
        />
      </label>
      <p className="helper-text" role="note">
        Visual covering is not content sanitization. Original PDF text may remain extractable.
      </p>
    </>
  );
}

function CalloutControls({ operation, update }: { operation: AnnotationOperation; update: OperationUpdater }) {
  return (
    <>
      <label>
        Callout text
        <textarea value={operation.text ?? ""} onChange={(event) => update({ text: event.currentTarget.value })} />
      </label>
      <div className="field-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <label>
          Line color
          <input
            type="color"
            value={operation.color}
            onChange={(event) => update({ color: event.currentTarget.value })}
          />
        </label>
        <label>
          Fill color
          <input
            type="color"
            value={operation.fillColor ?? "#ffffff"}
            onChange={(event) => update({ fillColor: event.currentTarget.value })}
          />
        </label>
      </div>
      <div className="field-grid">
        <label>
          Font size
          <input
            type="number"
            min={6}
            max={72}
            step={1}
            value={operation.fontSize ?? 12}
            onChange={(event) => update({ fontSize: Number(event.currentTarget.value) })}
          />
        </label>
        <label>
          Text color
          <input
            type="color"
            value={operation.textColor ?? "#17211a"}
            onChange={(event) => update({ textColor: event.currentTarget.value })}
          />
        </label>
      </div>
      <label>
        Line width
        <input
          type="number"
          min={1}
          max={12}
          step={0.5}
          value={operation.strokeWidth ?? 2}
          onChange={(event) => update({ strokeWidth: Number(event.currentTarget.value) })}
        />
      </label>
    </>
  );
}

function FormFieldControls({ operation, update }: { operation: FormFieldOperation; update: OperationUpdater }) {
  const isTextValue = operation.kind === "text" || operation.kind === "multiline" || operation.kind === "date";
  const isChoice = operation.kind === "dropdown" || operation.kind === "listbox";
  const isCheckable = operation.kind === "checkbox" || operation.kind === "radio";
  const isButton = operation.kind === "button";
  const options = normalizeFormFieldOptions(operation.options);
  const selectedValues = operation.selectedValues ?? (operation.value ? [operation.value] : []);
  const allowsMultiple = operation.kind === "listbox" && Boolean(operation.multiSelect);

  return (
    <>
      <label>
        Field type
        <select
          value={operation.kind}
          onChange={(event) => update({ kind: event.currentTarget.value as FormFieldKind })}
        >
          {FORM_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {FORM_FIELD_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>
      <label>
        Field name
        <input
          value={operation.name}
          autoComplete="off"
          onChange={(event) => update({ name: event.currentTarget.value })}
        />
      </label>

      {isTextValue ? (
        <>
          <label>
            Value
            {operation.kind === "multiline" ? (
              <textarea
                value={operation.value ?? ""}
                onChange={(event) => update({ value: event.currentTarget.value })}
              />
            ) : (
              <input
                type="text"
                inputMode={operation.kind === "date" ? "numeric" : undefined}
                placeholder={operation.kind === "date" ? (operation.dateFormat ?? "yyyy-MM-dd") : undefined}
                value={operation.value ?? ""}
                onChange={(event) => update({ value: event.currentTarget.value })}
              />
            )}
          </label>
          <label>
            Default value
            <input
              type="text"
              inputMode={operation.kind === "date" ? "numeric" : undefined}
              placeholder={operation.kind === "date" ? (operation.dateFormat ?? "yyyy-MM-dd") : undefined}
              value={operation.defaultValue ?? ""}
              onChange={(event) => update({ defaultValue: event.currentTarget.value })}
            />
          </label>
        </>
      ) : null}

      {isChoice ? (
        <>
          <label>
            Options
            <textarea
              aria-describedby={`form-options-help-${operation.id}`}
              value={(operation.options ?? []).join("\n")}
              onChange={(event) => update({ options: event.currentTarget.value.split(/\r?\n/) })}
              onBlur={(event) => {
                const normalized = normalizeFormFieldOptions(event.currentTarget.value.split(/\r?\n/));
                const permitsCustomValue = operation.kind === "dropdown" && Boolean(operation.allowCustomText);
                const nextSelectedValues = permitsCustomValue
                  ? selectedValues
                  : selectedValues.filter((value) => normalized.includes(value));
                const nextDefaultValue =
                  operation.defaultValue === undefined ||
                  permitsCustomValue ||
                  normalized.includes(operation.defaultValue)
                    ? operation.defaultValue
                    : undefined;
                update({
                  options: normalized,
                  selectedValues: nextSelectedValues,
                  value: nextSelectedValues[0] ?? "",
                  defaultValue: nextDefaultValue,
                });
              }}
            />
          </label>
          <p id={`form-options-help-${operation.id}`} className="helper-text">
            One option per line.
          </p>
          <label>
            {allowsMultiple ? "Selected choices" : "Selected choice"}
            <select
              multiple={allowsMultiple}
              size={allowsMultiple ? Math.min(5, Math.max(2, options.length)) : undefined}
              value={allowsMultiple ? selectedValues : (selectedValues[0] ?? "")}
              onChange={(event) => {
                const values = Array.from(event.currentTarget.selectedOptions, (option) => option.value);
                update({ selectedValues: values, value: values[0] ?? "" });
              }}
            >
              {!allowsMultiple ? <option value="">No selection</option> : null}
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Default choice
            <select
              value={operation.defaultValue ?? ""}
              onChange={(event) => update({ defaultValue: event.currentTarget.value || undefined })}
            >
              <option value="">No default</option>
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          {operation.kind === "dropdown" ? (
            <>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={operation.allowCustomText ?? false}
                  onChange={(event) => {
                    const allowCustomText = event.currentTarget.checked;
                    if (allowCustomText) {
                      update({ allowCustomText });
                      return;
                    }
                    const nextSelectedValues = selectedValues.filter((value) => options.includes(value)).slice(0, 1);
                    update({
                      allowCustomText,
                      selectedValues: nextSelectedValues,
                      value: nextSelectedValues[0] ?? "",
                      defaultValue:
                        operation.defaultValue === undefined || options.includes(operation.defaultValue)
                          ? operation.defaultValue
                          : undefined,
                    });
                  }}
                />
                Allow custom text
              </label>
              {operation.allowCustomText ? (
                <label>
                  Custom value
                  <input
                    value={operation.value ?? ""}
                    onChange={(event) =>
                      update({
                        value: event.currentTarget.value,
                        selectedValues: event.currentTarget.value ? [event.currentTarget.value] : [],
                      })
                    }
                  />
                </label>
              ) : null}
            </>
          ) : (
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={operation.multiSelect ?? false}
                onChange={(event) => {
                  const multiSelect = event.currentTarget.checked;
                  if (multiSelect) {
                    update({ multiSelect });
                    return;
                  }
                  const nextSelectedValues = selectedValues.slice(0, 1);
                  update({
                    multiSelect,
                    selectedValues: nextSelectedValues,
                    value: nextSelectedValues[0] ?? "",
                  });
                }}
              />
              Allow multiple selections
            </label>
          )}
        </>
      ) : null}

      {operation.kind === "radio" ? (
        <label>
          Group name
          <input
            value={operation.groupName ?? ""}
            onChange={(event) => update({ groupName: event.currentTarget.value })}
          />
        </label>
      ) : null}

      {isCheckable ? (
        <>
          <label>
            Export value
            <input
              value={operation.exportValue ?? "Yes"}
              onChange={(event) => update({ exportValue: event.currentTarget.value })}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={operation.checked ?? false}
              onChange={(event) => update({ checked: event.currentTarget.checked })}
            />
            {operation.kind === "checkbox" ? "Checked" : "Selected"}
          </label>
        </>
      ) : null}

      {isButton ? (
        <>
          <label>
            Button label
            <input
              value={operation.buttonLabel ?? operation.value ?? "Button"}
              onChange={(event) => update({ buttonLabel: event.currentTarget.value })}
            />
          </label>
          <label>
            Button action
            <select
              value={operation.buttonAction ?? "none"}
              onChange={(event) =>
                update({ buttonAction: event.currentTarget.value as FormFieldOperation["buttonAction"] })
              }
            >
              <option value="none">No action</option>
              <option value="reset">Reset form</option>
              <option value="print">Print document</option>
            </select>
          </label>
        </>
      ) : null}

      {operation.kind === "date" ? (
        <label>
          Date format
          <select
            value={operation.dateFormat ?? "yyyy-MM-dd"}
            onChange={(event) => {
              const dateFormat = event.currentTarget.value as NonNullable<FormFieldOperation["dateFormat"]>;
              const previousFormat = operation.dateFormat ?? "yyyy-MM-dd";
              update({
                dateFormat,
                value: reformatDateFieldValue(operation.value, previousFormat, dateFormat),
                defaultValue: reformatDateFieldValue(operation.defaultValue, previousFormat, dateFormat),
              });
            }}
          >
            <option value="yyyy-MM-dd">YYYY-MM-DD</option>
            <option value="MM/dd/yyyy">MM/DD/YYYY</option>
            <option value="dd/MM/yyyy">DD/MM/YYYY</option>
          </select>
        </label>
      ) : null}

      {operation.kind === "signature" ? (
        <p className="helper-text" role="note">
          Signature boxes export as interactive text placeholders. Use the Signature tool to place a visible typed,
          drawn, or image signature.
        </p>
      ) : null}
      {operation.kind === "date" ? (
        <p className="helper-text">Automatic date formatting depends on PDF viewer JavaScript support.</p>
      ) : null}
      {operation.kind === "button" && operation.buttonAction === "print" ? (
        <p className="helper-text">Some PDF viewers block print actions until the reader approves them.</p>
      ) : null}

      <label>
        Tooltip
        <input value={operation.tooltip ?? ""} onChange={(event) => update({ tooltip: event.currentTarget.value })} />
      </label>
      {!isButton ? (
        <>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={operation.required ?? false}
              onChange={(event) => update({ required: event.currentTarget.checked })}
            />
            Required
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={operation.readOnly ?? false}
              onChange={(event) => update({ readOnly: event.currentTarget.checked })}
            />
            Read only
          </label>
        </>
      ) : null}

      <div className="panel-heading panel-heading--small">
        <span>Appearance</span>
      </div>
      <div className="field-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <label>
          Fill color
          <input
            type="color"
            value={operation.fillColor ?? DEFAULT_FORM_FIELD_APPEARANCE.fillColor}
            onChange={(event) => update({ fillColor: event.currentTarget.value })}
          />
        </label>
        <label>
          Border color
          <input
            type="color"
            value={operation.borderColor ?? DEFAULT_FORM_FIELD_APPEARANCE.borderColor}
            onChange={(event) => update({ borderColor: event.currentTarget.value })}
          />
        </label>
      </div>
      <div className="field-grid">
        <label>
          Font size
          <input
            type="number"
            min={6}
            max={72}
            step={1}
            value={operation.fontSize ?? DEFAULT_FORM_FIELD_APPEARANCE.fontSize}
            onChange={(event) => {
              if (!event.currentTarget.value.trim()) return;
              const fontSize = Number(event.currentTarget.value);
              if (Number.isFinite(fontSize) && fontSize > 0) update({ fontSize });
            }}
            onBlur={(event) => {
              const fontSize = Number(event.currentTarget.value);
              if (!event.currentTarget.value.trim() || !Number.isFinite(fontSize) || fontSize <= 0) {
                update({ fontSize: DEFAULT_FORM_FIELD_APPEARANCE.fontSize });
              }
            }}
          />
        </label>
        <label>
          Text color
          <input
            type="color"
            value={operation.textColor ?? DEFAULT_FORM_FIELD_APPEARANCE.textColor}
            onChange={(event) => update({ textColor: event.currentTarget.value })}
          />
        </label>
      </div>
      <label>
        Font family
        <input
          value={operation.fontFamily ?? DEFAULT_FORM_FIELD_APPEARANCE.fontFamily}
          onChange={(event) => update({ fontFamily: event.currentTarget.value })}
        />
      </label>
      <div className="field-grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
        <label>
          Border width
          <input
            type="number"
            min={0}
            max={12}
            step={0.5}
            value={operation.borderWidth ?? DEFAULT_FORM_FIELD_APPEARANCE.borderWidth}
            onChange={(event) => update({ borderWidth: Number(event.currentTarget.value) })}
          />
        </label>
        <label>
          Border style
          <select
            value={operation.borderStyle ?? DEFAULT_FORM_FIELD_APPEARANCE.borderStyle}
            onChange={(event) => update({ borderStyle: event.currentTarget.value as FormBorderStyle })}
          >
            <option value="solid">Solid</option>
            <option value="dashed">Dashed</option>
            <option value="underline">Underline</option>
          </select>
        </label>
      </div>
      <div className="segmented" aria-label="Field text alignment">
        {(
          [
            ["left", AlignLeft],
            ["center", AlignCenter],
            ["right", AlignRight],
          ] as Array<[TextAlign, typeof AlignLeft]>
        ).map(([align, Icon]) => (
          <button
            type="button"
            key={align}
            aria-label={`Align ${align}`}
            aria-pressed={(operation.align ?? DEFAULT_FORM_FIELD_APPEARANCE.align) === align}
            onClick={() => update({ align })}
          >
            <Icon aria-hidden="true" />
          </button>
        ))}
      </div>
      <label>
        Rotation
        <select
          value={operation.rotation ?? DEFAULT_FORM_FIELD_APPEARANCE.rotation}
          onChange={(event) => update({ rotation: Number(event.currentTarget.value) as FormRotation })}
        >
          <option value={0}>0°</option>
          <option value={90}>90°</option>
          <option value={180}>180°</option>
          <option value={270}>270°</option>
        </select>
      </label>
    </>
  );
}

type InspectorProps = {
  operation?: EditOperation;
  operationCount: number;
  pageCount?: number;
  pageTextItems: TextItem[];
  /** How many operations are selected; >1 swaps the per-field editor for group actions. */
  selectedCount: number;
  onDuplicateSelected: () => void;
  onClose?: () => void;
  onExport: (format: ExportFormat) => void;
  onRemoveSelected: () => void;
  onUpdate: (id: string, patch: EditOperationPatch) => void;
};

function InspectorComponent({
  operation,
  operationCount,
  pageCount = 1,
  pageTextItems,
  selectedCount,
  onDuplicateSelected,
  onClose,
  onExport,
  onRemoveSelected,
  onUpdate,
}: InspectorProps) {
  const previewTextOperation = useTextPreviewDispatch();
  const update = (patch: EditOperationPatch) => {
    /* v8 ignore next -- every `update` caller renders only inside the `operation`-present block, so the guard's false branch is unreachable */
    if (operation) onUpdate(operation.id, patch);
  };

  return (
    <div className="inspector__inner">
      <div className="panel-heading">
        <span>Properties</span>
        <div className="panel-heading__actions">
          <SlidersHorizontal aria-hidden="true" />
          {onClose ? (
            <button
              className="icon-button"
              type="button"
              aria-label="Close properties"
              title="Close properties"
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </button>
          ) : null}
        </div>
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
                <textarea value={operation.text} onChange={(event) => update({ text: event.currentTarget.value })} />
              </label>
              <label className="inspector-font-field">
                Font
                <FontFamilySelect
                  aria-label="Font"
                  className="inspector-font-select"
                  value={operation.fontFamily}
                  variant="inspector"
                  onCommit={(patch) => update(patch)}
                  onPreview={(patch) => previewTextOperation(operation.id, patch)}
                />
              </label>
              <p className="helper-text">
                <TextFontHelper operation={operation} />
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
                      update({ fontSize: Math.round(parsed) });
                    }}
                    onBlur={(event) => {
                      const parsed = Number(event.currentTarget.value);
                      /* v8 ignore next -- the control is type="number"; the DOM coerces any entry (including empty) to a finite value, so the non-finite fallback is unreachable */
                      const clamped = Number.isFinite(parsed) ? Math.min(96, Math.max(6, Math.round(parsed))) : 6;
                      update({ fontSize: clamped });
                    }}
                  />
                </label>
                <label>
                  Color
                  <input
                    type="color"
                    value={operation.color}
                    onChange={(event) => update({ color: event.currentTarget.value })}
                  />
                </label>
              </div>
              <div className="segmented" aria-label="Text alignment">
                {(
                  [
                    ["left", AlignLeft],
                    ["center", AlignCenter],
                    ["right", AlignRight],
                  ] as Array<[TextAlign, typeof AlignLeft]>
                ).map(([align, Icon]) => (
                  <button key={align} aria-pressed={operation.align === align} onClick={() => update({ align })}>
                    <Icon aria-hidden="true" />
                  </button>
                ))}
              </div>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={operation.whiteout}
                  onChange={(event) => update({ whiteout: event.currentTarget.checked })}
                />
                Whiteout behind text
              </label>
              {operation.whiteout ? (
                <label>
                  Background
                  <input
                    type="color"
                    value={operation.whiteoutColor ?? "#ffffff"}
                    onChange={(event) => update({ whiteoutColor: event.currentTarget.value })}
                  />
                </label>
              ) : null}
            </>
          ) : null}

          {operation.type !== "form-field" &&
          ("opacity" in operation ||
            operation.type === "ink" ||
            operation.type === "redaction" ||
            (operation.type === "annotation" && operation.kind === "callout")) ? (
            <OpacityControl value={operation.opacity} update={update} />
          ) : null}

          {operation.type === "ink" ? <InkControls operation={operation} update={update} /> : null}

          {operation.type === "redaction" ? <RedactionControls operation={operation} update={update} /> : null}

          {operation.type === "annotation" && operation.kind === "callout" ? (
            <CalloutControls operation={operation} update={update} />
          ) : null}

          {operation.type === "shape" ? (
            <>
              <label>
                Stroke
                <input
                  type="color"
                  value={operation.stroke}
                  onChange={(event) => update({ stroke: event.currentTarget.value })}
                />
              </label>
              <label>
                Stroke width
                <input
                  type="number"
                  min={1}
                  max={12}
                  value={operation.strokeWidth}
                  onChange={(event) => update({ strokeWidth: Number(event.currentTarget.value) })}
                />
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
                    });
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
                    onChange={(event) => update({ target: { kind: "url", href: event.currentTarget.value } })}
                    onBlur={(event) => {
                      // Never leave an unsafe URL in the edit model. sanitizeUrl returns the
                      // safe form (http/https/mailto) or null; on null, clear the field rather
                      // than keeping the raw value the onChange already wrote.
                      update({ target: { kind: "url", href: sanitizeUrl(event.currentTarget.value) ?? "" } });
                    }}
                  />
                </label>
              ) : null}
              {operation.target.kind === "email" ? (
                <label>
                  Email
                  <input
                    value={operation.target.href.replace(/^mailto:/i, "")}
                    onChange={(event) => update({ target: { kind: "email", href: event.currentTarget.value } })}
                    onBlur={(event) => {
                      update({
                        target: { kind: "email", href: sanitizeEmailToMailto(event.currentTarget.value) ?? "" },
                      });
                    }}
                  />
                </label>
              ) : null}
              {operation.target.kind === "phone" ? (
                <label>
                  Phone
                  <input
                    value={operation.target.href.replace(/^tel:/i, "")}
                    onChange={(event) => update({ target: { kind: "phone", href: event.currentTarget.value } })}
                    onBlur={(event) => {
                      update({ target: { kind: "phone", href: sanitizeTel(event.currentTarget.value) ?? "" } });
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
                      update({ target: { kind: "page", pageIndex: clamped - 1 } });
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
                <input value={operation.label} onChange={(event) => update({ label: event.currentTarget.value })} />
              </label>
              <label>
                Detail line
                <input
                  value={operation.subline ?? ""}
                  placeholder="By Author at date"
                  onChange={(event) => update({ subline: event.currentTarget.value || undefined })}
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
                    })
                  }
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
                onChange={(event) => update({ color: event.currentTarget.value })}
              />
            </label>
          ) : null}

          {operation.type === "form-mark" ? (
            <>
              <div className="segmented" aria-label="Mark style">
                {(
                  [
                    ["check", Check],
                    ["cross", X],
                    ["dot", Circle],
                  ] as Array<[FormMarkOperation["mark"], typeof Check]>
                ).map(([mark, Icon]) => (
                  <button key={mark} aria-pressed={operation.mark === mark} onClick={() => update({ mark })}>
                    <Icon aria-hidden="true" />
                  </button>
                ))}
              </div>
              <label>
                Color
                <input
                  type="color"
                  value={operation.color}
                  onChange={(event) => update({ color: event.currentTarget.value })}
                />
              </label>
            </>
          ) : null}

          {operation.type === "form-field" ? <FormFieldControls operation={operation} update={update} /> : null}
        </div>
      )}

      <section className="inspector-section">
        <div className="panel-heading panel-heading--small">
          <span>Export</span>
          <strong>{operationCount} edits</strong>
        </div>
        <div className="export-grid">
          <button onClick={() => onExport("pdf")}>
            <FileText aria-hidden="true" /> PDF
          </button>
          <button onClick={() => onExport("txt")}>
            <FileText aria-hidden="true" /> TXT
          </button>
          <button onClick={() => onExport("csv")}>
            <FileSpreadsheet aria-hidden="true" /> CSV
          </button>
          <button onClick={() => onExport("xlsx")}>
            <FileSpreadsheet aria-hidden="true" /> XLSX
          </button>
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

// Memoized so unrelated controller-state changes (status text, isBusy flips
// around exports) don't re-render the whole panel; its props are referentially
// stable across those updates (memoized selections + useCallback'd handlers).
export const Inspector = memo(InspectorComponent);
