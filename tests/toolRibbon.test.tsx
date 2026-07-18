import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToolRibbon } from "../src/components/ToolRibbon";
import type { EditHistoryEntry } from "../src/state/editModel";
import type { EditorTool } from "../src/types/editor";

function makeProps(overrides: Partial<React.ComponentProps<typeof ToolRibbon>> = {}) {
  return {
    activeTool: "select" as EditorTool,
    canRedo: true,
    canUndo: true,
    disabled: false,
    historyEntries: [] as EditHistoryEntry[],
    scale: 1,
    selectedIds: ["sel-1"],
    onExport: vi.fn(),
    onDeletePage: vi.fn(),
    onFindReplace: vi.fn(),
    onHome: vi.fn(),
    onInsertPage: vi.fn(),
    onRedo: vi.fn(),
    onRemove: vi.fn(),
    onRestoreHistory: vi.fn(),
    onRotate: vi.fn(),
    onRotatePage: vi.fn(),
    onToolChange: vi.fn(),
    onUndo: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    ...overrides,
  };
}

function entry(id: string, ts: number, ops = 1): EditHistoryEntry {
  return { id, label: `Entry ${id}`, timestamp: ts, operations: Array.from({ length: ops }, () => ({} as never)) };
}

describe("ToolRibbon", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders zoom readout and fires home/zoom/rotate/insert/delete handlers", () => {
    const props = makeProps({ scale: 1.25 });
    render(<ToolRibbon {...props} />);
    expect(screen.getByText("125%")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("AkkiPDF home"));
    expect(props.onHome).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle("Zoom in"));
    expect(props.onZoomIn).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Zoom out"));
    expect(props.onZoomOut).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Rotate view"));
    expect(props.onRotate).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Rotate page permanently"));
    expect(props.onRotatePage).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Insert blank page after current page"));
    expect(props.onInsertPage).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Delete current page"));
    expect(props.onDeletePage).toHaveBeenCalled();
  });

  it("fires onFindReplace from the Find & replace button", () => {
    const props = makeProps();
    render(<ToolRibbon {...props} />);
    fireEvent.click(screen.getByTitle("Find & replace"));
    expect(props.onFindReplace).toHaveBeenCalled();
  });

  it("fires undo/redo/remove when enabled", () => {
    const props = makeProps();
    render(<ToolRibbon {...props} />);
    fireEvent.click(screen.getByTitle("Undo"));
    expect(props.onUndo).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Redo"));
    expect(props.onRedo).toHaveBeenCalled();
    fireEvent.click(screen.getByTitle("Remove selected"));
    expect(props.onRemove).toHaveBeenCalled();
  });

  it("disables undo/redo/remove based on canUndo/canRedo/selectedIds", () => {
    render(<ToolRibbon {...makeProps({ canUndo: false, canRedo: false, selectedIds: [] })} />);
    expect(screen.getByTitle("Undo")).toBeDisabled();
    expect(screen.getByTitle("Redo")).toBeDisabled();
    expect(screen.getByTitle("Remove selected")).toBeDisabled();
    expect(screen.getByTitle("Undo history")).toBeDisabled();
  });

  it("disables every control when disabled is true", () => {
    render(<ToolRibbon {...makeProps({ disabled: true })} />);
    expect(screen.getByTitle("Zoom in")).toBeDisabled();
    expect(screen.getByTitle("Undo")).toBeDisabled();
    // Tool buttons disabled too.
    expect(screen.getByRole("button", { name: /Select/ })).toBeDisabled();
  });

  describe("tool groups", () => {
    it("invokes onToolChange for a single-tool group", () => {
      const props = makeProps();
      render(<ToolRibbon {...props} />);
      // "Text" group has a single tool.
      fireEvent.click(screen.getByRole("button", { name: /Text/ }));
      expect(props.onToolChange).toHaveBeenCalledWith("text");
    });

    it("opens a multi-tool group popover and selects a menu item", () => {
      const props = makeProps();
      render(<ToolRibbon {...props} />);
      // "Forms" is a multi-tool group.
      fireEvent.click(screen.getByRole("button", { name: /Forms/ }));
      expect(props.onToolChange).toHaveBeenCalledWith("form-text");

      const menu = screen.getByRole("menu");
      const items = within(menu).getAllByRole("menuitem");
      fireEvent.click(items[1]);
      expect(props.onToolChange).toHaveBeenCalledWith("form-multiline");
      // Selecting a menu item closes the popover.
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("toggles a multi-tool group popover closed on second click", () => {
      render(<ToolRibbon {...makeProps()} />);
      const forms = screen.getByRole("button", { name: /Forms/ });
      fireEvent.click(forms);
      expect(screen.getByRole("menu")).toBeInTheDocument();
      fireEvent.click(forms);
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("toggles an active non-select tool back to select", () => {
      const props = makeProps({ activeTool: "form-text" });
      render(<ToolRibbon {...props} />);
      // Forms group is active; clicking its primary button resets to select.
      fireEvent.click(screen.getByRole("button", { name: /Forms/ }));
      expect(props.onToolChange).toHaveBeenCalledWith("select");
    });

    it("re-activates the select group without toggling to select", () => {
      const props = makeProps({ activeTool: "select" });
      render(<ToolRibbon {...props} />);
      // Select group is active and primary === select, so it falls through to the
      // single-tool path and re-selects select.
      fireEvent.click(screen.getByRole("button", { name: /Select/ }));
      expect(props.onToolChange).toHaveBeenCalledWith("select");
    });

    it("renders popover menu items with the correct aria-pressed state", () => {
      // Active tool sits in a *different* group (shapes), so the Forms popover opens
      // and all its items report aria-pressed=false.
      render(<ToolRibbon {...makeProps({ activeTool: "shape" })} />);
      fireEvent.click(screen.getByRole("button", { name: /Forms/ }));
      const menu = screen.getByRole("menu");
      const dropdown = within(menu).getByText("Dropdown").closest("button") as HTMLElement;
      expect(dropdown).toHaveAttribute("aria-pressed", "false");
    });

    it("closes an open tool popover with Escape", () => {
      const { container } = render(<ToolRibbon {...makeProps()} />);
      fireEvent.click(screen.getByRole("button", { name: /Forms/ }));
      expect(screen.getByRole("menu")).toBeInTheDocument();
      fireEvent.keyDown(container.firstChild as HTMLElement, { key: "Escape" });
      expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    });

    it("returns focus to the trigger button after Escape closes the popover", () => {
      const { container } = render(<ToolRibbon {...makeProps()} />);
      const formsButton = screen.getByRole("button", { name: /Forms/ });
      fireEvent.click(formsButton);
      expect(screen.getByRole("menu")).toBeInTheDocument();
      fireEvent.keyDown(container.firstChild as HTMLElement, { key: "Escape" });
      // A keyboard user must not be stranded at <body> once the menu unmounts.
      expect(document.activeElement).toBe(formsButton);
    });

    it("ignores non-Escape keys and Escape with nothing open", () => {
      const { container } = render(<ToolRibbon {...makeProps()} />);
      const root = container.firstChild as HTMLElement;
      // Nothing open: Escape is a no-op (must not throw or change state).
      fireEvent.keyDown(root, { key: "Escape" });
      fireEvent.click(screen.getByRole("button", { name: /Forms/ }));
      fireEvent.keyDown(root, { key: "Enter" });
      expect(screen.getByRole("menu")).toBeInTheDocument();
    });
  });

  describe("export", () => {
    it("applies via the primary Apply button", () => {
      const props = makeProps();
      render(<ToolRibbon {...props} />);
      fireEvent.click(screen.getByRole("button", { name: /Apply/ }));
      expect(props.onExport).toHaveBeenCalledWith("pdf");
    });

    it("exports a chosen format and resets the select", () => {
      const props = makeProps();
      render(<ToolRibbon {...props} />);
      const select = screen.getByLabelText("Export format") as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "csv" } });
      expect(props.onExport).toHaveBeenCalledWith("csv");
      expect(select.value).toBe("");
    });

    it("ignores the empty export selection", () => {
      const props = makeProps();
      render(<ToolRibbon {...props} />);
      const select = screen.getByLabelText("Export format") as HTMLSelectElement;
      fireEvent.change(select, { target: { value: "" } });
      expect(props.onExport).not.toHaveBeenCalled();
    });
  });

  describe("history dialog", () => {
    it("opens, lists entries newest-first, and shows the newest selected by default", () => {
      const entries = [entry("a", 1000, 0), entry("b", 2000, 2)];
      const props = makeProps({ historyEntries: entries });
      render(<ToolRibbon {...props} />);

      fireEvent.click(screen.getByTitle("Undo history"));
      const dialog = screen.getByRole("dialog");
      const radios = within(dialog).getAllByRole("radio") as HTMLInputElement[];
      // Reversed: newest "b" first and checked.
      expect(radios[0].checked).toBe(true);
      expect(within(dialog).getByText("Entry b")).toBeInTheDocument();
      expect(within(dialog).getByText("2 edits before this change")).toBeInTheDocument();
    });

    it("selects a different entry then reverts it", () => {
      const entries = [entry("a", 1000), entry("b", 2000)];
      const props = makeProps({ historyEntries: entries });
      render(<ToolRibbon {...props} />);

      fireEvent.click(screen.getByTitle("Undo history"));
      const dialog = screen.getByRole("dialog");
      const radios = within(dialog).getAllByRole("radio");
      // radios[1] corresponds to the older "a" entry.
      fireEvent.click(radios[1]);
      fireEvent.click(within(dialog).getByRole("button", { name: /Revert selected/ }));
      expect(props.onRestoreHistory).toHaveBeenCalledWith("a");
      // Dialog closes after revert.
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("shows an empty message and a disabled revert when there is no history", () => {
      render(<ToolRibbon {...makeProps({ historyEntries: [] })} />);
      fireEvent.click(screen.getByTitle("Undo history"));
      expect(screen.getByText("No edit history yet.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Revert selected/ })).toBeDisabled();
    });

    it("closes via the Cancel button", () => {
      render(<ToolRibbon {...makeProps({ historyEntries: [entry("a", 1)] })} />);
      fireEvent.click(screen.getByTitle("Undo history"));
      fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes via the X button", () => {
      render(<ToolRibbon {...makeProps({ historyEntries: [entry("a", 1)] })} />);
      fireEvent.click(screen.getByTitle("Undo history"));
      fireEvent.click(screen.getByTitle("Close history"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes when the backdrop is clicked but not when the dialog body is clicked", () => {
      render(<ToolRibbon {...makeProps({ historyEntries: [entry("a", 1)] })} />);
      fireEvent.click(screen.getByTitle("Undo history"));
      const dialog = screen.getByRole("dialog");
      // Click inside the dialog: stopPropagation keeps it open.
      fireEvent.click(dialog);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      // Click the backdrop: closes.
      const backdrop = dialog.parentElement as HTMLElement;
      fireEvent.click(backdrop);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes with Escape, taking priority over an open tool popover", () => {
      const { container } = render(<ToolRibbon {...makeProps({ historyEntries: [entry("a", 1)] })} />);
      const root = container.firstChild as HTMLElement;
      const historyButton = screen.getByTitle("Undo history");
      fireEvent.click(historyButton);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      fireEvent.keyDown(root, { key: "Escape" });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      // Same focus-return guarantee as the tool-menu popover.
      expect(document.activeElement).toBe(historyButton);
    });
  });
});
