import { AbsoluteFill, Audio, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { EditorWorkspace } from "./components/EditorWorkspace";
import { COLORS, SCENES, type ToolId } from "./constants";
import { jakarta } from "./fonts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

const TOOL_SWEEP: ToolId[] = [
  "select",
  "text",
  "links",
  "forms",
  "images",
  "sign",
  "whiteout",
  "annotate",
  "shapes",
  "table",
];

function activeToolForFrame(frame: number): ToolId {
  if (frame < SCENES.toolbar[0]) return "select";
  if (frame < SCENES.text[0]) {
    const index = Math.min(TOOL_SWEEP.length - 1, Math.floor((frame - SCENES.toolbar[0]) / 9));
    return TOOL_SWEEP[index];
  }
  if (frame < SCENES.linksForms[0]) return "text";
  if (frame < 390) return "links";
  if (frame < SCENES.whiteoutAnnotate[0]) return "forms";
  if (frame < 510) return "whiteout";
  if (frame < SCENES.shapesTable[0]) return "annotate";
  if (frame < 630) return "shapes";
  if (frame < SCENES.sign[0]) return "table";
  if (frame < SCENES.pages[0]) return "sign";
  if (frame < SCENES.apply[0]) return "select";
  if (frame < 990) return "apply";
  return "export";
}

type CaptionSegment = {
  start: number;
  end: number;
  eyebrow: string;
  line: string;
};

const CAPTIONS: CaptionSegment[] = [
  { start: 0, end: 90, eyebrow: "LOCAL, BY DEFAULT", line: "Your PDF never leaves your browser." },
  { start: 90, end: 180, eyebrow: "ONE COMPLETE TOOLKIT", line: "Every edit, right where you need it." },
  { start: 180, end: 330, eyebrow: "REPLACE TEXT", line: "Change the words. Match the font." },
  { start: 330, end: 450, eyebrow: "LINKS + FORMS", line: "Make documents interactive." },
  { start: 450, end: 570, eyebrow: "WHITEOUT + ANNOTATE", line: "Remove noise. Mark what matters." },
  { start: 570, end: 690, eyebrow: "SHAPES + TABLES", line: "Structure information visually." },
  { start: 690, end: 810, eyebrow: "SIGN NATURALLY", line: "Draw once. Keep it in this browser." },
  { start: 810, end: 930, eyebrow: "MANAGE PAGES", line: "Add a page. Remove a page." },
  { start: 930, end: 1050, eyebrow: "APPLY + EXPORT", line: "Locally saved. Ready anywhere." },
  { start: 1050, end: 1140, eyebrow: "AKKIPDF", line: "Edit locally. Export cleanly." },
];

function Caption() {
  const frame = useCurrentFrame();
  const segment = CAPTIONS.find(({ start, end }) => frame >= start && frame < end) ?? CAPTIONS.at(-1)!;
  const local = frame - segment.start;
  const duration = segment.end - segment.start;
  const isOpening = segment.start === SCENES.hook[0];
  const isEnd = segment.start === SCENES.end[0];
  const opacity = isOpening
    ? interpolate(local, [0, 40, 50, duration - 12, duration - 1], [0, 0, 1, 1, 0], clamp)
    : isEnd
      ? interpolate(local, [0, 10, duration - 1], [0, 1, 1], clamp)
      : interpolate(local, [0, 10, duration - 12, duration - 1], [0, 1, 1, 0], clamp);
  const y = interpolate(local, isOpening ? [38, 53] : [0, 15], [18, 0], clamp);

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        bottom: isEnd ? 402 : 46,
        transform: `translate(-50%, ${y}px)`,
        width: isEnd ? 650 : 620,
        padding: isEnd ? "24px 32px" : "15px 22px",
        borderRadius: isEnd ? 22 : 16,
        background: isEnd ? "rgba(31, 39, 31, 0.94)" : "rgba(31, 39, 31, 0.9)",
        boxShadow: "0 18px 50px -26px rgba(0, 0, 0, 0.7)",
        color: COLORS.white,
        opacity,
        textAlign: "center",
        backdropFilter: "blur(18px)",
        zIndex: 30,
      }}
    >
      <div
        style={{
          fontFamily: jakarta,
          color: COLORS.accent,
          fontSize: isEnd ? 16 : 11,
          fontWeight: 800,
          letterSpacing: "0.13em",
          marginBottom: isEnd ? 7 : 5,
        }}
      >
        {segment.eyebrow}
      </div>
      <div
        style={{
          fontFamily: jakarta,
          fontSize: isEnd ? 40 : 25,
          lineHeight: 1.15,
          fontWeight: 800,
          letterSpacing: "-0.035em",
          wordSpacing: "0.12em",
        }}
      >
        {segment.line}
      </div>
    </div>
  );
}

function OpeningVeil() {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 8, 46, 66], [1, 1, 0.84, 0], clamp);
  const reveal = interpolate(frame, [20, 64], [0, 1], clamp);
  if (frame > 68) return null;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 44%, ${COLORS.accentSoft} 0%, ${COLORS.paper} 52%, ${COLORS.paper2} 100%)`,
        opacity,
        zIndex: 26,
        clipPath: `inset(0 0 ${reveal * 100}% 0)`,
      }}
    />
  );
}

export function AkkiShowcase() {
  const frame = useCurrentFrame();
  const activeTool = activeToolForFrame(frame);
  const endDim = interpolate(frame, [SCENES.end[0], SCENES.end[0] + 28], [0, 0.32], clamp);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 20%, ${COLORS.surface}, ${COLORS.paper2})`,
        fontFamily: jakarta,
      }}
    >
      <Audio src={staticFile("audio/akki-bed.wav")} volume={0.82} />
      <EditorWorkspace activeTool={activeTool} />
      <OpeningVeil />
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: COLORS.ink,
          opacity: endDim,
          pointerEvents: "none",
          zIndex: 20,
        }}
      />
      <Caption />
      {frame < 30 ? (
        <Img
          src={staticFile("akki-pdf-showcase-poster.png")}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 50 }}
        />
      ) : null}
    </AbsoluteFill>
  );
}
