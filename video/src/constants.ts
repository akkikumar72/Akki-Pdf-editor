export const FPS = 30;
export const WIDTH = 1200;
export const HEIGHT = 1200;
export const DURATION_IN_FRAMES = 1140;

export const SCENES = {
  hook: [0, 90],
  toolbar: [90, 180],
  text: [180, 330],
  linksForms: [330, 450],
  whiteoutAnnotate: [450, 570],
  shapesTable: [570, 690],
  sign: [690, 810],
  pages: [810, 930],
  apply: [930, 1050],
  end: [1050, 1140],
} as const;

export const COLORS = {
  paper: "#f8f3df",
  paper2: "#eee6ca",
  paper3: "#ded3ad",
  surface: "#fffdf5",
  ink: "#20271f",
  ink2: "#434c40",
  muted: "#777c6d",
  rule: "#d3c9a9",
  accent: "#49d77a",
  accentDark: "#178f49",
  accentSoft: "#d8f7d9",
  accentWash: "#edfae8",
  sky: "#d5f3ef",
  selection: "#2f9c5e",
  highlight: "rgba(255, 221, 68, 0.58)",
  white: "#ffffff",
} as const;

export type ToolId =
  | "select"
  | "text"
  | "links"
  | "forms"
  | "images"
  | "sign"
  | "whiteout"
  | "annotate"
  | "shapes"
  | "apply"
  | "export";
