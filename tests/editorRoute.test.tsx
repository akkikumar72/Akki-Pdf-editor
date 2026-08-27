import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import type { EditHistoryEntry, EditState } from "../src/state/editModel";
import type { EditorController } from "../src/state/useEditorController";
import type {
  EditOperation,
  EditorTool,
  ExportFormat,
  LoadedPdf,
  TextItem,
} from "../src/types/editor";

type AppShellStubProps = {
  header: ReactNode;
  rail: ReactNode;
  inspector?: ReactNode;
  status: ReactNode;
  children: ReactNode;
  wrapStage?: (stage: ReactNode) => ReactNode;
};

type ToolRibbonStubProps = {
  canUndo: boolean;
  canRedo: boolean;
  disabled: boolean;
  activeTool: EditorTool;
  scale: number;
  documentName: string;
  propertiesOpen: boolean;
  onFindReplace: () => void;
  onHome: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRemove: () => void;
  onDeletePage: () => void;
  onInsertPage: () => void;
  onToggleProperties: () => void;
  onRotate: () => void;
  onRotatePage: () => void;
  onRestoreHistory: (id: string) => void;
  onToolChange: (tool: EditorTool) => void;
  onExport: (format: ExportFormat) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

type PageRailStubProps = {
  activePage: number;
  pageCount: number;
  onSelect: (index: number) => void;
};

type InspectorStubProps = {
  operationCount: number;
  pageTextItems: TextItem[];
  onUpdate: (id: string, patch: Partial<EditOperation>) => void;
  onExport: (format: ExportFormat) => void;
  onClose?: () => void;
};

type StatusBarStubProps = {
  documentName: string;
  isBusy: boolean;
};

type PdfCanvasStubProps = {
  activeTool: EditorTool;
  pageIndex: number;
  searchHighlight?: { pageIndex: number; rect: { x: number; y: number; width: number; height: number } } | null;
  selectedIds: string[];
  onDraggingChange: (count: number) => void;
  onNotice: (message: string) => void;
  onOperationAdd: (operation: Partial<EditOperation>) => void;
  onOperationsAdd: (operations: Partial<EditOperation>[]) => void;
  onOperationRemove: (id: string) => void;
  onOperationsRemove: (ids: string[]) => void;
  onOperationsReplace: (replacements: Array<{ id: string; operations: Partial<EditOperation>[] }>) => void;
  onOperationSelect: (ids: string[], additive?: boolean) => void;
  onOperationsTranslate: (ids: string[], dx: number, dy: number) => void;
  onOperationUpdate: (id: string, patch: Partial<EditOperation>) => void;
  onPropertiesOpen: () => void;
};

type FindReplaceDialogStubProps = {
  textItems: TextItem[];
  onAddOperations: (operations: Partial<EditOperation>[]) => void;
  onHighlight: (highlight: { pageIndex: number; rect: { x: number; y: number; width: number; height: number } } | null) => void;
  onPageChange: (pageIndex: number) => void;
  onClose: () => void;
};

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateSpy,
}));

// ---- stub heavy children; each exposes its props through buttons/spans ----
vi.mock("../src/components/AppShell", () => ({
  AppShell: ({ header, rail, inspector, status, children, wrapStage }: AppShellStubProps) => {
    const stage = (
      <>
        <div data-testid="inspector">{inspector}</div>
        <div data-testid="children">{children}</div>
      </>
    );
    return (
      <div data-testid="app-shell">
        <div data-testid="header">{header}</div>
        <div data-testid="rail">{rail}</div>
        <div data-testid="status">{status}</div>
        {wrapStage ? wrapStage(stage) : stage}
      </div>
    );
  },
}));

