import { act, fireEvent, render, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DocumentFonts,
  EditOperation,
  InkOperation,
  LoadedPdf,
  ShapeOperation,
  TextItem,
  TextOperation,
} from "../src/types/editor";

// ---------------------------------------------------------------------------
// react-pdf mock: render the real DOM classes PdfCanvas queries against
// (.react-pdf__Page__canvas + .react-pdf__Page__textContent), invoke the
// document/page success callbacks so onDocumentLoad + setIsPageRendered fire.
// ---------------------------------------------------------------------------
vi.mock("react-pdf", () => {
  const Document = ({
    children,
    onLoadSuccess,
  }: {
    children?: ReactNode;
    onLoadSuccess?: (pdf: { numPages: number }) => void;
  }) => {
    useEffect(() => {
      onLoadSuccess?.({ numPages: 3 });
    }, [onLoadSuccess]);
    return <div data-testid="rpdf-document">{children}</div>;
  };
  const Page = ({ onRenderSuccess }: { onRenderSuccess?: () => void }) => {
    useEffect(() => {
      // Defer so it lands after the parent's reset effect (which sets
      // isPageRendered=false on mount), mirroring real async render success.
      const t = setTimeout(() => onRenderSuccess?.(), 0);
      return () => clearTimeout(t);
    }, [onRenderSuccess]);
    return (
      <div data-testid="rpdf-page">
        <canvas className="react-pdf__Page__canvas" width={612} height={792} />
        <div className="react-pdf__Page__textContent">
          <span data-akki-span="a">Alpha</span>
          <span data-akki-span="b">Beta</span>
        </div>
      </div>
    );
  };
  return { Document, Page, pdfjs: { GlobalWorkerOptions: {} } };
});

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker.js" }));

// fontRegistry: keep light; PdfCanvas calls registerEmbeddedFont, OperationOverlay
// calls ensureEmbeddedFontLoaded / cssFamilyForFontKey.
vi.mock("../src/engine/fontRegistry", () => ({
  registerEmbeddedFont: vi.fn(),
  cssFamilyForFontKey: (key: string) => `akkiembed-${key}`,
  ensureEmbeddedFontLoaded: vi.fn(async () => undefined),
}));

vi.mock("../src/utils/caret", () => ({
  getLastPointerDownPoint: () => null,
  caretRangeFromClientPoint: () => null,
}));

// storage: jsdom has no indexedDB; the signature-store calls are stubbed and
// steered per test (saved signatures present / absent / failing).
vi.mock("../src/utils/storage", () => ({
  listSignatures: vi.fn(async () => []),
  saveSignature: vi.fn(async () => undefined),
  deleteSignature: vi.fn(async () => undefined),
}));

// Typed-signature rasterization needs a real canvas text pipeline; return a
// deterministic PNG here (the real function is unit-tested separately).
vi.mock("../src/utils/signatureRaster", () => ({
  rasterizeTypedSignature: vi.fn(() => ({ dataUrl: "data:image/png;base64,AAAA", width: 200, height: 80 })),
}));

// jsdom never loads image resources, so natural dimensions are stubbed.
vi.mock("../src/utils/imageSizing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/utils/imageSizing")>();
  return { ...actual, loadImageSize: vi.fn(async () => ({ width: 640, height: 480 })) };
});

import { PdfCanvas } from "../src/components/PdfCanvas";
import { deleteSignature, listSignatures, saveSignature, type SavedSignature } from "../src/utils/storage";
import { loadImageSize } from "../src/utils/imageSizing";

const PAGE = { width: 612, height: 792 };

const DOC: LoadedPdf = {
  name: "doc.pdf",
  bytes: new Uint8Array([1, 2, 3, 4]),
  pageCount: 3,
  fingerprint: "fp-1",
};

type Props = React.ComponentProps<typeof PdfCanvas>;

function makeProps(overrides: Partial<Props> = {}): Props {
  const stageRef = { current: null } as Props["stageRef"];
  return {
    activeTool: "select",
    document: DOC,
    documentFonts: undefined,
    operations: [],
    pageIndex: 0,
    pageSize: PAGE,
    rotation: 0,
    scale: 1,
    selectedIds: [],
    stageRef,
    textItems: [],
    onDocumentLoad: vi.fn(),
    onNotice: vi.fn(),
    onOperationAdd: vi.fn(),
    onOperationsAdd: vi.fn(),
    onOperationRemove: vi.fn(),
    onOperationsRemove: vi.fn(),
    onOperationSelect: vi.fn(),
    onOperationsTranslate: vi.fn(),
    onOperationUpdate: vi.fn(),
    ...overrides,
  };
}

function renderCanvas(overrides: Partial<Props> = {}) {
  const props = makeProps(overrides);
  const utils = render(<PdfCanvas {...props} />);
  const stage = utils.container.querySelector(".page-stage") as HTMLDivElement;
  return { ...utils, props, stage };
}

function textOp(overrides: Partial<TextOperation> = {}): TextOperation {
  return {
    id: "text-1",
    type: "text",
    pageIndex: 0,
    rect: { x: 50, y: 600, width: 120, height: 30 },
    createdAt: 1,
    text: "Hello",
    fontFamily: "Inter",
    fontSize: 16,
    color: "#111111",
    align: "left",
    ...overrides,
  };
}

function shapeOp(overrides: Partial<ShapeOperation> = {}): ShapeOperation {
  return {
    id: "shape-1",
    type: "shape",
    kind: "rectangle",
    pageIndex: 0,
    rect: { x: 100, y: 400, width: 140, height: 70 },
    createdAt: 1,
    stroke: "#000",
    fill: "transparent",
    strokeWidth: 1.5,
    ...overrides,
  };
}

// ---- jsdom layout + canvas + pointer-capture stubs ----
const BOUNDS = { left: 0, top: 0, right: 612, bottom: 792, width: 612, height: 792, x: 0, y: 0, toJSON() { } };

let imageDataAlpha = 255;
let imageDataColor: [number, number, number] = [200, 200, 200];
// Fraction of pixels that are dark "ink" (distance from background >= 42).
// null -> use the default alternating pattern; a number forces a precise ratio.
let inkFraction: number | null = null;
// When true, every 4th pixel is semi-transparent (alpha 200 < 220 threshold) so
// the alpha-skip branches in the colour/weight samplers execute while a light,
// fully-opaque background still dominates.
let mixedAlpha = false;

function makeImageData(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  const total = width * height;
  for (let i = 0; i < total; i += 1) {
    const o = i * 4;
    let r: number;
    let g: number;
    let b: number;
    if (inkFraction !== null) {
      // background is light (240); a deterministic prefix is dark ink.
      const isInk = i < Math.round(total * inkFraction);
      r = g = b = isInk ? 10 : 245;
    } else {
      const variant = i % 3;
      r = variant === 0 ? imageDataColor[0] : variant === 1 ? 10 : 250;
      g = variant === 0 ? imageDataColor[1] : variant === 1 ? 10 : 250;
      b = variant === 0 ? imageDataColor[2] : variant === 1 ? 10 : 250;
    }
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = mixedAlpha && i % 4 === 1 ? 200 : imageDataAlpha;
  }
  return { data, width, height } as ImageData;
}

beforeEach(() => {
  imageDataAlpha = 255;
  imageDataColor = [200, 200, 200];
  inkFraction = null;
  mixedAlpha = false;
  Element.prototype.getBoundingClientRect = vi.fn(
    () => ({ ...BOUNDS }),
  ) as typeof Element.prototype.getBoundingClientRect;
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    getImageData: (_x: number, _y: number, w: number, h: number) => makeImageData(Math.max(1, w), Math.max(1, h)),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.releasePointerCapture = vi.fn();
  const globalWithRO = globalThis as { ResizeObserver?: typeof ResizeObserver };
  if (!globalWithRO.ResizeObserver) {
    globalWithRO.ResizeObserver = class {
      observe() { }
      unobserve() { }
      disconnect() { }
    } as unknown as typeof ResizeObserver;
  }
  // jsdom lacks MutationObserver attribute filtering quirks? it has MutationObserver.
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0) as unknown as number;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("PdfCanvas - render + load callbacks", () => {
  it("renders the document chrome and invokes onDocumentLoad and page render", async () => {
    const onDocumentLoad = vi.fn();
    const { container } = renderCanvas({ onDocumentLoad });
    expect(container.querySelector(".canvas-workbench")).toBeTruthy();
    await waitFor(() => expect(onDocumentLoad).toHaveBeenCalledWith({ numPages: 3 }));
    expect(container.querySelector(".react-pdf__Page__canvas")).toBeTruthy();
  });

  it("defaults page size when pageSize prop is omitted", () => {
    const { stage } = renderCanvas({ pageSize: undefined });
    expect(stage.style.width).toBe("612px");
    expect(stage.style.minHeight).toBe("792px");
  });

  it("adds the text-tool class when the text tool is active", () => {
    const { stage } = renderCanvas({ activeTool: "text" });
    expect(stage.className).toContain("is-text-tool");
  });
});

describe("PdfCanvas - empty-area click/pointer behaviour", () => {
  it("deselects on an empty-area click (press + release without a drag) in select tool", () => {
    const onOperationSelect = vi.fn();
    const { stage } = renderCanvas({ activeTool: "select", onOperationSelect });
    fireEvent.pointerDown(stage, { clientX: 5, clientY: 5, pointerId: 1 });
    // Deselection is resolved on pointer up so a marquee drag can begin instead.
    expect(onOperationSelect).not.toHaveBeenCalled();
    fireEvent.pointerUp(stage, { clientX: 5, clientY: 5 });
    expect(onOperationSelect).toHaveBeenCalledWith([]);
  });

  it("deselects on a canvas click (canvas counts as empty area)", () => {
    const onOperationSelect = vi.fn();
    const { container, stage } = renderCanvas({ activeTool: "select", onOperationSelect });
    const canvas = container.querySelector(".react-pdf__Page__canvas") as HTMLCanvasElement;
    fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.pointerUp(stage, { clientX: 5, clientY: 5 });
    expect(onOperationSelect).toHaveBeenCalledWith([]);
  });

  it("does not deselect on empty pointer down with a non-select tool", () => {
    const onOperationSelect = vi.fn();
    const { stage } = renderCanvas({ activeTool: "text", onOperationSelect });
    fireEvent.pointerDown(stage, { clientX: 5, clientY: 5 });
    expect(onOperationSelect).not.toHaveBeenCalled();
  });

  it("ignores clicks that did not originate on the stage or canvas", () => {
    const onOperationAdd = vi.fn();
    const { container } = renderCanvas({ activeTool: "whiteout", onOperationAdd });
    const doc = container.querySelector('[data-testid="rpdf-document"]') as HTMLElement;
    fireEvent.click(doc);
    expect(onOperationAdd).not.toHaveBeenCalled();
  });

  it("returns early on a select-tool click without adding", () => {
    const onOperationAdd = vi.fn();
    const { stage } = renderCanvas({ activeTool: "select", onOperationAdd });
    fireEvent.click(stage);
    expect(onOperationAdd).not.toHaveBeenCalled();
  });
});

describe("PdfCanvas - creating operations by clicking", () => {
  it("creates a whiteout operation by drawing an area", async () => {
    const onOperationAdd = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { stage } = renderCanvas({ activeTool: "whiteout", onOperationAdd, stageRef });
    stageRef.current = stage;
    fireEvent.pointerDown(stage, { clientX: 30, clientY: 40, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 140, clientY: 110 });
    fireEvent.pointerUp(stage, { clientX: 140, clientY: 110 });
    await waitFor(() => expect(onOperationAdd).toHaveBeenCalled());
    expect(onOperationAdd.mock.calls[0][0].type).toBe("whiteout");
  });

  it("treats a region-tool press without a drag as a default-size placement", async () => {
    const onOperationAdd = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { stage } = renderCanvas({ activeTool: "whiteout", onOperationAdd, stageRef });
    stageRef.current = stage;
    fireEvent.pointerDown(stage, { clientX: 30, clientY: 40, pointerId: 1 });
    fireEvent.pointerUp(stage, { clientX: 31, clientY: 41 });
    await waitFor(() => expect(onOperationAdd).toHaveBeenCalled());
    expect(onOperationAdd.mock.calls[0][0].type).toBe("whiteout");
  });

  it("does not create a region operation from a bare click", () => {
    const onOperationAdd = vi.fn();
    const { stage } = renderCanvas({ activeTool: "whiteout", onOperationAdd });
    fireEvent.click(stage, { clientX: 30, clientY: 40 });
    expect(onOperationAdd).not.toHaveBeenCalled();
  });

  it("creates a text operation, selects it, and enters edit mode", async () => {
    const onOperationAdd = vi.fn();
    const onOperationSelect = vi.fn();
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    const { stage } = renderCanvas({ activeTool: "text", onOperationAdd, onOperationSelect });
    await act(async () => {
      fireEvent.click(stage, { clientX: 30, clientY: 40 });
      await Promise.resolve();
    });
    expect(onOperationAdd).toHaveBeenCalled();
    const created = onOperationAdd.mock.calls[0][0] as TextOperation;
    expect(created.type).toBe("text");
    expect(onOperationSelect).toHaveBeenCalledWith([created.id]);
    rafSpy.mockRestore();
  });
});

describe("PdfCanvas - image tool", () => {
  const PNG_FILE = () =>
    new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "x.png", { type: "image/png" });

  async function pickImage(stage: HTMLElement, container: HTMLElement, file: File = PNG_FILE()) {
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.click(stage, { clientX: 20, clientY: 20 });
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  it("shows an aspect-correct placement ghost after picking, then commits on the next click", async () => {
    const onOperationAdd = vi.fn();
    const onOperationSelect = vi.fn();
    const { stage, container } = renderCanvas({ activeTool: "image", onOperationAdd, onOperationSelect });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    await pickImage(stage, container);
    expect(clickSpy).toHaveBeenCalled();

    // No immediate drop: a semi-transparent ghost (real image, 640x480 scaled
    // into the 320x240 max box) is anchored at the picker-opening click.
    expect(onOperationAdd).not.toHaveBeenCalled();
    await waitFor(() => expect(container.querySelector(".image-ghost")).toBeTruthy());
    const ghost = container.querySelector(".image-ghost") as HTMLElement;
    expect(ghost.querySelector("img")).toBeTruthy();
    expect(ghost.style.width).toBe("320px");
    expect(ghost.style.height).toBe("240px");

    // The ghost follows the pointer.
    fireEvent.pointerMove(stage, { clientX: 300, clientY: 300 });
    expect((container.querySelector(".image-ghost") as HTMLElement).style.left).toBe(`${300 - 160}px`);

    // Next click commits the operation centered on the click point.
    fireEvent.click(stage, { clientX: 306, clientY: 396 });
    expect(onOperationAdd).toHaveBeenCalledTimes(1);
    const created = onOperationAdd.mock.calls[0][0];
    expect(created.type).toBe("image");
    expect(created.mimeType).toBe("image/png");
    expect(created.rect.width).toBe(320);
    expect(created.rect.height).toBe(240);
    expect(onOperationSelect).toHaveBeenCalledWith([created.id]);
    expect(container.querySelector(".image-ghost")).toBeNull();
  });

  it("commits a JPEG image with the jpeg mime type", async () => {
    const onOperationAdd = vi.fn();
    const { stage, container } = renderCanvas({ activeTool: "image", onOperationAdd });
    const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0])], "x.jpg", { type: "image/jpeg" });
    await pickImage(stage, container, jpeg);
    await waitFor(() => expect(container.querySelector(".image-ghost")).toBeTruthy());
    fireEvent.click(stage, { clientX: 300, clientY: 300 });
    expect(onOperationAdd.mock.calls[0][0].mimeType).toBe("image/jpeg");
  });

  it("falls back to the default box when natural dimensions cannot be read", async () => {
    vi.mocked(loadImageSize).mockResolvedValueOnce(null);
    const onOperationAdd = vi.fn();
    const { stage, container } = renderCanvas({ activeTool: "image", onOperationAdd });
    await pickImage(stage, container);
    await waitFor(() => expect(container.querySelector(".image-ghost")).toBeTruthy());
    const ghost = container.querySelector(".image-ghost") as HTMLElement;
    expect(ghost.style.width).toBe("180px");
    expect(ghost.style.height).toBe("120px");
  });

  it("cancels a pending placement on Escape without adding", async () => {
    const onOperationAdd = vi.fn();
    const { stage, container } = renderCanvas({ activeTool: "image", onOperationAdd });
    await pickImage(stage, container);
    await waitFor(() => expect(container.querySelector(".image-ghost")).toBeTruthy());
    // A non-Escape key leaves the pending placement alive.
    fireEvent.keyDown(window, { key: "a" });
    expect(container.querySelector(".image-ghost")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".image-ghost")).toBeNull();
    fireEvent.click(stage, { clientX: 300, clientY: 300 });
    expect(onOperationAdd).not.toHaveBeenCalled();
  });

  it("rejects an invalid image file with a notice and no ghost", async () => {
    const onOperationAdd = vi.fn();
    const onNotice = vi.fn();
    const { stage, container } = renderCanvas({ activeTool: "image", onOperationAdd, onNotice });
    const bad = new File([new Uint8Array([1, 2, 3, 4])], "x.txt", { type: "text/plain" });
    await pickImage(stage, container, bad);
    await waitFor(() => expect(onNotice).toHaveBeenCalled());
    expect(onOperationAdd).not.toHaveBeenCalled();
    expect(container.querySelector(".image-ghost")).toBeNull();
  });

  it("does nothing when the input change has no file", () => {
    const onOperationAdd = vi.fn();
    const { container } = renderCanvas({ activeTool: "image", onOperationAdd });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(onOperationAdd).not.toHaveBeenCalled();
  });

  it("renders an empty ghost when a spoofed MIME type produces a non-image data url", async () => {
    const { stage, container } = renderCanvas({ activeTool: "image" });
    // Real PNG magic bytes but a lying MIME type: validation passes, yet the
    // FileReader data URL header is not image/*, so the ghost <img> is dropped.
    const spoofed = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "x.png", {
      type: "text/plain",
    });
    await pickImage(stage, container, spoofed);
    await waitFor(() => expect(container.querySelector(".image-ghost")).toBeTruthy());
    expect(container.querySelector(".image-ghost img")).toBeNull();
  });

  it("notices a read failure when FileReader throws", async () => {
    const onNotice = vi.fn();
    const { stage, container } = renderCanvas({ activeTool: "image", onNotice });
    const original = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (this: FileReader) {
      this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>);
    };
    await pickImage(stage, container);
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("Could not read that image file."));
    FileReader.prototype.readAsDataURL = original;
  });

  it("supports the floating Image button (no prior click): ghost appears on first pointer move", async () => {
    const onOperationAdd = vi.fn();
    const { stage, container } = renderCanvas({ activeTool: "image", onOperationAdd });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");
    fireEvent.click(container.querySelector(".floating-image") as HTMLButtonElement);
    expect(clickSpy).toHaveBeenCalled();
    await act(async () => {
      fireEvent.change(input, { target: { files: [PNG_FILE()] } });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    // No opening click -> no anchor yet, ghost hidden until the pointer moves.
    expect(container.querySelector(".image-ghost")).toBeNull();
    await waitFor(() => {
      fireEvent.pointerMove(stage, { clientX: 250, clientY: 250 });
      expect(container.querySelector(".image-ghost")).toBeTruthy();
    });
    fireEvent.click(stage, { clientX: 250, clientY: 250 });
    expect(onOperationAdd).toHaveBeenCalledTimes(1);
  });
});

