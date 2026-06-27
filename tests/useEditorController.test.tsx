import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const engine = vi.hoisted(() => ({
  loadDocument: vi.fn(),
  createBlankDocument: vi.fn(),
  extractTextAndFonts: vi.fn(),
  getPageSizes: vi.fn(),
  insertBlankPage: vi.fn(),
  deletePage: vi.fn(),
  rotatePage: vi.fn(),
  savePdf: vi.fn(),
}));
const exporter = vi.hoisted(() => ({ export: vi.fn() }));
const store = vi.hoisted(() => ({
  listSessions: vi.fn(),
  getLatestSession: vi.fn(),
  getSession: vi.fn(),
  saveSession: vi.fn(),
  deleteSession: vi.fn(),
  clearSessions: vi.fn(),
}));
const validation = vi.hoisted(() => ({ validatePdfFile: vi.fn() }));

vi.mock("../src/engine/pdfEngine", () => ({ pdfEngine: engine }));
vi.mock("../src/engine/exportPipeline", () => ({ exportPipeline: exporter }));
vi.mock("../src/utils/storage", () => store);
vi.mock("../src/utils/fileValidation", () => validation);

import { useEditorController } from "../src/state/useEditorController";
import type { EditOperation } from "../src/types/editor";

const LOADED = { name: "a.pdf", bytes: new Uint8Array([1, 2]), pageCount: 2, fingerprint: "fp" };
const SIZES = [
  { width: 612, height: 792 },
  { width: 612, height: 792 },
];

function pdfFile() {
  return new File([new Uint8Array([0x25, 0x50])], "a.pdf", { type: "application/pdf" });
}

function textOp(id = "t1"): EditOperation {
  return { id, type: "text", pageIndex: 0, rect: { x: 1, y: 1, width: 10, height: 10 }, text: "x", fontFamily: "Inter", fontSize: 12, color: "#000", align: "left", createdAt: 1 };
}

beforeEach(() => {
  vi.clearAllMocks();
  engine.loadDocument.mockResolvedValue(LOADED);
  engine.createBlankDocument.mockResolvedValue({ ...LOADED, name: "blank.pdf", pageCount: 1, fingerprint: "bfp" });
  engine.extractTextAndFonts.mockResolvedValue({ items: [{ str: "hi", pageIndex: 0, rect: { x: 0, y: 0, width: 1, height: 1 } }], fonts: {} });
  engine.getPageSizes.mockResolvedValue(SIZES);
  engine.insertBlankPage.mockResolvedValue(new Uint8Array([3]));
  engine.deletePage.mockResolvedValue(new Uint8Array([4]));
  engine.rotatePage.mockResolvedValue(new Uint8Array([5]));
  engine.savePdf.mockResolvedValue(new Uint8Array([6]));
  exporter.export.mockResolvedValue(undefined);
  store.listSessions.mockResolvedValue([]);
  store.getLatestSession.mockResolvedValue(undefined);
  store.getSession.mockResolvedValue(undefined);
  store.saveSession.mockResolvedValue(undefined);
  store.deleteSession.mockResolvedValue(undefined);
  store.clearSessions.mockResolvedValue(undefined);
  validation.validatePdfFile.mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
});

async function openController() {
  const hook = renderHook(() => useEditorController());
  await act(async () => {
    await hook.result.current.openFile(pdfFile());
  });
  return hook;
}

