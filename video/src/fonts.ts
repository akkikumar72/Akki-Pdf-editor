import { loadFont as loadCaveat } from "@remotion/google-fonts/Caveat";
import { loadFont as loadPlusJakartaSans } from "@remotion/google-fonts/PlusJakartaSans";

export const { fontFamily: jakarta } = loadPlusJakartaSans("normal", {
  weights: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

export const { fontFamily: caveat } = loadCaveat("normal", {
  weights: ["500", "600", "700"],
  subsets: ["latin"],
});
