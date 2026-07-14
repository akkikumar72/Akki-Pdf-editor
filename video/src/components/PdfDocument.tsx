import { Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { COLORS, SCENES } from "../constants";
import { caveat, jakarta } from "../fonts";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export function PdfDocument() {
  const frame = useCurrentFrame();
  const textProgress = interpolate(frame, [205, 275], [0, 1], clamp);
  const typedLength = Math.floor(textProgress * "Northstar Studio".length);
  const linkProgress = interpolate(frame, [340, 378], [0, 1], clamp);
  const formProgress = interpolate(frame, [402, 438], [0, 1], clamp);
  const whiteoutProgress = interpolate(frame, [466, 500], [0, 1], clamp);
  const highlightProgress = interpolate(frame, [520, 554], [0, 1], clamp);
  const shapeProgress = interpolate(frame, [584, 620], [0, 1], clamp);
  const tableProgress = interpolate(frame, [640, 678], [0, 1], clamp);
  const signatureProgress = interpolate(frame, [752, 794], [0, 1], clamp);
  const applied = frame >= SCENES.apply[0] + 20;

  return (
    <div
      style={{
        position: "relative",
        width: 486,
        height: 629,
        background: COLORS.white,
        boxShadow: "0 28px 75px -36px rgba(35, 39, 31, 0.52)",
        border: `1px solid ${COLORS.rule}`,
        overflow: "hidden",
      }}
    >
      <Img
        src={staticFile("assets/sample-invoice-page.png")}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />

      {frame >= 205 ? (
        <div
          style={{
            position: "absolute",
            left: 49,
            top: 119,
            width: 207,
            height: 24,
            background: COLORS.white,
            border: frame < 300 ? `2px solid ${COLORS.selection}` : "2px solid transparent",
            boxShadow: frame < 300 ? "0 0 0 3px rgba(73, 215, 122, 0.16)" : "none",
            fontFamily: "Arial, sans-serif",
            fontSize: 9.5,
            display: "flex",
            alignItems: "center",
            paddingLeft: 2,
            color: "#161a20",
          }}
        >
          Bill to: {"Northstar Studio".slice(0, typedLength)}
          {frame < 290 ? (
            <span
              style={{
                width: 1,
                height: 13,
                background: COLORS.ink,
                marginLeft: 1,
                opacity: frame % 16 < 8 ? 1 : 0,
              }}
            />
          ) : null}
        </div>
      ) : null}

      {frame >= 340 ? (
        <div
          style={{
            position: "absolute",
            left: 49,
            top: 146,
            opacity: linkProgress,
            transform: `translateY(${(1 - linkProgress) * 8}px)`,
            color: "#1164c0",
            fontFamily: jakarta,
            fontSize: 9,
            fontWeight: 700,
            textDecoration: "underline",
            textUnderlineOffset: 2,
          }}
        >
          View payment terms ↗
        </div>
      ) : null}

      {frame >= 402 ? (
        <div
          style={{
            position: "absolute",
            left: 49,
            top: 350,
            width: 185,
            opacity: formProgress,
            transform: `scale(${0.96 + formProgress * 0.04})`,
            transformOrigin: "left center",
          }}
        >
          <div style={{ fontFamily: jakarta, fontSize: 7, fontWeight: 800, color: COLORS.ink2, marginBottom: 4 }}>
            APPROVED BY
          </div>
          <div
            style={{
              height: 29,
              border: `2px solid ${COLORS.accentDark}`,
              borderRadius: 5,
              background: COLORS.white,
              boxShadow: "0 0 0 3px rgba(73, 215, 122, 0.11)",
            }}
          />
        </div>
      ) : null}

      {frame >= 466 ? (
        <div
          style={{
            position: "absolute",
            left: 49,
            top: 104,
            width: 142 * whiteoutProgress,
            height: 13,
            background: COLORS.white,
            border: frame < 510 ? `1px dashed ${COLORS.accentDark}` : "1px solid transparent",
            boxSizing: "border-box",
          }}
        />
      ) : null}

      {frame >= 520 ? (
        <div
          style={{
            position: "absolute",
            left: 50,
            top: 177,
            height: 16,
            width: 205 * highlightProgress,
            background: COLORS.highlight,
            mixBlendMode: "multiply",
            transform: "rotate(-0.5deg)",
            borderRadius: 3,
          }}
        />
      ) : null}

      {frame >= 584 ? (
        <div
          style={{
            position: "absolute",
            left: 48,
            top: 224,
            width: 177 * shapeProgress,
            height: 42 * shapeProgress,
            border: `3px solid ${COLORS.accentDark}`,
            borderRadius: 9,
            opacity: shapeProgress,
            boxShadow: "0 0 0 4px rgba(73, 215, 122, 0.13)",
          }}
        />
      ) : null}

      {frame >= 640 ? (
        <div
          style={{
            position: "absolute",
            left: 47,
            top: 168,
            width: 260,
            height: 62,
            opacity: frame < 690 ? tableProgress : 0.42,
            transform: `scale(${0.97 + tableProgress * 0.03})`,
            transformOrigin: "left top",
            border: `2px dashed ${COLORS.accentDark}`,
            backgroundImage: `linear-gradient(90deg, transparent 33%, ${COLORS.accentDark} 33%, ${COLORS.accentDark} 33.5%, transparent 33.5%, transparent 66%, ${COLORS.accentDark} 66%, ${COLORS.accentDark} 66.5%, transparent 66.5%), linear-gradient(transparent 50%, ${COLORS.accentDark} 50%, ${COLORS.accentDark} 51%, transparent 51%)`,
          }}
        />
      ) : null}

      {frame >= 752 ? (
        <div
          style={{
            position: "absolute",
            right: 58,
            bottom: 83,
            width: 170,
            height: 64,
            transform: `rotate(-4deg) scale(${0.88 + signatureProgress * 0.12})`,
            opacity: signatureProgress,
            transformOrigin: "center",
          }}
        >
          <svg width="170" height="64" viewBox="0 0 170 64" style={{ overflow: "visible" }}>
            <path
              d="M6 48 C 29 17, 42 17, 52 40 C 58 52, 66 49, 73 30 C 78 18, 83 19, 86 36 C 90 51, 98 52, 105 34 C 110 23, 118 25, 120 38 C 123 51, 137 50, 161 34"
              fill="none"
              stroke="#155f39"
              strokeWidth="3.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={1 - signatureProgress}
            />
          </svg>
          <div
            style={{
              position: "absolute",
              left: 19,
              top: 19,
              fontFamily: caveat,
              fontWeight: 600,
              fontSize: 25,
              color: "#155f39",
              opacity: interpolate(signatureProgress, [0.62, 1], [0, 1], clamp),
              whiteSpace: "nowrap",
            }}
          >
            Akash Pathak
          </div>
        </div>
      ) : null}

      {applied ? (
        <div
          style={{
            position: "absolute",
            right: 16,
            top: 16,
            display: "flex",
            alignItems: "center",
            gap: 7,
            padding: "7px 10px",
            borderRadius: 999,
            background: COLORS.accentWash,
            color: COLORS.accentDark,
            border: `1px solid ${COLORS.accent}`,
            fontFamily: jakarta,
            fontWeight: 800,
            fontSize: 9,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: COLORS.accentDark }} />
          Locally saved
        </div>
      ) : null}

      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 13,
          textAlign: "center",
          fontFamily: jakarta,
          fontSize: 8,
          color: "#666",
        }}
      >
        1
      </div>
    </div>
  );
}