describe("useEditorController — opening documents", () => {
  it("rejects invalid PDFs before opening", async () => {
    validation.validatePdfFile.mockResolvedValueOnce({ ok: false, reason: "bad pdf" });
    const { result } = renderHook(() => useEditorController());
    let ok = true;
    await act(async () => {
      ok = await result.current.openFile(pdfFile());
    });
    expect(ok).toBe(false);
    expect(result.current.status).toBe("bad pdf");
    expect(engine.loadDocument).not.toHaveBeenCalled();
  });

  it("opens a valid PDF and populates document state", async () => {
    const { result } = await openController();
    expect(result.current.document?.name).toBe("a.pdf");
    expect(result.current.textItems).toHaveLength(1);
    expect(result.current.status).toContain("opened");
  });

  it("prompts for a password and retries when the PDF is encrypted", async () => {
    engine.loadDocument.mockRejectedValueOnce(new Error("Invalid password or password required"));
    engine.loadDocument.mockResolvedValueOnce(LOADED);
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("secret");
    const { result } = renderHook(() => useEditorController());
    let ok = false;
    await act(async () => {
      ok = await result.current.openFile(pdfFile());
    });
    expect(promptSpy).toHaveBeenCalled();
    expect(engine.loadDocument).toHaveBeenCalledTimes(2);
    expect(ok).toBe(true);
    promptSpy.mockRestore();
  });

  it("stops when the user cancels the password prompt", async () => {
    engine.loadDocument.mockRejectedValueOnce(new Error("password required"));
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue(null);
    const { result } = renderHook(() => useEditorController());
    let ok = true;
    await act(async () => {
      ok = await result.current.openFile(pdfFile());
    });
    expect(ok).toBe(false);
    expect(result.current.status).toContain("password");
    promptSpy.mockRestore();
  });

  it("reports a non-password failure", async () => {
    engine.loadDocument.mockRejectedValueOnce(new Error("corrupt"));
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.openFile(pdfFile());
    });
    expect(result.current.status).toBe("corrupt");
  });

  it("opens a blank document and surfaces blank-creation errors", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.openBlank();
    });
    expect(result.current.document?.name).toBe("blank.pdf");

    engine.createBlankDocument.mockRejectedValueOnce(new Error("nope"));
    await act(async () => {
      await result.current.openBlank();
    });
    expect(result.current.status).toBe("nope");
  });
});

describe("useEditorController — sessions", () => {
  it("autosaves the full session payload via the debounced effect", async () => {
    vi.useFakeTimers();
    const hook = renderHook(() => useEditorController());
    await act(async () => {
      await hook.result.current.openFile(pdfFile());
    });
    store.saveSession.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    expect(store.saveSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: "fp", name: "a.pdf", editState: expect.any(Object) }),
    );
  });

  it("restores the latest session when one exists", async () => {
    store.getLatestSession.mockResolvedValueOnce({
      id: "s1",
      name: "saved.pdf",
      bytes: new Uint8Array([9]),
      updatedAt: 1,
      pageIndex: 1,
      scale: 2,
      rotation: 90,
      editState: { operations: [textOp()], past: [], future: [] },
    });
    const { result } = renderHook(() => useEditorController());
    let ok = false;
    await act(async () => {
      ok = await result.current.restoreLatestSession();
    });
    expect(ok).toBe(true);
    expect(result.current.document?.name).toBe("saved.pdf");
    expect(result.current.scale).toBe(2);
  });

  it("reports when there is no latest session and recovers from errors", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      expect(await result.current.restoreLatestSession()).toBe(false);
    });
    store.getLatestSession.mockRejectedValueOnce(new Error("io"));
    await act(async () => {
      expect(await result.current.restoreLatestSession()).toBe(false);
    });
    expect(result.current.status).toContain("Drop a PDF");
  });

  it("resumes a session by id, using the legacy operations fallback", async () => {
    store.getSession.mockResolvedValueOnce({
      id: "s2",
      name: "legacy.pdf",
      bytes: new Uint8Array([7]),
      updatedAt: 1,
      operations: [textOp()],
    });
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      expect(await result.current.resumeSession("s2")).toBe(true);
    });
    expect(result.current.document?.name).toBe("legacy.pdf");
  });

  it("reports a missing session and resume errors", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      expect(await result.current.resumeSession("missing")).toBe(false);
    });
    expect(result.current.status).toContain("not found");

    store.getSession.mockRejectedValueOnce(new Error("read fail"));
    await act(async () => {
      expect(await result.current.resumeSession("x")).toBe(false);
    });
    expect(result.current.status).toBe("read fail");
  });

  it("removes and clears saved sessions, including error paths", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.removeSavedSession("s1");
    });
    expect(result.current.status).toContain("removed");
    store.deleteSession.mockRejectedValueOnce(new Error("del fail"));
    await act(async () => {
      await result.current.removeSavedSession("s1");
    });
    expect(result.current.status).toBe("del fail");

    await act(async () => {
      await result.current.clearSavedSessions();
    });
    expect(result.current.status).toContain("All local sessions");
    store.clearSessions.mockRejectedValueOnce(new Error("clear fail"));
    await act(async () => {
      await result.current.clearSavedSessions();
    });
    expect(result.current.status).toBe("clear fail");
  });

  it("falls back to an empty recent list when listing fails", async () => {
    store.listSessions.mockRejectedValueOnce(new Error("list fail"));
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.refreshRecentSessions();
    });
    expect(result.current.recentSessions).toEqual([]);
  });

  it("returns home, clearing the document", async () => {
    const { result } = await openController();
    await act(async () => {
      await result.current.returnHome();
    });
    expect(result.current.document).toBeNull();
    expect(result.current.status).toContain("Choose another PDF");
  });

  it("swallows autosave failures from the debounced effect and returnHome", async () => {
    vi.useFakeTimers();
    const hook = renderHook(() => useEditorController());
    await act(async () => {
      await hook.result.current.openFile(pdfFile());
    });
    store.saveSession.mockRejectedValue(new Error("disk full"));
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    // effect's .catch keeps the app alive; document stays loaded
    expect(hook.result.current.document?.name).toBe("a.pdf");
    await act(async () => {
      await hook.result.current.returnHome();
    });
    expect(hook.result.current.document).toBeNull();
    store.saveSession.mockResolvedValue(undefined);
  });
});