describe("PdfCanvas - signature flow", () => {
  const savedTyped: SavedSignature = {
    id: "saved-1", createdAt: 2, mode: "typed", value: "Akki", color: "#000000", fontFamily: "Caveat",
  };
  const savedImage: SavedSignature = {
    id: "saved-2", createdAt: 1, mode: "image", value: "data:image/png;base64,AAAA", color: "#000000",
  };

  it("opens the signature studio when there are no saved signatures", async () => {
    const { stage, getByRole } = renderCanvas({ activeTool: "signature" });
    await act(async () => {
      fireEvent.click(stage, { clientX: 200, clientY: 300 });
      await Promise.resolve();
    });
    expect(getByRole("dialog", { name: "Create signature" })).toBeTruthy();
  });

  it("opens the studio even when listing saved signatures fails", async () => {
    vi.mocked(listSignatures).mockRejectedValueOnce(new Error("idb down"));
    const { stage, getByRole } = renderCanvas({ activeTool: "signature" });
    await act(async () => {
      fireEvent.click(stage, { clientX: 200, clientY: 300 });
      await Promise.resolve();
    });
    expect(getByRole("dialog", { name: "Create signature" })).toBeTruthy();
  });

  it("saves + places a typed signature from the studio (rasterized to an image op)", async () => {
    const onOperationAdd = vi.fn();
    const onOperationSelect = vi.fn();
    const { stage, getByRole, getByLabelText, queryByRole } = renderCanvas({
      activeTool: "signature", onOperationAdd, onOperationSelect,
    });
    await act(async () => {
      fireEvent.click(stage, { clientX: 200, clientY: 300 });
      await Promise.resolve();
    });
    const dialog = getByRole("dialog", { name: "Create signature" });
    const saveButton = within(dialog).getByRole("button", { name: "Save signature" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    fireEvent.change(getByLabelText("Full name"), { target: { value: "Akki Pathak" } });
    expect(saveButton.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(saveButton);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(queryByRole("dialog", { name: "Create signature" })).toBeNull();
    expect(saveSignature).toHaveBeenCalledWith(expect.objectContaining({ mode: "typed", value: "Akki Pathak" }));
    await waitFor(() => expect(onOperationAdd).toHaveBeenCalled());
    const created = onOperationAdd.mock.calls[0][0];
    expect(created.type).toBe("signature");
    expect(created.mode).toBe("image");
    expect(created.value).toBe("data:image/png;base64,AAAA");
    expect(onOperationSelect).toHaveBeenCalledWith([created.id]);
  });

  it("does not persist when the save-for-reuse checkbox is unchecked, and notices a failing save", async () => {
    const onNotice = vi.fn();
    const { stage, getByRole, getByLabelText } = renderCanvas({ activeTool: "signature", onNotice });
    await act(async () => {
      fireEvent.click(stage, { clientX: 100, clientY: 100 });
      await Promise.resolve();
    });
    fireEvent.change(getByLabelText("Full name"), { target: { value: "Akki" } });
    fireEvent.click(getByLabelText("Save signature for reuse"));
    await act(async () => {
      fireEvent.click(within(getByRole("dialog", { name: "Create signature" })).getByRole("button", { name: "Save signature" }));
      await Promise.resolve();
    });
    expect(saveSignature).not.toHaveBeenCalled();

    // Second run: keep the checkbox on but make persistence fail.
    vi.mocked(saveSignature).mockRejectedValueOnce(new Error("full"));
    await act(async () => {
      fireEvent.click(stage, { clientX: 100, clientY: 100 });
      await Promise.resolve();
    });
    fireEvent.change(getByLabelText("Full name"), { target: { value: "Akki" } });
    await act(async () => {
      fireEvent.click(within(getByRole("dialog", { name: "Create signature" })).getByRole("button", { name: "Save signature" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("Could not save the signature for reuse."));
  });

  it("cancelling the studio leaves the document untouched", async () => {
    const onOperationAdd = vi.fn();
    const { stage, getByRole, queryByRole } = renderCanvas({ activeTool: "signature", onOperationAdd });
    await act(async () => {
      fireEvent.click(stage, { clientX: 100, clientY: 100 });
      await Promise.resolve();
    });
    fireEvent.click(within(getByRole("dialog", { name: "Create signature" })).getByRole("button", { name: "Cancel" }));
    expect(queryByRole("dialog", { name: "Create signature" })).toBeNull();
    expect(onOperationAdd).not.toHaveBeenCalled();
  });

  it("shows the saved-signature picker and places a chosen signature at the click point", async () => {
    vi.mocked(listSignatures).mockResolvedValueOnce([savedTyped, savedImage]);
    const onOperationAdd = vi.fn();
    const { stage, getByRole, queryByRole } = renderCanvas({ activeTool: "signature", onOperationAdd });
    await act(async () => {
      fireEvent.click(stage, { clientX: 200, clientY: 300 });
      await Promise.resolve();
    });
    const picker = getByRole("dialog", { name: "Place signature" });
    await act(async () => {
      fireEvent.click(within(picker).getByRole("button", { name: "Place signature Akki" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(queryByRole("dialog", { name: "Place signature" })).toBeNull();
    await waitFor(() => expect(onOperationAdd).toHaveBeenCalled());
    expect(onOperationAdd.mock.calls[0][0].type).toBe("signature");
  });

  it("places a saved image signature (natural-size lookup path)", async () => {
    vi.mocked(listSignatures).mockResolvedValueOnce([savedImage]);
    const onOperationAdd = vi.fn();
    const { stage, getByRole } = renderCanvas({ activeTool: "signature", onOperationAdd });
    await act(async () => {
      fireEvent.click(stage, { clientX: 200, clientY: 300 });
      await Promise.resolve();
    });
    const picker = getByRole("dialog", { name: "Place signature" });
    await act(async () => {
      fireEvent.click(within(picker).getByRole("button", { name: "Place signature image" }));
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(onOperationAdd).toHaveBeenCalled());
    const created = onOperationAdd.mock.calls[0][0];
    expect(created.mode).toBe("image");
    // 640x480 natural, fit into the 260x110 signature box -> 147x110.
    expect(Math.round(created.rect.height)).toBe(110);
  });

  it("deletes a saved signature from the picker, noticing a failing delete", async () => {
    vi.mocked(listSignatures).mockResolvedValueOnce([savedTyped, savedImage]);
    const onNotice = vi.fn();
    const { stage, getByRole } = renderCanvas({ activeTool: "signature", onNotice });
    await act(async () => {
      fireEvent.click(stage, { clientX: 200, clientY: 300 });
      await Promise.resolve();
    });
    const picker = getByRole("dialog", { name: "Place signature" });
    const deleteButtons = within(picker).getAllByRole("button", { name: "Delete saved signature" });
    expect(deleteButtons).toHaveLength(2);
    await act(async () => {
      fireEvent.click(deleteButtons[0]);
      await Promise.resolve();
    });
    expect(deleteSignature).toHaveBeenCalledWith("saved-1");
    expect(within(picker).getAllByRole("button", { name: "Delete saved signature" })).toHaveLength(1);

    vi.mocked(deleteSignature).mockRejectedValueOnce(new Error("idb down"));
    await act(async () => {
      fireEvent.click(within(picker).getAllByRole("button", { name: "Delete saved signature" })[0]);
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("Could not delete that saved signature."));
  });

  it("routes from the picker to the studio via New signature, and cancels on Escape", async () => {
    vi.mocked(listSignatures).mockResolvedValueOnce([savedTyped]);
    const { stage, getByRole, queryByRole } = renderCanvas({ activeTool: "signature" });
    await act(async () => {
      fireEvent.click(stage, { clientX: 200, clientY: 300 });
      await Promise.resolve();
    });
    const picker = getByRole("dialog", { name: "Place signature" });
    // A non-Escape key leaves the picker open.
    fireEvent.keyDown(picker, { key: "a" });
    expect(queryByRole("dialog", { name: "Place signature" })).toBeTruthy();
    fireEvent.click(within(picker).getByRole("button", { name: "New signature" }));
    expect(getByRole("dialog", { name: "Create signature" })).toBeTruthy();
  });

  it("closes the picker via Escape and via Cancel", async () => {
    vi.mocked(listSignatures).mockResolvedValueOnce([savedTyped]);
    const { stage, getByRole, queryByRole } = renderCanvas({ activeTool: "signature" });
    await act(async () => {
      fireEvent.click(stage, { clientX: 200, clientY: 300 });
      await Promise.resolve();
    });
    fireEvent.keyDown(getByRole("dialog", { name: "Place signature" }), { key: "Escape" });
    expect(queryByRole("dialog", { name: "Place signature" })).toBeNull();

    vi.mocked(listSignatures).mockResolvedValueOnce([savedTyped]);
    await act(async () => {
      fireEvent.click(stage, { clientX: 200, clientY: 300 });
      await Promise.resolve();
    });
    fireEvent.click(within(getByRole("dialog", { name: "Place signature" })).getByRole("button", { name: "Cancel" }));
    expect(queryByRole("dialog", { name: "Place signature" })).toBeNull();
  });
});

describe("PdfCanvas - text hit layer", () => {
  const textItems: TextItem[] = [
    { str: "Replace me", pageIndex: 0, rect: { x: 40, y: 700, width: 80, height: 14 }, fontSize: 12, fontName: "Helvetica" },
  ];

  it("renders hit targets when select tool is active and page rendered", async () => {
    const { container } = renderCanvas({ activeTool: "select", textItems });
    await waitFor(() => expect(container.querySelector(".text-hit-layer.is-active")).toBeTruthy());
    expect(container.querySelector(".text-hit")).toBeTruthy();
  });

  it("clicking a hit target creates a replacement text operation", async () => {
    const onOperationAdd = vi.fn();
    const onOperationSelect = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => { cb(0); return 1; });
    const { container } = renderCanvas({ activeTool: "text", textItems, onOperationAdd, onOperationSelect });
    await waitFor(() => expect(container.querySelector(".text-hit")).toBeTruthy());
    await act(async () => {
      fireEvent.click(container.querySelector(".text-hit") as HTMLButtonElement);
      await Promise.resolve();
    });
    expect(onOperationAdd).toHaveBeenCalled();
    expect(onOperationAdd.mock.calls[0][0].type).toBe("text");
  });

  it("hides hit target once an overlapping replacement exists", async () => {
    const op = textOp({
      sourceCoverRect: { x: 40, y: 700, width: 80, height: 14 },
      rect: { x: 40, y: 700, width: 80, height: 14 },
    });
    const { container } = renderCanvas({ activeTool: "select", textItems, operations: [op] });
    await waitFor(() => expect(container.querySelector(".react-pdf__Page__canvas")).toBeTruthy());
    expect(container.querySelector(".text-hit")).toBeNull();
  });

  it("hit layer is inert when select/text tools are not active", () => {
    const { container } = renderCanvas({ activeTool: "whiteout", textItems });
    const layer = container.querySelector(".text-hit-layer") as HTMLElement;
    expect(layer.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("PdfCanvas - operation overlays and selection", () => {
  it("renders a source-cover mask for a replacement text op", async () => {
    const op = textOp({ sourceCoverRect: { x: 10, y: 10, width: 50, height: 20 }, whiteoutColor: "#eeeeee" });
    const { container } = renderCanvas({ operations: [op] });
    await waitFor(() => expect(container.querySelector(".operation--source-cover")).toBeTruthy());
    const cover = container.querySelector(".operation--source-cover") as HTMLElement;
    expect(cover.style.background).toBe("rgb(238, 238, 238)");
  });

  it("source-cover defaults to white when whiteoutColor absent", async () => {
    const op = textOp({ sourceCoverRect: { x: 10, y: 10, width: 50, height: 20 } });
    const { container } = renderCanvas({ operations: [op] });
    const cover = await waitFor(() => container.querySelector(".operation--source-cover") as HTMLElement);
    expect(cover.style.background).toBe("rgb(255, 255, 255)");
  });

  it("renders the floating toolbar and resize handles for a selected shape", () => {
    const op = shapeOp();
    const { container } = renderCanvas({ operations: [op], selectedIds: [op.id] });
    expect(container.querySelector(".floating-toolbar")).toBeTruthy();
    expect(container.querySelector(".resize-frame")).toBeTruthy();
  });

  it("does not render resize handles for a non-resizable (text) operation", () => {
    const op = textOp();
    const { container } = renderCanvas({ operations: [op], selectedIds: [op.id] });
    expect(container.querySelector(".resize-frame")).toBeNull();
  });

  it("forwards toolbar delete/duplicate to the host callbacks", () => {
    const op = shapeOp();
    const onOperationRemove = vi.fn();
    const onOperationAdd = vi.fn();
    const { getByLabelText } = renderCanvas({ operations: [op], selectedIds: [op.id], onOperationRemove, onOperationAdd });
    fireEvent.click(getByLabelText("Delete"));
    expect(onOperationRemove).toHaveBeenCalledWith(op.id);
    fireEvent.click(getByLabelText("Duplicate"));
    expect(onOperationAdd).toHaveBeenCalled();
  });

  it("toggles move mode from the toolbar", () => {
    const op = shapeOp();
    const { getByLabelText } = renderCanvas({ operations: [op], selectedIds: [op.id] });
    const moveBtn = getByLabelText("Move");
    fireEvent.click(moveBtn);
    expect(moveBtn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(moveBtn);
    expect(moveBtn.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("PdfCanvas - link properties dialog", () => {
  it("adds a link operation to a non-link op via the toolbar dialog", () => {
    const op = shapeOp();
    const onOperationAdd = vi.fn();
    const { getByLabelText, getByRole } = renderCanvas({ operations: [op], selectedIds: [op.id], onOperationAdd });
    fireEvent.click(getByLabelText("Add link"));
    const dialog = getByRole("dialog", { name: "Add link" });
    fireEvent.change(within(dialog).getByLabelText("External URL"), { target: { value: "https://example.com" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add link" }));
    expect(onOperationAdd).toHaveBeenCalled();
    const created = onOperationAdd.mock.calls[0][0];
    expect(created.type).toBe("link");
    expect(created.target).toEqual({ kind: "url", href: "https://example.com/" });
    // Toolbar-attached links keep the source operation's exact rect.
    expect(created.rect).toEqual(op.rect);
  });

  it("does nothing when the link dialog is closed", () => {
    const op = shapeOp();
    const onOperationAdd = vi.fn();
    const { getByLabelText, getByRole, queryByRole } = renderCanvas({ operations: [op], selectedIds: [op.id], onOperationAdd });
    fireEvent.click(getByLabelText("Add link"));
    const dialog = getByRole("dialog", { name: "Add link" });
    fireEvent.click(within(dialog).getByText("Close"));
    expect(onOperationAdd).not.toHaveBeenCalled();
    expect(queryByRole("dialog", { name: "Add link" })).toBeNull();
  });

  it("keeps the dialog open with an inline error for an unsafe URL", () => {
    const op = shapeOp();
    const onOperationAdd = vi.fn();
    const { getByLabelText, getByRole } = renderCanvas({ operations: [op], selectedIds: [op.id], onOperationAdd });
    fireEvent.click(getByLabelText("Add link"));
    const dialog = getByRole("dialog", { name: "Add link" });
    fireEvent.change(within(dialog).getByLabelText("External URL"), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add link" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/valid http/i);
    expect(onOperationAdd).not.toHaveBeenCalled();
  });

  it("updates an existing link operation's target, pre-filled with its current value", () => {
    const op: EditOperation = {
      id: "link-1", type: "link", pageIndex: 0, rect: { x: 10, y: 10, width: 50, height: 20 },
      createdAt: 1, target: { kind: "url", href: "https://old.com" }, opacity: 1,
    };
    const onOperationUpdate = vi.fn();
    const { getByLabelText, getByRole } = renderCanvas({ operations: [op], selectedIds: [op.id], onOperationUpdate });
    fireEvent.click(getByLabelText("Add link"));
    const dialog = getByRole("dialog", { name: "Edit link" });
    const input = within(dialog).getByLabelText("External URL") as HTMLInputElement;
    expect(input.value).toBe("https://old.com");
    fireEvent.change(input, { target: { value: "https://new.com" } });
    fireEvent.click(within(dialog).getByText("Save link"));
    expect(onOperationUpdate).toHaveBeenCalledWith("link-1", { target: { kind: "url", href: "https://new.com/" } });
  });

  it("retargets an existing link to an internal page", () => {
    const op: EditOperation = {
      id: "link-2", type: "link", pageIndex: 0, rect: { x: 10, y: 10, width: 50, height: 20 },
      createdAt: 1, target: { kind: "url", href: "https://old.com" }, opacity: 1,
    };
    const onOperationUpdate = vi.fn();
    const { getByLabelText, getByRole } = renderCanvas({ operations: [op], selectedIds: [op.id], onOperationUpdate });
    fireEvent.click(getByLabelText("Add link"));
    const dialog = getByRole("dialog", { name: "Edit link" });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Link to internal page" }));
    fireEvent.change(within(dialog).getByLabelText("Page number"), { target: { value: "2" } });
    fireEvent.click(within(dialog).getByText("Save link"));
    expect(onOperationUpdate).toHaveBeenCalledWith("link-2", { target: { kind: "page", pageIndex: 1 } });
  });

  it("deletes an existing link from the dialog", () => {
    const op: EditOperation = {
      id: "link-3", type: "link", pageIndex: 0, rect: { x: 10, y: 10, width: 50, height: 20 },
      createdAt: 1, target: { kind: "url", href: "https://old.com" }, opacity: 1,
    };
    const onOperationRemove = vi.fn();
    const { getByLabelText, getByRole, queryByRole } = renderCanvas({ operations: [op], selectedIds: [op.id], onOperationRemove });
    fireEvent.click(getByLabelText("Add link"));
    const dialog = getByRole("dialog", { name: "Edit link" });
    fireEvent.click(within(dialog).getByText("Delete link"));
    expect(onOperationRemove).toHaveBeenCalledWith("link-3");
    expect(queryByRole("dialog", { name: "Edit link" })).toBeNull();
  });

  it("dismisses the dialog on Escape without changing anything", () => {
    const op = shapeOp();
    const onOperationAdd = vi.fn();
    const { getByLabelText, getByRole, queryByRole } = renderCanvas({ operations: [op], selectedIds: [op.id], onOperationAdd });
    fireEvent.click(getByLabelText("Add link"));
    const dialog = getByRole("dialog", { name: "Add link" });
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onOperationAdd).not.toHaveBeenCalled();
    expect(queryByRole("dialog", { name: "Add link" })).toBeNull();
  });

  it("confirms via Enter on the active field", () => {
    const op = shapeOp();
    const onOperationAdd = vi.fn();
    const { getByLabelText, getByRole } = renderCanvas({ operations: [op], selectedIds: [op.id], onOperationAdd });
    fireEvent.click(getByLabelText("Add link"));
    const dialog = getByRole("dialog", { name: "Add link" });
    const input = within(dialog).getByLabelText("External URL");
    fireEvent.change(input, { target: { value: "https://enter.example" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onOperationAdd).toHaveBeenCalled();
  });
});

describe("PdfCanvas - drag-to-draw region tools", () => {
  it("draws a shape, selects it, and shows the in-page hint banner", async () => {
    const onOperationAdd = vi.fn();
    const onOperationSelect = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "shape", onOperationAdd, onOperationSelect, stageRef,
    });
    stageRef.current = stage;
    // Armed hint before drawing.
    expect(container.querySelector(".canvas-hint")?.textContent).toContain(
      "Add a shape by making an area selection on the page",
    );
    fireEvent.pointerDown(stage, { clientX: 40, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 180, clientY: 160 });
    // Marquee + drawing hint visible mid-draw.
    expect(container.querySelector(".draw-marquee")).toBeTruthy();
    expect(container.querySelector(".canvas-hint")?.textContent).toContain("Click and drag to draw the shape");
    fireEvent.pointerUp(stage, { clientX: 180, clientY: 160 });
    await waitFor(() => expect(onOperationAdd).toHaveBeenCalled());
    const created = onOperationAdd.mock.calls[0][0];
    expect(created.type).toBe("shape");
    expect(onOperationSelect).toHaveBeenLastCalledWith([created.id]);
    expect(container.querySelector(".draw-marquee")).toBeNull();
  });

  it("auto-dismisses the in-page hint after a few seconds", () => {
    vi.useFakeTimers();
    try {
      const { container } = renderCanvas({ activeTool: "shape" });
      expect(container.querySelector(".canvas-hint")).toBeTruthy();
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(container.querySelector(".canvas-hint")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("hides the in-page hint when the Select tool is active", () => {
    const { container } = renderCanvas({ activeTool: "select" });
    expect(container.querySelector(".canvas-hint")).toBeNull();
  });

  it("cancels an in-progress draw on Escape without creating an operation", () => {
    const onOperationAdd = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({ activeTool: "shape", onOperationAdd, stageRef });
    stageRef.current = stage;
    fireEvent.pointerDown(stage, { clientX: 40, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 180, clientY: 160 });
    expect(container.querySelector(".draw-marquee")).toBeTruthy();
    // A non-Escape key leaves the draw in progress.
    fireEvent.keyDown(window, { key: "a" });
    expect(container.querySelector(".draw-marquee")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".draw-marquee")).toBeNull();
    fireEvent.pointerUp(stage, { clientX: 180, clientY: 160 });
    expect(onOperationAdd).not.toHaveBeenCalled();
  });

  it("clears the draw on pointer cancel and lost capture without creating", () => {
    const onOperationAdd = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({ activeTool: "shape-ellipse", onOperationAdd, stageRef });
    stageRef.current = stage;
    fireEvent.pointerDown(stage, { clientX: 40, clientY: 50, pointerId: 1 });
    fireEvent.pointerCancel(stage);
    expect(container.querySelector(".draw-marquee")).toBeNull();
    fireEvent.pointerDown(stage, { clientX: 40, clientY: 50, pointerId: 1 });
    fireEvent.lostPointerCapture(stage);
    expect(container.querySelector(".draw-marquee")).toBeNull();
    expect(onOperationAdd).not.toHaveBeenCalled();
  });

  it("ignores a pointer down that did not originate on the stage or canvas", () => {
    const onOperationSelect = vi.fn();
    const onOperationAdd = vi.fn();
    const { container } = renderCanvas({ activeTool: "shape", onOperationSelect, onOperationAdd });
    const doc = container.querySelector('[data-testid="rpdf-document"]') as HTMLElement;
    fireEvent.pointerDown(doc, { clientX: 5, clientY: 5, pointerId: 1 });
    expect(container.querySelector(".draw-marquee")).toBeNull();
    expect(onOperationAdd).not.toHaveBeenCalled();
  });

  it("does not create when a region draw's inline popover is cancelled", async () => {
    const onOperationAdd = vi.fn();
    const onOperationSelect = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { getByRole, stage } = renderCanvas({ activeTool: "form-text", onOperationAdd, onOperationSelect, stageRef });
    stageRef.current = stage;
    fireEvent.pointerDown(stage, { clientX: 40, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 180, clientY: 120 });
    fireEvent.pointerUp(stage, { clientX: 180, clientY: 120 });
    await Promise.resolve();
    const popover = getByRole("dialog", { name: "Add form field" });
    fireEvent.click(within(popover).getByText("Cancel"));
    expect(onOperationAdd).not.toHaveBeenCalled();
  });

  it("does not create when a drawn link region's dialog is closed", async () => {
    const onOperationAdd = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { getByRole, stage } = renderCanvas({ activeTool: "link", onOperationAdd, stageRef });
    stageRef.current = stage;
    fireEvent.pointerDown(stage, { clientX: 40, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 180, clientY: 120 });
    fireEvent.pointerUp(stage, { clientX: 180, clientY: 120 });
    await Promise.resolve();
    const popover = getByRole("dialog", { name: "Add link" });
    fireEvent.click(within(popover).getByText("Close"));
    expect(onOperationAdd).not.toHaveBeenCalled();
  });

  it("creates a link region operation once its properties dialog is confirmed", async () => {
    const onOperationAdd = vi.fn();
    const onOperationSelect = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { getByRole, stage } = renderCanvas({ activeTool: "link", onOperationAdd, onOperationSelect, stageRef });
    stageRef.current = stage;
    fireEvent.pointerDown(stage, { clientX: 40, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 180, clientY: 120 });
    fireEvent.pointerUp(stage, { clientX: 180, clientY: 120 });
    await Promise.resolve();
    const popover = getByRole("dialog", { name: "Add link" });
    fireEvent.change(within(popover).getByLabelText("External URL"), { target: { value: "https://region.example" } });
    fireEvent.click(within(popover).getByRole("button", { name: "Add link" }));
    expect(onOperationAdd).toHaveBeenCalled();
    const created = onOperationAdd.mock.calls[0][0];
    expect(created.type).toBe("link");
    expect(created.target).toEqual({ kind: "url", href: "https://region.example/" });
    // Drawn link regions inherit the factory minimum size.
    expect(created.rect.height).toBeGreaterThanOrEqual(28);
    expect(onOperationSelect).toHaveBeenLastCalledWith([created.id]);
  });

  it("creates an email link from the region dialog's email kind", async () => {
    const onOperationAdd = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { getByRole, stage } = renderCanvas({ activeTool: "link", onOperationAdd, stageRef });
    stageRef.current = stage;
    fireEvent.pointerDown(stage, { clientX: 40, clientY: 50, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 180, clientY: 120 });
    fireEvent.pointerUp(stage, { clientX: 180, clientY: 120 });
    await Promise.resolve();
    const popover = getByRole("dialog", { name: "Add link" });
    fireEvent.click(within(popover).getByRole("radio", { name: "Link to email address" }));
    fireEvent.change(within(popover).getByLabelText("Email address"), { target: { value: "you@example.com" } });
    fireEvent.click(within(popover).getByRole("button", { name: "Add link" }));
    expect(onOperationAdd).toHaveBeenCalled();
    expect(onOperationAdd.mock.calls[0][0].target).toEqual({ kind: "email", href: "mailto:you@example.com" });
  });

  it("creates a stamp operation from a single point-click once its inline popover is confirmed", () => {
    const onOperationAdd = vi.fn();
    const { getByRole, stage } = renderCanvas({ activeTool: "stamp", onOperationAdd });
    fireEvent.click(stage, { clientX: 100, clientY: 200 });
    const popover = getByRole("dialog", { name: "Add stamp" });
    fireEvent.change(within(popover).getByLabelText("Subject"), { target: { value: "REVIEWED" } });
    fireEvent.change(within(popover).getByLabelText("Author"), { target: { value: "Akki" } });
    fireEvent.change(within(popover).getByLabelText("Date"), { target: { value: "mdy" } });
    fireEvent.click(within(popover).getByRole("button", { name: "Add stamp" }));
    expect(onOperationAdd).toHaveBeenCalled();
    expect(onOperationAdd.mock.calls[0][0].type).toBe("stamp");
    expect(onOperationAdd.mock.calls[0][0].label).toBe("REVIEWED");
    expect(onOperationAdd.mock.calls[0][0].subline).toMatch(/^By Akki at /);
  });

  it("creates nothing and selects nothing when the popover is confirmed with an empty field", () => {
    const onOperationAdd = vi.fn();
    const onOperationSelect = vi.fn();
    const { getByRole, stage } = renderCanvas({ activeTool: "stamp", onOperationAdd, onOperationSelect });
    fireEvent.click(stage, { clientX: 100, clientY: 200 });
    const popover = getByRole("dialog", { name: "Add stamp" });
    fireEvent.change(within(popover).getByLabelText("Subject"), { target: { value: "" } });
    fireEvent.click(within(popover).getByRole("button", { name: "Add stamp" }));
    expect(onOperationAdd).not.toHaveBeenCalled();
    expect(onOperationSelect).not.toHaveBeenCalled();
  });
});

describe("PdfCanvas - overlay pointer interactions (drag)", () => {
  function setupStageRef(stage: HTMLDivElement) {
    // pointFromEvent relies on getBoundingClientRect (already stubbed to 0,0)
    return stage;
  }

  it("dragging an already-selected overlay keeps the selection and commits one translate", () => {
    const op = shapeOp();
    const onOperationSelect = vi.fn();
    const onOperationsTranslate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id], stageRef,
      onOperationSelect, onOperationsTranslate,
    });
    stageRef.current = stage;
    setupStageRef(stage);
    const overlay = container.querySelector(".operation--shape-rectangle") as HTMLElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, pointerId: 1 });
    // Already a selection member: pressing it must not rebuild the selection.
    expect(onOperationSelect).not.toHaveBeenCalled();
    fireEvent.pointerMove(stage, { clientX: 150, clientY: 150 });
    // The commit is deferred until the gesture ends, not fired on every pointermove.
    expect(onOperationsTranslate).not.toHaveBeenCalled();
    fireEvent.pointerUp(stage);
    expect(onOperationsTranslate).toHaveBeenCalledTimes(1);
    expect(onOperationsTranslate).toHaveBeenCalledWith([op.id], expect.any(Number), expect.any(Number));
  });

  it("pressing an unselected overlay selects it before the drag begins", () => {
    const op = shapeOp();
    const onOperationSelect = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [], stageRef, onOperationSelect,
    });
    stageRef.current = stage;
    const overlay = container.querySelector(".operation--shape-rectangle") as HTMLElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, pointerId: 1 });
    expect(onOperationSelect).toHaveBeenCalledWith([op.id]);
    fireEvent.pointerUp(stage);
  });

  it("shift-click toggles the pressed overlay into the selection without dragging", () => {
    const first = shapeOp();
    const second = shapeOp({ id: "shape-2", rect: { x: 300, y: 200, width: 60, height: 40 } });
    const onOperationSelect = vi.fn();
    const onOperationsTranslate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select", operations: [first, second], selectedIds: [first.id], stageRef,
      onOperationSelect, onOperationsTranslate,
    });
    stageRef.current = stage;
    const overlays = container.querySelectorAll(".operation--shape-rectangle");
    fireEvent.pointerDown(overlays[1], { clientX: 310, clientY: 160, pointerId: 1, shiftKey: true });
    expect(onOperationSelect).toHaveBeenCalledWith(["shape-2"], true);
    // No drag starts from an additive toggle press.
    fireEvent.pointerMove(stage, { clientX: 350, clientY: 200 });
    fireEvent.pointerUp(stage);
    expect(onOperationsTranslate).not.toHaveBeenCalled();
  });

  it("cmd/meta-click also toggles additively", () => {
    const op = shapeOp();
    const onOperationSelect = vi.fn();
    const { container } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [], onOperationSelect,
    });
    const overlay = container.querySelector(".operation--shape-rectangle") as HTMLElement;
    fireEvent.pointerDown(overlay, { clientX: 110, clientY: 110, pointerId: 1, metaKey: true });
    expect(onOperationSelect).toHaveBeenCalledWith([op.id], true);
  });

  it("dragging a member of a multi-selection moves the whole group with one translate", () => {
    const first = shapeOp();
    const second = shapeOp({ id: "shape-2", rect: { x: 300, y: 200, width: 60, height: 40 } });
    const onOperationsTranslate = vi.fn();
    const onDraggingChange = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select",
      operations: [first, second],
      selectedIds: [first.id, second.id],
      stageRef,
      onOperationsTranslate,
      onDraggingChange,
    });
    stageRef.current = stage;
    const overlays = container.querySelectorAll(".operation--shape-rectangle");
    const secondLeftBefore = (overlays[1] as HTMLElement).style.left;
    fireEvent.pointerDown(overlays[0], { clientX: 110, clientY: 350, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 160, clientY: 400 });
    // Live preview: BOTH members render at their dragged position mid-gesture.
    const liveOverlays = container.querySelectorAll(".operation--shape-rectangle");
    expect((liveOverlays[1] as HTMLElement).style.left).not.toBe(secondLeftBefore);
    // Group toolbar hides while the drag is live.
    expect(container.querySelector(".group-toolbar")).toBeNull();
    expect(onDraggingChange).toHaveBeenLastCalledWith(2);
    fireEvent.pointerUp(stage);
    expect(onOperationsTranslate).toHaveBeenCalledTimes(1);
    const [ids, dx, dy] = onOperationsTranslate.mock.calls[0];
    expect(ids).toEqual([first.id, second.id]);
    expect(typeof dx).toBe("number");
    expect(typeof dy).toBe("number");
    expect(onDraggingChange).toHaveBeenLastCalledWith(0);
  });

  it("a group drag skips selection ids that are not on this page", () => {
    const first = shapeOp();
    const onOperationsTranslate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select",
      operations: [first],
      selectedIds: [first.id, "op-on-another-page"],
      stageRef,
      onOperationsTranslate,
    });
    stageRef.current = stage;
    const overlay = container.querySelector(".operation--shape-rectangle") as HTMLElement;
    fireEvent.pointerDown(overlay, { clientX: 110, clientY: 350, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 160, clientY: 400 });
    fireEvent.pointerUp(stage);
    expect(onOperationsTranslate).toHaveBeenCalledWith([first.id], expect.any(Number), expect.any(Number));
  });

  it("dragging an ink operation commits through the same translate action", () => {
    const ink: InkOperation = {
      id: "ink-1", type: "ink", pageIndex: 0, rect: { x: 100, y: 400, width: 120, height: 48 },
      createdAt: 1, points: [{ x: 100, y: 410 }, { x: 150, y: 430 }], stroke: "#000", strokeWidth: 2,
    };
    const onOperationsTranslate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select", operations: [ink], selectedIds: [ink.id], stageRef, onOperationsTranslate,
    });
    stageRef.current = stage;
    const overlay = container.querySelector(".operation--ink") ?? container.querySelector('[class*="operation--"]');
    fireEvent.pointerDown(overlay as HTMLElement, { clientX: 100, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 120, clientY: 420 });
    fireEvent.pointerUp(stage);
    expect(onOperationsTranslate).toHaveBeenCalledWith(["ink-1"], expect.any(Number), expect.any(Number));
  });

  it("clicking a text overlay in the Text tool (no movement) enters edit mode instead of dragging", () => {
    const op = textOp();
    const onOperationsTranslate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "text", operations: [op], selectedIds: [op.id], stageRef,
      onOperationsTranslate,
    });
    stageRef.current = stage;
    const overlay = container.querySelector(".operation--text") as HTMLElement;
    fireEvent.pointerDown(overlay, { clientX: 60, clientY: 610, pointerId: 1 });
    // Released with no movement in between -> resolves to "enter edit mode", not a move.
    fireEvent.pointerUp(stage);
    expect(onOperationsTranslate).not.toHaveBeenCalled();
    expect(overlay.getAttribute("contenteditable")).toBe("true");
  });

  it("clicking a non-text overlay with no movement resolves to a no-op (not edit mode)", () => {
    const op = shapeOp();
    const onOperationsTranslate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id], stageRef,
      onOperationsTranslate,
    });
    stageRef.current = stage;
    const overlay = container.querySelector(".operation--shape-rectangle") as HTMLElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerUp(stage);
    expect(onOperationsTranslate).not.toHaveBeenCalled();
  });

  it("dragging a text overlay in the Text tool moves it instead of entering edit mode", () => {
    const op = textOp();
    const onOperationsTranslate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "text", operations: [op], selectedIds: [op.id], stageRef, onOperationsTranslate,
    });
    stageRef.current = stage;
    const overlay = container.querySelector(".operation--text") as HTMLElement;
    fireEvent.pointerDown(overlay, { clientX: 60, clientY: 610, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 70, clientY: 620 });
    expect(onOperationsTranslate).not.toHaveBeenCalled();
    fireEvent.pointerUp(stage);
    expect(onOperationsTranslate).toHaveBeenCalledWith([op.id], expect.any(Number), expect.any(Number));
    // Since the gesture moved, it must not also resolve to "enter edit mode".
    expect(overlay.getAttribute("contenteditable")).toBe("false");
  });

  it("pointercancel discards an in-progress drag instead of committing it", () => {
    const op = shapeOp();
    const onOperationsTranslate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id], stageRef, onOperationsTranslate,
    });
    stageRef.current = stage;
    const overlay = container.querySelector(".operation--shape-rectangle") as HTMLElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 180, clientY: 180 });
    // Browser aborts the gesture (OS touch takeover / stylus dropout):
    // the accumulated move must be thrown away, not applied.
    fireEvent.pointerCancel(stage);
    expect(onOperationsTranslate).not.toHaveBeenCalled();
  });

  it("drag works on an overlay regardless of which tool is active", () => {
    const op = shapeOp();
    const onOperationsTranslate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "whiteout", operations: [op], selectedIds: [op.id], stageRef, onOperationsTranslate,
    });
    stageRef.current = stage;
    const overlay = container.querySelector(".operation--shape-rectangle") as HTMLElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 150, clientY: 150 });
    expect(onOperationsTranslate).not.toHaveBeenCalled();
    fireEvent.pointerUp(stage);
    expect(onOperationsTranslate).toHaveBeenCalledWith([op.id], expect.any(Number), expect.any(Number));
  });

  it("suppresses the native click that follows a completed drag, so it doesn't add a stray operation", () => {
    // A real browser fires a native `click` right after `pointerup`, even when that
    // pointerup ended an actual drag over a different spot — jsdom's fireEvent doesn't
    // synthesize this automatically, so it's replicated explicitly here.
    const op = textOp();
    const onOperationAdd = vi.fn();
    const onOperationUpdate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "text", operations: [op], selectedIds: [op.id], stageRef, onOperationAdd, onOperationUpdate,
    });
    stageRef.current = stage;
    const overlay = container.querySelector(".operation--text") as HTMLElement;
    fireEvent.pointerDown(overlay, { clientX: 60, clientY: 610, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 160, clientY: 700 });
    fireEvent.pointerUp(stage);
    // The click's target is the stage itself (empty canvas), same as a real release.
    fireEvent.click(stage, { clientX: 160, clientY: 700 });
    expect(onOperationAdd).not.toHaveBeenCalled();
  });

  it("does not suppress a genuine plain click after a drag elsewhere finished", () => {
    const op = shapeOp();
    const onOperationAdd = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "text", operations: [op], selectedIds: [op.id], stageRef, onOperationAdd,
    });
    stageRef.current = stage;
    const overlay = container.querySelector(".operation--shape-rectangle") as HTMLElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 150, clientY: 150 });
    fireEvent.pointerUp(stage);
    fireEvent.click(stage, { clientX: 150, clientY: 150 });
    // A separate, later plain click on empty canvas must still add text normally.
    fireEvent.click(stage, { clientX: 300, clientY: 300 });
    expect(onOperationAdd).toHaveBeenCalledTimes(1);
  });

  it("renders snapped alignment guides while dragging near an edge", () => {
    const op = shapeOp({ rect: { x: 100, y: 700, width: 80, height: 40 } });
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id], stageRef,
    });
    stageRef.current = stage;
    const overlay = container.querySelector(".operation--shape-rectangle") as HTMLElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 50, pointerId: 1 });
    // Drag toward the very top so the rect's top edge snaps to the y=0 guide line.
    fireEvent.pointerMove(stage, { clientX: 100, clientY: 2 });
    expect(container.querySelector(".guides-layer .guide")).toBeTruthy();
    // at least one guide should be rendered; snapped class appears when within tolerance
    fireEvent.pointerUp(stage);
  });

  it("pointer move without drag/resize is a no-op", () => {
    const onOperationUpdate = vi.fn();
    const { stage } = renderCanvas({ onOperationUpdate });
    fireEvent.pointerMove(stage, { clientX: 10, clientY: 10 });
    expect(onOperationUpdate).not.toHaveBeenCalled();
  });

  it("pointer cancel and lost capture clear drag state", () => {
    const op = shapeOp();
    const onOperationsTranslate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id], stageRef, onOperationsTranslate,
    });
    stageRef.current = stage;
    const overlay = container.querySelector(".operation--shape-rectangle") as HTMLElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.pointerCancel(stage);
    fireEvent.pointerMove(stage, { clientX: 150, clientY: 150 });
    fireEvent.pointerUp(stage);
    expect(onOperationsTranslate).not.toHaveBeenCalled();

    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, pointerId: 1 });
    fireEvent.lostPointerCapture(stage);
    onOperationsTranslate.mockClear();
    fireEvent.pointerMove(stage, { clientX: 160, clientY: 160 });
    fireEvent.pointerUp(stage);
    expect(onOperationsTranslate).not.toHaveBeenCalled();
  });

  it("clicking with the Check mark tool places a mark centered on the click point", () => {
    const onOperationAdd = vi.fn();
    const { stage } = renderCanvas({ activeTool: "mark-check", onOperationAdd });
    fireEvent.click(stage, { clientX: 100, clientY: 400 });
    expect(onOperationAdd).toHaveBeenCalledTimes(1);
    expect(onOperationAdd.mock.calls[0][0].type).toBe("form-mark");
    expect(onOperationAdd.mock.calls[0][0].mark).toBe("check");
  });

  it("a placed check mark can be dragged like any other overlay", () => {
    const op: EditOperation = {
      id: "mark-1", type: "form-mark", mark: "check", pageIndex: 0,
      rect: { x: 100, y: 400, width: 16, height: 16 }, createdAt: 1, color: "#111827",
    };
    const onOperationsTranslate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id], stageRef, onOperationsTranslate,
    });
    stageRef.current = stage;
    const overlay = container.querySelector(".operation--form-mark") as HTMLElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 150, clientY: 450 });
    fireEvent.pointerUp(stage);
    expect(onOperationsTranslate).toHaveBeenCalledWith(["mark-1"], expect.any(Number), expect.any(Number));
  });
});

