import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolHub } from "../src/components/ToolHub";
import type { SessionSummary } from "../src/utils/storage";

function makeProps(overrides: Partial<React.ComponentProps<typeof ToolHub>> = {}) {
  return {
    isBusy: false,
    status: undefined as string | undefined,
    recentSessions: [] as SessionSummary[],
    onBlank: vi.fn().mockResolvedValue(undefined),
    onClearSessions: vi.fn().mockResolvedValue(undefined),
    onDeleteSession: vi.fn().mockResolvedValue(undefined),
    onOpen: vi.fn().mockResolvedValue(undefined),
    onResume: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function session(id: string, name: string, ops = 3): SessionSummary {
  return { id, name, updatedAt: 1700000000000, operationCount: ops };
}

const pdfFile = new File([new Uint8Array([1, 2, 3])], "doc.pdf", { type: "application/pdf" });

describe("ToolHub", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it("renders the hero and the trust points", () => {
    render(<ToolHub {...makeProps()} />);
    const proofStrip = screen.getByLabelText("Product promises");
    expect(screen.getByRole("heading", { name: "AkkiPDF" })).toBeInTheDocument();
    expect(within(proofStrip).getByText("Browser-native PDF editing")).toBeInTheDocument();
    expect(within(proofStrip).getByText("Local by default")).toBeInTheDocument();
    expect(within(proofStrip).getByText("Web now")).toBeInTheDocument();
    expect(within(proofStrip).getByText("Your browser")).toBeInTheDocument();
    expect(screen.queryByText(/desktop/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ask AkkiPDF/i)).not.toBeInTheDocument();
  });

  it("does not render the status line without a status, and renders it with one", () => {
    const { unmount } = render(<ToolHub {...makeProps()} />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    unmount();
    render(<ToolHub {...makeProps({ status: "Loading..." })} />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading...");
  });

  it("opens the file picker from the nav, hero, action row, and closing CTAs", () => {
    render(<ToolHub {...makeProps()} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click");

    fireEvent.click(within(screen.getByRole("navigation", { name: "PDF editor" })).getByRole("button", { name: "Open PDF" }));
    fireEvent.click(screen.getByRole("button", { name: /Click or drag a PDF here/ }));
    fireEvent.click(screen.getByRole("button", { name: "Choose PDF" }));
    fireEvent.click(screen.getByRole("button", { name: "Start editing" }));
    expect(clickSpy).toHaveBeenCalledTimes(4);
  });

  it("calls onBlank from each blank CTA", () => {
    const props = makeProps();
    render(<ToolHub {...props} />);
    // Hero, preview, and closing blank buttons.
    const blanks = screen.getAllByRole("button", { name: /Blank PDF/ });
    blanks.forEach((b) => fireEvent.click(b));
    expect(props.onBlank).toHaveBeenCalledTimes(blanks.length);
  });

  it("calls onOpen when a file is chosen via the input", () => {
    const props = makeProps();
    render(<ToolHub {...props} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [pdfFile] } });
    expect(props.onOpen).toHaveBeenCalledWith(pdfFile);
  });

  it("ignores a file change event with no file", () => {
    const props = makeProps();
    render(<ToolHub {...props} />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [] } });
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("handles drag over, drag leave, and drop with a file", () => {
    const props = makeProps();
    render(<ToolHub {...props} />);
    const hero = document.querySelector(".lumen-hero") as HTMLElement;

    fireEvent.dragOver(hero, { dataTransfer: { files: [] } });
    expect(document.querySelector(".tool-hub")?.className).toContain("is-dragging");

    fireEvent.dragLeave(hero);
    expect(document.querySelector(".tool-hub")?.className).not.toContain("is-dragging");

    fireEvent.drop(hero, { dataTransfer: { files: [pdfFile] } });
    expect(props.onOpen).toHaveBeenCalledWith(pdfFile);
  });

  it("ignores a drop with no files", () => {
    const props = makeProps();
    render(<ToolHub {...props} />);
    const hero = document.querySelector(".lumen-hero") as HTMLElement;
    fireEvent.drop(hero, { dataTransfer: { files: [] } });
    expect(props.onOpen).not.toHaveBeenCalled();
  });

  it("disables CTAs when busy", () => {
    render(<ToolHub {...makeProps({ isBusy: true })} />);
    expect(within(screen.getByRole("navigation", { name: "PDF editor" })).getByRole("button", { name: "Open PDF" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Choose PDF" })).toBeDisabled();
    screen.getAllByRole("button", { name: /Blank PDF/ }).forEach((b) => expect(b).toBeDisabled());
  });

  describe("recent sessions", () => {
    it("does not render the recent section when there are none", () => {
      render(<ToolHub {...makeProps({ recentSessions: [] })} />);
      expect(screen.queryByLabelText("Recent local sessions")).not.toBeInTheDocument();
    });

    it("renders up to three sessions and wires resume/delete/clear handlers", () => {
      const props = makeProps({
        recentSessions: [session("1", "Alpha"), session("2", "Beta"), session("3", "Gamma"), session("4", "Delta")],
      });
      render(<ToolHub {...props} />);
      const region = screen.getByLabelText("Recent local sessions");
      expect(within(region).getByText("4 saved in this browser")).toBeInTheDocument();
      // Sliced to three.
      expect(within(region).getByText("Alpha")).toBeInTheDocument();
      expect(within(region).queryByText("Delta")).not.toBeInTheDocument();

      fireEvent.click(within(region).getByText("Alpha"));
      expect(props.onResume).toHaveBeenCalledWith("1");

      fireEvent.click(within(region).getByLabelText("Remove Beta"));
      expect(props.onDeleteSession).toHaveBeenCalledWith("2");

      fireEvent.click(within(region).getByText("Clear all"));
      expect(props.onClearSessions).toHaveBeenCalled();
    });
  });

  describe("footer", () => {
    it("scrolls to editor for non-blank product buttons and calls onBlank for Blank PDF", () => {
      const props = makeProps();
      render(<ToolHub {...props} />);
      const footerNav = screen.getByRole("navigation", { name: "Product" });
      const editor = document.getElementById("editor") as HTMLElement;
      const scrollSpy = vi.fn();
      editor.scrollIntoView = scrollSpy;

      fireEvent.click(within(footerNav).getByRole("button", { name: "Open PDF" }));
      expect(scrollSpy).toHaveBeenCalled();

      fireEvent.click(within(footerNav).getByRole("button", { name: "Blank PDF" }));
      expect(props.onBlank).toHaveBeenCalled();
    });
  });

  describe("scroll effect", () => {
    it("toggles the floating class based on scrollY", () => {
      const rafSpy = vi
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation((cb: FrameRequestCallback) => {
          cb(0);
          return 1;
        });
      render(<ToolHub {...makeProps()} />);
      const nav = document.getElementById("lumen-nav") as HTMLElement;
      // Initial onScroll already ran (scrollY 0 -> not floating).
      expect(nav.classList.contains("is-floating")).toBe(false);

      Object.defineProperty(window, "scrollY", { value: 100, configurable: true });
      fireEvent.scroll(window);
      expect(nav.classList.contains("is-floating")).toBe(true);

      // Second scroll while still "ticking" path: re-enable and scroll back to top.
      Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
      fireEvent.scroll(window);
      expect(nav.classList.contains("is-floating")).toBe(false);
      rafSpy.mockRestore();
    });

    it("coalesces scroll handling while a frame is pending (ticking guard)", () => {
      // Never invoke the rAF callback so `ticking` stays true; a second scroll is a no-op.
      const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
      render(<ToolHub {...makeProps()} />);
      fireEvent.scroll(window);
      fireEvent.scroll(window);
      expect(rafSpy).toHaveBeenCalledTimes(1);
      rafSpy.mockRestore();
    });
  });
});
