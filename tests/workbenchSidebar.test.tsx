import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkbenchSidebar } from "../src/components/WorkbenchSidebar";
import type { EditorTool } from "../src/types/editor";
import type { EditHistoryEntry } from "../src/state/editModel";

function props(overrides: Partial<React.ComponentProps<typeof WorkbenchSidebar>> = {}) {
  return {
    activeTool: "select" as EditorTool,
    disabled: false,
    pageCount: 2,
    scale: 1,
    historyEntries: [] as EditHistoryEntry[],
    canRedo: false,
    selectedCount: 0,
    pages: <div>Document thumbnails</div>,
    onToolChange: vi.fn(),
    onHome: vi.fn(),
    onFind: vi.fn(),
    onInsertPage: vi.fn(),
    onDeletePage: vi.fn(),
    onRotatePage: vi.fn(),
    onRotateView: vi.fn(),
    onFit: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onRestoreHistory: vi.fn(),
    onExport: vi.fn(),
    onProperties: vi.fn(),
    onDuplicate: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
}
const open = (name: string) => fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name }));
afterEach(() => vi.unstubAllGlobals());

describe("workspace sidebar", () => {
  it("searches the tool library, recovers from no results, and activates the chosen tool", () => {
    const p = props();
    render(<WorkbenchSidebar {...p} />);
    fireEvent.change(screen.getByLabelText("Search tools"), { target: { value: "dropdown" } });
    fireEvent.click(screen.getByRole("button", { name: "Dropdown" }));
    expect(p.onToolChange).toHaveBeenCalledWith("form-dropdown");
    fireEvent.click(screen.getByLabelText("Clear tool search"));
    expect(screen.getByRole("button", { name: "Edit text" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Search tools"), { target: { value: "missing-tool-xyz" } });
    expect(screen.getByText("No matching tools")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Show all tools" }));
    fireEvent.click(screen.getByLabelText("Find text from sidebar"));
    expect(p.onFind).toHaveBeenCalledOnce();
    open("Annotate");
    expect(screen.getByRole("button", { name: "Marker" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Text field" })).toBeNull();
    open("Forms");
    expect(screen.getByRole("button", { name: "Text field" })).toBeVisible();
    open("Sign");
    expect(screen.getByRole("button", { name: "Signature" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Documents" }));
    expect(p.onHome).toHaveBeenCalledOnce();
  });

  it("shows page operations and respects the last-page and busy guards", () => {
    const p = props();
    const { rerender } = render(<WorkbenchSidebar {...p} />);
    open("Pages");
    expect(screen.getByText("Document thumbnails")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Add page" }));
    fireEvent.click(screen.getByRole("button", { name: "Rotate page" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));
    fireEvent.click(screen.getByRole("button", { name: "Crop page" }));
    expect(p.onInsertPage).toHaveBeenCalledOnce();
    expect(p.onRotatePage).toHaveBeenCalledOnce();
    expect(p.onDeletePage).toHaveBeenCalledOnce();
    expect(p.onToolChange).toHaveBeenCalledWith("crop");
    rerender(<WorkbenchSidebar {...p} pageCount={1} />);
    expect(screen.getByRole("button", { name: "Delete page" })).toBeDisabled();
    rerender(<WorkbenchSidebar {...p} disabled />);
    expect(screen.getByText("Document thumbnails").parentElement).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "Add page" })).toBeDisabled();
  });

  it("restores history checkpoints, exports every format, and explains limitations", () => {
    const p = props();
    const { rerender } = render(<WorkbenchSidebar {...p} />);
    open("History");
    expect(screen.getByText("A fresh start")).toBeVisible();
    expect(screen.getByRole("button", { name: "Undo change" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo change" })).toBeDisabled();
    const history = [{ id: "before-text", label: "Add text", timestamp: 1700000000000, operations: [] }];
    rerender(<WorkbenchSidebar {...p} historyEntries={history} canRedo />);
    fireEvent.click(screen.getByRole("button", { name: "Undo change" }));
    fireEvent.click(screen.getByRole("button", { name: "Redo change" }));
    fireEvent.click(screen.getByRole("button", { name: /Add text/ }));
    expect(p.onUndo).toHaveBeenCalledOnce();
    expect(p.onRedo).toHaveBeenCalledOnce();
    expect(p.onRestoreHistory).toHaveBeenCalledWith("before-text");
    open("Export");
    expect(screen.getByText(/2 pages/)).toBeVisible();
    for (const name of [/Edited PDF/, /Plain text/, /CSV spreadsheet/, /Excel workbook/])
      fireEvent.click(screen.getByRole("button", { name }));
    expect(p.onExport).toHaveBeenCalledTimes(4);
    for (const [index, format] of ["pdf", "txt", "csv", "xlsx"].entries())
      expect(p.onExport).toHaveBeenNthCalledWith(index + 1, format);
    rerender(<WorkbenchSidebar {...p} pageCount={1} />);
    expect(screen.getByText(/1 page ·/)).toBeVisible();
    open("Help");
    expect(screen.getByText(/original text remains extractable/)).toBeVisible();
  });

  it("offers selected-object actions and view controls without leaving the sidebar", () => {
    const p = props({ selectedCount: 2 });
    render(<WorkbenchSidebar {...p} />);
    for (const name of [
      "Open selected properties",
      "Duplicate from sidebar",
      "Remove from sidebar",
      "Zoom out from sidebar",
      "Zoom in from sidebar",
      "Fit page from sidebar",
      "Rotate view from sidebar",
    ])
      fireEvent.click(screen.getByRole("button", { name }));
    for (const handler of [p.onProperties, p.onDuplicate, p.onRemove, p.onZoomOut, p.onZoomIn, p.onFit, p.onRotateView])
      expect(handler).toHaveBeenCalledOnce();
  });

  it("collapses on mobile, opens tool search with either modifier, and returns keyboard focus", async () => {
    vi.stubGlobal("innerWidth", 390);
    const p = props();
    render(<WorkbenchSidebar {...p} />);
    expect(screen.queryByLabelText("Search tools")).toBeNull();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    await waitFor(() => expect(screen.getByLabelText("Search tools")).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Text" }));
    expect(p.onToolChange).toHaveBeenCalledWith("text");
    expect(screen.queryByLabelText("Search tools")).toBeNull();
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    await waitFor(() => expect(screen.getByLabelText("Search tools")).toHaveFocus());
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(screen.getByRole("button", { name: "All tools" })).toHaveFocus();
    open("Forms");
    const claimedEscape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    claimedEscape.preventDefault();
    fireEvent(window, claimedEscape);
    expect(screen.getByRole("heading", { name: "Forms" })).toBeVisible();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByLabelText("Search tools")).toBeNull();
  });
});
