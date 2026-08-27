import {
  adjustDimsForRotation,
  AnnotationFlags,
  cleanText,
  componentsToColor,
  defaultButtonAppearanceProvider,
  defaultCheckBoxAppearanceProvider,
  defaultDropdownAppearanceProvider,
  defaultOptionListAppearanceProvider,
  defaultRadioGroupAppearanceProvider,
  defaultTextFieldAppearanceProvider,
  degrees,
  drawLine,
  drawRectangle,
  lineSplit,
  mergeLines,
  type AppearanceProviderFor,
  type PDFButton,
  type PDFCheckBox,
  PDFDict,
  PDFDocument,
  type PDFDropdown,
  PDFField,
  PDFHexString,
  PDFName,
  type PDFOperator,
  type PDFOptionList,
  PDFPage,
  PDFRadioGroup,
  type PDFTextField,
  type PDFWidgetAnnotation,
  reduceRotation,
  rgb,
  StandardFonts,
  TextAlignment,
  type PDFFont,
} from "pdf-lib";
import {
  assertValidFormFieldOperation,
  normalizeFormFieldOperation,
  uniquifyFormFieldName,
  type NormalizedFormFieldOperation,
} from "../editor/formField";
import type { FormFieldKind, FormFieldOperation } from "../types/editor";

export type FormFieldWriterContext = {
  getFont?: (fontFamily?: string) => Promise<PDFFont>;
};

export type FormFieldWriteResult = {
  fieldName: string;
  kind: FormFieldKind;
  mode: "acroform" | "signature-text-fallback";
  reusedField: boolean;
};