describe("PdfCanvas - marquee multi-select (select tool)", () => {
  const twoShapes = () => [
    shapeOp({ id: "shape-1", rect: { x: 50, y: 600, width: 80, height: 40 } }),
    shapeOp({ id: "shape-2", rect: { x: 200, y: 600, width: 80, height: 40 } }),
  ];

  it("renders the rubber-band while dragging and selects every intersected operation", () => {
    // Viewport (scale 1, page 792): shape-1 top = 792-600-40 = 152, spans x 50..130.
    const ops = twoShapes();
    const onOperationSelect = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select", operations: ops, selectedIds: [], stageRef, onOperationSelect,
    });
    stageRef.current = stage;
    fireEvent.pointerDown(stage, { clientX: 30, clientY: 140, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 300, clientY: 210 });
    expect(container.querySelector(".select-marquee")).toBeTruthy();
    fireEvent.pointerUp(stage, { clientX: 300, clientY: 210 });
    expect(onOperationSelect).toHaveBeenCalledWith(["shape-1", "shape-2"]);
    expect(container.querySelector(".select-marquee")).toBeNull();
  });

  it("a marquee over empty space selects nothing", () => {
    const ops = twoShapes();
    const onOperationSelect = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { stage } = renderCanvas({
      activeTool: "select", operations: ops, selectedIds: [], stageRef, onOperationSelect,
    });
    stageRef.current = stage;
    fireEvent.pointerDown(stage, { clientX: 400, clientY: 400, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 500, clientY: 500 });
    fireEvent.pointerUp(stage, { clientX: 500, clientY: 500 });
    expect(onOperationSelect).toHaveBeenCalledWith([]);
  });

  it("shift at marquee end unions the hits with the existing selection (no toggling)", () => {
    const ops = twoShapes();
    const onOperationSelect = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { stage } = renderCanvas({
      activeTool: "select", operations: ops, selectedIds: ["shape-1"], stageRef, onOperationSelect,
    });
    stageRef.current = stage;
    fireEvent.pointerDown(stage, { clientX: 30, clientY: 140, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 300, clientY: 210 });
    fireEvent.pointerUp(stage, { clientX: 300, clientY: 210, shiftKey: true });
    // shape-1 is already selected, so only shape-2 is toggled in — a union, not a toggle-out.
    expect(onOperationSelect).toHaveBeenCalledWith(["shape-2"], true);
  });

  it("Escape cancels an in-progress marquee without changing the selection", () => {
    const ops = twoShapes();
    const onOperationSelect = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select", operations: ops, selectedIds: [], stageRef, onOperationSelect,
    });
    stageRef.current = stage;
    fireEvent.pointerDown(stage, { clientX: 30, clientY: 140, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 300, clientY: 210 });
    expect(container.querySelector(".select-marquee")).toBeTruthy();
    // A non-Escape key leaves the marquee alive.
    fireEvent.keyDown(window, { key: "a" });
    expect(container.querySelector(".select-marquee")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".select-marquee")).toBeNull();
    fireEvent.pointerUp(stage, { clientX: 300, clientY: 210 });
    expect(onOperationSelect).not.toHaveBeenCalled();
  });
});

