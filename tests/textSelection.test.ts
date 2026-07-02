import { describe, expect, it } from "vitest";
import { annotationRectsForClick, annotationRectsForMarquee } from "../src/utils/textSelection";
import type { TextItem } from "../src/types/editor";

function run(x: number, y: number, width = 200, height = 14): TextItem {
  return { str: "run", pageIndex: 0, rect: { x, y, width, height } };
}

describe("annotationRectsForMarquee", () => {
  it("returns one rect per intersected run line, clipped horizontally to the marquee", () => {
    const runs = [run(50, 700), run(50, 680), run(50, 660)];
    const marquee = { x: 100, y: 662, width: 80, height: 50 };
    const rects = annotationRectsForMarquee(marquee, runs);
    expect(rects).toEqual([
      { x: 100, y: 700, width: 80, height: 14 },
      { x: 100, y: 680, width: 80, height: 14 },
      { x: 100, y: 660, width: 80, height: 14 },
    ]);
  });

  it("keeps the run's own bounds when the marquee extends beyond it", () => {
    const rects = annotationRectsForMarquee({ x: 0, y: 690, width: 600, height: 40 }, [run(50, 700)]);
    expect(rects).toEqual([{ x: 50, y: 700, width: 200, height: 14 }]);
  });

  it("returns an empty list when no run is touched", () => {
    expect(annotationRectsForMarquee({ x: 400, y: 100, width: 50, height: 20 }, [run(50, 700)])).toEqual([]);
  });

  it("excludes runs that only align vertically (no horizontal overlap)", () => {
    expect(annotationRectsForMarquee({ x: 300, y: 700, width: 50, height: 14 }, [run(50, 700, 100)])).toEqual([]);
  });

  it("excludes runs that only align horizontally (no vertical overlap)", () => {
    expect(annotationRectsForMarquee({ x: 50, y: 100, width: 200, height: 20 }, [run(50, 700)])).toEqual([]);
  });
});

describe("annotationRectsForClick", () => {
  it("snaps a click inside a run to the whole run rect", () => {
    expect(annotationRectsForClick({ x: 120, y: 705 }, [run(50, 700)])).toEqual([
      { x: 50, y: 700, width: 200, height: 14 },
    ]);
  });

  it("returns an empty list when the click hits no run", () => {
    expect(annotationRectsForClick({ x: 400, y: 100 }, [run(50, 700)])).toEqual([]);
  });
});
