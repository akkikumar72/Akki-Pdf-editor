import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FontFamilySelect } from "../src/components/FontFamilySelect";
import { fontFamilyPatch } from "../src/components/fontFamilyPatch";

vi.mock("react-select", async () => {
  const { reactSelectStub } = await import("./helpers/reactSelectStub");
  return reactSelectStub();
});

function renderSelect(overrides: Partial<React.ComponentProps<typeof FontFamilySelect>> = {}) {
  const onPreview = vi.fn();
  const onCommit = vi.fn();
  const onMenuOpen = vi.fn();
  const utils = render(
    <FontFamilySelect
      value={overrides.value ?? "Inter"}
      variant={overrides.variant}
      onPreview={overrides.onPreview ?? onPreview}
      onCommit={overrides.onCommit ?? onCommit}
      onMenuOpen={"onMenuOpen" in overrides ? overrides.onMenuOpen : onMenuOpen}
      className={overrides.className}
      aria-label={overrides["aria-label"]}
    />,
  );
  return { ...utils, onPreview, onCommit, onMenuOpen };
}

describe("fontFamilyPatch", () => {
  it("builds a patch that clears derived font metadata", () => {
    expect(fontFamilyPatch("Arial")).toEqual({
      fontFamily: "Arial",
      cssFontFamily: undefined,
      detectedFontName: undefined,
      embeddedFontKey: undefined,
    });
  });
});

describe("FontFamilySelect", () => {
  beforeEach(() => vi.clearAllMocks());

  it("commits the chosen font and clears the live preview", () => {
    const { onCommit, onPreview } = renderSelect();

    // Mounting focuses the first option (Amiri), which live-previews it via the
    // custom Option row's context — exercises the focused-Option preview path.
    expect(onPreview).toHaveBeenCalledWith({
      fontFamily: "Amiri",
      cssFontFamily: undefined,
      detectedFontName: undefined,
      embeddedFontKey: undefined,
    });

    onPreview.mockClear();
    fireEvent.click(screen.getByTestId("inspector-font-change"));
    expect(onCommit).toHaveBeenCalledWith({
      fontFamily: "Arial",
      cssFontFamily: undefined,
      detectedFontName: undefined,
      embeddedFontKey: undefined,
    });
    expect(onPreview).toHaveBeenCalledWith();
  });

  it("ignores a null selection (no commit, no preview)", () => {
    const { onCommit, onPreview } = renderSelect();
    onPreview.mockClear();
    fireEvent.click(screen.getByTestId("rs-change-null"));
    expect(onCommit).not.toHaveBeenCalled();
    expect(onPreview).not.toHaveBeenCalled();
  });

  it("clears the live preview on blur", () => {
    const { onPreview } = renderSelect();
    onPreview.mockClear();
    fireEvent.click(screen.getByTestId("inspector-font-blur"));
    expect(onPreview).toHaveBeenCalledWith();
  });

  it("clears the live preview when the menu closes", () => {
    const { onPreview } = renderSelect();
    onPreview.mockClear();
    fireEvent.click(screen.getByTestId("inspector-font-close"));
    expect(onPreview).toHaveBeenCalledWith();
  });

  it("forwards menu-open", () => {
    const { onMenuOpen } = renderSelect();
    fireEvent.click(screen.getByTestId("inspector-font-open"));
    expect(onMenuOpen).toHaveBeenCalledTimes(1);
  });

  it("does not throw when onMenuOpen is omitted", () => {
    renderSelect({ onMenuOpen: undefined });
    fireEvent.click(screen.getByTestId("inspector-font-open"));
    expect(screen.getByTestId("font-select")).toBeInTheDocument();
  });

  it("shows the compact 'Aa' value label in the default toolbar variant", () => {
    renderSelect();
    expect(screen.getByTestId("value-label").textContent).toBe("Aa");
  });

  it("shows the full font label as the value in the inspector variant", () => {
    renderSelect({ variant: "inspector", value: "Inter" });
    expect(screen.getByTestId("value-label").textContent).toBe("Inter");
  });
});
