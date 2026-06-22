import { afterEach, describe, expect, it, vi } from "vitest";
import { caretRangeFromClientPoint, getLastPointerDownPoint } from "../src/utils/caret";

describe("module-level window guard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("does not register a pointerdown listener when window is undefined", async () => {
    vi.resetModules();
    vi.stubGlobal("window", undefined);
    // Re-import with window undefined so the module-level guard's false branch runs.
    const mod = await import("../src/utils/caret");
    expect(mod.getLastPointerDownPoint()).toBeNull();
  });
});

type CaretDoc = {
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
};

describe("getLastPointerDownPoint", () => {
  it("records the most recent pointerdown viewport coordinates", () => {
    const event = new MouseEvent("pointerdown", { clientX: 123, clientY: 456 });
    window.dispatchEvent(event);
    expect(getLastPointerDownPoint()).toEqual({ x: 123, y: 456 });

    const next = new MouseEvent("pointerdown", { clientX: 7, clientY: 8 });
    window.dispatchEvent(next);
    expect(getLastPointerDownPoint()).toEqual({ x: 7, y: 8 });
  });
});

describe("caretRangeFromClientPoint", () => {
  const doc = document as unknown as CaretDoc;
  const hadRange = "caretRangeFromPoint" in doc;
  const hadPosition = "caretPositionFromPoint" in doc;
  const originalRange = doc.caretRangeFromPoint;
  const originalPosition = doc.caretPositionFromPoint;

  afterEach(() => {
    if (hadRange) doc.caretRangeFromPoint = originalRange;
    else delete doc.caretRangeFromPoint;
    if (hadPosition) doc.caretPositionFromPoint = originalPosition;
    else delete doc.caretPositionFromPoint;
  });

  it("uses caretRangeFromPoint when available", () => {
    const fakeRange = document.createRange();
    doc.caretRangeFromPoint = (x: number, y: number) => {
      expect(x).toBe(10);
      expect(y).toBe(20);
      return fakeRange;
    };
    delete doc.caretPositionFromPoint;
    expect(caretRangeFromClientPoint(10, 20)).toBe(fakeRange);
  });

  it("falls back to caretPositionFromPoint and builds a collapsed range", () => {
    delete doc.caretRangeFromPoint;
    const node = document.createTextNode("hello");
    document.body.append(node);
    doc.caretPositionFromPoint = () => ({ offsetNode: node, offset: 2 });
    const range = caretRangeFromClientPoint(5, 6);
    expect(range).not.toBeNull();
    expect(range?.collapsed).toBe(true);
    expect(range?.startContainer).toBe(node);
    expect(range?.startOffset).toBe(2);
    node.remove();
  });

  it("returns null when caretPositionFromPoint resolves to nothing", () => {
    delete doc.caretRangeFromPoint;
    doc.caretPositionFromPoint = () => null;
    expect(caretRangeFromClientPoint(0, 0)).toBeNull();
  });

  it("returns null when neither caret API is available", () => {
    delete doc.caretRangeFromPoint;
    delete doc.caretPositionFromPoint;
    expect(caretRangeFromClientPoint(0, 0)).toBeNull();
  });
});
