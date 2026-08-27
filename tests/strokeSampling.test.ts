import { describe, expect, it } from "vitest";
import { simplifyStroke, StrokeSampler } from "../src/editor/strokeSampling";

describe("stroke sampling", () => {
  it("collapses a dense straight stroke while preserving exact endpoints", () => {
    const sampler = new StrokeSampler({ x: 0, y: 10 });
    for (let index = 1; index <= 100_000; index += 1) {
      sampler.add({ x: index, y: 10 });
    }

    expect(sampler.points).toEqual([
      { x: 0, y: 10 },
      { x: 100_000, y: 10 },
    ]);
    expect(sampler.finish()).toEqual(sampler.points);
  });

  it("retains hard corners and the release endpoint", () => {
    const sampler = new StrokeSampler({ x: 0, y: 0 }, { minDistance: 0 });
    for (let x = 1; x <= 100; x += 1) sampler.add({ x, y: 0 });
    for (let y = 1; y < 100; y += 1) sampler.add({ x: 100, y });

    expect(sampler.finish({ x: 100, y: 100 })).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ]);
  });

  it("collapses duplicate points without dividing by a zero-length segment", () => {
    expect(simplifyStroke([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ])).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);

    expect(simplifyStroke([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 0 },
    ])).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });

  it("retains a full reversal as a hard corner", () => {
    expect(simplifyStroke([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ])).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
    ]);
  });

  it("simplifies the same large path deterministically", () => {
    const path = Array.from({ length: 20_000 }, (_, index) => ({
      x: index,
      y: Math.floor(index / 250) % 2 === 0 ? 0 : 30,
    }));

    const first = simplifyStroke(path);
    const second = simplifyStroke(path);
    expect(second).toEqual(first);
    expect(first.length).toBeLessThan(path.length / 10);
    expect(first[0]).toEqual(path[0]);
    expect(first.at(-1)).toEqual(path.at(-1));
  });

  it("caps a 100k-point zigzag deterministically while preserving both endpoints", () => {
    const path = Array.from({ length: 100_000 }, (_, index) => ({
      x: index,
      y: index % 2 === 0 ? -20 : 20,
    }));

    const first = simplifyStroke(path);
    const second = simplifyStroke(path);

    expect(first).toHaveLength(4_096);
    expect(second).toEqual(first);
    expect(first[0]).toEqual(path[0]);
    expect(first.at(-1)).toEqual(path.at(-1));
  });

  it("bounds the live preview for a 100k-point zigzag before capping the committed stroke", () => {
    const sampler = new StrokeSampler({ x: 0, y: -20 }, { minDistance: 0 });
    for (let index = 1; index < 100_000; index += 1) {
      sampler.add({ x: index, y: index % 2 === 0 ? -20 : 20 });
    }

    expect(sampler.points.length).toBeLessThanOrEqual(8_192);
    const committed = sampler.finish();
    expect(committed.length).toBeLessThanOrEqual(4_096);
    expect(committed[0]).toEqual({ x: 0, y: -20 });
    expect(committed.at(-1)).toEqual({ x: 99_999, y: 20 });
  });
});
