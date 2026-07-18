import { act, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TextPreviewProvider } from "../src/state/TextPreviewProvider";
import { useTextPreview, useTextPreviewDispatch } from "../src/state/textPreviewContext";
import type { TextPreview } from "../src/state/textPreviewContext";

let latestPreview: TextPreview = null;
let latestDispatch: ((id: string, patch?: Record<string, unknown>) => void) | null = null;

function Probe() {
  latestPreview = useTextPreview();
  latestDispatch = useTextPreviewDispatch();
  return <span data-testid="probe">{latestPreview ? latestPreview.id : "none"}</span>;
}

function renderProbe(selectedIds: string[] = []) {
  return render(
    <TextPreviewProvider selectedIds={selectedIds}>
      <Probe />
    </TextPreviewProvider>,
  );
}

describe("textPreviewContext", () => {
  it("starts with a null preview and a no-op dispatch when used outside a provider", () => {
    render(<Probe />);
    expect(latestPreview).toBeNull();
    expect(() => act(() => latestDispatch?.("op-1", { fontFamily: "Courier" }))).not.toThrow();
  });

  it("dispatch with a patch sets the preview to { id, patch }", () => {
    renderProbe(["op-1"]);
    act(() => latestDispatch?.("op-1", { fontFamily: "Courier" }));
    expect(latestPreview).toEqual({ id: "op-1", patch: { fontFamily: "Courier" } });
  });

  it("dispatch without a patch clears the preview back to null", () => {
    renderProbe(["op-1"]);
    act(() => latestDispatch?.("op-1", { fontFamily: "Courier" }));
    act(() => latestDispatch?.("op-1"));
    expect(latestPreview).toBeNull();
  });

  it("clears the preview when the selectedIds prop changes identity", () => {
    const { rerender } = renderProbe(["op-1"]);
    act(() => latestDispatch?.("op-1", { fontFamily: "Courier" }));
    expect(latestPreview).toEqual({ id: "op-1", patch: { fontFamily: "Courier" } });

    rerender(
      <TextPreviewProvider selectedIds={["op-2"]}>
        <Probe />
      </TextPreviewProvider>,
    );
    expect(latestPreview).toBeNull();
  });
});
