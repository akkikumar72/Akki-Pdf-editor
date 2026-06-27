import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ToolHub } from "../../src/components/ToolHub";
import type { SessionSummary } from "../../src/utils/storage";

const SESSIONS: SessionSummary[] = [
  { id: "s1", name: "Alpha.pdf", updatedAt: 1700000000000, operationCount: 2, pageIndex: 0 },
  { id: "s2", name: "Beta.pdf", updatedAt: 1700000100000, operationCount: 0, pageIndex: 1 },
];

function setup(overrides: Partial<React.ComponentProps<typeof ToolHub>> = {}) {
  const props = {
    isBusy: false,
    status: undefined,
    recentSessions: [] as SessionSummary[],
    onBlank: vi.fn().mockResolvedValue(undefined),
    onClearSessions: vi.fn().mockResolvedValue(undefined),
    onDeleteSession: vi.fn().mockResolvedValue(undefined),
    onOpen: vi.fn().mockResolvedValue(undefined),
    onResume: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const view = render(<ToolHub {...props} />);
  return { props, view };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ToolHub", () => {
  it("opens the file picker, creates blank PDFs, and shows the default hint", () => {
    const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => undefined);
    const { props } = setup();
    expect(screen.getByText("Drop a PDF anywhere on this section.")).toBeInTheDocument();

    // click every picker-opening button (header + dropzone + both CTAs)
    for (const btn of screen.getAllByRole("button", { name: /Choose file|Start editing/ })) {
      fireEvent.click(btn);
    }
    expect(clickSpy).toHaveBeenCalled();

    for (const btn of screen.getAllByRole("button", { name: /Blank PDF/ })) {
      fireEvent.click(btn);
    }
    expect(props.onBlank).toHaveBeenCalled();
  });

  it("opens a dropped or chosen file and ignores empty selections", () => {
    const { props, view } = setup();
    const file = new File([new Uint8Array([1])], "x.pdf", { type: "application/pdf" });

    const input = view.container.querySelector('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [file] } });
    expect(props.onOpen).toHaveBeenCalledWith(file);

    vi.mocked(props.onOpen).mockClear();
    fireEvent.change(input, { target: { files: [] } }); // no file -> ignored
    expect(props.onOpen).not.toHaveBeenCalled();

    const dropzone = screen.getByLabelText("Import PDF");
    fireEvent.dragOver(dropzone);
    fireEvent.dragLeave(dropzone);
    fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    expect(props.onOpen).toHaveBeenCalledWith(file);

    vi.mocked(props.onOpen).mockClear();
    fireEvent.drop(dropzone, { dataTransfer: { files: [] } }); // empty drop
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("renders a status message when provided", () => {
    setup({ status: "Opening..." });
    expect(screen.getByText("Opening...")).toBeInTheDocument();
  });

  it("lists recent sessions and supports resume, delete, and clear", () => {
    const { props } = setup({ recentSessions: SESSIONS });
    expect(screen.getByText("Alpha.pdf")).toBeInTheDocument();
    expect(screen.getByText(/2 edits ·/)).toBeInTheDocument();

    fireEvent.click(screen.getByText("Alpha.pdf"));
    expect(props.onResume).toHaveBeenCalledWith("s1");

    fireEvent.click(screen.getByRole("button", { name: "Remove Beta.pdf" }));
    expect(props.onDeleteSession).toHaveBeenCalledWith("s2");

    fireEvent.click(screen.getByRole("button", { name: /Clear all/ }));
    expect(props.onClearSessions).toHaveBeenCalled();
  });

  it("disables actions while busy", () => {
    setup({ isBusy: true });
    expect(screen.getAllByRole("button", { name: /Blank PDF/ })[0]).toBeDisabled();
  });
});
