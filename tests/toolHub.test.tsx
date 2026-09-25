import { createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ToolHub } from "../src/components/ToolHub";
import type { SessionSummary } from "../src/utils/storage";

function makeProps(overrides: Partial<React.ComponentProps<typeof ToolHub>> = {}) {
  return {
    isBusy: false,
    recentSessions: [] as SessionSummary[],
    onBlank: vi.fn(),
    onClearSessions: vi.fn(),
    onDeleteSession: vi.fn(),
    onOpen: vi.fn(),
    onResume: vi.fn(),
    ...overrides,
  };
}
const sessions = ["Alpha.pdf", "Beta.pdf", "Gamma.pdf", "Delta.pdf"].map((name, index) => ({
  id: String(index),
  name,
  updatedAt: 1700000000000,
  operationCount: index,
}));

describe("local document workspace", () => {
  it("opens the file picker and creates blank documents from the sidebar", () => {
    const props = makeProps();
    render(<ToolHub {...props} />);
    expect(screen.getByRole("heading", { name: "Your document desk." })).toBeVisible();
    const input = screen.getByLabelText("Choose PDF file");
    const picker = vi.spyOn(input, "click");
    fireEvent.click(screen.getByRole("button", { name: "Choose file" }));
    fireEvent.click(screen.getByRole("button", { name: "Open a PDF" }));
    expect(picker).toHaveBeenCalledTimes(2);
    fireEvent.click(
      within(screen.getByRole("navigation", { name: "Home navigation" })).getByRole("button", { name: "Blank PDF" }),
    );
    expect(props.onBlank).toHaveBeenCalledOnce();
  });
  it("imports files through both the picker and drop zone", () => {
    const props = makeProps();
    render(<ToolHub {...props} />);
    const file = new File(["%PDF-"], "local.pdf", { type: "application/pdf" });
    fireEvent.change(screen.getByLabelText("Choose PDF file"), { target: { files: [file] } });
    expect(props.onOpen).toHaveBeenCalledWith(file);
    fireEvent.dragOver(screen.getByLabelText("Import PDF"));
    expect(document.querySelector(".studio-home")).toHaveClass("is-dragging");
    fireEvent.drop(screen.getByLabelText("Import PDF"), { dataTransfer: { files: [file] } });
    expect(props.onOpen).toHaveBeenCalledTimes(2);
    expect(document.querySelector(".studio-home")).not.toHaveClass("is-dragging");
  });
  it("blocks imports and blank creation while busy", () => {
    const props = makeProps({ isBusy: true });
    render(<ToolHub {...props} />);
    fireEvent.drop(screen.getByLabelText("Import PDF"), { dataTransfer: { files: [new File(["%PDF-"], "test.pdf")] } });
    expect(props.onOpen).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Blank PDF" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Open a PDF" })).toBeDisabled();
  });
  it("shows every saved document, filters it, and resumes or removes the chosen session", () => {
    const props = makeProps({ recentSessions: sessions });
    render(<ToolHub {...props} />);
    expect(screen.getByText("Delta.pdf")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Find a recent document"), { target: { value: "delta" } });
    expect(screen.queryByText("Alpha.pdf")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Delta.pdf"));
    expect(props.onResume).toHaveBeenCalledWith("3");
    fireEvent.click(screen.getByLabelText("Remove Delta.pdf"));
    expect(props.onDeleteSession).toHaveBeenCalledWith("3");
    fireEvent.click(screen.getByRole("button", { name: "Clear local history" }));
    expect(props.onClearSessions).toHaveBeenCalledOnce();
    fireEvent.change(screen.getByLabelText("Find a recent document"), { target: { value: "missing" } });
    expect(screen.getByText("No documents match your search.")).toBeVisible();
  });
  it("switches to recent documents and keeps the import action working", () => {
    render(<ToolHub {...makeProps({ recentSessions: sessions })} />);
    fireEvent.click(screen.getByRole("button", { name: /Recent documents/ }));
    expect(screen.getByRole("heading", { name: "Pick up where you left off." })).toBeVisible();
    expect(screen.queryByLabelText("Import PDF")).not.toBeInTheDocument();
    const picker = vi.spyOn(screen.getByLabelText("Choose PDF file"), "click");
    fireEvent.click(screen.getByRole("button", { name: "Open a PDF" }));
    expect(picker).toHaveBeenCalledOnce();
  });
  it("reports import errors and exposes local-storage and licence information", () => {
    render(<ToolHub {...makeProps({ status: "That file is not a valid PDF." })} />);
    expect(screen.getByRole("status")).toHaveTextContent("That file is not a valid PDF.");
    fireEvent.click(screen.getByText("Privacy & legal"));
    expect(screen.getByText(/Clearing browser storage/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Licence" })).toHaveAttribute("href", "/LICENSE.txt");
  });
});

it("keeps dragging feedback stable over children and imports from the recent view", () => {
  const props = makeProps({ recentSessions: sessions });
  const { rerender } = render(<ToolHub {...props} />);
  const dropzone = screen.getByLabelText("Import PDF");
  fireEvent.dragOver(dropzone);
  const childLeave = createEvent.dragLeave(dropzone);
  Object.defineProperty(childLeave, "relatedTarget", { value: screen.getByRole("button", { name: "Choose file" }) });
  fireEvent(dropzone, childLeave);
  expect(document.querySelector(".studio-home")).toHaveClass("is-dragging");
  fireEvent.dragLeave(dropzone, { relatedTarget: null });
  expect(document.querySelector(".studio-home")).not.toHaveClass("is-dragging");
  rerender(<ToolHub {...props} isBusy />);
  fireEvent.dragOver(dropzone);
  expect(document.querySelector(".studio-home")).not.toHaveClass("is-dragging");
  rerender(<ToolHub {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /Recent documents/ }));
  const file = new File(["%PDF-"], "recent.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Choose PDF file"), { target: { files: [file] } });
  expect(props.onOpen).toHaveBeenCalledWith(file);
  fireEvent.click(screen.getByRole("button", { name: "Overview" }));
  expect(screen.getByLabelText("Import PDF")).toBeVisible();
});

it("starts a blank document from the empty workspace", () => {
  const props = makeProps();
  render(<ToolHub {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Create a blank PDF" }));
  expect(props.onBlank).toHaveBeenCalledOnce();
});
