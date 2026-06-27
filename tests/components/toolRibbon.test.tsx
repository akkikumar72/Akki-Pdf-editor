import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolRibbon } from "../../src/components/ToolRibbon";
import type { EditorTool } from "../../src/types/editor";

function setup(activeTool: EditorTool = "select", disabled = false) {
  const props = {
    activeTool,
    disabled,
    onExport: vi.fn(),
    onHome: vi.fn(),
    onToolChange: vi.fn(),
  };
  render(<ToolRibbon {...props} />);
  return props;
}

describe("ToolRibbon", () => {
  it("returns home and exports through the apply button and format select", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: /AkkiPDF home/i }));
    expect(props.onHome).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Apply/i }));
    expect(props.onExport).toHaveBeenCalledWith("pdf");

    const select = screen.getByLabelText("Export format");
    fireEvent.change(select, { target: { value: "csv" } });
    expect(props.onExport).toHaveBeenCalledWith("csv");

    // selecting the empty placeholder does not export
    props.onExport.mockClear();
    fireEvent.change(select, { target: { value: "" } });
    expect(props.onExport).not.toHaveBeenCalled();
  });

  it("activates a single-tool group directly", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: /^Text/ }));
    expect(props.onToolChange).toHaveBeenCalledWith("text");
  });

  it("opens a multi-tool group menu, highlights the active item, and toggles it", () => {
    const props = {
      activeTool: "select" as const,
      disabled: false,
      onExport: vi.fn(),
      onHome: vi.fn(),
      onToolChange: vi.fn(),
    };
    const { rerender } = render(<ToolRibbon {...props} />);
    const formsButton = screen.getByRole("button", { name: /^Forms/ });
    fireEvent.click(formsButton);
    expect(props.onToolChange).toHaveBeenCalledWith("form-text");

    // The parent reflects the new active tool while the menu is still open,
    // so the matching item renders in its active state.
    rerender(<ToolRibbon {...props} activeTool="form-multiline" />);
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Multiline/ })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(menu).getByRole("menuitem", { name: /Dropdown/ }));
    expect(props.onToolChange).toHaveBeenCalledWith("form-dropdown");

    // re-open then toggle closed (back to a non-active group)
    rerender(<ToolRibbon {...props} activeTool="select" />);
    fireEvent.click(formsButton);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.click(formsButton);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("deactivates an active non-select group back to select", () => {
    const props = setup("highlight");
    fireEvent.click(screen.getByRole("button", { name: /^Annotate/ }));
    expect(props.onToolChange).toHaveBeenCalledWith("select");
  });
});