describe("useEditorController — editing and pages", () => {
  it("adds, updates, and removes operations", async () => {
    const { result } = await openController();
    act(() => {
      result.current.addOperation(textOp("t1"));
    });
    expect(result.current.editState.operations).toHaveLength(1);
    expect(result.current.status).toContain("text added");

    act(() => {
      result.current.updateOperation("t1", { color: "#fff" });
    });
    expect(result.current.selectedOperation).toMatchObject({ color: "#fff" });
    expect(result.current.visibleOperations).toHaveLength(1);

    act(() => {
      result.current.removeSelected();
    });
    expect(result.current.editState.operations).toHaveLength(0);
  });

  it("ignores removeSelected with no selection and removes by id", async () => {
    const { result } = await openController();
    act(() => {
      result.current.removeSelected(); // nothing selected -> no-op
    });
    act(() => {
      result.current.addOperation(textOp("t9"));
    });
    act(() => {
      result.current.removeOperation("t9");
    });
    expect(result.current.editState.operations).toHaveLength(0);
  });

  it("inserts, deletes, and rotates pages", async () => {
    const { result } = await openController();
    // ops on an in-range and an out-of-range page exercise the post-edit filter.
    act(() => {
      result.current.addOperation(textOp("keep"));
    });
    act(() => {
      result.current.addOperation({ ...textOp("drop"), pageIndex: 9 });
    });
    await act(async () => {
      await result.current.insertPageAfter();
    });
    expect(engine.insertBlankPage).toHaveBeenCalled();
    expect(result.current.status).toContain("inserted");

    await act(async () => {
      await result.current.deleteCurrentPage();
    });
    expect(engine.deletePage).toHaveBeenCalled();

    await act(async () => {
      await result.current.rotateCurrentPage();
    });
    expect(engine.rotatePage).toHaveBeenCalled();
  });

  it("surfaces page-operation errors", async () => {
    const { result } = await openController();
    engine.insertBlankPage.mockRejectedValueOnce(new Error("insert fail"));
    await act(async () => {
      await result.current.insertPageAfter();
    });
    expect(result.current.status).toBe("insert fail");

    engine.deletePage.mockRejectedValueOnce(new Error("delete fail"));
    await act(async () => {
      await result.current.deleteCurrentPage();
    });
    expect(result.current.status).toBe("delete fail");

    engine.rotatePage.mockRejectedValueOnce(new Error("rotate fail"));
    await act(async () => {
      await result.current.rotateCurrentPage();
    });
    expect(result.current.status).toBe("rotate fail");
  });

  it("derives the refreshed fingerprint from the name when the document has none", async () => {
    engine.loadDocument.mockResolvedValueOnce({ ...LOADED, fingerprint: undefined });
    const hook = renderHook(() => useEditorController());
    await act(async () => {
      await hook.result.current.openFile(pdfFile());
    });
    await act(async () => {
      await hook.result.current.rotateCurrentPage();
    });
    expect(engine.rotatePage).toHaveBeenCalled();
  });

  it("restores a history entry", async () => {
    const { result } = await openController();
    act(() => {
      result.current.restoreHistoryEntry("any");
    });
    expect(result.current.status).toContain("checkpoint");
  });

  it("exports the document and reports export errors", async () => {
    const { result } = await openController();
    await act(async () => {
      await result.current.runExport("pdf");
    });
    expect(exporter.export).toHaveBeenCalledWith("pdf", expect.objectContaining({ filename: "a.pdf" }));
    expect(result.current.status).toContain("PDF exported");

    exporter.export.mockRejectedValueOnce(new Error("export fail"));
    await act(async () => {
      await result.current.runExport("csv");
    });
    expect(result.current.status).toBe("export fail");
  });

  it("ignores document-dependent actions when no document is loaded", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.insertPageAfter();
      await result.current.deleteCurrentPage();
      await result.current.rotateCurrentPage();
      await result.current.runExport("pdf");
    });
    expect(engine.insertBlankPage).not.toHaveBeenCalled();
    expect(exporter.export).not.toHaveBeenCalled();
  });

  it("exposes setters for tool, scale, page, rotation, and status", async () => {
    const { result } = await openController();
    act(() => {
      result.current.setActiveTool("text");
      result.current.setScale(1.5);
      result.current.setPageIndex(1);
      result.current.setRotation(90);
      result.current.setStatus("custom");
    });
    expect(result.current.activeTool).toBe("text");
    expect(result.current.scale).toBe(1.5);
    expect(result.current.pageIndex).toBe(1);
    expect(result.current.rotation).toBe(90);
    expect(result.current.status).toBe("custom");
  });
});

