import type { CSSProperties } from "react";

type AuroraBackgroundProps = {
  amplitude?: number;
  blend?: number;
  colorStops?: [string, string, string];
  speed?: number;
};

export function AuroraBackground({
  amplitude = 1,
  blend = 0.58,
  colorStops = ["var(--color-accent)", "var(--color-sky)", "var(--color-ink)"],
  speed = 18,
}: AuroraBackgroundProps) {
  const style = {
    "--aurora-amplitude": amplitude,
    "--aurora-blend": blend,
    "--aurora-color-a": colorStops[0],
    "--aurora-color-b": colorStops[1],
    "--aurora-color-c": colorStops[2],
    "--aurora-speed": `${speed}s`,
  } as CSSProperties;

  return (
    <div className="aurora-bg" style={style} aria-hidden="true">
      <span className="aurora-bg__band aurora-bg__band--one" />
      <span className="aurora-bg__band aurora-bg__band--two" />
      <span className="aurora-bg__band aurora-bg__band--three" />
      <span className="aurora-bg__grain" />
    </div>
  );
}
