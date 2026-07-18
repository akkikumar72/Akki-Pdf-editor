import { render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { EditorContext, useEditor } from "../src/state/editorContext";
import { EditorProvider } from "../src/state/EditorProvider";
import type { EditorController } from "../src/state/useEditorController";

// EditorProvider calls useEditorController, which touches the engine + storage on
// mount via effects. Mock those modules so the provider renders without real PDF
// or IndexedDB work.
vi.mock("../src/engine/pdfEngine", () => ({
  pdfEngine: {
    loadDocument: vi.fn(),
    createBlankDocument: vi.fn(),
    getPageSizes: vi.fn().mockResolvedValue([{ width: 612, height: 792 }]),
    extractTextAndFonts: vi.fn().mockResolvedValue({ items: [], fonts: {}, links: [] }),
    insertBlankPage: vi.fn(),
    deletePage: vi.fn(),
    rotatePage: vi.fn(),
    savePdf: vi.fn(),
  },
}));

vi.mock("../src/engine/exportPipeline", () => ({
  exportPipeline: { export: vi.fn() },
}));

vi.mock("../src/utils/storage", () => ({
  saveSession: vi.fn().mockResolvedValue(undefined),
  listSessions: vi.fn().mockResolvedValue([]),
  getLatestSession: vi.fn().mockResolvedValue(undefined),
  getSession: vi.fn().mockResolvedValue(undefined),
  deleteSession: vi.fn().mockResolvedValue(undefined),
  clearSessions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../src/utils/fileValidation", () => ({
  validatePdfFile: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("useEditor", () => {
  it("throws when used outside an EditorProvider", () => {
    // React logs the (intentional) render error to console.error twice; keep
    // the suite's output clean so real failures stand out.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      expect(() => renderHook(() => useEditor())).toThrowError(
        "useEditor must be used within an EditorProvider",
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("returns the context value when used inside a provider", () => {
    const controller = { status: "ready" } as unknown as EditorController;
    const wrapper = ({ children }: { children: ReactNode }) => (
      <EditorContext.Provider value={controller}>{children}</EditorContext.Provider>
    );
    const { result } = renderHook(() => useEditor(), { wrapper });
    expect(result.current).toBe(controller);
  });
});

describe("EditorProvider", () => {
  it("renders children and provides the editor context", () => {
    function Consumer() {
      const editor = useEditor();
      return <div>status:{editor.status}</div>;
    }

    render(
      <EditorProvider>
        <Consumer />
      </EditorProvider>,
    );

    expect(screen.getByText(/status:/)).toBeInTheDocument();
  });
});
