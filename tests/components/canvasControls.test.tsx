import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CanvasControls } from "../../src/components/CanvasControls";
import type { EditHistoryEntry } from "../../src/state/editModel";

const HISTORY: EditHistoryEntry[] = [
  { id: "h1", label: "First", timestamp: 1700000000000, operations: [] },
  { id: "h2", label: "Second", timestamp: 1700000100000, operations: [{ id: "o" } as never] },
];

function setup(overrides: Partial<React.ComponentProps<typeof CanvasControls>> = {}) {
  const props = {
    canRedo: true,
    canUndo: true,
    disabled: false,
    selectedId: "sel",
    scale: 1.2,
    historyEntries: HISTORY,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onRemove: vi.fn(),
    onInsertPage: vi.fn(),
    onDeletePage: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onRotate: vi.fn(),
    onRotatePage: vi.fn(),
    onRestoreHistory: vi.fn(),
    ...overrides,
  };
  render(<CanvasControls {...props} />);
  return props;
}

describe("CanvasControls", () => {
  it("invokes each toolbar action", () => {
    const props = setup();
    fireEvent.click(screen.getByTitle("Undo"));
    fireEvent.click(screen.getByTitle("Redo"));
    fireEvent.click(screen.getByTitle("Remove selected"));
    fireEvent.click(screen.getByTitle("Insert blank page after current page"));
    fireEvent.click(screen.getByTitle("Delete current page"));
    fireEvent.click(screen.getByTitle("Zoom in"));
    fireEvent.click(screen.getByTitle("Zoom out"));
    fireEvent.click(screen.getByTitle("Rotate view"));
    fireEvent.click(screen.getByTitle("Rotate page permanently"));
    expect(props.onUndo).toHaveBeenCalled();
    expect(props.onRedo).toHaveBeenCalled();
    expect(props.onRemove).toHaveBeenCalled();
    expect(props.onInsertPage).toHaveBeenCalled();
    expect(props.onDeletePage).toHaveBeenCalled();
    expect(props.onZoomIn).toHaveBeenCalled();
    expect(props.onZoomOut).toHaveBeenCalled();
    expect(props.onRotate).toHaveBeenCalled();
    expect(props.onRotatePage).toHaveBeenCalled();
    expect(screen.getByText("120%")).toBeInTheDocument();
  });

  it("opens the history dialog, selects an entry, and reverts", () => {
    const props = setup();
    fireEvent.click(screen.getByTitle("Undo history"));
    expect(screen.getByText("Undo changes")).toBeInTheDocument();
    // both entries shown (reversed: newest first)
    expect(screen.getByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();

    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[1]); // select the older entry
    fireEvent.click(screen.getByRole("button", { name: /Revert selected/ }));
    expect(props.onRestoreHistory).toHaveBeenCalledWith("h1");
    expect(screen.queryByText("Undo changes")).not.toBeInTheDocument();
  });

  it("can be cancelled and shows an empty state with no history", () => {
    const props = setup({ historyEntries: [] });
    fireEvent.click(screen.getByTitle("Undo history"));
    expect(screen.getByText("No edit history yet.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    expect(screen.queryByText("No edit history yet.")).not.toBeInTheDocument();
    expect(props.onRestoreHistory).not.toHaveBeenCalled();
  });

  it("disables actions when busy or unavailable", () => {
    setup({ canUndo: false, canRedo: false, selectedId: undefined, disabled: true });
    expect(screen.getByTitle("Undo")).toBeDisabled();
    expect(screen.getByTitle("Redo")).toBeDisabled();
    expect(screen.getByTitle("Remove selected")).toBeDisabled();
  });
});
