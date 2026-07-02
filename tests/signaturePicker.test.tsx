import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SignaturePicker } from "../src/components/SignaturePicker";
import type { SavedSignature } from "../src/utils/storage";

function renderPicker(signatures: SavedSignature[]) {
  const onCancel = vi.fn();
  const onChoose = vi.fn();
  const onCreateNew = vi.fn();
  const onDelete = vi.fn();
  const utils = render(
    <SignaturePicker
      anchor={{ left: 100, top: 100, width: 1, height: 1 }}
      pageWidth={612}
      scale={1}
      signatures={signatures}
      onCancel={onCancel}
      onChoose={onChoose}
      onCreateNew={onCreateNew}
      onDelete={onDelete}
    />,
  );
  return { ...utils, onCancel, onChoose, onCreateNew, onDelete };
}

describe("SignaturePicker", () => {
  it("renders a typed preview in its handwriting face and forwards the choice", () => {
    const typed: SavedSignature = {
      id: "t", createdAt: 1, mode: "typed", value: "Akki", color: "#333333", fontFamily: "Satisfy",
    };
    const { container, getByRole, onChoose } = renderPicker([typed]);
    const choice = getByRole("button", { name: "Place signature Akki" });
    expect((choice.querySelector("span") as HTMLElement).style.fontFamily).toContain("Satisfy");
    fireEvent.click(choice);
    expect(onChoose).toHaveBeenCalledWith(typed);
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders an image preview only for safe data urls", () => {
    const safe: SavedSignature = {
      id: "img-safe", createdAt: 2, mode: "image", value: "data:image/png;base64,AAAA", color: "#000",
    };
    const unsafe: SavedSignature = {
      id: "img-unsafe", createdAt: 1, mode: "image", value: "https://evil.example/sig.png", color: "#000",
    };
    const { container } = renderPicker([safe, unsafe]);
    // Only the validated data URL renders an <img>; the unsafe row stays empty.
    expect(container.querySelectorAll("img")).toHaveLength(1);
  });

  it("swallows pointer events so the stage underneath never sees them", () => {
    const typed: SavedSignature = {
      id: "t", createdAt: 1, mode: "typed", value: "Akki", color: "#333", fontFamily: "Caveat",
    };
    const { getByRole } = renderPicker([typed]);
    const dialog = getByRole("dialog", { name: "Place signature" });
    fireEvent.pointerDown(dialog, { clientX: 5, clientY: 5 });
    fireEvent.click(dialog);
    expect(dialog).toBeInTheDocument();
  });

  it("forwards delete, create-new, and cancel actions", () => {
    const typed: SavedSignature = {
      id: "t", createdAt: 1, mode: "typed", value: "Akki", color: "#333", fontFamily: "Caveat",
    };
    const { getByRole, onDelete, onCreateNew, onCancel } = renderPicker([typed]);
    fireEvent.click(getByRole("button", { name: "Delete saved signature" }));
    expect(onDelete).toHaveBeenCalledWith("t");
    fireEvent.click(getByRole("button", { name: "New signature" }));
    expect(onCreateNew).toHaveBeenCalled();
    fireEvent.click(getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });
});
