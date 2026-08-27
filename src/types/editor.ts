export type EditorTool =
  | "select"
  | "crop"
  | "text"
  | "whiteout"
  | "redact"
  | "redact-area"
  | "erase"
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
  | "form-listbox"
  | "form-radio"
  | "form-checkbox"
  | "form-button"
  | "form-date"
  | "form-signature"
  | "mark-check"
  | "mark-cross"
  | "annotate-text"
  | "callout"
  | "strikeout"
  | "underline"
  | "highlight"
  | "freehand-highlight"
  | "draw";

export type TextAlign = "left" | "center" | "right";
export type ShapeKind = "rectangle" | "ellipse" | "line" | "arrow";
export type FormFieldKind =
  | "text"
  | "multiline"
  | "dropdown"
  | "listbox"
  | "radio"
  | "checkbox"
  | "button"
  | "date"
  | "signature";
export type AnnotationKind =
  | "note"
  | "callout"
  | "strikeout"
  | "underline"
  | "highlight"
  | "freehand-highlight"
  | "draw";
export type FormBorderStyle = "solid" | "dashed" | "underline";
export type FormRotation = 0 | 90 | 180 | 270;

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

/**
 * A deliberate redaction overlay. This is kept distinct from whiteout so the
 * UI, eraser, history, and PDF writer can preserve redaction-specific intent.
 */
export type RedactionOperation = BaseOperation & {
  type: "redaction";
  mode: "text" | "area";
  fillColor: string;
  borderColor?: string;
  borderWidth?: number;
  overlayText?: string;
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
  // Optional second line ("By <author> at <date>"); `label` stays the subject so
  // stamps in previously saved sessions keep rendering unchanged.
  subline?: string;
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

/**
 * Where a link operation points (Sejda parity: external URL, email, phone,
 * internal page). `email`/`phone` store the full scheme-qualified href
 * (`mailto:…`/`tel:…`) so the writer and overlay never re-derive it.
 */
export type LinkTarget =
  | { kind: "url"; href: string }
  | { kind: "email"; href: string }
  | { kind: "phone"; href: string }
  | { kind: "page"; pageIndex: number };

export type LinkOperation = BaseOperation & {
  type: "link";
  target: LinkTarget;
  /** True when this op mirrors a /Link annotation read from the source PDF. */
  imported?: boolean;
  /** PDF.js annotation id (e.g. "13R") of the mirrored source annotation. */
  annotationRef?: string;
};

/** A /Link annotation read from the source PDF during text extraction. */
export type ImportedLinkAnnotation = {
  pageIndex: number;
  rect: PdfRect;
  target: LinkTarget;
  annotationRef?: string;
};

export type AnnotationOperation = BaseOperation & {
  type: "annotation";
  kind: AnnotationKind;
  color: string;
  text?: string;
  strokeWidth?: number;
  fontSize?: number;
  fillColor?: string;
  textColor?: string;
  /** Callout leader endpoint in page PDF coordinates. */
  anchor?: PdfPoint;
  /** Optional bend point for a two-segment callout leader. */
  elbow?: PdfPoint;
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
  defaultValue?: string;
  options?: string[];
  selectedValues?: string[];
  checked?: boolean;
  required?: boolean;
  readOnly?: boolean;
  tooltip?: string;
  exportValue?: string;
  groupName?: string;
  allowCustomText?: boolean;
  multiSelect?: boolean;
  buttonLabel?: string;
  buttonAction?: "none" | "reset" | "print";
  dateFormat?: "yyyy-MM-dd" | "MM/dd/yyyy" | "dd/MM/yyyy";
  fillColor?: string;
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: FormBorderStyle;
  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  align?: TextAlign;
  rotation?: FormRotation;
};

export type EditOperation =
  | TextOperation
  | WhiteoutOperation
  | RedactionOperation
  | ImageOperation
  | SignatureOperation
  | StampOperation
  | ShapeOperation
  | InkOperation
  | LinkOperation
  | AnnotationOperation
  | FormMarkOperation
  | FormFieldOperation;

/** Replaces one operation with zero or more derived operations in one history entry. */
export type OperationReplacement = {
  id: string;
  operations: EditOperation[];
};

/**
 * A patch valid for at least one operation variant — no casts at call sites.
 * Identity fields (`id`, `type`) are omitted so updates cannot re-discriminate
 * or re-key an existing operation.
 */
export type EditOperationPatch = {
  [K in EditOperation["type"]]: Partial<Omit<Extract<EditOperation, { type: K }>, "id" | "type">>;
}[EditOperation["type"]];

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
