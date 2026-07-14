import { AbsoluteFill, Sequence } from "remotion";
import { EditorWorkspace } from "./components/EditorWorkspace";
import { COLORS } from "./constants";
import { jakarta } from "./fonts";

const featurePills = ["Replace text", "Sign", "Annotate", "Export"];

export function AkkiShowcasePoster() {
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        background: `radial-gradient(circle at 50% 18%, ${COLORS.surface}, ${COLORS.paper2})`,
        fontFamily: jakarta,
      }}
    >
      <Sequence from={-1010}>
        <EditorWorkspace activeTool="export" />
      </Sequence>

      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "linear-gradient(180deg, transparent 0%, transparent 55%, rgba(22, 29, 23, 0.12) 66%, rgba(22, 29, 23, 0.96) 82%, #161d17 100%)",
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 62,
          right: 62,
          bottom: 58,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 36,
        }}
      >
        <div style={{ maxWidth: 720 }}>
          <div
            style={{
              color: COLORS.accent,
              fontSize: 17,
              lineHeight: 1,
              fontWeight: 800,
              letterSpacing: "0.13em",
              marginBottom: 14,
            }}
          >
            AKKIPDF · LOCAL-FIRST PDF EDITOR
          </div>
          <div
            style={{
              color: COLORS.white,
              fontSize: 62,
              lineHeight: 0.98,
              fontWeight: 800,
              letterSpacing: "-0.055em",
            }}
          >
            Edit PDFs.
            <br />
            Keep them private.
          </div>
          <div
            style={{
              color: "rgba(255, 255, 255, 0.76)",
              fontSize: 20,
              lineHeight: 1.35,
              fontWeight: 600,
              marginTop: 17,
              letterSpacing: "-0.018em",
            }}
          >
            Everything happens locally in your browser.
          </div>
        </div>

        <div
          style={{
            width: 260,
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "flex-end",
            gap: 9,
            paddingBottom: 4,
          }}
        >
          {featurePills.map((feature) => (
            <div
              key={feature}
              style={{
                padding: "10px 13px",
                borderRadius: 999,
                color: feature === "Export" ? "#10351f" : COLORS.white,
                background: feature === "Export" ? COLORS.accent : "rgba(255, 255, 255, 0.1)",
                border: `1px solid ${feature === "Export" ? COLORS.accent : "rgba(255, 255, 255, 0.18)"}`,
                fontSize: 13,
                fontWeight: 700,
                backdropFilter: "blur(14px)",
              }}
            >
              {feature}
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
}
