import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { EditorController } from "../src/state/useEditorController";
import type { SessionSummary } from "../src/utils/storage";

type ToolHubStubProps = {
  status?: string;
  isBusy: boolean;
  recentSessions: SessionSummary[];
  onBlank: () => Promise<void>;
  onOpen: (file: File) => Promise<void>;
  onResume: (id: string) => Promise<void>;
  onClearSessions: () => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
};

// ---- navigate spy ----
const navigateSpy = vi.fn();
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateSpy,
}));

// ---- ToolHub stub exposes buttons that invoke each callback prop ----
vi.mock("../src/components/ToolHub", () => ({
  ToolHub: (props: ToolHubStubProps) => (
    <div data-testid="toolhub">
      <span data-testid="status">{props.status}</span>
      <span data-testid="busy">{String(props.isBusy)}</span>
      <span data-testid="recent-count">{props.recentSessions.length}</span>
      <button onClick={() => void props.onBlank()}>blank</button>
      <button onClick={() => void props.onOpen({ name: "x.pdf" } as File)}>open</button>
      <button onClick={() => void props.onResume("session-1")}>resume</button>
      <button onClick={() => void props.onClearSessions()}>clear</button>
      <button onClick={() => void props.onDeleteSession("session-1")}>delete</button>
    </div>
  ),
}));

import { EditorContext } from "../src/state/editorContext";
import { LandingRoute } from "../src/routes/LandingRoute";

function makeController(overrides: Partial<EditorController> = {}): EditorController {
  return {
    isBusy: false,
    status: "Ready",
    recentSessions: [],
    refreshRecentSessions: vi.fn(async () => undefined),
    openBlank: vi.fn(async () => true),
    openFile: vi.fn(async () => true),
    resumeSession: vi.fn(async () => true),
    clearSavedSessions: vi.fn(async () => undefined),
    removeSavedSession: vi.fn(async () => undefined),
    ...overrides,
  } as unknown as EditorController;
}

function renderLanding(controller: EditorController) {
  return render(
    <MemoryRouter>
      <EditorContext.Provider value={controller}>
        <LandingRoute />
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

describe("LandingRoute", () => {
  it("refreshes recent sessions on mount and forwards display props", () => {
    const controller = makeController({
      isBusy: true,
      status: "Hello",
      recentSessions: [{ id: "a" }, { id: "b" }] as Pick<SessionSummary, "id">[] as SessionSummary[],
    });
    renderLanding(controller);
    expect(controller.refreshRecentSessions).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("status").textContent).toBe("Hello");
    expect(screen.getByTestId("busy").textContent).toBe("true");
    expect(screen.getByTestId("recent-count").textContent).toBe("2");
  });

  it("navigates to the editor when openBlank succeeds", async () => {
    const controller = makeController({ openBlank: vi.fn(async () => true) });
    renderLanding(controller);
    fireEvent.click(screen.getByText("blank"));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith("/pdf-editor"));
  });

  it("does not navigate when openBlank fails", async () => {
    const controller = makeController({ openBlank: vi.fn(async () => false) });
    renderLanding(controller);
    fireEvent.click(screen.getByText("blank"));
    await Promise.resolve();
    await Promise.resolve();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("navigates when openFile succeeds and not when it fails", async () => {
    const ok = makeController({ openFile: vi.fn(async () => true) });
    renderLanding(ok);
    fireEvent.click(screen.getByText("open"));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith("/pdf-editor"));

    navigateSpy.mockReset();
    const bad = makeController({ openFile: vi.fn(async () => false) });
    renderLanding(bad);
    fireEvent.click(screen.getAllByText("open")[1]);
    await Promise.resolve();
    await Promise.resolve();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("navigates when resumeSession succeeds and not when it fails", async () => {
    const ok = makeController({ resumeSession: vi.fn(async () => true) });
    renderLanding(ok);
    fireEvent.click(screen.getByText("resume"));
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledWith("/pdf-editor"));

    navigateSpy.mockReset();
    const bad = makeController({ resumeSession: vi.fn(async () => false) });
    renderLanding(bad);
    fireEvent.click(screen.getAllByText("resume")[1]);
    await Promise.resolve();
    await Promise.resolve();
    expect(navigateSpy).not.toHaveBeenCalled();
  });

  it("wires clear and delete session callbacks through to the controller", () => {
    const controller = makeController();
    renderLanding(controller);
    fireEvent.click(screen.getByText("clear"));
    fireEvent.click(screen.getByText("delete"));
    expect(controller.clearSavedSessions).toHaveBeenCalledTimes(1);
    expect(controller.removeSavedSession).toHaveBeenCalledWith("session-1");
  });
});