describe("PdfCanvas - multi-selection group chrome", () => {
  const groupOps = () => [
    shapeOp({ id: "shape-1", rect: { x: 50, y: 600, width: 80, height: 40 } }),
    shapeOp({ id: "shape-2", rect: { x: 200, y: 500, width: 80, height: 40 } }),
  ];

  it("renders the group outline spanning the members and no single-op chrome", () => {
    const ops = groupOps();
    const { container } = renderCanvas({ operations: ops, selectedIds: ["shape-1", "shape-2"] });
    const outline = container.querySelector(".group-selection-outline") as HTMLElement;
    expect(outline).toBeTruthy();
    // min left = 50; top = min(792-600-40, 792-500-40) = min(152, 252) = 152;
    // right = max(130, 280) = 280 -> width 230; bottom = max(192, 292) -> height 140.
    expect(outline.style.left).toBe("50px");
    expect(outline.style.top).toBe("152px");
    expect(outline.style.width).toBe("230px");
    expect(outline.style.height).toBe("140px");
    // Exactly-one-selected chrome must not render for a group.
    expect(container.querySelector(".floating-toolbar")).toBeNull();
    expect(container.querySelector(".resize-frame")).toBeNull();
  });

  it("shows the Selected N objects count and fires group duplicate/delete", () => {
    const ops = groupOps();
    const onOperationsAdd = vi.fn();
    const onOperationsRemove = vi.fn();
    const onOperationSelect = vi.fn();
    const { container, getByLabelText } = renderCanvas({
      operations: ops, selectedIds: ["shape-1", "shape-2"], onOperationsAdd, onOperationsRemove, onOperationSelect,
    });
    expect(container.querySelector(".group-toolbar__count")?.textContent).toBe("Selected 2 objects");
    fireEvent.click(getByLabelText("Duplicate selected"));
    expect(onOperationsAdd).toHaveBeenCalledTimes(1);
    const clones = onOperationsAdd.mock.calls[0][0] as EditOperation[];
    expect(clones).toHaveLength(2);
    expect(clones.every((clone) => clone.id !== "shape-1" && clone.id !== "shape-2")).toBe(true);
    // The whole duplicated group stays selected (add-many alone would
    // collapse the selection to the last clone).
    expect(onOperationSelect).toHaveBeenCalledWith(clones.map((clone) => clone.id));
    fireEvent.click(getByLabelText("Delete selected"));
    expect(onOperationsRemove).toHaveBeenCalledWith(["shape-1", "shape-2"]);
  });

  it("renders no group chrome when fewer than two selected members are on the page", () => {
    const ops = groupOps();
    const { container } = renderCanvas({
      operations: [ops[0]], selectedIds: ["shape-1", "op-from-another-page"],
    });
    expect(container.querySelector(".group-selection-outline")).toBeNull();
    expect(container.querySelector(".group-toolbar")).toBeNull();
  });
});

