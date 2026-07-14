import { useEffect, useRef, useState } from "react";
import { SIGNATURE_COLORS, SIGNATURE_FONTS } from "../editor/signatureFonts";
import type { SignatureDraft } from "../editor/signaturePlacement";
import { validateImageFile } from "../utils/fileValidation";
import { clampInkPoint, exportInkPng, renderInk, type InkStroke } from "../utils/signatureInk";
import { Button } from "./ui/button";

type SignatureTab = "type" | "draw" | "upload";

type SignatureModalProps = {
  onCancel: () => void;
  onNotice?: (message: string) => void;
  onSave: (draft: SignatureDraft, saveForReuse: boolean) => void;
};

const DRAW_WIDTH = 440;
const DRAW_HEIGHT = 160;

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
}

export function SignatureModal({ onCancel, onNotice, onSave }: SignatureModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<SignatureTab>("type");
  const [name, setName] = useState("");
  const [color, setColor] = useState(SIGNATURE_COLORS[6]);
  const [fontFamily, setFontFamily] = useState(SIGNATURE_FONTS[0].label);
  const [strokes, setStrokes] = useState<InkStroke[]>([]);
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const [saveForReuse, setSaveForReuse] = useState(true);

  // Crisp ink on retina displays: the backing store is DPR-scaled while the
  // stroke math stays in the pad's logical 440x160 space.
  const pixelRatio = Math.max(1, window.devicePixelRatio || 0);

  useEffect(() => {
    dialogRef.current?.querySelector<HTMLElement>("input, button")?.focus();
  }, []);

  // The pad re-renders from the stroke model on every change (Documenso-style):
  // strokes are data, not paint, which is what makes Undo and trimmed export possible.
  useEffect(() => {
    if (tab !== "draw") return;
    /* v8 ignore next -- the canvas ref is attached whenever the draw tab is mounted */
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, DRAW_WIDTH, DRAW_HEIGHT);
    renderInk(context, strokes);
  }, [tab, strokes, pixelRatio]);

  const hasDrawn = strokes.length > 0;
  const canSave =
    tab === "type" ? name.trim().length > 0 : tab === "draw" ? hasDrawn : Boolean(uploadedDataUrl);

  const strokePointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    // Clamped because pointer capture keeps delivering moves after the cursor
    // leaves the pad, and the trimmed export sizes itself from the ink bounds.
    return clampInkPoint(
      {
        x: ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * DRAW_WIDTH,
        y: ((event.clientY - bounds.top) / Math.max(1, bounds.height)) * DRAW_HEIGHT,
        pressure: event.pressure,
      },
      DRAW_WIDTH,
      DRAW_HEIGHT,
    );
  };

  const handleDrawStart = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!event.currentTarget.getContext("2d")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const point = strokePointFromEvent(event);
    // A bare tap is already a stroke: perfect-freehand turns a single point into a dot.
    setStrokes((previous) => [
      ...previous,
      { points: [point], color, simulatePressure: event.pointerType !== "pen" },
    ]);
  };

  const handleDrawMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const point = strokePointFromEvent(event);
    setStrokes((previous) => {
      const current = previous[previous.length - 1];
      /* v8 ignore next -- the drawing flag is only set after handleDrawStart pushed a stroke */
      if (!current) return previous;
      return [...previous.slice(0, -1), { ...current, points: [...current.points, point] }];
    });
  };

  const handleDrawEnd = () => {
    drawingRef.current = false;
  };

  const undoStroke = () => {
    setStrokes((previous) => previous.slice(0, -1));
  };

  const clearCanvas = () => {
    setStrokes([]);
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    const validation = await validateImageFile(file);
    if (!validation.ok) {
      onNotice?.(validation.reason);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      // Same invariant as the overlay renderer: only data:image/(png|jpeg)
      // payloads are kept, so a spoofed MIME type can't ride in on the header.
      if (!/^data:image\/(png|jpeg|jpg);base64,/i.test(dataUrl)) {
        onNotice?.("Only PNG or JPEG images are supported.");
        return;
      }
      setUploadedDataUrl(dataUrl);
    } catch {
      onNotice?.("Could not read that image file.");
    }
  };

  const handleSave = () => {
    if (tab === "type") {
      onSave({ mode: "typed", value: name.trim(), color, fontFamily }, saveForReuse);
      return;
    }
    if (tab === "draw") {
      const exported = exportInkPng(strokes);
      if (!exported) {
        onNotice?.("Could not capture the drawn signature.");
        return;
      }
      onSave({ mode: "image", value: exported.dataUrl, color }, saveForReuse);
      return;
    }
    /* v8 ignore next -- Save is disabled until a validated upload exists on the upload tab */
    if (!uploadedDataUrl) return;
    onSave({ mode: "image", value: uploadedDataUrl, color }, saveForReuse);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(
      /* v8 ignore next -- dialogRef is attached to the always-rendered root, so the ?? [] fallback never executes */
      dialogRef.current?.querySelectorAll<HTMLElement>("input, button, canvas[tabindex]") ?? [],
    ).filter((element) => !element.hasAttribute("disabled"));
    /* v8 ignore next -- the dialog always renders the tab strip and Cancel button, so this guard never executes */
    if (focusable.length === 0) return;
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    const nextIndex = event.shiftKey
      ? (currentIndex - 1 + focusable.length) % focusable.length
      : (currentIndex + 1) % focusable.length;
    focusable[nextIndex]?.focus();
  };

  return (
    <div className="signature-modal__backdrop" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <div
        ref={dialogRef}
        className="signature-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Create signature"
        onKeyDown={handleKeyDown}
      >
        <div className="signature-modal__head">
          <h2>Create signature</h2>
          <div className="segmented" role="tablist" aria-label="Signature source">
            {([
              ["type", "Type"],
              ["draw", "Draw"],
              ["upload", "Upload image"],
            ] as Array<[SignatureTab, string]>).map(([id, label]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {tab !== "upload" ? (
          <div className="signature-modal__swatches" role="group" aria-label="Ink color">
            {SIGNATURE_COLORS.map((swatch) => (
              <button
                key={swatch}
                className="signature-modal__swatch"
                style={{ background: swatch }}
                aria-label={`Ink color ${swatch}`}
                aria-pressed={color === swatch}
                onClick={() => setColor(swatch)}
              />
            ))}
          </div>
        ) : null}

        {tab === "type" ? (
          <div className="signature-modal__body field-stack">
            <label>
              <span>Full name</span>
              <input
                type="text"
                value={name}
                placeholder="Your name"
                onChange={(event) => setName(event.currentTarget.value)}
              />
            </label>
            <div className="signature-modal__fonts" role="group" aria-label="Signature style">
              {SIGNATURE_FONTS.map((font) => (
                <button
                  key={font.label}
                  className="signature-modal__font"
                  style={{ fontFamily: font.cssFamily, color }}
                  aria-pressed={fontFamily === font.label}
                  onClick={() => setFontFamily(font.label)}
                >
                  {name.trim() || "Your name"}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {tab === "draw" ? (
          <div className="signature-modal__body">
            <canvas
              ref={canvasRef}
              className="signature-modal__canvas"
              width={DRAW_WIDTH * pixelRatio}
              height={DRAW_HEIGHT * pixelRatio}
              aria-label="Signature drawing area"
              onPointerDown={handleDrawStart}
              onPointerMove={handleDrawMove}
              onPointerUp={handleDrawEnd}
              onPointerCancel={handleDrawEnd}
            />
            <div className="signature-modal__canvas-actions">
              <Button type="button" variant="quiet" size="sm" onClick={undoStroke} disabled={!hasDrawn}>
                Undo
              </Button>
              <Button type="button" variant="quiet" size="sm" onClick={clearCanvas} disabled={!hasDrawn}>
                Clear
              </Button>
            </div>
          </div>
        ) : null}

        {tab === "upload" ? (
          <div className="signature-modal__body field-stack">
            <input
              ref={uploadInputRef}
              type="file"
              accept="image/png,image/jpeg"
              aria-label="Signature image file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                void handleUpload(file);
              }}
            />
            {uploadedDataUrl ? (
              <div className="signature-modal__preview">
                <img src={uploadedDataUrl} alt="Uploaded signature preview" />
              </div>
            ) : (
              <p className="helper-text">PNG or JPEG, up to 20MB.</p>
            )}
          </div>
        ) : null}

        <div className="signature-modal__foot">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={saveForReuse}
              onChange={(event) => setSaveForReuse(event.currentTarget.checked)}
            />
            Save signature for reuse
          </label>
          <div className="signature-modal__actions">
            <Button type="button" variant="quiet" size="sm" onClick={onCancel}>Cancel</Button>
            <Button type="button" variant="primary" size="sm" disabled={!canSave} onClick={handleSave}>
              Save signature
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
