import type { FormBorderStyle, FormFieldKind, FormFieldOperation, FormRotation, TextAlign } from "../types/editor";

export const FORM_FIELD_LABELS: Readonly<Record<FormFieldKind, string>> = {
  text: "Text field",
  multiline: "Multiline text",
  dropdown: "Dropdown",
  listbox: "List box",
  radio: "Radio button",
  checkbox: "Checkbox",
  button: "Button",
  date: "Date field",
  signature: "Signature field",
};

export type FormFieldAppearance = {
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  borderStyle: FormBorderStyle;
  fontFamily: string;
  fontSize: number;
  textColor: string;
  align: TextAlign;
  rotation: FormRotation;
};

export const DEFAULT_FORM_FIELD_APPEARANCE: Readonly<FormFieldAppearance> = {
  fillColor: "#ffffff",
  borderColor: "#64748b",
  borderWidth: 1,
  borderStyle: "solid",
  fontFamily: "Inter",
  fontSize: 12,
  textColor: "#111827",
  align: "left",
  rotation: 0,
};

export type NormalizedFormFieldOperation = FormFieldOperation &
  FormFieldAppearance & {
    options: string[];
    selectedValues: string[];
    required: boolean;
    readOnly: boolean;
    exportValue: string;
    allowCustomText: boolean;
    multiSelect: boolean;
    buttonLabel: string;
    buttonAction: "none" | "reset" | "print";
    dateFormat: "yyyy-MM-dd" | "MM/dd/yyyy" | "dd/MM/yyyy";
  };

export type FormFieldValidationIssue = {
  field: string;
  message: string;
};

const HEX_COLOR = /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;

function stripControlCharacters(value: string): string {
  return Array.from(value)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code >= 32 && code !== 127;
    })
    .join("");
}

export function formFieldLabel(kind: FormFieldKind): string {
  return FORM_FIELD_LABELS[kind];
}

export function normalizeFormFieldOptions(options?: readonly string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const option of options ?? []) {
    const value = option.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
  }
  return normalized;
}

/**
 * PDF field names are hierarchical when they contain dots. Keep user-facing
 * Unicode letters while removing controls and separators that can accidentally
 * create a field tree or an invalid empty terminal name.
 */
export function sanitizeFormFieldName(value: string, fallback = "field"): string {
  const normalized = stripControlCharacters(value.normalize("NFKC"))
    .trim()
    .replace(/[.\s]+/g, "_")
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "");
  if (normalized) return normalized;
  const safeFallback = fallback
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}_-]+/gu, "_")
    .replace(/^[_-]+|[_-]+$/g, "");
  return safeFallback || "field";
}