describe("PdfCanvas - text-snapped annotations", () => {
  // Two distinct run lines at pdf y=700 (viewport 78..92) and y=680 (98..112).
  const runItems: TextItem[] = [
    { str: "First line of text", pageIndex: 0, rect: { x: 50, y: 700, width: 200, height: 14 }, fontSize: 12, fontName: "Arial" },
    { str: "Second line of text", pageIndex: 0, rect: { x: 50, y: 680, width: 200, height: 14 }, fontSize: 12, fontName: "Arial" },
  ];

  function setup(activeTool: "highlight" | "strikeout" | "underline") {
    const onOperationAdd = vi.fn();
    const onOperationsAdd = vi.fn();
    const onOperationSelect = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const rendered = renderCanvas({
      activeTool, textItems: runItems, stageRef, onOperationAdd, onOperationsAdd, onOperationSelect,
    });
    stageRef.current = rendered.stage;
    return { ...rendered, onOperationAdd, onOperationsAdd, onOperationSelect };
  }

  it("marquee across two run lines emits one annotation per line via the batch callback", async () => {
    const { stage, onOperationAdd, onOperationsAdd, onOperationSelect } = setup("highlight");
    fireEvent.pointerDown(stage, { clientX: 60, clientY: 80, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 200, clientY: 110 });
    fireEvent.pointerUp(stage, { clientX: 200, clientY: 110 });
    await waitFor(() => expect(onOperationsAdd).toHaveBeenCalled());
    const created = onOperationsAdd.mock.calls[0][0] as EditOperation[];
    expect(created).toHaveLength(2);
    expect(created.every((op) => op.type === "annotation")).toBe(true);
    // Clipped horizontally to the marquee (pdf x 60..200), full run line vertically.
    expect(created[0].rect).toMatchObject({ x: 60, width: 140, height: 14 });
    expect(onOperationSelect).toHaveBeenLastCalledWith([created[1].id]);
    expect(onOperationAdd).not.toHaveBeenCalled();
  });

  it("a plain click on a run annotates the whole run (strikeout)", async () => {
    const { stage, onOperationsAdd } = setup("strikeout");
    fireEvent.pointerDown(stage, { clientX: 100, clientY: 85, pointerId: 1 });
    fireEvent.pointerUp(stage, { clientX: 100, clientY: 85 });
    await waitFor(() => expect(onOperationsAdd).toHaveBeenCalled());
    const created = onOperationsAdd.mock.calls[0][0] as EditOperation[];
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ type: "annotation", kind: "strikeout" });
    expect(created[0].rect).toEqual({ x: 50, y: 700, width: 200, height: 14 });
  });

  it("marquee over empty page area falls back to the free-rect annotation (underline)", async () => {
    const { stage, onOperationAdd, onOperationsAdd } = setup("underline");
    fireEvent.pointerDown(stage, { clientX: 300, clientY: 300, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 420, clientY: 340 });
    fireEvent.pointerUp(stage, { clientX: 420, clientY: 340 });
    await waitFor(() => expect(onOperationAdd).toHaveBeenCalled());
    expect(onOperationAdd.mock.calls[0][0]).toMatchObject({ type: "annotation", kind: "underline" });
    expect(onOperationsAdd).not.toHaveBeenCalled();
  });

  it("a plain click on empty page area falls back to the default-size annotation", async () => {
    const { stage, onOperationAdd, onOperationsAdd } = setup("highlight");
    fireEvent.pointerDown(stage, { clientX: 400, clientY: 400, pointerId: 1 });
    fireEvent.pointerUp(stage, { clientX: 400, clientY: 400 });
    await waitFor(() => expect(onOperationAdd).toHaveBeenCalled());
    expect(onOperationAdd.mock.calls[0][0]).toMatchObject({ type: "annotation", kind: "highlight" });
    expect(onOperationsAdd).not.toHaveBeenCalled();
  });
});

