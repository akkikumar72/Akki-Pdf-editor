import { useEffect, useRef } from "react";
import type { ViewportRect } from "../types/editor";
import type { SavedSignature } from "../utils/storage";
import { signatureCssFamily } from "../editor/signatureFonts";
import { safeImageSrc } from "../utils/safeImage";
import { clampToolbarLeft, getToolbarPlacement } from "../utils/toolbarPlacement";
import { IconTrash } from "./AppIcons";
import { Button } from "./ui/button";

type SignaturePickerProps = {
  anchor: ViewportRect;
  pageWidth: number;
  scale: number;
  signatures: SavedSignature[];
  onCancel: () => void;
  onChoose: (signature: SavedSignature) => void;
  onCreateNew: () => void;
  onDelete: (id: string) => void;
};

const PICKER_WIDTH = 272;
const PICKER_HEIGHT = 200;

/** One-click reuse of saved signatures: pick one to place it at the clicked point, or open the studio. */
export function SignaturePicker({
  anchor,
  pageWidth,
  scale,
  signatures,
  onCancel,
  onChoose,
  onCreateNew,
  onDelete,
}: SignaturePickerProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    rootRef.current?.querySelector<HTMLElement>("button")?.focus();
  }, []);

  const placement = getToolbarPlacement(anchor, PICKER_WIDTH, PICKER_HEIGHT);
  const left = clampToolbarLeft(placement.left, PICKER_WIDTH, pageWidth * scale, anchor);

  return (
    <div
      ref={rootRef}
      className="inline-popover signature-picker"
      data-placement={placement.placement}
      role="dialog"
      aria-label="Place signature"
      style={{ left, top: placement.top }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onCancel();
      }}
    >
      <p className="inline-popover__title">Place signature</p>
      <div className="signature-picker__list">
        {signatures.map((signature) => (
          <div key={signature.id} className="signature-picker__row">
            <button
              className="signature-picker__choice"
              onClick={() => onChoose(signature)}
              aria-label={`Place signature ${signature.mode === "typed" ? signature.value : "image"}`}
            >
              {signature.mode === "typed" ? (
                <span style={{ fontFamily: signatureCssFamily(signature.fontFamily), color: signature.color }}>
                  {signature.value}
                </span>
              ) : safeImageSrc(signature.value) ? (
                <img src={safeImageSrc(signature.value)} alt="" />
              ) : null}
            </button>
            <button
              className="signature-picker__delete"
              aria-label="Delete saved signature"
              onClick={() => onDelete(signature.id)}
            >
              <IconTrash aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
      <div className="inline-popover__actions">
        <Button type="button" variant="quiet" size="sm" onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="primary" size="sm" onClick={onCreateNew}>New signature</Button>
      </div>
    </div>
  );
}