function hexToRgb(color: string) {
  const normalized = color.slice(1);
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => `${character}${character}`)
          .join("")
      : normalized;
  const value = Number.parseInt(expanded, 16);
  return rgb(((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255);
}

function optionalColor(color: string) {
  return color === "transparent" ? undefined : hexToRgb(color);
}

function toTextAlignment(alignment: NormalizedFormFieldOperation["align"]): TextAlignment {
  if (alignment === "center") return TextAlignment.Center;
  if (alignment === "right") return TextAlignment.Right;
  return TextAlignment.Left;
}

async function resolveFont(
  pdf: PDFDocument,
  operation: NormalizedFormFieldOperation,
  context: FormFieldWriterContext,
): Promise<PDFFont> {
  return context.getFont ? context.getFont(operation.fontFamily) : pdf.embedFont(StandardFonts.Helvetica);
}

function appearanceOptions(operation: NormalizedFormFieldOperation, font: PDFFont) {
  return {
    x: operation.rect.x,
    y: operation.rect.y,
    width: operation.rect.width,
    height: operation.rect.height,
    textColor: hexToRgb(operation.textColor),
    backgroundColor: optionalColor(operation.fillColor),
    borderColor: optionalColor(operation.borderColor),
    borderWidth: operation.borderWidth,
    rotate: degrees(operation.rotation),
    font,
  };
}

function appendBorderOperators<T>(appearance: T, borderOperators: PDFOperator[]): T {
  if (borderOperators.length === 0) return appearance;
  if (Array.isArray(appearance)) {
    return [...appearance, ...borderOperators] as T;
  }
  if (appearance !== null && typeof appearance === "object") {
    return Object.fromEntries(
      Object.entries(appearance).map(([key, value]) => [key, appendBorderOperators(value, borderOperators)]),
    ) as T;
  }
  return appearance;
}

type WidgetBorderAppearance = {
  style: "solid" | "dashed" | "underline";
  color: ReturnType<typeof componentsToColor>;
  width: number;
};

function widgetBorderAppearance(widget: PDFWidgetAnnotation): WidgetBorderAppearance {
  const borderStyle = widget.getOrCreateBorderStyle();
  const styleName = borderStyle.dict.lookupMaybe(PDFName.of("S"), PDFName)?.decodeText();
  return {
    style: styleName === "D" ? "dashed" : styleName === "U" ? "underline" : "solid",
    color: componentsToColor(widget.getAppearanceCharacteristics()?.getBorderColor()),
    width: borderStyle.getWidth() ?? 0,
  };
}

function customBorderOperators(widget: PDFWidgetAnnotation, border: WidgetBorderAppearance): PDFOperator[] {
  if (!border.color || border.width === 0) return [];

  const rotation = reduceRotation(widget.getAppearanceCharacteristics()?.getRotation());
  const { width, height } = adjustDimsForRotation(widget.getRectangle(), rotation);
  const inset = border.width / 2;

  if (border.style === "underline") {
    return drawLine({
      start: { x: inset, y: inset },
      end: { x: Math.max(inset, width - inset), y: inset },
      thickness: border.width,
      color: border.color,
    });
  }

  return drawRectangle({
    x: inset,
    y: inset,
    width: Math.max(0, width - border.width),
    height: Math.max(0, height - border.width),
    borderWidth: border.width,
    color: undefined,
    borderColor: border.color,
    borderDashArray: [3, 2],
    rotate: degrees(0),
    xSkew: degrees(0),
    ySkew: degrees(0),
  });
}

function styledAppearanceProvider<TField, TArgs extends unknown[], TResult>(
  provider: (field: TField, widget: PDFWidgetAnnotation, ...args: TArgs) => TResult,
): (field: TField, widget: PDFWidgetAnnotation, ...args: TArgs) => TResult {
  return (field, widget, ...args) => {
    const render = () => provider(field, widget, ...args);
    const border = widgetBorderAppearance(widget);
    if (border.style === "solid") return render();

    const borderStyle = widget.getOrCreateBorderStyle();
    borderStyle.setWidth(0);
    try {
      return appendBorderOperators(render(), customBorderOperators(widget, border));
    } finally {
      borderStyle.setWidth(border.width);
    }
  };
}

function applyFieldMetadata(field: PDFField, operation: NormalizedFormFieldOperation): void {
  if (operation.readOnly) field.enableReadOnly();
  else field.disableReadOnly();
  if (operation.required) field.enableRequired();
  else field.disableRequired();
  if (operation.tooltip) {
    field.acroField.dict.set(PDFName.of("TU"), PDFHexString.fromText(operation.tooltip));
  }
}

function applyWidgetMetadata(field: PDFField, operation: NormalizedFormFieldOperation): void {
  const widgets = field.acroField.getWidgets();
  const widget = widgets[widgets.length - 1]!;
  const borderStyle = widget.getOrCreateBorderStyle();
  borderStyle.setWidth(operation.borderWidth);
  const style = operation.borderStyle === "dashed" ? "D" : operation.borderStyle === "underline" ? "U" : "S";
  borderStyle.dict.set(PDFName.of("S"), PDFName.of(style));
  if (operation.borderStyle === "dashed") {
    borderStyle.dict.set(PDFName.of("D"), widget.dict.context.obj([3, 2]));
  } else {
    borderStyle.dict.delete(PDFName.of("D"));
  }
  widget.setFlagTo(AnnotationFlags.Print, true);
}

function setDefaultTextValue(field: PDFField, value: string | undefined): void {
  if (value !== undefined) {
    field.acroField.dict.set(PDFName.of("DV"), PDFHexString.fromText(value));
  }
}

function setChoiceAlignment(field: PDFField, operation: NormalizedFormFieldOperation): void {
  field.acroField.dict.set(PDFName.of("Q"), field.acroField.dict.context.obj(toTextAlignment(operation.align)));
}

function setChoiceDefault(field: PDFField, value: string | undefined): void {
  if (value === undefined) return;
  field.acroField.dict.set(PDFName.of("DV"), PDFHexString.fromText(value));
}

function configureWidget(field: PDFField, operation: NormalizedFormFieldOperation): void {
  applyFieldMetadata(field, operation);
  applyWidgetMetadata(field, operation);
}

function existingFieldNames(pdf: PDFDocument): string[] {
  return pdf
    .getForm()
    .getFields()
    .map((field) => field.getName());
}

function uniqueFieldName(pdf: PDFDocument, operation: NormalizedFormFieldOperation): string {
  return uniquifyFormFieldName(operation.name, existingFieldNames(pdf), operation.kind);
}

function selectedChoiceValues(operation: NormalizedFormFieldOperation): string[] {
  if (operation.selectedValues.length > 0) return operation.selectedValues;
  return operation.defaultValue === undefined ? [] : [operation.defaultValue];
}

function appearanceTextValues(operation: NormalizedFormFieldOperation): string[] {
  if (operation.kind === "button") return [operation.buttonLabel];
  if (operation.kind === "dropdown" || operation.kind === "listbox") {
    return [...operation.options, ...operation.selectedValues, operation.value, operation.defaultValue].filter(
      (value): value is string => value !== undefined,
    );
  }
  if (
    operation.kind === "text" ||
    operation.kind === "multiline" ||
    operation.kind === "date" ||
    operation.kind === "signature"
  ) {
    return [operation.value, operation.defaultValue].filter((value): value is string => value !== undefined);
  }
  return [];
}

/**
 * Standard PDF fonts only support a limited character set. pdf-lib otherwise
 * discovers an unsupported glyph while creating `/AP`, after the AcroForm
 * field and page annotation have already been registered. Encode every string
 * that may be painted before creating a field so a caller can safely skip a
 * failed operation without leaving an orphan control behind.
 */
function preflightAppearanceText(operation: NormalizedFormFieldOperation, font: PDFFont): void {
  const usesMultilineLayout = operation.kind === "multiline" || operation.kind === "listbox";
  const strings = new Set(
    appearanceTextValues(operation).flatMap((value) =>
      usesMultilineLayout ? lineSplit(cleanText(value)) : [mergeLines(cleanText(value))],
    ),
  );
  for (const value of strings) {
    if (value) font.encodeText(value);
  }
}

function updateTextFieldAppearance(field: PDFTextField, operation: NormalizedFormFieldOperation, font: PDFFont): void {
  field.setFontSize(operation.fontSize);
  field.updateAppearances(
    font,
    styledAppearanceProvider(defaultTextFieldAppearanceProvider) as AppearanceProviderFor<PDFTextField>,
  );
}

function updateDropdownAppearance(field: PDFDropdown, operation: NormalizedFormFieldOperation, font: PDFFont): void {
  field.setFontSize(operation.fontSize);
  field.updateAppearances(
    font,
    styledAppearanceProvider(defaultDropdownAppearanceProvider) as AppearanceProviderFor<PDFDropdown>,
  );
}

function updateOptionListAppearance(
  field: PDFOptionList,
  operation: NormalizedFormFieldOperation,
  font: PDFFont,
): void {
  field.setFontSize(operation.fontSize);
  field.updateAppearances(
    font,
    styledAppearanceProvider(defaultOptionListAppearanceProvider) as AppearanceProviderFor<PDFOptionList>,
  );
}

function updateButtonAppearance(field: PDFButton, operation: NormalizedFormFieldOperation, font: PDFFont): void {
  field.setFontSize(operation.fontSize);
  field.updateAppearances(
    font,
    styledAppearanceProvider(defaultButtonAppearanceProvider) as AppearanceProviderFor<PDFButton>,
  );
}

function updateCheckBoxAppearance(field: PDFCheckBox): void {
  field.updateAppearances(
    styledAppearanceProvider(defaultCheckBoxAppearanceProvider) as AppearanceProviderFor<PDFCheckBox>,
  );
}

function updateRadioAppearance(field: PDFRadioGroup): void {
  field.updateAppearances(
    styledAppearanceProvider(defaultRadioGroupAppearanceProvider) as AppearanceProviderFor<PDFRadioGroup>,
  );
}

function addButtonAction(field: PDFField, operation: NormalizedFormFieldOperation): void {
  if (operation.buttonAction === "none") return;
  const widgets = field.acroField.getWidgets();
  const widget = widgets[widgets.length - 1]!;
  const action =
    operation.buttonAction === "reset"
      ? widget.dict.context.obj({ S: "ResetForm" })
      : widget.dict.context.obj({
          S: "JavaScript",
          JS: PDFHexString.fromText("this.print();"),
        });
  widget.dict.set(PDFName.of("A"), action);
}

function addDateActions(field: PDFField, operation: NormalizedFormFieldOperation): void {
  const acrobatFormat: Record<NormalizedFormFieldOperation["dateFormat"], string> = {
    "yyyy-MM-dd": "yyyy-mm-dd",
    "MM/dd/yyyy": "mm/dd/yyyy",
    "dd/MM/yyyy": "dd/mm/yyyy",
  };
  const format = acrobatFormat[operation.dateFormat];
  const context = field.acroField.dict.context;
  field.acroField.dict.set(
    PDFName.of("AA"),
    context.obj({
      F: context.obj({
        S: "JavaScript",
        JS: PDFHexString.fromText(`AFDate_FormatEx("${format}");`),
      }),
      K: context.obj({
        S: "JavaScript",
        JS: PDFHexString.fromText(`AFDate_KeystrokeEx("${format}");`),
      }),
    }),
  );
}

function renameCheckBoxExportValue(field: PDFField, exportValue: string): void {
  const widget = field.acroField.getWidgets().at(-1)!;
  const oldOnValue = widget.getOnValue()!;
  const newOnValue = PDFName.of(exportValue);
  if (oldOnValue === newOnValue) return;
  const appearances = widget.getAppearances();
  for (const appearance of [appearances?.normal, appearances?.rollover, appearances?.down]) {
    if (!(appearance instanceof PDFDict)) continue;
    const onAppearance = appearance.get(oldOnValue)!;
    appearance.set(newOnValue, onAppearance);
    appearance.delete(oldOnValue);
  }
  widget.setAppearanceState(PDFName.of("Off"));
}

async function writeTextLikeField(
  pdf: PDFDocument,
  page: PDFPage,
  operation: NormalizedFormFieldOperation,
  font: PDFFont,
  signatureFallback = false,
): Promise<FormFieldWriteResult> {
  const form = pdf.getForm();
  const fieldName = uniqueFieldName(pdf, operation);
  const field = form.createTextField(fieldName);
  if (operation.kind === "multiline") field.enableMultiline();
  field.setAlignment(toTextAlignment(operation.align));
  field.setText(operation.value ?? operation.defaultValue);
  setDefaultTextValue(field, operation.defaultValue);
  field.addToPage(page, appearanceOptions(operation, font));
  configureWidget(field, operation);
  updateTextFieldAppearance(field, operation, font);
  if (operation.kind === "date") addDateActions(field, operation);
  return {
    fieldName,
    kind: operation.kind,
    mode: signatureFallback ? "signature-text-fallback" : "acroform",
    reusedField: false,
  };
}

async function writeDropdownField(
  pdf: PDFDocument,
  page: PDFPage,
  operation: NormalizedFormFieldOperation,
  font: PDFFont,
): Promise<FormFieldWriteResult> {
  const fieldName = uniqueFieldName(pdf, operation);
  const field = pdf.getForm().createDropdown(fieldName);
  field.setOptions(operation.options);
  if (operation.allowCustomText) field.enableEditing();
  if (operation.multiSelect) field.enableMultiselect();
  const selected = selectedChoiceValues(operation);
  if (selected.length > 0) field.select(selected.length === 1 ? selected[0] : selected);
  setChoiceDefault(field, operation.defaultValue);
  setChoiceAlignment(field, operation);
  field.addToPage(page, appearanceOptions(operation, font));
  configureWidget(field, operation);
  updateDropdownAppearance(field, operation, font);
  return { fieldName, kind: operation.kind, mode: "acroform", reusedField: false };
}

async function writeListBoxField(
  pdf: PDFDocument,
  page: PDFPage,
  operation: NormalizedFormFieldOperation,
  font: PDFFont,
): Promise<FormFieldWriteResult> {
  const fieldName = uniqueFieldName(pdf, operation);
  const field = pdf.getForm().createOptionList(fieldName);
  field.setOptions(operation.options);
  if (operation.multiSelect) field.enableMultiselect();
  const selected = selectedChoiceValues(operation);
  if (selected.length > 0) field.select(selected.length === 1 ? selected[0] : selected);
  setChoiceDefault(field, operation.defaultValue);
  setChoiceAlignment(field, operation);
  field.addToPage(page, appearanceOptions(operation, font));
  configureWidget(field, operation);
  updateOptionListAppearance(field, operation, font);
  return { fieldName, kind: operation.kind, mode: "acroform", reusedField: false };
}

function writeRadioField(
  pdf: PDFDocument,
  page: PDFPage,
  operation: NormalizedFormFieldOperation,
  font: PDFFont,
): FormFieldWriteResult {
  const form = pdf.getForm();
  const requestedName = operation.groupName ?? operation.name;
  const safeName = uniquifyFormFieldName(requestedName, [], "radio_group");
  const existing = form.getFieldMaybe(safeName);
  const reusedField = existing instanceof PDFRadioGroup;
  const fieldName = reusedField ? safeName : uniquifyFormFieldName(safeName, existingFieldNames(pdf), "radio_group");
  const field = reusedField ? existing : form.createRadioGroup(fieldName);
  field.addOptionToPage(operation.exportValue, page, appearanceOptions(operation, font));
  const shouldSelect =
    operation.checked === true ||
    (operation.checked === undefined && (operation.value ?? operation.defaultValue) === operation.exportValue);
  if (shouldSelect) field.select(operation.exportValue);
  if (operation.defaultValue) {
    field.acroField.dict.set(PDFName.of("DV"), PDFName.of(operation.defaultValue));
  }
  configureWidget(field, operation);
  updateRadioAppearance(field);
  return { fieldName, kind: operation.kind, mode: "acroform", reusedField };
}

function writeCheckBoxField(
  pdf: PDFDocument,
  page: PDFPage,
  operation: NormalizedFormFieldOperation,
  font: PDFFont,
): FormFieldWriteResult {
  const fieldName = uniqueFieldName(pdf, operation);
  const field = pdf.getForm().createCheckBox(fieldName);
  field.addToPage(page, appearanceOptions(operation, font));
  renameCheckBoxExportValue(field, operation.exportValue);
  if (operation.checked) field.check();
  else field.uncheck();
  if (operation.defaultValue !== undefined) {
    const defaultValue = operation.defaultValue === operation.exportValue ? operation.exportValue : "Off";
    field.acroField.dict.set(PDFName.of("DV"), PDFName.of(defaultValue));
  }
  configureWidget(field, operation);
  updateCheckBoxAppearance(field);
  return { fieldName, kind: operation.kind, mode: "acroform", reusedField: false };
}

function writeButtonField(
  pdf: PDFDocument,
  page: PDFPage,
  operation: NormalizedFormFieldOperation,
  font: PDFFont,
): FormFieldWriteResult {
  const fieldName = uniqueFieldName(pdf, operation);
  const field = pdf.getForm().createButton(fieldName);
  field.addToPage(operation.buttonLabel, page, appearanceOptions(operation, font));
  configureWidget(field, operation);
  updateButtonAppearance(field, operation, font);
  addButtonAction(field, operation);
  return { fieldName, kind: operation.kind, mode: "acroform", reusedField: false };
}

/**
 * Writes one editor form operation as a live AcroForm widget.
 *
 * pdf-lib cannot create unsigned signature fields through its public API, so
 * `signature` is intentionally exported as an interactive text field and the
 * result reports `signature-text-fallback`. All other supported kinds are real
 * AcroForm controls. Button print and date-format actions use fixed Acrobat
 * JavaScript snippets; readers that disable PDF JavaScript still show the field
 * but may not execute those optional actions.
 */
export async function writeInteractiveFormField(
  pdf: PDFDocument,
  page: PDFPage,
  operation: FormFieldOperation,
  context: FormFieldWriterContext = {},
): Promise<FormFieldWriteResult> {
  assertValidFormFieldOperation(operation);
  const normalized = normalizeFormFieldOperation(operation);
  const font = await resolveFont(pdf, normalized, context);
  preflightAppearanceText(normalized, font);

  if (normalized.kind === "dropdown") return writeDropdownField(pdf, page, normalized, font);
  if (normalized.kind === "listbox") return writeListBoxField(pdf, page, normalized, font);
  if (normalized.kind === "radio") return writeRadioField(pdf, page, normalized, font);
  if (normalized.kind === "checkbox") return writeCheckBoxField(pdf, page, normalized, font);
  if (normalized.kind === "button") return writeButtonField(pdf, page, normalized, font);
  return writeTextLikeField(pdf, page, normalized, font, normalized.kind === "signature");
}