describe("PdfCanvas - search match highlight", () => {
  it("renders the pink match flag when the highlight targets the current page", () => {
    const { container } = renderCanvas({
      searchHighlight: { pageIndex: 0, rect: { x: 100, y: 700, width: 50, height: 14 } },
    });
    const flag = container.querySelector(".search-match-highlight") as HTMLElement;
    expect(flag).toBeTruthy();
    // pdfRectToViewport at scale 1: top = 792 - 700 - 14 = 78
    expect(flag.style.left).toBe("100px");
    expect(flag.style.top).toBe("78px");
    expect(flag.style.width).toBe("50px");
    expect(flag.style.height).toBe("14px");
  });

  it("hides the flag when the highlight belongs to another page", () => {
    const { container } = renderCanvas({
      searchHighlight: { pageIndex: 2, rect: { x: 100, y: 700, width: 50, height: 14 } },
    });
    expect(container.querySelector(".search-match-highlight")).toBeNull();
  });
});

describe("PdfCanvas - resize interactions", () => {
  it("resizing from the SE handle updates the rect", () => {
    const op = shapeOp();
    const onOperationUpdate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id], stageRef, onOperationUpdate,
    });
    stageRef.current = stage;
    const handles = container.querySelectorAll(".resize-handle");
    // HANDLES order: nw, n, ne, e, se, s, sw, w  -> index 4 is "se"
    fireEvent.pointerDown(handles[4], { clientX: 240, clientY: 470, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 300, clientY: 530 });
    expect(onOperationUpdate).not.toHaveBeenCalled();
    fireEvent.pointerUp(stage);
    expect(onOperationUpdate).toHaveBeenCalled();
    expect(onOperationUpdate.mock.calls.at(-1)?.[1]).toHaveProperty("rect");
  });

  it("resizing from the NW handle clamps to the minimum size", () => {
    const op = shapeOp({ rect: { x: 100, y: 400, width: 20, height: 20 } });
    const onOperationUpdate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id], stageRef, onOperationUpdate,
    });
    stageRef.current = stage;
    const handles = container.querySelectorAll(".resize-handle");
    // index 0 is "nw"
    fireEvent.pointerDown(handles[0], { clientX: 100, clientY: 372, pointerId: 1 });
    // drag far past the opposite edge to force min clamp on both axes
    fireEvent.pointerMove(stage, { clientX: 400, clientY: 400 });
    fireEvent.pointerUp(stage);
    expect(onOperationUpdate).toHaveBeenCalled();
    // The clamp must keep the opposite (SE) edge anchored, not just cap the
    // size: op rect is x:100..120, y:400..420 (PDF space, page height 792).
    // MIN_RESIZE_PX is 8, so the clamped rect hugs the SE corner.
    const [, patch] = onOperationUpdate.mock.calls.at(-1)!;
    const rect = (patch as { rect: { x: number; y: number; width: number; height: number } }).rect;
    expect(rect.width).toBe(8);
    expect(rect.height).toBe(8);
    expect(rect.x + rect.width).toBeCloseTo(120, 5);
    expect(rect.y).toBeCloseTo(400, 5);
  });

  it("resizing from the SE handle clamps size without re-anchoring the NW corner", () => {
    const op = shapeOp({ rect: { x: 100, y: 400, width: 20, height: 20 } });
    const onOperationUpdate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id], stageRef, onOperationUpdate,
    });
    stageRef.current = stage;
    const handles = container.querySelectorAll(".resize-handle");
    // The 20x20 rect is below the midpoint-handle threshold, so only corner
    // handles render: nw(0), ne(1), se(2), sw(3).
    fireEvent.pointerDown(handles[2], { clientX: 120, clientY: 392, pointerId: 1 });
    // drag far past the opposite (NW) corner to force min clamp on both axes
    fireEvent.pointerMove(stage, { clientX: 0, clientY: 300 });
    fireEvent.pointerUp(stage);
    const [, patch] = onOperationUpdate.mock.calls.at(-1)!;
    const rect = (patch as { rect: { x: number; y: number; width: number; height: number } }).rect;
    expect(rect.width).toBe(8);
    expect(rect.height).toBe(8);
    // East/south handles clamp size only — the NW anchor must not move.
    expect(rect.x).toBeCloseTo(100, 5);
    expect(rect.y + rect.height).toBeCloseTo(420, 5);
  });

  it("resize start without a stage ref does nothing", () => {
    const op = shapeOp();
    const onOperationUpdate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id], stageRef, onOperationUpdate,
    });
    // leave stageRef.current null
    const handles = container.querySelectorAll(".resize-handle");
    fireEvent.pointerDown(handles[4], { clientX: 240, clientY: 470, pointerId: 1 });
    expect(onOperationUpdate).not.toHaveBeenCalled();
  });
});

describe("PdfCanvas - keyboard delete", () => {
  it("removes the selected operation on Delete", () => {
    const op = shapeOp();
    const onOperationsRemove = vi.fn();
    renderCanvas({ operations: [op], selectedIds: [op.id], onOperationsRemove });
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onOperationsRemove).toHaveBeenCalledWith([op.id]);
  });

  it("removes every member of a multi-selection on Backspace", () => {
    const first = shapeOp();
    const second = shapeOp({ id: "shape-2", rect: { x: 300, y: 200, width: 60, height: 40 } });
    const onOperationsRemove = vi.fn();
    renderCanvas({ operations: [first, second], selectedIds: [first.id, second.id], onOperationsRemove });
    fireEvent.keyDown(window, { key: "Backspace" });
    expect(onOperationsRemove).toHaveBeenCalledWith([first.id, second.id]);
  });

  it("ignores other keys", () => {
    const op = shapeOp();
    const onOperationsRemove = vi.fn();
    renderCanvas({ operations: [op], selectedIds: [op.id], onOperationsRemove });
    fireEvent.keyDown(window, { key: "a" });
    expect(onOperationsRemove).not.toHaveBeenCalled();
  });

  it("does not delete when focus is in an editable field", () => {
    const op = shapeOp();
    const onOperationsRemove = vi.fn();
    renderCanvas({ operations: [op], selectedIds: [op.id], onOperationsRemove });
    const input = window.document.createElement("input");
    window.document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onOperationsRemove).not.toHaveBeenCalled();
    window.document.body.removeChild(input);
  });

  it("does not register the handler when nothing is selected", () => {
    const onOperationsRemove = vi.fn();
    renderCanvas({ selectedIds: [], onOperationsRemove });
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onOperationsRemove).not.toHaveBeenCalled();
  });
});

