import { describe, expect, it } from "vitest";
import {
  eraseStrokeByPath,
  eraseStrokeByPreparedPath,
  prepareStrokeEraserPath,
  strokeIntersectsEraser,
  strokeIntersectsPreparedEraser,
  type StrokePoint,
} from "../src/editor/strokeEraser";

const options = { strokeWidth: 10, eraserRadius: 10 };

function expectPoint(point: StrokePoint, x: number, y: number) {
  expect(point.x).toBeCloseTo(x, 8);
  expect(point.y).toBeCloseTo(y, 8);
}

describe("stroke eraser geometry", () => {
  it("handles empty ink and eraser paths without manufacturing geometry", () => {
    const ink = [{ x: 0, y: 0 }, { x: 10, y: 0 }];
    const prepared = prepareStrokeEraserPath([{ x: 0, y: 0 }], options);

    expect(strokeIntersectsEraser([], [{ x: 0, y: 0 }], options)).toBe(false);
    expect(strokeIntersectsEraser(ink, [], options)).toBe(false);
    expect(strokeIntersectsPreparedEraser([], prepared)).toBe(false);
    expect(eraseStrokeByPath([], [{ x: 0, y: 0 }], options)).toEqual({ didErase: false, fragments: [] });
    expect(eraseStrokeByPreparedPath([], prepared)).toEqual({ didErase: false, fragments: [] });

    const unchanged = eraseStrokeByPath(ink, [], options);
    expect(unchanged).toEqual({ didErase: false, fragments: [ink] });
    expect(unchanged.fragments[0]).not.toBe(ink);
    expect(() => prepareStrokeEraserPath([], options)).toThrow(RangeError);
  });

  it("computes bounds for descending and expanding paths", () => {
    const ink = [
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 20, y: 10 },
    ];

    expect(strokeIntersectsEraser(ink, [{ x: 100, y: 100 }], {
      strokeWidth: 0,
      eraserRadius: 1,
    })).toBe(false);
  });

  it("returns an unchanged copy when the paths do not intersect", () => {
    const ink = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];
    const result = eraseStrokeByPath(ink, [{ x: 0, y: 16 }], options);

    expect(result).toEqual({ didErase: false, fragments: [ink] });
    expect(result.fragments[0]).not.toBe(ink);
    expect(result.fragments[0][0]).not.toBe(ink[0]);
    expect(strokeIntersectsEraser(ink, [{ x: 0, y: 16 }], options)).toBe(false);
  });

  it("splits a long sparse ink segment at exact swept-path boundaries", () => {
    const ink = [
      { x: 0, y: 0 },
      { x: 1_000, y: 0 },
    ];
    const eraser = [
      { x: 500, y: -100 },
      { x: 500, y: 100 },
    ];
    const result = eraseStrokeByPath(ink, eraser, options);

    expect(result.didErase).toBe(true);
    expect(result.fragments).toHaveLength(2);
    expectPoint(result.fragments[0][0], 0, 0);
    expectPoint(result.fragments[0][1], 485, 0);
    expectPoint(result.fragments[1][0], 515, 0);
    expectPoint(result.fragments[1][1], 1_000, 0);
    expect(strokeIntersectsEraser(ink, eraser, options)).toBe(true);
  });

  it("treats a one-point eraser path as a circular tap", () => {
    const result = eraseStrokeByPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [{ x: 50, y: 0 }],
      options,
    );

    expect(result.fragments).toHaveLength(2);
    expectPoint(result.fragments[0][1], 35, 0);
    expectPoint(result.fragments[1][0], 65, 0);
  });

  it("erases an ink tap when the round caps touch", () => {
    const inkTap = [{ x: 0, y: 0 }];
    const touchingEraser = [{ x: 5, y: 0 }];
    const tapOptions = { strokeWidth: 4, eraserRadius: 3 };

    expect(strokeIntersectsEraser(inkTap, touchingEraser, tapOptions)).toBe(true);
    expect(eraseStrokeByPath(inkTap, touchingEraser, tapOptions)).toEqual({
      didErase: true,
      fragments: [],
    });
    expect(strokeIntersectsEraser(inkTap, [{ x: 5.01, y: 0 }], tapOptions)).toBe(false);
  });

  it("measures a one-point ink stroke against non-degenerate eraser segments", () => {
    const point = [{ x: 0, y: 0 }];
    const crossing = [{ x: -2, y: 0 }, { x: 2, y: 0 }];
    const nearbyButClear = [{ x: 1, y: 1 }, { x: 2, y: 2 }];
    const tapOptions = { strokeWidth: 0, eraserRadius: 1 };

    expect(strokeIntersectsEraser(point, crossing, tapOptions)).toBe(true);
    expect(strokeIntersectsEraser(point, nearbyButClear, tapOptions)).toBe(false);
    expect(eraseStrokeByPath(point, nearbyButClear, tapOptions)).toEqual({
      didErase: false,
      fragments: [[{ x: 0, y: 0 }]],
    });
  });

  it("clips cleanly at the start and end of an ink stroke", () => {
    const ink = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const atStart = eraseStrokeByPath(ink, [{ x: 0, y: 0 }], options);
    const atEnd = eraseStrokeByPath(ink, [{ x: 100, y: 0 }], options);

    expect(atStart.fragments).toHaveLength(1);
    expectPoint(atStart.fragments[0][0], 15, 0);
    expectPoint(atStart.fragments[0][1], 100, 0);
    expect(atEnd.fragments).toHaveLength(1);
    expectPoint(atEnd.fragments[0][0], 0, 0);
    expectPoint(atEnd.fragments[0][1], 85, 0);
  });

  it("preserves original vertices around an erased middle section", () => {
    const result = eraseStrokeByPath(
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 60, y: 20 },
        { x: 100, y: 20 },
      ],
      [{ x: 50, y: 10 }],
      { strokeWidth: 0, eraserRadius: 5 },
    );

    expect(result.fragments).toHaveLength(2);
    expect(result.fragments[0][0]).toEqual({ x: 0, y: 0 });
    expect(result.fragments[0]).toContainEqual({ x: 40, y: 0 });
    expect(result.fragments[1]).toContainEqual({ x: 60, y: 20 });
    expect(result.fragments[1].at(-1)).toEqual({ x: 100, y: 20 });
  });

  it("unions overlapping eraser segments instead of producing tiny fragments", () => {
    const result = eraseStrokeByPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      [
        { x: 35, y: 0 },
        { x: 50, y: 0 },
        { x: 65, y: 0 },
      ],
      { strokeWidth: 0, eraserRadius: 10 },
    );

    expect(result.fragments).toHaveLength(2);
    expectPoint(result.fragments[0][1], 25, 0);
    expectPoint(result.fragments[1][0], 75, 0);
  });

  it("keeps separate retained fragments between disjoint swept intersections", () => {
    const result = eraseStrokeByPath(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      [
        { x: 20, y: -10 },
        { x: 20, y: 10 },
        { x: 80, y: 10 },
        { x: 80, y: -10 },
      ],
      { strokeWidth: 0, eraserRadius: 5 },
    );

    expect(result.didErase).toBe(true);
    expect(result.fragments).toHaveLength(3);
    expectPoint(result.fragments[0].at(-1)!, 15, 0);
    expectPoint(result.fragments[1][0], 25, 0);
    expectPoint(result.fragments[1].at(-1)!, 75, 0);
    expectPoint(result.fragments[2][0], 85, 0);
  });

  it("fully erases a stroke covered by the swept path", () => {
    expect(eraseStrokeByPath(
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      { strokeWidth: 0, eraserRadius: 1 },
    )).toEqual({ didErase: true, fragments: [] });
  });

  it("handles an exact tangent as an intersection", () => {
    const ink = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const eraser = [{ x: 50, y: 15 }];

    expect(strokeIntersectsEraser(ink, eraser, options)).toBe(true);
    expect(eraseStrokeByPath(ink, eraser, options).fragments).toHaveLength(2);
  });

  it("rejects invalid physical dimensions", () => {
    expect(() =>
      strokeIntersectsEraser([{ x: 0, y: 0 }], [{ x: 0, y: 0 }], {
        strokeWidth: -1,
        eraserRadius: 1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      eraseStrokeByPath([{ x: 0, y: 0 }], [{ x: 0, y: 0 }], {
        strokeWidth: 1,
        eraserRadius: Number.NaN,
      }),
    ).toThrow(RangeError);
  });

  it("spatially indexes a 4096-by-4096 worst-case path pair", () => {
    const pointCount = 4_096;
    const ink = new Array<StrokePoint>(pointCount);
    const eraser = new Array<StrokePoint>(pointCount);
    for (let index = 0; index < pointCount; index += 1) {
      // Both paths have globally overlapping bounds, which defeats the old
      // whole-path fast rejection. Almost every segment is locally far apart,
      // while the final diagonals cross, so the result still exercises erasing.
      ink[index] = { x: index, y: index === pointCount - 1 ? 100 : 0 };
      eraser[index] = { x: index, y: index === pointCount - 1 ? 0 : 100 };
    }
    const diagnostics = { indexNodeVisits: 0, candidateSegmentChecks: 0 };

    const result = eraseStrokeByPath(ink, eraser, {
      strokeWidth: 0,
      eraserRadius: 0.25,
      diagnostics,
    });

    expect(result.didErase).toBe(true);
    // A nested scan would perform about 16.7 million segment checks. These
    // deterministic counters keep the regression independent of machine load.
    expect(diagnostics.candidateSegmentChecks).toBeLessThan(pointCount * 4);
    expect(diagnostics.indexNodeVisits).toBeLessThan(pointCount * 32);
  });

  it("prepares one spatial index for many independently erased strokes", () => {
    const segmentCount = 4_096;
    const strokeCount = 100;
    const eraser = Array.from({ length: segmentCount + 1 }, (_, index) => ({
      x: 0,
      y: index * 2,
    }));
    const diagnostics = { indexNodeVisits: 0, candidateSegmentChecks: 0, indexBuilds: 0 };
    const prepared = prepareStrokeEraserPath(eraser, {
      strokeWidth: 0,
      eraserRadius: 0.5,
      diagnostics,
    });

    for (let index = 0; index < strokeCount; index += 1) {
      const y = index * 20 + 1;
      const result = eraseStrokeByPreparedPath(
        [{ x: -10, y }, { x: 10, y }],
        prepared,
      );
      expect(result.didErase).toBe(true);
    }

    expect(diagnostics.indexBuilds).toBe(1);
    expect(diagnostics.candidateSegmentChecks).toBeLessThan(strokeCount * 32);
    expect(diagnostics.indexNodeVisits).toBeLessThan(strokeCount * 64);
  });

  it("indexes a vertically distributed zigzag on the Y axis", () => {
    const eraser = Array.from({ length: 12 }, (_, index) => ({
      x: index % 2 === 0 ? -index : index,
      y: index * 10,
    }));
    const diagnostics = { indexNodeVisits: 99, candidateSegmentChecks: 99 };

    expect(strokeIntersectsEraser(
      [{ x: -20, y: 55 }, { x: 20, y: 55 }],
      eraser,
      { strokeWidth: 0, eraserRadius: 0.5, diagnostics },
    )).toBe(true);
    expect(diagnostics.indexNodeVisits).toBeGreaterThan(0);
    expect(diagnostics.candidateSegmentChecks).toBeGreaterThan(0);
  });

  it("processes a 100k-point ink path iteratively", () => {
    const ink = new Array<StrokePoint>(100_000);
    for (let index = 0; index < ink.length; index += 1) ink[index] = { x: index, y: 0 };

    const diagnostics = { indexNodeVisits: 0, candidateSegmentChecks: 0 };
    const result = eraseStrokeByPath(ink, [{ x: 50_000, y: 0 }], {
      strokeWidth: 4,
      eraserRadius: 8,
      diagnostics,
    });

    expect(result.didErase).toBe(true);
    expect(result.fragments).toHaveLength(2);
    expect(result.fragments[0].length + result.fragments[1].length).toBeLessThanOrEqual(100_002);
    expectPoint(result.fragments[0].at(-1)!, 49_990, 0);
    expectPoint(result.fragments[1][0], 50_010, 0);
    expect(diagnostics.indexNodeVisits).toBeLessThan(100);
    expect(diagnostics.candidateSegmentChecks).toBeLessThan(100);
  });
});