describe("useEditorController — non-Error fallbacks", () => {
  it("uses generic messages when a thrown value is not an Error", async () => {
    const { result } = await openController();

    engine.insertBlankPage.mockRejectedValueOnce("boom");
    await act(async () => {
      await result.current.insertPageAfter();
    });
    expect(result.current.status).toBe("Could not insert page.");

    engine.deletePage.mockRejectedValueOnce("boom");
    await act(async () => {
      await result.current.deleteCurrentPage();
    });
    expect(result.current.status).toBe("Could not delete page.");

    engine.rotatePage.mockRejectedValueOnce("boom");
    await act(async () => {
      await result.current.rotateCurrentPage();
    });
    expect(result.current.status).toBe("Could not rotate page.");

    exporter.export.mockRejectedValueOnce("boom");
    await act(async () => {
      await result.current.runExport("txt");
    });
    expect(result.current.status).toBe("Could not export txt.");

    store.deleteSession.mockRejectedValueOnce("boom");
    await act(async () => {
      await result.current.removeSavedSession("s");
    });
    expect(result.current.status).toBe("Could not remove local session.");

    store.clearSessions.mockRejectedValueOnce("boom");
    await act(async () => {
      await result.current.clearSavedSessions();
    });
    expect(result.current.status).toBe("Could not clear local sessions.");

    store.getSession.mockRejectedValueOnce("boom");
    await act(async () => {
      await result.current.resumeSession("s");
    });
    expect(result.current.status).toBe("Could not restore saved session.");
  });

  it("uses generic messages for open failures that are not Errors", async () => {
    engine.loadDocument.mockRejectedValueOnce("boom");
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.openFile(pdfFile());
    });
    expect(result.current.status).toBe("Could not open PDF.");

    engine.createBlankDocument.mockRejectedValueOnce("boom");
    await act(async () => {
      await result.current.openBlank();
    });
    expect(result.current.status).toBe("Could not create blank PDF.");
  });

  it("restores a session that has neither editState nor operations and no view prefs", async () => {
    store.getSession.mockResolvedValueOnce({
      id: "bare",
      name: "bare.pdf",
      bytes: new Uint8Array([1]),
      updatedAt: 1,
    });
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      expect(await result.current.resumeSession("bare")).toBe(true);
    });
    expect(result.current.scale).toBe(1.18); // default
    expect(result.current.rotation).toBe(0);
  });

  it("falls back to the document name when there is no fingerprint", async () => {
    engine.loadDocument.mockResolvedValueOnce({ ...LOADED, fingerprint: undefined });
    vi.useFakeTimers();
    const hook = renderHook(() => useEditorController());
    await act(async () => {
      await hook.result.current.openFile(pdfFile());
    });
    store.saveSession.mockClear();
    await act(async () => {
      vi.advanceTimersByTime(700);
    });
    expect(store.saveSession).toHaveBeenCalledWith(expect.objectContaining({ id: "a.pdf" }));
  });
});

describe("useEditorController — autosave waitFor smoke", () => {
  it("eventually autosaves after edits settle", async () => {
    const { result } = await openController();
    act(() => {
      result.current.addOperation(textOp("late"));
    });
    await waitFor(() => expect(store.saveSession).toHaveBeenCalled());
  });
});