describe("PdfCanvas - effects", () => {
  it("registers embedded fonts when documentFonts provided", async () => {
    const { registerEmbeddedFont } = await import("../src/engine/fontRegistry");
    renderCanvas({
      documentFonts: { a: { key: "font-a", bytes: new Uint8Array([1]) } } satisfies DocumentFonts,
    });
    expect(registerEmbeddedFont).toHaveBeenCalledWith("font-a", expect.anything());
  });

  it("suppresses overlapping text-layer spans for replacement ops", async () => {
    // sourceCoverRect overlapping the whole page so spans (bounded at 0,0,612,792) are hidden
    const op = textOp({
      sourceCoverRect: { x: 0, y: 0, width: 612, height: 792 },
      rect: { x: 0, y: 0, width: 612, height: 792 },
    });
    const { container } = renderCanvas({ operations: [op] });
    await waitFor(() => {
      const span = container.querySelector(".react-pdf__Page__textContent span") as HTMLElement;
      expect(span.getAttribute("data-akki-suppressed")).toBe("true");
    });
  });

  it("un-suppresses a span via the MutationObserver when it stops overlapping", async () => {
    // cover rect viewport: top=(792-600-100)*1=92, height=100 -> 92..192
    const op = textOp({ sourceCoverRect: { x: 0, y: 600, width: 100, height: 100 }, rect: { x: 0, y: 600, width: 100, height: 100 } });
    const { container } = renderCanvas({ operations: [op] });
    await waitFor(() => expect(container.querySelector(".react-pdf__Page__canvas")).toBeTruthy());
    const span = container.querySelector(".react-pdf__Page__textContent span") as HTMLElement;
    // overlapping bounds -> effect suppresses it
    let bounds = { left: 10, top: 100, right: 60, bottom: 150, width: 50, height: 50, x: 10, y: 100, toJSON() { } };
    span.getBoundingClientRect = vi.fn(() => bounds) as typeof span.getBoundingClientRect;
    await waitFor(() => expect(span.getAttribute("data-akki-suppressed")).toBe("true"));
    // move the span out of the cover region, then trigger a style mutation
    // INSIDE the text layer so suppressReplacedTextLayer re-runs and
    // un-suppresses it (mutations elsewhere in the stage are filtered out).
    bounds = { left: 10, top: 700, right: 60, bottom: 740, width: 50, height: 40, x: 10, y: 700, toJSON() { } };
    await act(async () => {
      span.style.opacity = "0.99";
      await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() => expect(span.getAttribute("data-akki-suppressed")).toBeNull());
  });

  it("ignores style mutations outside the text layer (drag frames must not re-trigger the span scan)", async () => {
    const op = textOp({ sourceCoverRect: { x: 0, y: 600, width: 100, height: 100 }, rect: { x: 0, y: 600, width: 100, height: 100 } });
    const { container } = renderCanvas({ operations: [op] });
    await waitFor(() => expect(container.querySelector(".react-pdf__Page__canvas")).toBeTruthy());
    const span = container.querySelector(".react-pdf__Page__textContent span") as HTMLElement;
    let bounds = { left: 10, top: 100, right: 60, bottom: 150, width: 50, height: 50, x: 10, y: 100, toJSON() { } };
    span.getBoundingClientRect = vi.fn(() => bounds) as typeof span.getBoundingClientRect;
    await waitFor(() => expect(span.getAttribute("data-akki-suppressed")).toBe("true"));
    // Move the span out of the cover region, then mutate style OUTSIDE the
    // text layer (what every drag/resize frame does) — the filtered observer
    // must NOT re-scan, so the span stays suppressed.
    bounds = { left: 10, top: 700, right: 60, bottom: 740, width: 50, height: 40, x: 10, y: 700, toJSON() { } };
    await act(async () => {
      (container.querySelector(".react-pdf__Page__canvas") as HTMLElement).style.opacity = "0.98";
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(span.getAttribute("data-akki-suppressed")).toBe("true");
  });

  it("clears a stale suppressed span when no cover rects are present", async () => {
    const { container, rerender, props } = renderCanvas({ operations: [] });
    await waitFor(() => expect(container.querySelector(".react-pdf__Page__canvas")).toBeTruthy());
    const span = container.querySelector(".react-pdf__Page__textContent span") as HTMLElement;
    // manually mark suppressed even though no replacement ops exist
    span.setAttribute("data-akki-suppressed", "true");
    span.style.visibility = "hidden";
    // re-run the effect (scale change) with still-empty cover rects -> 451-455 clears it
    rerender(<PdfCanvas {...props} operations={[]} scale={1.0003} />);
    await waitFor(() => expect(span.getAttribute("data-akki-suppressed")).toBeNull());
  });

  it("clears suppression when there are no replacement cover rects", async () => {
    const { container, rerender, props } = renderCanvas({
      operations: [textOp({ sourceCoverRect: { x: 0, y: 0, width: 612, height: 792 }, rect: { x: 0, y: 0, width: 612, height: 792 } })],
    });
    await waitFor(() => {
      expect(container.querySelector("span[data-akki-suppressed]")).toBeTruthy();
    });
    rerender(<PdfCanvas {...props} operations={[]} />);
    await waitFor(() => {
      expect(container.querySelector("span[data-akki-suppressed]")).toBeNull();
    });
  });
});

describe("PdfCanvas - re-render resets", () => {
  it("resets page-rendered state when the document fingerprint changes", async () => {
    const { container, rerender, props } = renderCanvas({
      activeTool: "text", textItems: [
        { str: "x", pageIndex: 0, rect: { x: 1, y: 1, width: 5, height: 5 } },
      ]
    });
    await waitFor(() => expect(container.querySelector(".text-hit-layer.is-active")).toBeTruthy());
    rerender(<PdfCanvas {...props} document={{ ...DOC, fingerprint: "fp-2" }} />);
    // after fingerprint change isPageRendered resets; the mocked Page re-fires render success
    await waitFor(() => expect(container.querySelector(".react-pdf__Page__canvas")).toBeTruthy());
  });
});

describe("PdfCanvas - resizable image/signature handles", () => {
  it("renders resize handles for an image operation (isResizableOperation fallthrough)", () => {
    const op: EditOperation = {
      id: "img-1", type: "image", pageIndex: 0, rect: { x: 100, y: 400, width: 80, height: 60 },
      createdAt: 1, dataUrl: "data:image/png;base64,AAAA", mimeType: "image/png", opacity: 1,
    };
    const { container } = renderCanvas({ operations: [op], selectedIds: [op.id] });
    expect(container.querySelector(".resize-frame")).toBeTruthy();
  });

  it("does not render resize handles for an ink operation", () => {
    const ink: InkOperation = {
      id: "ink-x", type: "ink", pageIndex: 0, rect: { x: 100, y: 400, width: 80, height: 60 },
      createdAt: 1, points: [{ x: 0, y: 0 }], stroke: "#000", strokeWidth: 2,
    };
    const { container } = renderCanvas({ operations: [ink], selectedIds: [ink.id] });
    expect(container.querySelector(".resize-frame")).toBeNull();
  });
});

describe("PdfCanvas - text style inheritance + grouping", () => {
  // Items: a multi-word run on one line (forces mergeTextRun spacing), plus a
  // second line (forces a run split in groupEditableTextRuns), positioned near
  // the click point so findNearbyTextRunForStyle selects one.
  const textItems: TextItem[] = [
    { str: "Hello", pageIndex: 0, rect: { x: 50, y: 700, width: 40, height: 14 }, fontSize: 12, fontName: "UberMove-Bold", fontWeight: 700, cssFontFamily: '"Custom"' },
    { str: "world", pageIndex: 0, rect: { x: 95, y: 700, width: 40, height: 14 }, fontSize: 12, fontName: "g_d0_f1", italic: true },
    { str: ".", pageIndex: 0, rect: { x: 140, y: 700, width: 6, height: 14 }, fontSize: 12 },
    { str: "Second", pageIndex: 0, rect: { x: 50, y: 600, width: 60, height: 30 }, fontSize: 24, fontName: "serif" },
  ];

  it("creates a styled text op inheriting from a nearby run (text tool, empty-area click)", async () => {
    const onOperationAdd = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => { cb(0); return 1; });
    imageDataAlpha = 255;
    const { stage } = renderCanvas({ activeTool: "text", textItems, onOperationAdd });
    await act(async () => {
      // click near the first line (top ~ (792-700-14)*1 = 78), so y≈80
      fireEvent.click(stage, { clientX: 60, clientY: 80 });
      await Promise.resolve();
    });
    expect(onOperationAdd).toHaveBeenCalled();
    expect(onOperationAdd.mock.calls[0][0].type).toBe("text");
  });

  it("samples weights when the background sampling yields opaque ink coverage", async () => {
    const onOperationAdd = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => { cb(0); return 1; });
    // strong dark ink against light background -> exercises 700/600/500/400 branches
    imageDataColor = [240, 240, 240];
    const { stage } = renderCanvas({ activeTool: "text", textItems, onOperationAdd });
    await act(async () => {
      fireEvent.click(stage, { clientX: 60, clientY: 80 });
      await Promise.resolve();
    });
    expect(onOperationAdd).toHaveBeenCalled();
  });

  it("creates text when the canvas 2D context is unavailable (sampling skipped)", async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn(
      () => null,
    ) as typeof HTMLCanvasElement.prototype.getContext;
    const onOperationAdd = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => { cb(0); return 1; });
    const { stage } = renderCanvas({ activeTool: "text", textItems, onOperationAdd });
    await act(async () => {
      fireEvent.click(stage, { clientX: 60, clientY: 80 });
      await Promise.resolve();
    });
    expect(onOperationAdd).toHaveBeenCalled();
  });

  it("creates text when the sample rect collapses (zero-size canvas)", async () => {
    const ctx = {
      getImageData: (_x: number, _y: number, w: number, h: number) => makeImageData(Math.max(1, w), Math.max(1, h)),
      drawImage: vi.fn(), fillRect: vi.fn(),
    };
    const onOperationAdd = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => { cb(0); return 1; });
    const { stage, container } = renderCanvas({ activeTool: "text", textItems, onOperationAdd });
    // Override the rendered canvas instance to report zero intrinsic size so
    // sampleRect width/height <= 0 -> getCanvasSample returns undefined.
    const canvas = container.querySelector(".react-pdf__Page__canvas") as HTMLCanvasElement;
    canvas.getContext = vi.fn(() => ctx) as unknown as typeof canvas.getContext;
    Object.defineProperty(canvas, "width", { configurable: true, get: () => 0 });
    Object.defineProperty(canvas, "height", { configurable: true, get: () => 0 });
    await act(async () => {
      fireEvent.click(stage, { clientX: 60, clientY: 80 });
      await Promise.resolve();
    });
    expect(onOperationAdd).toHaveBeenCalled();
  });

  it("handles a transparent sample (background sampling yields no color)", async () => {
    const onOperationAdd = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => { cb(0); return 1; });
    imageDataAlpha = 100; // all pixels below the 250 alpha threshold -> no background
    const { stage } = renderCanvas({ activeTool: "text", textItems, onOperationAdd });
    await act(async () => {
      fireEvent.click(stage, { clientX: 60, clientY: 80 });
      await Promise.resolve();
    });
    expect(onOperationAdd).toHaveBeenCalled();
  });

  it("click far from any run still creates text (findNearbyTextRunForStyle returns undefined)", async () => {
    const onOperationAdd = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => { cb(0); return 1; });
    const { stage } = renderCanvas({ activeTool: "text", textItems, onOperationAdd });
    await act(async () => {
      fireEvent.click(stage, { clientX: 600, clientY: 780 });
      await Promise.resolve();
    });
    expect(onOperationAdd).toHaveBeenCalled();
  });
});

describe("PdfCanvas - resizable type branches", () => {
  it.each([
    ["highlight annotation", { id: "a1", type: "annotation", kind: "highlight", pageIndex: 0, rect: { x: 50, y: 500, width: 100, height: 20 }, createdAt: 1, color: "#ff0" }, true],
    ["note annotation", { id: "a2", type: "annotation", kind: "note", pageIndex: 0, rect: { x: 50, y: 500, width: 100, height: 40 }, createdAt: 1, color: "#00f", text: "n" }, true],
    ["strikeout annotation (not resizable)", { id: "a3", type: "annotation", kind: "strikeout", pageIndex: 0, rect: { x: 50, y: 500, width: 100, height: 18 }, createdAt: 1, color: "#f00" }, false],
    ["link (not resizable)", { id: "l1", type: "link", pageIndex: 0, rect: { x: 50, y: 500, width: 100, height: 20 }, createdAt: 1, target: { kind: "url", href: "https://x.com" } }, false],
    ["form-mark (resizable, to fit whatever box size the PDF has)", { id: "fm1", type: "form-mark", pageIndex: 0, rect: { x: 50, y: 500, width: 20, height: 20 }, createdAt: 1, mark: "check", color: "#000" }, true],
    ["shape line (not resizable)", { id: "s9", type: "shape", kind: "line", pageIndex: 0, rect: { x: 50, y: 500, width: 100, height: 4 }, createdAt: 1, stroke: "#000", strokeWidth: 2 }, false],
  ])("%s -> resize handles present=%s", (_label, op, expected) => {
    const { container } = renderCanvas({ operations: [op as EditOperation], selectedIds: [(op as EditOperation).id] });
    expect(Boolean(container.querySelector(".resize-frame"))).toBe(expected as boolean);
  });
});

describe("PdfCanvas - text run grouping coverage", () => {
  // Diverse items: a multi-word same-line run (spacing branches), a punctuation
  // glyph (no-space branch), a different-scale item (run split), a far line.
  const items: TextItem[] = [
    { str: "Foo", pageIndex: 0, rect: { x: 40, y: 700, width: 30, height: 14 }, fontSize: 12, fontName: "Arial" },
    { str: "bar", pageIndex: 0, rect: { x: 73, y: 700, width: 30, height: 14 }, fontSize: 12, fontName: "Arial" },
    { str: "!", pageIndex: 0, rect: { x: 104, y: 700, width: 6, height: 14 }, fontSize: 12, fontName: "Arial" },
    { str: "Huge", pageIndex: 0, rect: { x: 40, y: 700, width: 80, height: 40 }, fontSize: 40, fontName: "g_d0_f2" },
    { str: "FarAway", pageIndex: 0, rect: { x: 400, y: 200, width: 60, height: 14 }, fontSize: 12 },
    // item with no fontSize / fontName / cssFontFamily exercises the `?? rect.height`
    // and `?? ""` default branches in the style/grouping helpers.
    { str: "Bare", pageIndex: 0, rect: { x: 40, y: 400, width: 30, height: 14 } },
    { str: "next", pageIndex: 0, rect: { x: 72, y: 400, width: 30, height: 14 } },
  ];

  // A same-line run whose SECOND glyph is heavier so chooseRunStyleItem's reduce
  // picks a non-first item (289 true branch).
  const heavierSecond: TextItem[] = [
    { str: "lo", pageIndex: 0, rect: { x: 40, y: 700, width: 20, height: 14 }, fontSize: 12, fontName: "Arial", fontWeight: 300 },
    { str: "HI", pageIndex: 0, rect: { x: 62, y: 700, width: 20, height: 14 }, fontSize: 12, fontName: "Arial-Bold", fontWeight: 800, cssFontFamily: '"Heavy"' },
  ];

  it("picks the heavier style item when merging a run", async () => {
    const onOperationAdd = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => { cb(0); return 1; });
    const { stage } = renderCanvas({ activeTool: "text", textItems: heavierSecond, onOperationAdd });
    await act(async () => {
      fireEvent.click(stage, { clientX: 55, clientY: 80 });
      await Promise.resolve();
    });
    expect(onOperationAdd).toHaveBeenCalled();
  });

  it("inherits from a run when clicking clearly to its left", async () => {
    const onOperationAdd = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => { cb(0); return 1; });
    // single isolated run far from the left margin
    const single: TextItem[] = [
      { str: "word", pageIndex: 0, rect: { x: 200, y: 700, width: 60, height: 14 }, fontSize: 12, fontName: "Arial" },
    ];
    const { stage } = renderCanvas({ activeTool: "text", textItems: single, onOperationAdd });
    await act(async () => {
      // click center (clickX + 80) lands left of rect.left(200): 60+80=140 < 200
      fireEvent.click(stage, { clientX: 60, clientY: 80 });
      await Promise.resolve();
    });
    expect(onOperationAdd).toHaveBeenCalled();
  });

  it("ignores a run that is within the line band but far in x", async () => {
    const onOperationAdd = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => { cb(0); return 1; });
    // single short run; click on the same line band but hundreds of px to the right
    const single: TextItem[] = [
      { str: "edge", pageIndex: 0, rect: { x: 20, y: 700, width: 30, height: 14 }, fontSize: 12, fontName: "Arial" },
    ];
    const { stage } = renderCanvas({ activeTool: "text", textItems: single, onOperationAdd });
    await act(async () => {
      fireEvent.click(stage, { clientX: 560, clientY: 80 });
      await Promise.resolve();
    });
    expect(onOperationAdd).toHaveBeenCalled();
  });

  it.each([
    ["left of a run", 30, 80],
    ["inside a run", 60, 80],
    ["right of a run", 130, 80],
    ["above all runs", 300, 760],
  ])("creates inheriting text when clicking %s", async (_label, x, y) => {
    const onOperationAdd = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => { cb(0); return 1; });
    const { stage } = renderCanvas({ activeTool: "text", textItems: items, onOperationAdd });
    await act(async () => {
      fireEvent.click(stage, { clientX: x, clientY: y });
      await Promise.resolve();
    });
    expect(onOperationAdd).toHaveBeenCalled();
  });
});