export function uniquifyFormFieldName(
  requestedName: string,
  existingNames: Iterable<string>,
  fallback = "field",
): string {
  const base = sanitizeFormFieldName(requestedName, fallback);
  const existing = new Set(existingNames);
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

export function resolveFormFieldAppearance(operation: FormFieldOperation): FormFieldAppearance {
  return {
    fillColor: operation.fillColor ?? DEFAULT_FORM_FIELD_APPEARANCE.fillColor,
    borderColor: operation.borderColor ?? DEFAULT_FORM_FIELD_APPEARANCE.borderColor,
    borderWidth: operation.borderWidth ?? DEFAULT_FORM_FIELD_APPEARANCE.borderWidth,
    borderStyle: operation.borderStyle ?? DEFAULT_FORM_FIELD_APPEARANCE.borderStyle,
    fontFamily: operation.fontFamily ?? DEFAULT_FORM_FIELD_APPEARANCE.fontFamily,
    fontSize: operation.fontSize ?? DEFAULT_FORM_FIELD_APPEARANCE.fontSize,
    textColor: operation.textColor ?? DEFAULT_FORM_FIELD_APPEARANCE.textColor,
    align: operation.align ?? DEFAULT_FORM_FIELD_APPEARANCE.align,
    rotation: operation.rotation ?? DEFAULT_FORM_FIELD_APPEARANCE.rotation,
  };
}

export function normalizeFormFieldOperation(operation: FormFieldOperation): NormalizedFormFieldOperation {
  const fallbackName = operation.kind.replace(/-/g, "_");
  const options = normalizeFormFieldOptions(operation.options);
  const selectedValues = normalizeFormFieldOptions(
    operation.selectedValues ?? (operation.value === undefined ? [] : [operation.value]),
  );
  return {
    ...operation,
    ...resolveFormFieldAppearance(operation),
    name: sanitizeFormFieldName(operation.name, fallbackName),
    groupName: operation.groupName ? sanitizeFormFieldName(operation.groupName, `${fallbackName}_group`) : undefined,
    tooltip: operation.tooltip ? stripControlCharacters(operation.tooltip).trim() || undefined : undefined,
    options,
    selectedValues,
    required: operation.required ?? false,
    readOnly: operation.readOnly ?? false,
    exportValue:
      operation.exportValue === undefined
        ? operation.kind === "checkbox"
          ? "Yes"
          : operation.value?.trim() || "Choice"
        : operation.exportValue.trim(),
    allowCustomText: operation.allowCustomText ?? false,
    multiSelect: operation.multiSelect ?? false,
    buttonLabel: operation.buttonLabel?.trim() || operation.value?.trim() || "Button",
    buttonAction: operation.buttonAction ?? "none",
    dateFormat: operation.dateFormat ?? "yyyy-MM-dd",
  };
}

function isValidColor(value: string): boolean {
  return value === "transparent" || HEX_COLOR.test(value);
}

function parseDateParts(
  value: string,
  format: NormalizedFormFieldOperation["dateFormat"],
): [number, number, number] | null {
  const patterns: Record<typeof format, RegExp> = {
    "yyyy-MM-dd": /^(\d{4})-(\d{2})-(\d{2})$/,
    "MM/dd/yyyy": /^(\d{2})\/(\d{2})\/(\d{4})$/,
    "dd/MM/yyyy": /^(\d{2})\/(\d{2})\/(\d{4})$/,
  };
  const match = patterns[format].exec(value);
  if (!match) return null;
  if (format === "yyyy-MM-dd") return [Number(match[1]), Number(match[2]), Number(match[3])];
  if (format === "MM/dd/yyyy") return [Number(match[3]), Number(match[1]), Number(match[2])];
  return [Number(match[3]), Number(match[2]), Number(match[1])];
}

export function isValidDateFieldValue(
  value: string | undefined,
  format: NormalizedFormFieldOperation["dateFormat"],
): boolean {
  if (!value) return true;
  const parts = parseDateParts(value, format);
  if (!parts) return false;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function reformatDateFieldValue(
  value: string | undefined,
  fromFormat: NormalizedFormFieldOperation["dateFormat"],
  toFormat: NormalizedFormFieldOperation["dateFormat"],
): string | undefined {
  if (!value) return value;
  const parts = parseDateParts(value, fromFormat);
  if (!parts || !isValidDateFieldValue(value, fromFormat)) return undefined;
  const [year, month, day] = parts;
  const yyyy = String(year).padStart(4, "0");
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  if (toFormat === "yyyy-MM-dd") return `${yyyy}-${mm}-${dd}`;
  if (toFormat === "MM/dd/yyyy") return `${mm}/${dd}/${yyyy}`;
  return `${dd}/${mm}/${yyyy}`;
}

export function validateFormFieldOperation(operation: FormFieldOperation): FormFieldValidationIssue[] {
  const field = normalizeFormFieldOperation(operation);
  const issues: FormFieldValidationIssue[] = [];
  const rectValues = [field.rect.x, field.rect.y, field.rect.width, field.rect.height];
  if (!rectValues.every(Number.isFinite) || field.rect.width <= 0 || field.rect.height <= 0) {
    issues.push({ field: "rect", message: "Field bounds must be finite and have positive width and height." });
  }
  if (!isValidColor(field.fillColor)) {
    issues.push({ field: "fillColor", message: "Fill color must be a 3- or 6-digit hex color, or transparent." });
  }
  if (!isValidColor(field.borderColor)) {
    issues.push({ field: "borderColor", message: "Border color must be a 3- or 6-digit hex color, or transparent." });
  }
  if (!isValidColor(field.textColor) || field.textColor === "transparent") {
    issues.push({ field: "textColor", message: "Text color must be a 3- or 6-digit hex color." });
  }
  if (!Number.isFinite(field.borderWidth) || field.borderWidth < 0) {
    issues.push({ field: "borderWidth", message: "Border width must be a non-negative finite number." });
  }
  if (!Number.isFinite(field.fontSize) || field.fontSize <= 0) {
    issues.push({ field: "fontSize", message: "Font size must be a positive finite number." });
  }
  if (field.kind === "dropdown" || field.kind === "listbox") {
    const permitsCustomValue = field.kind === "dropdown" && field.allowCustomText;
    const unknownSelections = field.selectedValues.filter((value) => !field.options.includes(value));
    if (unknownSelections.length > 0 && !permitsCustomValue) {
      issues.push({ field: "selectedValues", message: "Selected values must exist in the field options." });
    }
    if (!field.multiSelect && field.selectedValues.length > 1) {
      issues.push({
        field: "selectedValues",
        message: "A single-select choice field cannot have multiple selected values.",
      });
    }
    if (field.defaultValue !== undefined && !field.options.includes(field.defaultValue) && !permitsCustomValue) {
      issues.push({ field: "defaultValue", message: "Default value must exist in the field options." });
    }
  }
  if (field.kind === "radio" || field.kind === "checkbox") {
    if (!field.exportValue.trim()) {
      issues.push({ field: "exportValue", message: "Choice controls need a non-empty export value." });
    } else if (!/^[\x20-\x7e]+$/.test(field.exportValue)) {
      issues.push({ field: "exportValue", message: "Choice export values must use printable ASCII characters." });
    }
  }
  if (field.kind === "date") {
    if (!isValidDateFieldValue(field.value, field.dateFormat)) {
      issues.push({ field: "value", message: `Date value must match ${field.dateFormat}.` });
    }
    if (!isValidDateFieldValue(field.defaultValue, field.dateFormat)) {
      issues.push({ field: "defaultValue", message: `Default date value must match ${field.dateFormat}.` });
    }
  }
  return issues;
}

export class FormFieldValidationError extends Error {
  readonly issues: FormFieldValidationIssue[];

  constructor(issues: FormFieldValidationIssue[]) {
    super(issues.map((issue) => issue.message).join(" "));
    this.name = "FormFieldValidationError";
    this.issues = issues;
  }
}

export function assertValidFormFieldOperation(operation: FormFieldOperation): void {
  const issues = validateFormFieldOperation(operation);
  if (issues.length > 0) throw new FormFieldValidationError(issues);
}