vi.mock("../src/components/ToolRibbon", () => ({
  ToolRibbon: (props: ToolRibbonStubProps) => (
    <div data-testid="tool-ribbon">
      <span data-testid="canUndo">{String(props.canUndo)}</span>
      <span data-testid="canRedo">{String(props.canRedo)}</span>
      <span data-testid="disabled">{String(props.disabled)}</span>
      <span data-testid="activeTool">{props.activeTool}</span>
      <span data-testid="scale">{props.scale}</span>
      <span data-testid="toolbar-document-name">{props.documentName}</span>
      <span data-testid="properties-open">{String(props.propertiesOpen)}</span>
      <button onClick={props.onHome}>home</button>
      <button onClick={props.onUndo}>undo</button>
      <button onClick={props.onRedo}>redo</button>
      <button onClick={props.onRemove}>remove</button>
      <button onClick={props.onDeletePage}>delete-page</button>
      <button onClick={props.onInsertPage}>insert-page</button>
      <button onClick={props.onRotate}>rotate</button>
      <button onClick={props.onRotatePage}>rotate-page</button>
      <button onClick={() => props.onRestoreHistory("h1")}>restore-history</button>
      <button onClick={() => props.onToolChange("text")}>tool-change</button>
      <button onClick={() => props.onToolChange("mark-cross")}>cross-tool</button>
      <button onClick={() => props.onToolChange("crop")}>crop-tool</button>
      <button onClick={() => props.onExport("pdf")}>export</button>
      <button onClick={props.onZoomIn}>zoom-in</button>
      <button onClick={props.onZoomOut}>zoom-out</button>
      <button onClick={props.onFindReplace}>find-replace</button>
      <button onClick={props.onToggleProperties}>toggle-properties</button>
    </div>
  ),
}));

vi.mock("../src/components/PageRail", () => ({
  PageRail: (props: PageRailStubProps) => (
    <div data-testid="page-rail">
      <span data-testid="active-page">{props.activePage}</span>
      <span data-testid="page-count">{props.pageCount}</span>
      <button onClick={() => props.onSelect(2)}>select-page</button>
    </div>
  ),
}));

vi.mock("../src/components/Inspector", () => ({
  Inspector: (props: InspectorStubProps) => (
    <div data-testid="inspector-cmp">
      <span data-testid="op-count">{props.operationCount}</span>
      <span data-testid="page-text-count">{props.pageTextItems.length}</span>
      <button onClick={() => props.onUpdate("id-1", { text: "x" })}>inspector-update</button>
      <button onClick={() => props.onExport("txt")}>inspector-export</button>
      <button onClick={props.onClose}>close-properties</button>
    </div>
  ),
}));

vi.mock("../src/components/StatusBar", () => ({
  StatusBar: (props: StatusBarStubProps) => (
    <div data-testid="status-bar">
      <span data-testid="doc-name">{props.documentName}</span>
      <span data-testid="status-busy">{String(props.isBusy)}</span>
    </div>
  ),
}));

vi.mock("../src/components/PdfCanvas", () => ({
  PdfCanvas: (props: PdfCanvasStubProps) => (
    <div data-testid="pdf-canvas">
      <span data-testid="canvas-tool">{props.activeTool}</span>
      <span data-testid="canvas-page">{props.pageIndex}</span>
      <span data-testid="canvas-highlight">{props.searchHighlight ? String(props.searchHighlight.pageIndex) : "none"}</span>
      <button onClick={() => props.onNotice("hi")}>canvas-notice</button>
      <button onClick={() => props.onOperationAdd({ id: "o" })}>canvas-add</button>
      <button onClick={() => props.onOperationsAdd([{ id: "o1" }, { id: "o2" }])}>canvas-add-many</button>
      <button onClick={() => props.onOperationRemove("o")}>canvas-remove</button>
      <button onClick={() => props.onOperationsRemove(["o1", "o2"])}>canvas-remove-many</button>
      <button onClick={() => props.onOperationsReplace([{ id: "o1", operations: [] }])}>canvas-replace-many</button>
      <button onClick={() => props.onOperationSelect(["o"], true)}>canvas-select</button>
      <button onClick={() => props.onOperationsTranslate(["o1", "o2"], 4, 5)}>canvas-translate</button>
      <button onClick={() => props.onDraggingChange(2)}>canvas-dragging</button>
      <button onClick={() => props.onOperationUpdate("o", { text: "y" })}>canvas-update</button>
      <button onClick={props.onPropertiesOpen}>canvas-properties</button>
    </div>
  ),
}));

