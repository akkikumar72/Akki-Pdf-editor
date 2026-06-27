import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Inspector } from "../../src/components/Inspector";
import type { EditOperation, TextItem } from "../../src/types/editor";

function textOp(overrides: Partial<Extract<EditOperation, { type: "text" }>> = {}): EditOperation {
  return {
    id: "t1",
    type: "text",
    pageIndex: 0,
    rect: { x: 0, y: 0, width: 10, height: 10 },
    text: "Hello",
    fontFamily: "Inter",
    fontSize: 14,
    color: "#111827",
    align: "left",
    opacity: 1,
    whiteout: false,
    createdAt: 1,
    ...overrides,
  };
}

const TEXT_ITEMS: TextItem[] = Array.from({ length: 20 }, (_, i) => ({
  str: `word${i}`,
  pageIndex: 0,
  rect: { x: 0, y: 0, width: 1, height: 1 },
}));

describe("Inspector", () => {
  it("shows the empty state and exports from the footer", () => {
    const onExport = vi.fn();
    render(<Inspector operationCount={0} pageTextItems={TEXT_ITEMS} onExport={onExport} onUpdate={vi.fn()} />);
    expect(screen.getByText("No selection")).toBeInTheDocument();
    for (const fmt of ["PDF", "TXT", "CSV", "XLSX"]) {
      fireEvent.click(screen.getByRole("button", { name: fmt }));
    }
    expect(onExport).toHaveBeenCalledWith("pdf");
    expect(onExport).toHaveBeenCalledWith("xlsx");
    // page text capped at 18
    expect(screen.getAllByText(/^word\d+$/)).toHaveLength(18);
  });

  it("edits a text operation across every field", () => {
    const onUpdate = vi.fn();
    render(
      <Inspector
        operation={textOp({ whiteout: true, whiteoutColor: "#eeeeee", embeddedFontKey: "g_d0_f1", detectedFontName: "Roboto" })}
        operationCount={1}
        pageTextItems={[]}
        onUpdate={onUpdate}
        onExport={vi.fn()}
      />,
    );
    expect(screen.getByText(/Matched the original embedded font \(Roboto\)/)).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "New body" } });
    expect(onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ text: "New body" }));

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "Arial" } });
    expect(onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ fontFamily: "Arial", embeddedFontKey: undefined }));

    const size = screen.getByRole("spinbutton");
    fireEvent.change(size, { target: { value: "200" } });
    expect(onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ fontSize: 96 })); // clamped to max
    fireEvent.change(size, { target: { value: "40" } });
    expect(onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ fontSize: 40 })); // in range
    fireEvent.change(size, { target: { value: "2" } });
    expect(onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ fontSize: 6 })); // clamped to min

    // alignment buttons (left/center/right) carry aria-pressed
    const alignButtons = screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") !== null);
    fireEvent.click(alignButtons[0]); // left
    fireEvent.click(alignButtons[1]); // center
    fireEvent.click(alignButtons[2]); // right
    expect(onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ align: "center" }));

    fireEvent.change(screen.getByDisplayValue("#111827"), { target: { value: "#00ff00" } });
    expect(onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ color: "#00ff00" }));

    fireEvent.change(screen.getByDisplayValue("#eeeeee"), { target: { value: "#123456" } });
    expect(onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ whiteoutColor: "#123456" }));

    // opacity slider + whiteout toggle
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0.5" } });
    expect(onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ opacity: 0.5 }));

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    expect(onUpdate).toHaveBeenCalledWith("t1", expect.objectContaining({ whiteout: false }));
  });

  it("ignores a non-finite size entry", () => {
    const onUpdate = vi.fn();
    render(
      <Inspector operation={textOp()} operationCount={1} pageTextItems={[]} onUpdate={onUpdate} onExport={vi.fn()} />,
    );
    // "1e999" is a valid number-input value but parses to Infinity -> guarded out.
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "1e999" } });
    for (const call of onUpdate.mock.calls) {
      if ("fontSize" in call[1]) expect(Number.isFinite(call[1].fontSize)).toBe(true);
    }
  });

  it("defaults opacity and whiteout background when those values are absent", () => {
    const onUpdate = vi.fn();
    // whiteout on, but no whiteoutColor and opacity explicitly undefined
    const op = { ...textOp({ whiteout: true }), opacity: undefined, whiteoutColor: undefined };
    const { rerender } = render(
      <Inspector operation={op as never} operationCount={1} pageTextItems={[]} onUpdate={onUpdate} onExport={vi.fn()} />,
    );
    expect(screen.getByRole("slider")).toHaveValue("1"); // opacity ?? 1
    const colors = screen.getAllByDisplayValue("#ffffff"); // whiteoutColor ?? "#ffffff"
    expect(colors.length).toBeGreaterThan(0);

    // an operation that has no opacity key at all skips the slider entirely
    const noOpacity = { id: "n", type: "link", pageIndex: 0, rect: { x: 0, y: 0, width: 1, height: 1 }, href: "x", createdAt: 1 };
    rerender(
      <Inspector operation={noOpacity as never} operationCount={1} pageTextItems={[]} onUpdate={onUpdate} onExport={vi.fn()} />,
    );
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
  });

  it("describes a detected (non-embedded) font and a fallback font", () => {
    const { rerender } = render(
      <Inspector
        operation={textOp({ detectedFontName: "Comic Sans", cssFontFamily: "Comic Sans, sans-serif" })}
        operationCount={1}
        pageTextItems={[]}
        onUpdate={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    expect(screen.getByText(/Detected/)).toBeInTheDocument();

    rerender(
      <Inspector operation={textOp()} operationCount={1} pageTextItems={[]} onUpdate={vi.fn()} onExport={vi.fn()} />,
    );
    // plain font, no detection -> describeFallback ("Exact editor font" for Inter)
    expect(screen.getByText(/Exact editor font|Closest match/)).toBeInTheDocument();
  });

  it("shows the embedded-font hint without a detected name", () => {
    render(
      <Inspector
        operation={textOp({ embeddedFontKey: "g_d0_f1" })}
        operationCount={1}
        pageTextItems={[]}
        onUpdate={vi.fn()}
        onExport={vi.fn()}
      />,
    );
    expect(screen.getByText("Matched the original embedded font")).toBeInTheDocument();
  });

  it("edits shape and link operations", () => {
    const onUpdate = vi.fn();
    const { rerender } = render(
      <Inspector
        operation={{ id: "s1", type: "shape", kind: "rectangle", pageIndex: 0, rect: { x: 0, y: 0, width: 1, height: 1 }, stroke: "#000000", strokeWidth: 2, opacity: 1, createdAt: 1 }}
        operationCount={1}
        pageTextItems={[]}
        onUpdate={onUpdate}
        onExport={vi.fn()}
      />,
    );
    const colors = screen.getAllByDisplayValue("#000000");
    fireEvent.change(colors[0], { target: { value: "#ff0000" } });
    expect(onUpdate).toHaveBeenCalledWith("s1", expect.objectContaining({ stroke: "#ff0000" }));
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "5" } });
    expect(onUpdate).toHaveBeenCalledWith("s1", expect.objectContaining({ strokeWidth: 5 }));

    rerender(
      <Inspector
        operation={{ id: "l1", type: "link", pageIndex: 0, rect: { x: 0, y: 0, width: 1, height: 1 }, href: "example.com", opacity: 1, createdAt: 1 }}
        operationCount={1}
        pageTextItems={[]}
        onUpdate={onUpdate}
        onExport={vi.fn()}
      />,
    );
    const url = screen.getByRole("textbox");
    fireEvent.change(url, { target: { value: "https://safe.com" } });
    expect(onUpdate).toHaveBeenCalledWith("l1", expect.objectContaining({ href: "https://safe.com" }));
    fireEvent.blur(url, { target: { value: "javascript:alert(1)" } });
    expect(onUpdate).toHaveBeenCalledWith("l1", expect.objectContaining({ href: "" })); // unsafe -> cleared
  });
});
