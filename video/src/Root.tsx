import { Composition } from "remotion";
import { AkkiShowcase } from "./AkkiShowcase";
import { AkkiShowcasePoster } from "./AkkiShowcasePoster";
import { DURATION_IN_FRAMES, FPS, HEIGHT, WIDTH } from "./constants";

export function RemotionRoot() {
  return (
    <>
      <Composition
        id="AkkiShowcase"
        component={AkkiShowcase}
        durationInFrames={DURATION_IN_FRAMES}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
      <Composition
        id="AkkiShowcasePoster"
        component={AkkiShowcasePoster}
        durationInFrames={1}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
}
