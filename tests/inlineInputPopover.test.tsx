import { fireEvent, render, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineInputPopover, type PendingInputRequest } from "../src/components/InlineInputPopover";

const realGetBoundingClientRect = Element.prototype.getBoundingClientRect;
const OriginalResizeObserver = global.ResizeObserver;
class StubResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
  constructor(_cb: () => void) {}
}

beforeEach(() => {
  global.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = realGetBoundingClientRect;
  global.ResizeObserver = OriginalResizeObserver;
});

function makeRequest(overrides: Partial<PendingInputRequest> = {}): PendingInputRequest {
  return {
    title: "Add link",
    confirmLabel: "Add link",
    fields: [{ key: "href", label: "Link URL", defaultValue: "https://" }],
    anchor: { left: 40, top: 40, width: 100, height: 20 },
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

describe("InlineInputPopover", () => {
  it("pre-fills, focuses, and confirms the resolved field values", () => {
    const onConfirm = vi.fn();
    const request = makeRequest({ onConfirm });
    const { getByRole, getByLabelText } = render(<InlineInputPopover request={request} pageWidth={612} scale={1} />);
    const input = getByLabelText("Link URL") as HTMLInputElement;
    expect(input.value).toBe("https://");
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: "https://example.com" } });
    fireEvent.click(getByRole("button", { name: "Add link" }));
    expect(onConfirm).toHaveBeenCalledWith({ href: "https://example.com" });
  });

  it("renders a select for a field with options and confirms the chosen value", () => {
    const onConfirm = vi.fn();
    const request = makeRequest({
      onConfirm,
      confirmLabel: "Add stamp",
      fields: [
        { key: "label", label: "Subject", defaultValue: "Approved" },
        {
          key: "dateStyle",
          label: "Date",
          defaultValue: "none",
          options: [
            { value: "none", label: "No date" },
            { value: "mdy", label: "Feb 3, 2025" },
          ],
        },
      ],
    });
    const { getByRole, getByLabelText } = render(<InlineInputPopover request={request} pageWidth={612} scale={1} />);
    const select = getByLabelText("Date") as HTMLSelectElement;
    expect(select.tagName).toBe("SELECT");
    expect(select.value).toBe("none");
    fireEvent.change(select, { target: { value: "mdy" } });
    fireEvent.click(getByRole("button", { name: "Add stamp" }));
    expect(onConfirm).toHaveBeenCalledWith({ label: "Approved", dateStyle: "mdy" });
  });

  it("cancels on the Cancel button click", () => {
    const onCancel = vi.fn();
    const request = makeRequest({ onCancel });
    const { getByRole } = render(<InlineInputPopover request={request} pageWidth={612} scale={1} />);
    fireEvent.click(getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("cancels on Escape", () => {
    const onCancel = vi.fn();
    const request = makeRequest({ onCancel });
    const { getByRole } = render(<InlineInputPopover request={request} pageWidth={612} scale={1} />);
    fireEvent.keyDown(getByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("confirms on Enter for a single-line field, but not on Enter within a multiline field", () => {
    const onConfirm = vi.fn();
    const request = makeRequest({
      onConfirm,
      fields: [
        { key: "name", label: "Field name", defaultValue: "field_1" },
        { key: "notes", label: "Notes", defaultValue: "", multiline: true },
      ],
    });
    const { getByLabelText } = render(<InlineInputPopover request={request} pageWidth={612} scale={1} />);
    const notes = getByLabelText("Notes") as HTMLTextAreaElement;
    fireEvent.change(notes, { target: { value: "line one" } });
    fireEvent.keyDown(notes, { key: "Enter" });
    expect(onConfirm).not.toHaveBeenCalled();

    const nameField = getByLabelText("Field name");
    fireEvent.keyDown(nameField, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledWith({ name: "field_1", notes: "line one" });
  });

  it("cycles focus forward and backward with Tab, wrapping at both ends", () => {
    const request = makeRequest({
      fields: [
        { key: "name", label: "Field name", defaultValue: "choice" },
        { key: "options", label: "Dropdown options", defaultValue: "Option 1, Option 2" },
      ],
    });
    const { getByLabelText, getByRole } = render(<InlineInputPopover request={request} pageWidth={612} scale={1} />);
    const nameField = getByLabelText("Field name");
    const optionsField = getByLabelText("Dropdown options");
    const cancelButton = getByRole("button", { name: "Cancel" });
    const confirmButton = getByRole("button", { name: "Add link" });

    expect(document.activeElement).toBe(nameField);
    fireEvent.keyDown(nameField, { key: "Tab" });
    expect(document.activeElement).toBe(optionsField);
    fireEvent.keyDown(optionsField, { key: "Tab" });
    expect(document.activeElement).toBe(cancelButton);
    fireEvent.keyDown(cancelButton, { key: "Tab" });
    expect(document.activeElement).toBe(confirmButton);
    // Wraps back to the first focusable element after the last one.
    fireEvent.keyDown(confirmButton, { key: "Tab" });
    expect(document.activeElement).toBe(nameField);
    // Shift+Tab from the first element wraps to the last.
    fireEvent.keyDown(nameField, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(confirmButton);
  });

  it("stops click and pointerdown propagation so the underlying canvas doesn't react", () => {
    const outerClick = vi.fn();
    const outerPointerDown = vi.fn();
    const request = makeRequest();
    const { getByRole } = render(
      <div onClick={outerClick} onPointerDown={outerPointerDown}>
        <InlineInputPopover request={request} pageWidth={612} scale={1} />
      </div>,
    );
    fireEvent.click(getByRole("dialog"));
    fireEvent.pointerDown(getByRole("dialog"));
    expect(outerClick).not.toHaveBeenCalled();
    expect(outerPointerDown).not.toHaveBeenCalled();
  });

  it("re-measures and repositions when a new request replaces the current one", () => {
    const request = makeRequest();
    const { rerender, getByRole } = render(<InlineInputPopover request={request} pageWidth={612} scale={1} />);
    const nextRequest = makeRequest({ title: "Edit link", anchor: { left: 200, top: 200, width: 50, height: 20 } });
    rerender(<InlineInputPopover request={nextRequest} pageWidth={612} scale={1} />);
    expect(getByRole("dialog", { name: "Edit link" })).toBeInTheDocument();
  });

  it("wires the first-field ref for a multiline first field too", () => {
    const onConfirm = vi.fn();
    const request = makeRequest({
      onConfirm,
      fields: [{ key: "text", label: "Note", defaultValue: "hello", multiline: true }],
    });
    const { getByLabelText } = render(<InlineInputPopover request={request} pageWidth={612} scale={1} />);
    const note = getByLabelText("Note") as HTMLTextAreaElement;
    expect(document.activeElement).toBe(note);
    fireEvent.change(note, { target: { value: "hello world" } });
    fireEvent.keyDown(note, { key: "Enter", shiftKey: true });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("supports a second, non-first field without stealing initial focus", () => {
    const request = makeRequest({
      fields: [
        { key: "name", label: "Field name", defaultValue: "choice" },
        { key: "options", label: "Dropdown options", defaultValue: "A, B" },
      ],
    });
    const { getByLabelText } = render(<InlineInputPopover request={request} pageWidth={612} scale={1} />);
    expect(document.activeElement).toBe(getByLabelText("Field name"));
    const options = getByLabelText("Dropdown options") as HTMLInputElement;
    fireEvent.change(options, { target: { value: "A, B, C" } });
    expect(options.value).toBe("A, B, C");
  });

  it("re-measures its size via the ResizeObserver callback", () => {
    let observerCallback: (() => void) | undefined;
    global.ResizeObserver = class {
      constructor(cb: () => void) {
        observerCallback = cb;
      }
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      left: 0, top: 0, width: 240, height: 90, right: 240, bottom: 90, x: 0, y: 0, toJSON() {},
    })) as unknown as typeof realGetBoundingClientRect;
    const { getByRole } = render(<InlineInputPopover request={makeRequest()} pageWidth={612} scale={1} />);
    observerCallback?.();
    expect(getByRole("dialog")).toBeInTheDocument();
  });

  it("scopes queries to the popover via role dialog with the request title as its name", () => {
    const request = makeRequest({ title: "Add form field" });
    const { getByRole } = render(<InlineInputPopover request={request} pageWidth={612} scale={1} />);
    const dialog = getByRole("dialog", { name: "Add form field" });
    expect(within(dialog).getByText("Add form field")).toBeInTheDocument();
  });
});