vi.mock("../src/components/FindReplaceDialog", () => ({
  FindReplaceDialog: (props: FindReplaceDialogStubProps) => (
    <div data-testid="find-replace-dialog">
      <span data-testid="find-text-count">{props.textItems.length}</span>
      <button onClick={() => props.onAddOperations([{ id: "fr" }])}>fr-add</button>
      <button onClick={() => props.onHighlight({ pageIndex: 1, rect: { x: 1, y: 2, width: 3, height: 4 } })}>fr-highlight</button>
      <button onClick={() => props.onPageChange(2)}>fr-page</button>
      <button onClick={props.onClose}>fr-close</button>
    </div>
  ),
}));

import { EditorContext } from "../src/state/editorContext";
import { EditorRoute } from "../src/routes/EditorRoute";

const DOC: LoadedPdf = { name: "doc.pdf", bytes: new Uint8Array([1]), pageCount: 3, fingerprint: "fp" };

function makeController(overrides: Partial<EditorController> = {}): EditorController {
  return {
    document: DOC,
    isBusy: false,
    restoreLatestSession: vi.fn(async () => true),
    activeTool: "select",
    rotation: 0,
    scale: 1.18,
    pageIndex: 0,
    status: "Ready",
    documentFonts: {},
    textItems: [],
    pageTextItems: [],
    pageSizes: [{ width: 612, height: 792 }],
    selectedOperation: undefined,
    visibleOperations: [],
    pageStageRef: { current: null },
    editState: { past: [], future: [], operations: [], selectedIds: [] },
    dispatch: vi.fn(),
    runExport: vi.fn(),
    returnHome: vi.fn(async () => undefined),
    removeSelected: vi.fn(),
    deleteCurrentPage: vi.fn(),
    insertPageAfter: vi.fn(),
    setRotation: vi.fn(),
    rotateCurrentPage: vi.fn(),
    restoreHistoryEntry: vi.fn(),
    setActiveTool: vi.fn(),
    setScale: vi.fn(),
    setPageIndex: vi.fn(),
    setStatus: vi.fn(),
    addOperation: vi.fn(),
    addOperations: vi.fn(),
    removeOperation: vi.fn(),
    removeOperations: vi.fn(),
    replaceOperations: vi.fn(),
    translateOperations: vi.fn(),
    duplicateSelected: vi.fn(),
    selectedOperations: [],
    updateOperation: vi.fn(),
    undo: vi.fn(async () => undefined),
    redo: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as EditorController;
}

function renderRoute(controller: EditorController) {
  return render(
    <MemoryRouter>
      <EditorContext.Provider value={controller}>
        <EditorRoute />
      </EditorContext.Provider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  navigateSpy.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("EditorRoute - no document", () => {
  it("does not navigate from the !restored branch when a session is restored", async () => {
    // restored === true so the `if (!restored) navigate` branch is skipped; the
    // single navigate call comes from the follow-up effect run (restoreChecked=true).
    const restoreLatestSession = vi.fn(async () => true);
    renderRoute(makeController({ document: null, restoreLatestSession }));
    expect(screen.getByText("Loading editor…")).toBeInTheDocument();
    await waitFor(() => expect(restoreLatestSession).toHaveBeenCalled());
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith("/", { replace: true }));
    expect(navigateSpy).toHaveBeenCalledTimes(1);
  });

  it("navigates home when no session is restored", async () => {
    const restoreLatestSession = vi.fn(async () => false);
    renderRoute(makeController({ document: null, restoreLatestSession }));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith("/", { replace: true }));
  });

  it("shows the busy restoring message while busy", () => {
    renderRoute(makeController({ document: null, isBusy: true }));
    expect(screen.getByText("Restoring your document…")).toBeInTheDocument();
  });

  it("navigates home immediately when restore was already checked but doc still null", async () => {
    // restoreLatestSession resolves true (so setRestoreChecked(true)) but document
    // stays null, so the effect re-runs with restoreChecked=true -> navigate home.
    const restoreLatestSession = vi.fn(async () => true);
    renderRoute(makeController({ document: null, restoreLatestSession }));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith("/", { replace: true }));
  });

  it("cancels the pending restore on unmount without setting state", async () => {
    let resolveRestore: (value: boolean) => void = () => {};
    const restoreLatestSession = vi.fn(
      () => new Promise<boolean>((resolve) => { resolveRestore = resolve; }),
    );
    const { unmount } = renderRoute(makeController({ document: null, restoreLatestSession }));
    unmount();
    await act(async () => {
      resolveRestore(false);
      await Promise.resolve();
    });
    // cancelled === true so neither navigate nor setRestoreChecked runs
    expect(navigateSpy).not.toHaveBeenCalled();
  });
});

