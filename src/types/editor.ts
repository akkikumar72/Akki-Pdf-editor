export type EditorTool =
  | "select"
  | "text"
  | "whiteout"
  | "image"
  | "stamp"
  | "signature"
  | "shape"
  | "shape-ellipse"
  | "shape-line"
  | "shape-arrow"
  | "ink"
  | "link"
  | "form-text"
  | "form-multiline"
  | "form-dropdown"
  | "form-radio"
  | "form-checkbox"
  | "form-signature"
  | "annotate-text"
  | "strikeout"
  | "underline"
  | "highlight"
  | "draw"
  | "table-region";

export type TextAlign = "left" | "center" | "right";
export type ShapeKind = "rectangle" | "ellipse" | "line" | "arrow";
export type FormFieldKind = "text" | "multiline" | "dropdown" | "radio" | "checkbox" | "signature";
export type AnnotationKind = "note" | "strikeout" | "underline" | "highlight" | "freehand-highlight" | "draw";

export type PdfPoint = {
  x: number;
  y: number;
};

export type PdfRect = PdfPoint & {
  width: number;
  height: number;
};

type BaseOperation = {
  id: string;
  pageIndex: number;
  rect: PdfRect;
  opacity?: number;
  locked?: boolean;
  createdAt: number;
};

export type TextOperation = BaseOperation & {
  type: "text";
  text: string;
  fontFamily: string;
  cssFontFamily?: string;
  detectedFontName?: string;
  embeddedFontKey?: string;
  fontSize: number;
  color: string;
  bold?: boolean;
  italic?: boolean;
  fontWeight?: number;
  fontStyle?: "normal" | "italic";
  letterSpacing?: number;
  align: TextAlign;
  whiteout?: boolean;
  whiteoutColor?: string;
  // Original PDF text bounds for a replacement overlay. The mask at this rect stays
  // fixed even when the editable text is dragged, so the underlying glyph never reappears.
  sourceCoverRect?: PdfRect;
};

export type WhiteoutOperation = BaseOperation & {
  type: "whiteout";
  color: string;
};

export type ImageOperation = BaseOperation & {
  type: "image";
  dataUrl: string;
  mimeType: "image/png" | "image/jpeg";
};

export type SignatureOperation = BaseOperation & {
  type: "signature";
  mode: "typed" | "drawn" | "image";
  value: string;
  color: string;
  fontFamily: string;
};

export type StampOperation = BaseOperation & {
  type: "stamp";
  label: string;
  color: string;
  borderColor: string;
};

export type ShapeOperation = BaseOperation & {
  type: "shape";
  kind: ShapeKind;
  stroke: string;
  fill?: string;
  strokeWidth: number;
};

export type InkOperation = BaseOperation & {
  type: "ink";
  points: PdfPoint[];
  stroke: string;
  strokeWidth: number;
  variant?: "ink" | "draw" | "freehand-highlight";
};

export type LinkOperation = BaseOperation & {
  type: "link";
  href: string;
};

export type AnnotationOperation = BaseOperation & {
  type: "annotation";
  kind: AnnotationKind;
  color: string;
  text?: string;
  strokeWidth?: number;
};

export type FormMarkOperation = BaseOperation & {
  type: "form-mark";
  mark: "check" | "cross" | "dot";
  color: string;
};

export type FormFieldOperation = BaseOperation & {
  type: "form-field";
  kind: FormFieldKind;
  name: string;
  value?: string;
  options?: string[];
  checked?: boolean;
  required?: boolean;
};

export type TableRegionOperation = BaseOperation & {
  type: "table-region";
  label: string;
};

export type EditOperation =
  | TextOperation
  | WhiteoutOperation
  | ImageOperation
  | SignatureOperation
  | StampOperation
  | ShapeOperation
  | InkOperation
  | LinkOperation
  | AnnotationOperation
  | FormMarkOperation
  | FormFieldOperation
  | TableRegionOperation;

/**
 * The kind of an AcroForm field that ALREADY EXISTS in a loaded PDF. Distinct from
 * `FormFieldKind` (which describes NEW overlay fields the user draws on the canvas).
 */
export type AcroFieldType = "text" | "checkbox" | "radio" | "dropdown" | "optionlist";

/**
 * One existing AcroForm field enumerated from a loaded PDF, with its widget position
 * mapped into the page coordinate model. Held in memory so the user can fill it; the
 * entered value is applied back into the PDF on export.
 */
export type FormFieldDescriptor = {
  name: string;
  type: AcroFieldType;
  pageIndex: number;
  rect: PdfRect;
  // Current value(s) read from the field. Text -> the string; dropdown/optionlist/radio
  // -> the selected option(s) joined for display.
  value: string;
  selected: string[];
  options?: string[];
  checked?: boolean;
  readOnly?: boolean;
  multiline?: boolean;
};

/**
 * User-entered values for existing AcroForm fields, keyed by field name. Applied back
 * into the document's AcroForm on export. Strings for text/dropdown/radio; booleans for
 * checkboxes; string arrays for (multi-select) option lists.
 */
export type FormFieldValues = Record<string, string | string[] | boolean>;

export type TextItem = {
  str: string;
  pageIndex: number;
  rect: PdfRect;
  fontName?: string;
  fontKey?: string;
  cssFontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  sampledFontWeight?: number;
  italic?: boolean;
};

/**
 * One embedded font program extracted from the source PDF, keyed for reuse so the
 * editor can render and export replacement text with the document's actual font
 * instead of a bundled substitute. Built per-load and held in memory only.
 */
export type DocumentFontInfo = {
  key: string;
  postScriptName?: string;
  familyName?: string;
  subfamilyName?: string;
  weight?: number;
  italic?: boolean;
  widthClass?: number;
  bytes?: Uint8Array;
  mimetype?: string;
};

export type DocumentFonts = Record<string, DocumentFontInfo>;

export type PageRenderInfo = {
  pageIndex: number;
  width: number;
  height: number;
  scale: number;
};

export type LoadedPdf = {
  name: string;
  bytes: Uint8Array;
  pageCount: number;
  fingerprint?: string;
};

export type EditorDocument = LoadedPdf & {
  textItems: TextItem[];
};

export type ExportFormat = "pdf" | "txt" | "csv" | "xlsx";

export type ViewportRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
