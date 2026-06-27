import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "../../src/components/AppShell";
import { AkkiPdfLogo, AkkiPdfLogoLink, AkkiPdfMark } from "../../src/components/AkkiPdfLogo";
import { StatusBar } from "../../src/components/StatusBar";
import { ResizeHandles } from "../../src/components/ResizeHandles";

describe("AppShell", () => {
  it("renders all regions, with and without the canvas toolbar", () => {
    const { rerender } = render(
      <AppShell
        header={<span>HEAD</span>}
        rail={<span>RAIL</span>}
        inspector={<span>INSPECT</span>}
        status={<span>STATUS</span>}
        canvasToolbar={<span>BAR</span>}
      >
        <span>CANVAS</span>
      </AppShell>,
    );
    expect(screen.getByText("HEAD")).toBeInTheDocument();
    expect(screen.getByText("BAR")).toBeInTheDocument();
    expect(screen.getByText("CANVAS")).toBeInTheDocument();

    rerender(
      <AppShell header={<span>HEAD</span>} rail={<span>RAIL</span>} inspector={<span>INSPECT</span>} status={<span>STATUS</span>}>
        <span>CANVAS</span>
      </AppShell>,
    );
    expect(screen.queryByText("BAR")).not.toBeInTheDocument();
  });
});

describe("AkkiPdfLogo family", () => {
  it("renders the mark, button, and link with optional wordmark", () => {
    const { container } = render(
      <div>
        <AkkiPdfMark className="m" />
        <AkkiPdfLogo />
        <AkkiPdfLogo showWordmark={false} className="x" />
        <AkkiPdfLogoLink href="#" />
        <AkkiPdfLogoLink showWordmark={false} className="y" href="#" />
      </div>,
    );
    expect(container.querySelector("svg.m")).toBeInTheDocument();
    expect(screen.getAllByText("AkkiPDF")).toHaveLength(2); // one button + one link with wordmark
    expect(container.querySelector("button.x")).toBeInTheDocument();
    expect(container.querySelector("a.y")).toBeInTheDocument();
  });
});

describe("StatusBar", () => {
  it("shows the busy spinner and page counter when a document is open", () => {
    render(<StatusBar documentName="a.pdf" isBusy operationCount={3} pageIndex={1} pageCount={4} scale={1.25} status="Working" />);
    expect(screen.getByText("Working")).toBeInTheDocument();
    expect(screen.getByText("a.pdf")).toBeInTheDocument();
    expect(screen.getByText("Page 2/4")).toBeInTheDocument();
    expect(screen.getByText("3 edits")).toBeInTheDocument();
    expect(screen.getByText("125%")).toBeInTheDocument();
  });

  it("shows defaults when no document is open and not busy", () => {
    render(<StatusBar isBusy={false} operationCount={0} pageIndex={0} pageCount={0} scale={1} status="Idle" />);
    expect(screen.getByText("No document")).toBeInTheDocument();
    expect(screen.getByText("Page -")).toBeInTheDocument();
  });
});

describe("ResizeHandles", () => {
  it("renders eight handles and forwards a resize start with stopped propagation", () => {
    const onResizeStart = vi.fn();
    const { container } = render(
      <ResizeHandles rect={{ left: 10, top: 20, width: 100, height: 50 }} onResizeStart={onResizeStart} />,
    );
    const handles = container.querySelectorAll(".resize-handle");
    expect(handles).toHaveLength(8);
    fireEvent.pointerDown(handles[0]);
    expect(onResizeStart).toHaveBeenCalledWith("nw", expect.anything());
  });
});
