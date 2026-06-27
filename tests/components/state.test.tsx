import { render, renderHook, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EditorProvider } from "../../src/state/EditorProvider";
import { EditorContext, useEditor } from "../../src/state/editorContext";
import { cn } from "../../src/lib/utils";

describe("editorContext", () => {
  it("throws when used outside an EditorProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => renderHook(() => useEditor())).toThrow(/EditorProvider/);
    spy.mockRestore();
  });

  it("returns the controller value when provided", () => {
    const fake = { status: "ready" } as never;
    const { result } = renderHook(() => useEditor(), {
      wrapper: ({ children }) => <EditorContext.Provider value={fake}>{children}</EditorContext.Provider>,
    });
    expect(result.current.status).toBe("ready");
  });
});

describe("EditorProvider", () => {
  it("provides a live controller to its children", () => {
    function Probe() {
      const editor = useEditor();
      return <p>{editor.status}</p>;
    }
    render(
      <EditorProvider>
        <Probe />
      </EditorProvider>,
    );
    expect(screen.getByText(/Drop a PDF to start/)).toBeInTheDocument();
  });
});

describe("cn", () => {
  it("merges class names and resolves tailwind conflicts", () => {
    const skip = false as boolean;
    expect(cn("a", skip && "skip", null, undefined, "b")).toBe("a b");
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
