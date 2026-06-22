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
  inspector: ReactNode;
  status: ReactNode;
  children: ReactNode;
};

type ToolRibbonStubProps = {
  canUndo: boolean;
  canRedo: boolean;
  disabled: boolean;
  activeTool: EditorTool;
  scale: number;
  onHome: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRemove: () => void;
  onDeletePage: () => void;
  onInsertPage: () => void;
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
};

type StatusBarStubProps = {
  documentName: string;
  isBusy: boolean;
};

type PdfCanvasStubProps = {
  activeTool: EditorTool;
  pageIndex: number;
  onNotice: (message: string) => void;
  onOperationAdd: (operation: Partial<EditOperation>) => void;
  onOperationRemove: (id: string) => void;
  onOperationSelect: (id: string) => void;
  onOperationUpdate: (id: string, patch: Partial<EditOperation>) => void;
};

const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateSpy,
}));

// ---- stub heavy children; each exposes its props through buttons/spans ----
vi.mock("../src/components/AppShell", () => ({
  AppShell: ({ header, rail, inspector, status, children }: AppShellStubProps) => (
    <div data-testid="app-shell">
      <div data-testid="header">{header}</div>
      <div data-testid="rail">{rail}</div>
      <div data-testid="inspector">{inspector}</div>
      <div data-testid="status">{status}</div>
      <div data-testid="children">{children}</div>
    </div>
  ),
}));

vi.mock("../src/components/ToolRibbon", () => ({
  ToolRibbon: (props: ToolRibbonStubProps) => (
    <div data-testid="tool-ribbon">
      <span data-testid="canUndo">{String(props.canUndo)}</span>
      <span data-testid="canRedo">{String(props.canRedo)}</span>
      <span data-testid="disabled">{String(props.disabled)}</span>
      <span data-testid="activeTool">{props.activeTool}</span>
      <span data-testid="scale">{props.scale}</span>
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
      <button onClick={() => props.onExport("pdf")}>export</button>
      <button onClick={props.onZoomIn}>zoom-in</button>
      <button onClick={props.onZoomOut}>zoom-out</button>
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
      <button onClick={() => props.onNotice("hi")}>canvas-notice</button>
      <button onClick={() => props.onOperationAdd({ id: "o" })}>canvas-add</button>
      <button onClick={() => props.onOperationRemove("o")}>canvas-remove</button>
      <button onClick={() => props.onOperationSelect("o")}>canvas-select</button>
      <button onClick={() => props.onOperationUpdate("o", { text: "y" })}>canvas-update</button>
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
    pageSizes: [{ width: 612, height: 792 }],
    selectedOperation: undefined,
    visibleOperations: [],
    pageStageRef: { current: null },
    editState: { past: [], future: [], operations: [], selectedId: undefined },
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
    removeOperation: vi.fn(),
    updateOperation: vi.fn(),
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
    expect(screen.getByTestId("page-count").textContent).toBe("3");
  });

  it("computes canUndo/canRedo from history length", () => {
    renderRoute(makeController({
      editState: {
        past: [{ id: "p" }] as Pick<EditHistoryEntry, "id">[] as EditHistoryEntry[],
        future: [{ id: "f" }] as Pick<EditHistoryEntry, "id">[] as EditHistoryEntry[],
        operations: [],
        selectedId: undefined,
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
    expect(controller.dispatch).toHaveBeenCalledWith({ type: "undo" });
    fireEvent.click(screen.getByText("redo"));
    expect(controller.dispatch).toHaveBeenCalledWith({ type: "redo" });

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

  it("applies the rotate, zoom-in and zoom-out updater functions", () => {
    const controller = makeController();
    renderRoute(controller);

    fireEvent.click(screen.getByText("rotate"));
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
    fireEvent.click(screen.getByText("canvas-select"));
    expect(controller.dispatch).toHaveBeenCalledWith({ type: "select", id: "o" });
    fireEvent.click(screen.getByText("canvas-update"));
    expect(controller.updateOperation).toHaveBeenCalledWith("o", { text: "y" });
  });

  it("filters text items to the active page for canvas and inspector", () => {
    const controller = makeController({
      pageIndex: 1,
      textItems: [
        { str: "a", pageIndex: 0, rect: { x: 0, y: 0, width: 1, height: 1 } },
        { str: "b", pageIndex: 1, rect: { x: 0, y: 0, width: 1, height: 1 } },
      ] satisfies TextItem[],
    });
    renderRoute(controller);
    expect(screen.getByTestId("page-text-count").textContent).toBe("1");
    expect(screen.getByTestId("canvas-page").textContent).toBe("1");
  });
});
