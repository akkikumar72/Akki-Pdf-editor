import { fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkPropertiesDialog, type LinkDialogRequest } from "../src/components/LinkPropertiesDialog";

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

function makeRequest(overrides: Partial<LinkDialogRequest> = {}): LinkDialogRequest {
  return {
    anchor: { left: 40, top: 40, width: 100, height: 20 },
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
}

function renderDialog(request: LinkDialogRequest, pageCount = 3) {
  return render(<LinkPropertiesDialog request={request} pageCount={pageCount} pageWidth={612} scale={1} />);
}

describe("LinkPropertiesDialog", () => {
  it("renders all four Sejda-parity kinds with the URL kind active and focused by default", () => {
    const { getByRole, getByLabelText } = renderDialog(makeRequest());
    expect(getByRole("dialog", { name: "Add link" })).toBeInTheDocument();
    for (const label of ["Link to external URL", "Link to email address", "Link to phone number", "Link to internal page"]) {
      expect(getByRole("radio", { name: label })).toBeInTheDocument();
    }
    expect((getByRole("radio", { name: "Link to external URL" }) as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement).toBe(getByLabelText("External URL"));
  });

  it("confirms a URL target", () => {
    const onConfirm = vi.fn();
    const { getByRole, getByLabelText } = renderDialog(makeRequest({ onConfirm }));
    fireEvent.change(getByLabelText("External URL"), { target: { value: "example.com" } });
    fireEvent.click(getByRole("button", { name: "Add link" }));
    expect(onConfirm).toHaveBeenCalledWith({ kind: "url", href: "https://example.com/" });
  });

  it("confirms an email target after switching kinds via radio", () => {
    const onConfirm = vi.fn();
    const { getByRole, getByLabelText } = renderDialog(makeRequest({ onConfirm }));
    fireEvent.click(getByRole("radio", { name: "Link to email address" }));
    fireEvent.change(getByLabelText("Email address"), { target: { value: "you@example.com" } });
    fireEvent.click(getByRole("button", { name: "Add link" }));
    expect(onConfirm).toHaveBeenCalledWith({ kind: "email", href: "mailto:you@example.com" });
  });

  it("selects a kind when its input is focused directly", () => {
    const onConfirm = vi.fn();
    const { getByRole, getByLabelText } = renderDialog(makeRequest({ onConfirm }));
    fireEvent.focus(getByLabelText("Phone number"));
    expect((getByRole("radio", { name: "Link to phone number" }) as HTMLInputElement).checked).toBe(true);
    fireEvent.change(getByLabelText("Phone number"), { target: { value: "+1 555 000 1234" } });
    fireEvent.click(getByRole("button", { name: "Add link" }));
    expect(onConfirm).toHaveBeenCalledWith({ kind: "phone", href: "tel:+15550001234" });
  });

  it("confirms an internal page target within range", () => {
    const onConfirm = vi.fn();
    const { getByRole, getByLabelText } = renderDialog(makeRequest({ onConfirm }), 5);
    fireEvent.click(getByRole("radio", { name: "Link to internal page" }));
    fireEvent.change(getByLabelText("Page number"), { target: { value: "4" } });
    fireEvent.click(getByRole("button", { name: "Add link" }));
    expect(onConfirm).toHaveBeenCalledWith({ kind: "page", pageIndex: 3 });
  });

  it("shows an inline error instead of confirming an invalid value, and clears it on edit", () => {
    const onConfirm = vi.fn();
    const { getByRole, getByLabelText, queryByRole } = renderDialog(makeRequest({ onConfirm }));
    fireEvent.change(getByLabelText("External URL"), { target: { value: "javascript:alert(1)" } });
    fireEvent.click(getByRole("button", { name: "Add link" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(getByRole("alert")).toHaveTextContent("Enter a valid http(s) URL.");
    fireEvent.change(getByLabelText("External URL"), { target: { value: "https://example.com" } });
    expect(queryByRole("alert")).toBeNull();
  });

  it("pre-fills from an existing target and offers Save link / Delete link", () => {
    const onConfirm = vi.fn();
    const onDelete = vi.fn();
    const { getByRole, getByLabelText } = renderDialog(
      makeRequest({ target: { kind: "email", href: "mailto:old@example.com" }, onConfirm, onDelete }),
    );
    expect(getByRole("dialog", { name: "Edit link" })).toBeInTheDocument();
    expect((getByRole("radio", { name: "Link to email address" }) as HTMLInputElement).checked).toBe(true);
    expect(getByLabelText("Email address")).toHaveValue("old@example.com");
    fireEvent.click(getByRole("button", { name: "Delete link" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
    fireEvent.click(getByRole("button", { name: "Save link" }));
    expect(onConfirm).toHaveBeenCalledWith({ kind: "email", href: "mailto:old@example.com" });
  });

  it("cancels on the Close button and on Escape", () => {
    const onCancel = vi.fn();
    const { getByRole } = renderDialog(makeRequest({ onCancel }));
    fireEvent.click(getByRole("button", { name: "Close" }));
    fireEvent.keyDown(getByRole("dialog"), { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("confirms on Enter within the active input", () => {
    const onConfirm = vi.fn();
    const { getByLabelText } = renderDialog(makeRequest({ onConfirm }));
    const input = getByLabelText("External URL");
    fireEvent.change(input, { target: { value: "https://enter.example" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onConfirm).toHaveBeenCalledWith({ kind: "url", href: "https://enter.example/" });
  });

  it("cycles focus with Tab, wrapping in both directions", () => {
    const { getByRole } = renderDialog(makeRequest());
    const urlRadio = getByRole("radio", { name: "Link to external URL" });
    const confirmButton = getByRole("button", { name: "Add link" });
    urlRadio.focus();
    fireEvent.keyDown(urlRadio, { key: "Tab", shiftKey: true });
    // Shift+Tab from the first focusable wraps to the last (the confirm button).
    expect(document.activeElement).toBe(confirmButton);
    fireEvent.keyDown(confirmButton, { key: "Tab" });
    expect(document.activeElement).toBe(urlRadio);
  });

  it("ignores other keys in the trap handler", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const { getByRole } = renderDialog(makeRequest({ onCancel, onConfirm }));
    fireEvent.keyDown(getByRole("dialog"), { key: "a" });
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("stops click and pointerdown propagation so the underlying canvas doesn't react", () => {
    const outerClick = vi.fn();
    const outerPointerDown = vi.fn();
    const { getByRole } = render(
      <div onClick={outerClick} onPointerDown={outerPointerDown}>
        <LinkPropertiesDialog request={makeRequest()} pageCount={1} pageWidth={612} scale={1} />
      </div>,
    );
    fireEvent.click(getByRole("dialog"));
    fireEvent.pointerDown(getByRole("dialog"));
    expect(outerClick).not.toHaveBeenCalled();
    expect(outerPointerDown).not.toHaveBeenCalled();
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
      left: 0, top: 0, width: 300, height: 220, right: 300, bottom: 220, x: 0, y: 0, toJSON() {},
    })) as unknown as typeof realGetBoundingClientRect;
    const { getByRole } = renderDialog(makeRequest());
    observerCallback?.();
    expect(getByRole("dialog")).toBeInTheDocument();
  });

  it("seeds the page field from an existing page target", () => {
    const { getByRole, getByLabelText } = renderDialog(
      makeRequest({ target: { kind: "page", pageIndex: 1 }, onDelete: vi.fn() }),
      4,
    );
    expect((getByRole("radio", { name: "Link to internal page" }) as HTMLInputElement).checked).toBe(true);
    expect(getByLabelText("Page number")).toHaveValue(2);
  });
});