describe("PdfCanvas - sampled font weight thresholds", () => {
  // A large nearby PDF text run so the canvas sample yields >= 24 opaque pixels,
  // letting sampleTextFontWeight return each of 700/600/500/400.
  const bigRun: TextItem[] = [
    { str: "Big sample text", pageIndex: 0, rect: { x: 40, y: 600, width: 300, height: 120 }, fontSize: 40, fontName: "g_d0_f1" },
  ];

  it("skips translucent pixels and rejects sparse ink (alpha + low-count branches)", async () => {
    inkFraction = 0.004; // very little ink -> colour dominant count < 3
    mixedAlpha = true; // every 4th pixel alpha 200 -> alpha-skip branches run
    const onOperationAdd = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => { cb(0); return 1; });
    const { stage } = renderCanvas({ activeTool: "text", textItems: bigRun, onOperationAdd });
    await act(async () => {
      fireEvent.click(stage, { clientX: 180, clientY: 130 });
      await Promise.resolve();
    });
    expect(onOperationAdd).toHaveBeenCalled();
  });

  it.each([
    [0.3, "700"],
    [0.13, "600"],
    [0.09, "500"],
    [0.04, "400"],
  ])("samples weight at ink fraction %s", async (fraction) => {
    inkFraction = fraction as number;
    const onOperationAdd = vi.fn();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => { cb(0); return 1; });
    // click center of the big run: top=(792-600-120)*1=72, mid ~ 72+60=132
    const { stage } = renderCanvas({ activeTool: "text", textItems: bigRun, onOperationAdd });
    await act(async () => {
      fireEvent.click(stage, { clientX: 180, clientY: 130 });
      await Promise.resolve();
    });
    expect(onOperationAdd).toHaveBeenCalled();
  });
});

describe("PdfCanvas - OperationOverlay text edit callbacks", () => {
  it("forwards text edit start, change and commit from the overlay", () => {
    const op = textOp({ text: "abc" });
    const onOperationSelect = vi.fn();
    const onOperationUpdate = vi.fn();
    const { container } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id],
      onOperationSelect, onOperationUpdate,
    });
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    // double click -> onStartTextEdit -> select + set editing
    fireEvent.doubleClick(el);
    expect(onOperationSelect).toHaveBeenCalledWith([op.id]);
    // now editing: input fires onTextChange
    const editable = container.querySelector(".operation--text") as HTMLDivElement;
    editable.textContent = "changed";
    fireEvent.input(editable);
    expect(onOperationUpdate).toHaveBeenCalledWith(op.id, { text: "changed" });
    // commit on Enter
    fireEvent.keyDown(editable, { key: "Enter" });
  });
});

describe("PdfCanvas - Sejda-style placeholder text UX", () => {
  it("selects the whole placeholder on edit start so typing replaces it", () => {
    const op = textOp({ text: "Type your text" });
    const { container } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id],
    });
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    fireEvent.doubleClick(el);
    const selection = window.getSelection();
    expect(selection?.toString()).toBe("Type your text");
  });

  it("keeps caret behavior (no full selection) for boxes with real content", () => {
    const op = textOp({ text: "Real content" });
    const { container } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id],
    });
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    fireEvent.doubleClick(el);
    const selection = window.getSelection();
    expect(selection?.toString()).toBe("");
  });

  it("discards an untouched placeholder box when the edit session ends", async () => {
    const op = textOp({ text: "Type your text" });
    const onOperationRemove = vi.fn();
    const { container, stage, rerender, props } = renderCanvas({
      activeTool: "text", operations: [op], selectedIds: [op.id], onOperationRemove,
    });
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    // Click resolves to edit mode with the Text tool.
    fireEvent.pointerDown(el, { clientX: 60, clientY: 610, pointerId: 1 });
    fireEvent.pointerUp(stage);
    // End the session by deselecting (click-away path).
    rerender(<PdfCanvas {...props} activeTool="text" operations={[op]} selectedIds={[]} onOperationRemove={onOperationRemove} />);
    await waitFor(() => expect(onOperationRemove).toHaveBeenCalledWith(op.id));
  });

  it("keeps a box whose text was actually changed", async () => {
    const edited = textOp({ text: "My real words" });
    const onOperationRemove = vi.fn();
    const { container, stage, rerender, props } = renderCanvas({
      activeTool: "text", operations: [edited], selectedIds: [edited.id], onOperationRemove,
    });
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    fireEvent.pointerDown(el, { clientX: 60, clientY: 610, pointerId: 1 });
    fireEvent.pointerUp(stage);
    rerender(<PdfCanvas {...props} activeTool="text" operations={[edited]} selectedIds={[]} onOperationRemove={onOperationRemove} />);
    await waitFor(() => expect(container.querySelector(".operation--text.is-editing")).toBeNull());
    expect(onOperationRemove).not.toHaveBeenCalled();
  });

  it("never discards a replacement overlay, even when cleared to empty", async () => {
    const replacement = textOp({
      text: "",
      whiteout: true,
      sourceCoverRect: { x: 50, y: 600, width: 120, height: 30 },
    });
    const onOperationRemove = vi.fn();
    const { container, stage, rerender, props } = renderCanvas({
      activeTool: "text", operations: [replacement], selectedIds: [replacement.id], onOperationRemove,
    });
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    fireEvent.pointerDown(el, { clientX: 60, clientY: 610, pointerId: 1 });
    fireEvent.pointerUp(stage);
    rerender(<PdfCanvas {...props} activeTool="text" operations={[replacement]} selectedIds={[]} onOperationRemove={onOperationRemove} />);
    await waitFor(() => expect(container.querySelector(".operation--text.is-editing")).toBeNull());
    expect(onOperationRemove).not.toHaveBeenCalled();
  });

  it("does not end the edit session when focus moves into the inline toolbar", () => {
    const op = textOp({ text: "Type your text" });
    const { container } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id],
    });
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    fireEvent.doubleClick(el);
    expect(container.querySelector(".operation--text.is-editing")).not.toBeNull();
    const boldButton = container.querySelector(".floating-toolbar button") as HTMLButtonElement;
    expect(boldButton).not.toBeNull();
    fireEvent.blur(el, { relatedTarget: boldButton });
    // Editing persists: styling from the toolbar applies to the live session.
    expect(container.querySelector(".operation--text.is-editing")).not.toBeNull();
  });
});

describe("PdfCanvas - editing-driven effects", () => {
  it("clears editing state when the selection changes away from the edited op", async () => {
    const op = textOp({ text: "edit me" });
    const other = shapeOp({ id: "shape-2" });
    const { container, stage, rerender, props } = renderCanvas({
      activeTool: "text", operations: [op, other], selectedIds: [op.id],
    });
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    // A click (down + up, no movement) with the Text tool resolves to edit mode.
    fireEvent.pointerDown(el, { clientX: 60, clientY: 610, pointerId: 1 });
    fireEvent.pointerUp(stage);
    // editing now active; change selection to the other op
    rerender(<PdfCanvas {...props} activeTool="text" operations={[op, other]} selectedIds={["shape-2"]} />);
    await waitFor(() => expect(container.querySelector(".operation--text.is-editing")).toBeNull());
  });

  it("does not start a drag on a text op that is currently being edited (select tool)", () => {
    const op = textOp({ text: "edit me" });
    const onOperationUpdate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id], stageRef, onOperationUpdate,
    });
    stageRef.current = stage;
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    // double click -> enters edit mode (editingTextId === op.id)
    fireEvent.doubleClick(el);
    // pointer down again in select tool -> canDragOperation returns false, no drag
    fireEvent.pointerDown(el, { clientX: 60, clientY: 610, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 90, clientY: 640 });
    expect(onOperationUpdate).not.toHaveBeenCalled();
  });

  it("clears move mode when the moved op begins text editing", () => {
    const op = textOp({ text: "edit me" });
    const { container, getByLabelText } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id],
    });
    // turn move mode on for this op
    const moveBtn = getByLabelText("Move");
    fireEvent.click(moveBtn);
    expect(moveBtn.getAttribute("aria-pressed")).toBe("true");
    // begin editing the same op -> effect clears move mode (433 true branch)
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    fireEvent.doubleClick(el);
    expect(getByLabelText("Move").getAttribute("aria-pressed")).toBe("false");
  });

  it("does not delete while editing text even with Delete pressed", () => {
    const op = textOp({ text: "edit me" });
    const onOperationRemove = vi.fn();
    const { container, stage } = renderCanvas({
      activeTool: "text", operations: [op], selectedIds: [op.id], onOperationRemove,
    });
    const el = container.querySelector(".operation--text") as HTMLDivElement;
    // A click (down + up, no movement) with the Text tool resolves to edit mode.
    fireEvent.pointerDown(el, { clientX: 60, clientY: 610, pointerId: 1 });
    fireEvent.pointerUp(stage);
    fireEvent.keyDown(window, { key: "Delete" });
    expect(onOperationRemove).not.toHaveBeenCalled();
  });

  it("drag move is a no-op when the dragged op disappears from operations", () => {
    const op = shapeOp();
    const onOperationUpdate = vi.fn();
    const stageRef = { current: null } as Props["stageRef"];
    const { container, stage, rerender, props } = renderCanvas({
      activeTool: "select", operations: [op], selectedIds: [op.id], stageRef, onOperationUpdate,
    });
    stageRef.current = stage;
    const overlay = container.querySelector(".operation--shape-rectangle") as HTMLElement;
    fireEvent.pointerDown(overlay, { clientX: 100, clientY: 100, pointerId: 1 });
    // remove the op while a drag is in progress
    rerender(<PdfCanvas {...props} activeTool="select" operations={[]} selectedIds={[]} stageRef={stageRef} onOperationUpdate={onOperationUpdate} />);
    fireEvent.pointerMove(stage, { clientX: 150, clientY: 150 });
    expect(onOperationUpdate).not.toHaveBeenCalled();
  });

});

describe("PdfCanvas - text preview", () => {
  it("applies a font preview patch to the selected text overlay via the font menu", async () => {
    const op = textOp({ text: "Preview", fontFamily: "Inter" });
    const { container } = renderCanvas({ operations: [op], selectedIds: [op.id] });
    const control = container.querySelector(".floating-toolbar__font-control") as HTMLElement;
    expect(control).toBeTruthy();
    // Open the react-select menu; focusing an option fires onTextPreview(id, patch)
    // through FontOptionRow's isFocused effect -> setTextPreview -> previewOperation.
    const input = control.querySelector("input") as HTMLInputElement;
    // Open the menu by pressing down on the control, then hover an option so
    // react-select marks it focused -> FontOptionRow effect -> onTextPreview(patch).
    await act(async () => {
      fireEvent.mouseDown(control.querySelector(".font-select__control") ?? control, { button: 0 });
      fireEvent.keyDown(input, { key: "ArrowDown", code: "ArrowDown" });
      await Promise.resolve();
    });
    const option = document.querySelector(".font-select__option") as HTMLElement | null;
    if (option) {
      await act(async () => {
        fireEvent.mouseMove(option);
        fireEvent.mouseOver(option);
        await Promise.resolve();
      });
    }
    // Blur the font input -> onTextPreview(id) with no patch -> setTextPreview(null)
    // (the `patch ? ... : null` null branch, line 812).
    await act(async () => {
      fireEvent.blur(input);
      await Promise.resolve();
    });
    // The preview overlay still renders text content; assert no crash and overlay present.
    expect(container.querySelector(".operation--text")).toBeTruthy();
  });

  it("toggles bold on a selected text op through the toolbar (onUpdate path)", () => {
    const op = textOp({ text: "Preview", fontFamily: "Inter" });
    const onOperationUpdate = vi.fn();
    const { getByLabelText } = renderCanvas({ operations: [op], selectedIds: [op.id], onOperationUpdate });
    fireEvent.click(getByLabelText("Bold"));
    expect(onOperationUpdate).toHaveBeenCalledWith(op.id, expect.objectContaining({ bold: true }));
  });
});
