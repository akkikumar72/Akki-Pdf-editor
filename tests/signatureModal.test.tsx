import { act, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SignatureModal } from "../src/components/SignatureModal";
import { SIGNATURE_COLORS, SIGNATURE_FONTS } from "../src/editor/signatureFonts";

const PNG_FILE = () =>
  new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "sig.png", { type: "image/png" });

type Ctx2D = Record<string, unknown>;

let context2d: Ctx2D | null;
let toDataUrlValue: string;
let toDataUrlThrows: boolean;

function renderModal() {
  const onCancel = vi.fn();
  const onNotice = vi.fn();
  const onSave = vi.fn();
  const utils = render(<SignatureModal onCancel={onCancel} onNotice={onNotice} onSave={onSave} />);
  const dialog = utils.getByRole("dialog", { name: "Create signature" });
  return { ...utils, dialog, onCancel, onNotice, onSave };
}

function drawStroke(canvas: HTMLCanvasElement) {
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 40, clientY: 30 });
  // Pointer capture keeps reporting moves outside the pad; the point is clamped.
  fireEvent.pointerMove(canvas, { clientX: 4000, clientY: -200 });
  fireEvent.pointerUp(canvas, { pointerId: 1 });
}

beforeEach(() => {
  context2d = {
    fillStyle: "#000000",
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
  };
  toDataUrlValue = "data:image/png;base64,DRAWN";
  toDataUrlThrows = false;
  // Spies (not prototype assignment) so vi.restoreAllMocks() reliably undoes
  // every canvas stub instead of leaking it into other tests.
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => context2d as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => {
    if (toDataUrlThrows) throw new Error("tainted");
    return toDataUrlValue;
  });
  // jsdom lacks pointer capture; seed a noop base so the spy has something to wrap.
  HTMLElement.prototype.setPointerCapture ??= () => {};
  vi.spyOn(HTMLElement.prototype, "setPointerCapture").mockImplementation(() => {});
  // jsdom reports a zero-size rect; give the pad its real 440x160 box so
  // client coordinates map onto the logical stroke space 1:1.
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockImplementation(
    () =>
      ({
        left: 0, top: 0, x: 0, y: 0, width: 440, height: 160, right: 440, bottom: 160,
        toJSON: () => ({}),
      }) as DOMRect,
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SignatureModal - type tab", () => {
  it("renders the font grid, requires a name, and saves a typed draft", () => {
    const { dialog, getByLabelText, onSave } = renderModal();
    const saveButton = within(dialog).getByRole("button", { name: "Save signature" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    const fontButtons = dialog.querySelectorAll(".signature-modal__font");
    expect(fontButtons).toHaveLength(SIGNATURE_FONTS.length);
    // Empty name shows the placeholder preview.
    expect(fontButtons[0].textContent).toBe("Your name");

    fireEvent.change(getByLabelText("Full name"), { target: { value: "  Akki Pathak  " } });
    expect(fontButtons[0].textContent).toBe("Akki Pathak");

    // Pick a different face and a different ink.
    fireEvent.click(fontButtons[2]);
    expect(fontButtons[2].getAttribute("aria-pressed")).toBe("true");
    const swatches = dialog.querySelectorAll(".signature-modal__swatch");
    expect(swatches).toHaveLength(SIGNATURE_COLORS.length);
    fireEvent.click(swatches[0]);
    expect(swatches[0].getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledWith(
      { mode: "typed", value: "Akki Pathak", color: SIGNATURE_COLORS[0], fontFamily: SIGNATURE_FONTS[2].label },
      true,
    );
  });

  it("passes saveForReuse=false when the checkbox is unchecked", () => {
    const { dialog, getByLabelText, onSave } = renderModal();
    fireEvent.change(getByLabelText("Full name"), { target: { value: "Akki" } });
    fireEvent.click(getByLabelText("Save signature for reuse"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save signature" }));
    expect(onSave.mock.calls[0][1]).toBe(false);
  });
});

describe("SignatureModal - draw tab", () => {
  function openDrawTab() {
    const utils = renderModal();
    fireEvent.click(within(utils.dialog).getByRole("tab", { name: "Draw" }));
    const canvas = utils.dialog.querySelector(".signature-modal__canvas") as HTMLCanvasElement;
    return { ...utils, canvas };
  }

  it("captures strokes, enables Undo/Clear/Save, and saves the trimmed ink PNG", () => {
    const { dialog, canvas, onSave } = openDrawTab();
    const saveButton = within(dialog).getByRole("button", { name: "Save signature" }) as HTMLButtonElement;
    const clearButton = within(dialog).getByRole("button", { name: "Clear" }) as HTMLButtonElement;
    const undoButton = within(dialog).getByRole("button", { name: "Undo" }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
    expect(clearButton.disabled).toBe(true);
    expect(undoButton.disabled).toBe(true);

    // Moving without a press draws nothing.
    fireEvent.pointerMove(canvas, { clientX: 5, clientY: 5 });
    expect((context2d as Ctx2D).fill).not.toHaveBeenCalled();

    drawStroke(canvas);
    // The pad re-renders the stroke model as filled perfect-freehand outlines.
    expect((context2d as Ctx2D).fill).toHaveBeenCalled();
    expect(saveButton.disabled).toBe(false);
    expect(clearButton.disabled).toBe(false);
    expect(undoButton.disabled).toBe(false);

    // A move after pointer up is ignored (drawing flag reset).
    const fillMock = (context2d as Ctx2D).fill as ReturnType<typeof vi.fn>;
    const fillCallsAfterStroke = fillMock.mock.calls.length;
    fireEvent.pointerMove(canvas, { clientX: 60, clientY: 60 });
    expect(fillMock.mock.calls.length).toBe(fillCallsAfterStroke);

    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "image", value: "data:image/png;base64,DRAWN" }),
      true,
    );
  });

  it("Undo drops only the last stroke; Clear empties the pad and disables Save", () => {
    const { dialog, canvas } = openDrawTab();
    const saveButton = within(dialog).getByRole("button", { name: "Save signature" }) as HTMLButtonElement;
    const undoButton = within(dialog).getByRole("button", { name: "Undo" }) as HTMLButtonElement;
    drawStroke(canvas);
    // A second stroke drawn with a pen keeps its reported pressure (no simulation).
    fireEvent.pointerDown(canvas, { clientX: 80, clientY: 40, pointerId: 2, pointerType: "pen", pressure: 0.8 });
    fireEvent.pointerMove(canvas, { clientX: 120, clientY: 70, pointerType: "pen", pressure: 0.6 });
    fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: "pen" });

    fireEvent.click(undoButton);
    expect(saveButton.disabled).toBe(false);
    fireEvent.click(undoButton);
    expect(saveButton.disabled).toBe(true);
    expect(undoButton.disabled).toBe(true);

    drawStroke(canvas);
    fireEvent.click(within(dialog).getByRole("button", { name: "Clear" }));
    expect((context2d as Ctx2D).clearRect).toHaveBeenCalled();
    expect(saveButton.disabled).toBe(true);
  });

  it("scales the canvas backing store by devicePixelRatio (and guards a falsy ratio)", () => {
    const originalRatio = window.devicePixelRatio;
    // finally-restored so a failing assertion can't leak the ratio into later tests.
    try {
      Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
      const first = openDrawTab();
      expect(first.canvas.width).toBe(880);
      expect(first.canvas.height).toBe(320);
      first.unmount();

      Object.defineProperty(window, "devicePixelRatio", { value: 0, configurable: true });
      const second = openDrawTab();
      expect(second.canvas.width).toBe(440);
      expect(second.canvas.height).toBe(160);
    } finally {
      Object.defineProperty(window, "devicePixelRatio", { value: originalRatio, configurable: true });
    }
  });

  it("does not start a stroke when no 2D context is available", () => {
    context2d = null;
    const { dialog, canvas } = openDrawTab();
    fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
    expect((within(dialog).getByRole("button", { name: "Save signature" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("notices when the ink cannot be captured (throw and non-png header)", () => {
    const first = openDrawTab();
    drawStroke(first.canvas);
    toDataUrlThrows = true;
    fireEvent.click(within(first.dialog).getByRole("button", { name: "Save signature" }));
    expect(first.onNotice).toHaveBeenCalledWith("Could not capture the drawn signature.");
    expect(first.onSave).not.toHaveBeenCalled();
    first.unmount();

    toDataUrlThrows = false;
    toDataUrlValue = "data:,";
    const second = openDrawTab();
    drawStroke(second.canvas);
    fireEvent.click(within(second.dialog).getByRole("button", { name: "Save signature" }));
    expect(second.onNotice).toHaveBeenCalledWith("Could not capture the drawn signature.");
    expect(second.onSave).not.toHaveBeenCalled();
  });
});

describe("SignatureModal - upload tab", () => {
  function openUploadTab() {
    const utils = renderModal();
    fireEvent.click(within(utils.dialog).getByRole("tab", { name: "Upload image" }));
    const input = utils.getByLabelText("Signature image file") as HTMLInputElement;
    const dropzone = utils.dialog.querySelector(".signature-modal__dropzone") as HTMLButtonElement;
    return { ...utils, input, dropzone };
  }

  it("accepts a validated PNG, previews it in the dropzone, and saves it as an image draft", async () => {
    const { dialog, input, onSave } = openUploadTab();
    // The ink swatches are irrelevant for uploads and hidden on this tab.
    expect(dialog.querySelector(".signature-modal__swatches")).toBeNull();
    await act(async () => {
      fireEvent.change(input, { target: { files: [PNG_FILE()] } });
      await Promise.resolve();
    });
    await waitFor(() => expect(dialog.querySelector(".signature-modal__dropzone img")).toBeTruthy());
    fireEvent.click(within(dialog).getByRole("button", { name: "Save signature" }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "image", value: expect.stringMatching(/^data:image\/png/) }),
      true,
    );
  });

  it("clicking the dropzone opens the file picker, and it keeps its name with a preview inside", async () => {
    const { dialog, input, dropzone } = openUploadTab();
    const click = vi.spyOn(input, "click");
    fireEvent.click(dropzone);
    expect(click).toHaveBeenCalled();

    // The control name must not collapse to the preview image's alt text.
    await act(async () => {
      fireEvent.change(input, { target: { files: [PNG_FILE()] } });
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(within(dialog).getByRole("button", { name: "Upload signature image" }).querySelector("img")).toBeTruthy(),
    );
  });

  it("accepts a file dropped onto the dropzone and ignores an empty drop", async () => {
    const { dialog, dropzone } = openUploadTab();
    fireEvent.dragOver(dropzone);
    // A drop without files (e.g. dragged text) is a no-op.
    fireEvent.drop(dropzone, { dataTransfer: {} });
    expect(dialog.querySelector(".signature-modal__dropzone img")).toBeNull();

    await act(async () => {
      fireEvent.drop(dropzone, { dataTransfer: { files: [PNG_FILE()] } });
      await Promise.resolve();
    });
    await waitFor(() => expect(dialog.querySelector(".signature-modal__dropzone img")).toBeTruthy());
  });

  it("rejects a file that fails magic-byte validation", async () => {
    const { dialog, input, onNotice } = openUploadTab();
    const bad = new File([new Uint8Array([1, 2, 3, 4])], "x.txt", { type: "text/plain" });
    await act(async () => {
      fireEvent.change(input, { target: { files: [bad] } });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onNotice).toHaveBeenCalled();
    expect(dialog.querySelector(".signature-modal__dropzone img")).toBeNull();
  });

  it("rejects a spoofed data-url header even when magic bytes pass", async () => {
    const { input, onNotice } = openUploadTab();
    // Real PNG magic bytes but a lying MIME type -> FileReader produces a
    // non-image data URL header, which the guard drops.
    const spoofed = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], "x.png", {
      type: "text/plain",
    });
    await act(async () => {
      fireEvent.change(input, { target: { files: [spoofed] } });
      await Promise.resolve();
    });
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("Only PNG or JPEG images are supported."));
  });

  it("notices when the file cannot be read", async () => {
    const { input, onNotice } = openUploadTab();
    const original = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function (this: FileReader) {
      this.onerror?.(new ProgressEvent("error") as ProgressEvent<FileReader>);
    };
    await act(async () => {
      fireEvent.change(input, { target: { files: [PNG_FILE()] } });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onNotice).toHaveBeenCalledWith("Could not read that image file.");
    FileReader.prototype.readAsDataURL = original;
  });

  it("does nothing when the change event carries no file", () => {
    const { dialog, input } = openUploadTab();
    fireEvent.change(input, { target: { files: [] } });
    expect(dialog.querySelector(".signature-modal__dropzone img")).toBeNull();
  });
});

describe("SignatureModal - dialog behaviour", () => {
  it("closes on Escape and ignores other keys", () => {
    const { dialog, onCancel } = renderModal();
    fireEvent.keyDown(dialog, { key: "a" });
    expect(onCancel).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("traps Tab focus inside the dialog (forward and backward)", () => {
    const { dialog } = renderModal();
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>("input, button")).filter(
      (element) => !element.hasAttribute("disabled"),
    );
    focusable[focusable.length - 1].focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(focusable[0]);
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(focusable[focusable.length - 1]);
  });

  it("cancel button closes the dialog", () => {
    const { dialog, onCancel } = renderModal();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