describe("EditorRoute - with document", () => {
  it("renders the full shell and forwards core props", () => {
    renderRoute(makeController());
    expect(screen.getByTestId("app-shell")).toBeInTheDocument();
    expect(screen.getByTestId("canvas-tool").textContent).toBe("select");
    expect(screen.getByTestId("doc-name").textContent).toBe("doc.pdf");
    expect(screen.getByTestId("toolbar-document-name").textContent).toBe("doc.pdf");
    expect(screen.getByTestId("page-count").textContent).toBe("3");
    expect(screen.queryByTestId("inspector-cmp")).toBeNull();
  });

  it("computes canUndo/canRedo from history length", () => {
    renderRoute(makeController({
      editState: {
        past: [{ id: "p" }] as Pick<EditHistoryEntry, "id">[] as EditHistoryEntry[],
        future: [{ id: "f" }] as Pick<EditHistoryEntry, "id">[] as EditHistoryEntry[],
        operations: [],
        selectedIds: [],
      } satisfies EditState,
    }));
    expect(screen.getByTestId("canUndo").textContent).toBe("true");
    expect(screen.getByTestId("canRedo").textContent).toBe("true");
  });

  it("fires the ToolRibbon handlers", () => {
    const controller = makeController();
    renderRoute(controller);

    fireEvent.click(screen.getByText("home"));
    expect(navigateSpy).toHaveBeenCalledWith("/");
    expect(controller.returnHome).toHaveBeenCalled();

    fireEvent.click(screen.getByText("undo"));
    expect(controller.undo).toHaveBeenCalled();
    fireEvent.click(screen.getByText("redo"));
    expect(controller.redo).toHaveBeenCalled();

    fireEvent.click(screen.getByText("remove"));
    expect(controller.removeSelected).toHaveBeenCalled();
    fireEvent.click(screen.getByText("delete-page"));
    expect(controller.deleteCurrentPage).toHaveBeenCalled();
    fireEvent.click(screen.getByText("insert-page"));
    expect(controller.insertPageAfter).toHaveBeenCalled();
    fireEvent.click(screen.getByText("rotate-page"));
    expect(controller.rotateCurrentPage).toHaveBeenCalled();
    fireEvent.click(screen.getByText("restore-history"));
    expect(controller.restoreHistoryEntry).toHaveBeenCalledWith("h1");
    fireEvent.click(screen.getByText("tool-change"));
    expect(controller.setActiveTool).toHaveBeenCalledWith("text");
    fireEvent.click(screen.getByText("export"));
    expect(controller.runExport).toHaveBeenCalledWith("pdf");
  });

  it("inserts Cross immediately at the page center and returns to Select", () => {
    const controller = makeController({ scale: 1 });
    renderRoute(controller);

    fireEvent.click(screen.getByText("cross-tool"));

    expect(controller.addOperation).toHaveBeenCalledWith(expect.objectContaining({
      type: "form-mark",
      mark: "cross",
      pageIndex: 0,
      rect: { x: 295, y: 385, width: 22, height: 22 },
    }));
    expect(controller.setActiveTool).toHaveBeenCalledWith("select");
    expect(controller.setStatus).toHaveBeenCalledWith("Cross inserted at page center");
  });

  it("resets a rotated view before arming Crop", () => {
    const controller = makeController({ rotation: 90 });
    renderRoute(controller);

    fireEvent.click(screen.getByText("crop-tool"));

    expect(controller.setRotation).toHaveBeenCalledWith(0);
    expect(controller.setActiveTool).toHaveBeenCalledWith("crop");
    expect(controller.setStatus).toHaveBeenCalledWith("View reset to original orientation for accurate cropping.");
  });

  it("applies the rotate, zoom-in and zoom-out updater functions", () => {
    const controller = makeController();
    renderRoute(controller);

    fireEvent.click(screen.getByText("rotate"));
    expect(controller.setActiveTool).toHaveBeenCalledWith("select");
    const rotateUpdater = (controller.setRotation as unknown as Mock).mock.calls[0][0] as (n: number) => number;
    expect(rotateUpdater(300)).toBe(30); // (300 + 90) % 360
    expect(rotateUpdater(0)).toBe(90);

    fireEvent.click(screen.getByText("zoom-in"));
    const zoomInUpdater = (controller.setScale as unknown as Mock).mock.calls[0][0] as (n: number) => number;
    expect(zoomInUpdater(1)).toBeCloseTo(1.1);
    expect(zoomInUpdater(2.4)).toBe(2.4); // clamped to max

    fireEvent.click(screen.getByText("zoom-out"));
    const zoomOutUpdater = (controller.setScale as unknown as Mock).mock.calls[1][0] as (n: number) => number;
    expect(zoomOutUpdater(1)).toBeCloseTo(0.9);
    expect(zoomOutUpdater(0.45)).toBe(0.45); // clamped to min
  });

  it("wires the PageRail, Inspector, and PdfCanvas callbacks", () => {
    const controller = makeController();
    renderRoute(controller);

    fireEvent.click(screen.getByText("select-page"));
    expect(controller.setPageIndex).toHaveBeenCalledWith(2);

    fireEvent.click(screen.getByText("toggle-properties"));
    expect(screen.getByTestId("properties-open").textContent).toBe("true");
    fireEvent.click(screen.getByText("inspector-update"));
    expect(controller.updateOperation).toHaveBeenCalledWith("id-1", { text: "x" });
    fireEvent.click(screen.getByText("inspector-export"));
    expect(controller.runExport).toHaveBeenCalledWith("txt");

    fireEvent.click(screen.getByText("canvas-notice"));
    expect(controller.setStatus).toHaveBeenCalledWith("hi");
    fireEvent.click(screen.getByText("canvas-add"));
    expect(controller.addOperation).toHaveBeenCalledWith({ id: "o" });
    fireEvent.click(screen.getByText("canvas-remove"));
    expect(controller.removeOperation).toHaveBeenCalledWith("o");
    fireEvent.click(screen.getByText("canvas-remove-many"));
    expect(controller.removeOperations).toHaveBeenCalledWith(["o1", "o2"]);
    fireEvent.click(screen.getByText("canvas-replace-many"));
    expect(controller.replaceOperations).toHaveBeenCalledWith([{ id: "o1", operations: [] }]);
    fireEvent.click(screen.getByText("canvas-select"));
    expect(controller.dispatch).toHaveBeenCalledWith({ type: "select", ids: ["o"], additive: true });
    fireEvent.click(screen.getByText("canvas-translate"));
    expect(controller.translateOperations).toHaveBeenCalledWith(["o1", "o2"], 4, 5);
    fireEvent.click(screen.getByText("canvas-update"));
    expect(controller.updateOperation).toHaveBeenCalledWith("o", { text: "y" });
    fireEvent.click(screen.getByText("canvas-properties"));
    expect(screen.getByTestId("properties-open").textContent).toBe("true");
    // onDraggingChange feeds the StatusBar's movingCount state without crashing.
    fireEvent.click(screen.getByText("canvas-dragging"));
  });

  it("wires the batch add-operations callback through to the controller", () => {
    const controller = makeController();
    renderRoute(controller);
    fireEvent.click(screen.getByText("canvas-add-many"));
    expect(controller.addOperations).toHaveBeenCalledWith([{ id: "o1" }, { id: "o2" }]);
  });

  it("forwards the controller's pageTextItems to canvas and inspector", () => {
    const controller = makeController({
      pageIndex: 1,
      pageTextItems: [
        { str: "b", pageIndex: 1, rect: { x: 0, y: 0, width: 1, height: 1 } },
      ] satisfies TextItem[],
    });
    renderRoute(controller);
    fireEvent.click(screen.getByText("toggle-properties"));
    expect(screen.getByTestId("page-text-count").textContent).toBe("1");
    expect(screen.getByTestId("canvas-page").textContent).toBe("1");
  });

  it("closes the properties drawer from its close action and Escape", () => {
    renderRoute(makeController());
    fireEvent.click(screen.getByText("toggle-properties"));
    expect(screen.getByTestId("inspector-cmp")).toBeInTheDocument();
    fireEvent.click(screen.getByText("close-properties"));
    expect(screen.queryByTestId("inspector-cmp")).toBeNull();

    fireEvent.click(screen.getByText("toggle-properties"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByTestId("inspector-cmp")).toBeNull();
  });
});

describe("EditorRoute - find & replace", () => {
  it("opens the dialog from the ribbon button and closes it, clearing the flag", () => {
    renderRoute(makeController());
    expect(screen.queryByTestId("find-replace-dialog")).toBeNull();

    fireEvent.click(screen.getByText("find-replace"));
    expect(screen.getByTestId("find-replace-dialog")).toBeInTheDocument();

    // Dialog reports a highlight -> forwarded to the canvas.
    fireEvent.click(screen.getByText("fr-highlight"));
    expect(screen.getByTestId("canvas-highlight").textContent).toBe("1");

    fireEvent.click(screen.getByText("fr-close"));
    expect(screen.queryByTestId("find-replace-dialog")).toBeNull();
    expect(screen.getByTestId("canvas-highlight").textContent).toBe("none");
  });

  it("opens on Cmd+F and Ctrl+F, preventing the browser find", () => {
    renderRoute(makeController());
    const notPrevented = fireEvent.keyDown(window, { key: "f", metaKey: true });
    // fireEvent returns false when preventDefault was called.
    expect(notPrevented).toBe(false);
    expect(screen.getByTestId("find-replace-dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByText("fr-close"));
    fireEvent.keyDown(window, { key: "F", ctrlKey: true });
    expect(screen.getByTestId("find-replace-dialog")).toBeInTheDocument();
  });

  it("ignores plain keys and modified non-f keys", () => {
    renderRoute(makeController());
    fireEvent.keyDown(window, { key: "f" });
    fireEvent.keyDown(window, { key: "g", metaKey: true });
    expect(screen.queryByTestId("find-replace-dialog")).toBeNull();
  });

  it("wires the dialog callbacks to the controller", () => {
    const controller = makeController({
      textItems: [
        { str: "a", pageIndex: 0, rect: { x: 0, y: 0, width: 1, height: 1 } },
      ] satisfies TextItem[],
    });
    renderRoute(controller);
    fireEvent.click(screen.getByText("find-replace"));
    expect(screen.getByTestId("find-text-count").textContent).toBe("1");

    fireEvent.click(screen.getByText("fr-add"));
    expect(controller.addOperations).toHaveBeenCalledWith([{ id: "fr" }]);

    fireEvent.click(screen.getByText("fr-page"));
    expect(controller.setPageIndex).toHaveBeenCalledWith(2);
  });
});

describe("EditorRoute - history shortcuts", () => {
  function makeHistoryController(overrides: Partial<EditorController> = {}) {
    return makeController({
      editState: {
        past: [{ id: "past" }] as Pick<EditHistoryEntry, "id">[] as EditHistoryEntry[],
        future: [{ id: "future" }] as Pick<EditHistoryEntry, "id">[] as EditHistoryEntry[],
        operations: [],
        selectedIds: [],
      },
      ...overrides,
    });
  }

  it.each([
    ["Cmd+Z", { key: "z", metaKey: true }, "undo"],
    ["Ctrl+Z", { key: "z", ctrlKey: true }, "undo"],
    ["Cmd+Shift+Z", { key: "z", metaKey: true, shiftKey: true }, "redo"],
    ["Ctrl+Shift+Z", { key: "z", ctrlKey: true, shiftKey: true }, "redo"],
    ["Ctrl+Y", { key: "y", ctrlKey: true }, "redo"],
  ] as const)("handles %s", (_label, init, action) => {
    const controller = makeHistoryController();
    renderRoute(controller);

    const notPrevented = fireEvent.keyDown(window, init);

    expect(notPrevented).toBe(false);
    expect(controller[action]).toHaveBeenCalledTimes(1);
  });

  it.each(["input", "textarea", "select"])("leaves %s history shortcuts to the field", (tagName) => {
    const controller = makeHistoryController();
    renderRoute(controller);
    const field = document.createElement(tagName);
    document.body.appendChild(field);

    const notPrevented = fireEvent.keyDown(field, { key: "z", ctrlKey: true });

    expect(notPrevented).toBe(true);
    expect(controller.undo).not.toHaveBeenCalled();
    expect(controller.redo).not.toHaveBeenCalled();
    field.remove();
  });

  it("leaves history shortcuts to contenteditable text", () => {
    const controller = makeHistoryController();
    renderRoute(controller);
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    document.body.appendChild(editable);

    const notPrevented = fireEvent.keyDown(editable, { key: "z", metaKey: true });

    expect(notPrevented).toBe(true);
    expect(controller.undo).not.toHaveBeenCalled();
    expect(controller.redo).not.toHaveBeenCalled();
    editable.remove();
  });

  it("ignores non-history key combinations", () => {
    const controller = makeHistoryController();
    renderRoute(controller);

    fireEvent.keyDown(window, { key: "z" });
    fireEvent.keyDown(window, { key: "y", metaKey: true });
    fireEvent.keyDown(window, { key: "x", ctrlKey: true });

    expect(controller.undo).not.toHaveBeenCalled();
    expect(controller.redo).not.toHaveBeenCalled();
  });

  it("leaves unavailable history shortcuts to the browser", () => {
    const controller = makeController();
    renderRoute(controller);

    const undoNotPrevented = fireEvent.keyDown(window, { key: "z", ctrlKey: true });
    const redoNotPrevented = fireEvent.keyDown(window, { key: "z", ctrlKey: true, shiftKey: true });

    expect(undoNotPrevented).toBe(true);
    expect(redoNotPrevented).toBe(true);
    expect(controller.undo).not.toHaveBeenCalled();
    expect(controller.redo).not.toHaveBeenCalled();
  });

  it("does not mutate history while the editor is busy", () => {
    const controller = makeHistoryController({ isBusy: true });
    renderRoute(controller);

    const notPrevented = fireEvent.keyDown(window, { key: "z", metaKey: true });

    expect(notPrevented).toBe(true);
    expect(controller.undo).not.toHaveBeenCalled();
    expect(controller.redo).not.toHaveBeenCalled();
  });

  it("respects a shortcut already handled by another surface", () => {
    const controller = makeHistoryController();
    renderRoute(controller);
    const event = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    event.preventDefault();

    window.dispatchEvent(event);

    expect(controller.undo).not.toHaveBeenCalled();
    expect(controller.redo).not.toHaveBeenCalled();
  });
});
