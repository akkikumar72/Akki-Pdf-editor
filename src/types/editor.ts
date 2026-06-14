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

export type TextItem = {
  str: string;
  pageIndex: number;
  rect: PdfRect;
  fontName?: string;
  cssFontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
};

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

export type ExportFormat = "pdf" | "txt" | "csv" | "xlsx" | "png";

export type ViewportRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};
