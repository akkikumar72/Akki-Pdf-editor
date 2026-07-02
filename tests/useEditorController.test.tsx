import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorController } from "../src/state/useEditorController";
import type { LoadedPdf, TextOperation } from "../src/types/editor";
import type { SavedSession } from "../src/utils/storage";

import { pdfEngine } from "../src/engine/pdfEngine";
import { exportPipeline } from "../src/engine/exportPipeline";
import { validatePdfFile } from "../src/utils/fileValidation";
import {
  clearSessions,
  deleteSession,
  getLatestSession,
  getSession,
  listSessions,
  saveSession,
} from "../src/utils/storage";

vi.mock("../src/engine/pdfEngine", () => ({
  pdfEngine: {
    loadDocument: vi.fn(),
    createBlankDocument: vi.fn(),
    getPageSizes: vi.fn(),
    extractTextAndFonts: vi.fn(),
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
  saveSession: vi.fn(),
  listSessions: vi.fn(),
  getLatestSession: vi.fn(),
  getSession: vi.fn(),
  deleteSession: vi.fn(),
  clearSessions: vi.fn(),
}));

vi.mock("../src/utils/fileValidation", () => ({
  validatePdfFile: vi.fn(),
}));

const mockedEngine = vi.mocked(pdfEngine, true);
const mockedExport = vi.mocked(exportPipeline, true);
const mockedValidate = vi.mocked(validatePdfFile);
const mockedSave = vi.mocked(saveSession);
const mockedList = vi.mocked(listSessions);
const mockedGetLatest = vi.mocked(getLatestSession);
const mockedGetSession = vi.mocked(getSession);
const mockedDelete = vi.mocked(deleteSession);
const mockedClear = vi.mocked(clearSessions);

const sizes = [{ width: 612, height: 792 }];

function makeLoaded(overrides: Partial<LoadedPdf> = {}): LoadedPdf {
  return {
    name: "doc.pdf",
    bytes: new Uint8Array([1, 2, 3]),
    pageCount: 1,
    fingerprint: "fp-1",
    ...overrides,
  };
}

function makeFile(name = "doc.pdf"): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], name, {
    type: "application/pdf",
  });
}

function textOp(overrides: Partial<TextOperation> = {}): TextOperation {
  return {
    id: "text_1",
    type: "text",
    pageIndex: 0,
    rect: { x: 1, y: 1, width: 10, height: 10 },
    text: "hi",
    fontFamily: "Inter",
    fontSize: 12,
    color: "#000000",
    align: "left",
    createdAt: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults; individual tests override.
  mockedEngine.getPageSizes.mockResolvedValue(sizes);
  mockedEngine.extractTextAndFonts.mockResolvedValue({ items: [], fonts: {}, links: [] });
  mockedEngine.loadDocument.mockResolvedValue(makeLoaded());
  mockedEngine.createBlankDocument.mockResolvedValue(makeLoaded({ name: "blank.pdf" }));
  mockedEngine.insertBlankPage.mockResolvedValue(new Uint8Array([9]));
  mockedEngine.deletePage.mockResolvedValue(new Uint8Array([9]));
  mockedEngine.rotatePage.mockResolvedValue(new Uint8Array([9]));
  mockedExport.export.mockResolvedValue(undefined);
  mockedValidate.mockResolvedValue({ ok: true });
  mockedSave.mockResolvedValue(undefined);
  mockedList.mockResolvedValue([]);
  mockedGetLatest.mockResolvedValue(undefined);
  mockedGetSession.mockResolvedValue(undefined);
  mockedDelete.mockResolvedValue(undefined);
  mockedClear.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function openDocument(result: { current: ReturnType<typeof useEditorController> }) {
  await act(async () => {
    await result.current.openFile(makeFile());
  });
}

describe("openFile", () => {
  it("opens a valid file successfully", async () => {
    const { result } = renderHook(() => useEditorController());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.openFile(makeFile());
    });
    expect(ok).toBe(true);
    expect(result.current.document?.name).toBe("doc.pdf");
    expect(result.current.status).toContain("opened");
  });

  it("returns false when validation fails", async () => {
    mockedValidate.mockResolvedValue({ ok: false, reason: "bad file" });
    const { result } = renderHook(() => useEditorController());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.openFile(makeFile());
    });
    expect(ok).toBe(false);
    expect(result.current.status).toBe("bad file");
    expect(mockedEngine.loadDocument).not.toHaveBeenCalled();
  });

  it("retries with a password when prompted and the PDF is encrypted", async () => {
    mockedEngine.loadDocument
      .mockRejectedValueOnce(new Error("Incorrect password"))
      .mockResolvedValueOnce(makeLoaded());
    const promptSpy = vi.spyOn(window, "prompt").mockReturnValue("secret");

    const { result } = renderHook(() => useEditorController());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.openFile(makeFile());
    });

    expect(promptSpy).toHaveBeenCalled();
    // second call uses the entered password (skips validation branch)
    expect(mockedEngine.loadDocument).toHaveBeenLastCalledWith(expect.any(File), "secret");
    expect(ok).toBe(true);
  });

  it("does not retry when no password is entered", async () => {
    mockedEngine.loadDocument.mockRejectedValue(new Error("password required"));
    vi.spyOn(window, "prompt").mockReturnValue(null);

    const { result } = renderHook(() => useEditorController());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.openFile(makeFile());
    });
    expect(ok).toBe(false);
    expect(result.current.status).toBe("password required");
  });

  it("reports a non-password error", async () => {
    mockedEngine.loadDocument.mockRejectedValue(new Error("boom"));
    const { result } = renderHook(() => useEditorController());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.openFile(makeFile());
    });
    expect(ok).toBe(false);
    expect(result.current.status).toBe("boom");
  });

  it("reports a generic message for non-Error throws", async () => {
    mockedEngine.loadDocument.mockRejectedValue("nope");
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.openFile(makeFile());
    });
    expect(result.current.status).toBe("Could not open PDF.");
  });
});

describe("openBlank", () => {
  it("creates a blank document", async () => {
    const { result } = renderHook(() => useEditorController());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.openBlank();
    });
    expect(ok).toBe(true);
    expect(result.current.status).toContain("Blank PDF created");
  });

  it("handles a creation error", async () => {
    mockedEngine.createBlankDocument.mockRejectedValue(new Error("nope"));
    const { result } = renderHook(() => useEditorController());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.openBlank();
    });
    expect(ok).toBe(false);
    expect(result.current.status).toBe("nope");
  });

  it("handles a non-Error creation failure", async () => {
    mockedEngine.createBlankDocument.mockRejectedValue("x");
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.openBlank();
    });
    expect(result.current.status).toBe("Could not create blank PDF.");
  });
});

describe("saveCurrentSession (via returnHome / autosave)", () => {
  it("does nothing without a document (returnHome from home)", async () => {
    const { result } = renderHook(() => useEditorController());
    // No document loaded: returnHome calls saveCurrentSession which early-returns.
    await act(async () => {
      await result.current.returnHome();
    });
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it("saves silently when a document exists (returnHome)", async () => {
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    mockedSave.mockClear();
    await act(async () => {
      await result.current.returnHome();
    });
    expect(mockedSave).toHaveBeenCalledTimes(1);
    // silent save: returnHome sets its own status afterwards
    expect(result.current.status).toContain("Choose another PDF");
  });

  it("uses document name as id when fingerprint is missing", async () => {
    vi.useFakeTimers();
    try {
      mockedEngine.loadDocument.mockResolvedValue(makeLoaded({ fingerprint: undefined }));
      const { result } = renderHook(() => useEditorController());
      await act(async () => {
        result.current.openFile(makeFile());
        await vi.runOnlyPendingTimersAsync();
      });
      mockedSave.mockClear();
      // autosave debounce flushes a silent save
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });
      expect(mockedSave).toHaveBeenCalledWith(expect.objectContaining({ id: "doc.pdf" }));
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("autosave effect", () => {
  it("debounces a save after the document is set", async () => {
    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => useEditorController());
      await act(async () => {
        result.current.openFile(makeFile());
        await vi.runOnlyPendingTimersAsync();
      });
      mockedSave.mockClear();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });
      expect(mockedSave).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("autosave / returnHome error swallowing", () => {
  it("swallows a rejected autosave save", async () => {
    vi.useFakeTimers();
    try {
      mockedSave.mockRejectedValue(new Error("save failed"));
      const { result } = renderHook(() => useEditorController());
      await act(async () => {
        result.current.openFile(makeFile());
        await vi.runOnlyPendingTimersAsync();
      });
      // The debounced autosave rejects; .catch(() => undefined) must swallow it.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });
      // Status should not have been clobbered by an unhandled rejection.
      expect(result.current.document).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("swallows a rejected save during returnHome", async () => {
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    mockedSave.mockRejectedValue(new Error("save failed"));
    await act(async () => {
      await result.current.returnHome();
    });
    expect(result.current.document).toBeNull();
    expect(result.current.status).toContain("Choose another PDF");
  });
});

describe("restoreLatestSession", () => {
  it("restores the latest session when present", async () => {
    const session: SavedSession = {
      id: "s1",
      name: "saved.pdf",
      updatedAt: 1,
      bytes: new Uint8Array([1]),
      pageIndex: 0,
      scale: 1.5,
      rotation: 90,
      editState: { operations: [], past: [], future: [] },
    };
    mockedGetLatest.mockResolvedValue(session);
    const { result } = renderHook(() => useEditorController());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.restoreLatestSession();
    });
    expect(ok).toBe(true);
    expect(result.current.document?.name).toBe("saved.pdf");
    expect(result.current.scale).toBe(1.5);
    expect(result.current.rotation).toBe(90);
  });

  it("uses session defaults when fields are absent", async () => {
    const session: SavedSession = {
      id: "s1",
      name: "saved.pdf",
      updatedAt: 1,
      bytes: new Uint8Array([1]),
      operations: [textOp()],
    };
    mockedGetLatest.mockResolvedValue(session);
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.restoreLatestSession();
    });
    expect(result.current.scale).toBe(1.18);
    expect(result.current.rotation).toBe(0);
  });

  it("returns false when no session exists", async () => {
    mockedGetLatest.mockResolvedValue(undefined);
    const { result } = renderHook(() => useEditorController());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.restoreLatestSession();
    });
    expect(ok).toBe(false);
    expect(result.current.status).toContain("Drop a PDF");
  });

  it("returns false when restoring throws", async () => {
    mockedGetLatest.mockRejectedValue(new Error("db error"));
    const { result } = renderHook(() => useEditorController());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.restoreLatestSession();
    });
    expect(ok).toBe(false);
    expect(result.current.status).toContain("Drop a PDF");
  });
});

describe("resumeSession", () => {
  it("resumes a found session", async () => {
    const session: SavedSession = {
      id: "s1",
      name: "resumed.pdf",
      updatedAt: 1,
      bytes: new Uint8Array([1]),
    };
    mockedGetSession.mockResolvedValue(session);
    const { result } = renderHook(() => useEditorController());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.resumeSession("s1");
    });
    expect(ok).toBe(true);
    expect(result.current.document?.name).toBe("resumed.pdf");
    expect(result.current.status).toContain("restored");
  });

  it("returns false when the session is not found", async () => {
    mockedGetSession.mockResolvedValue(undefined);
    const { result } = renderHook(() => useEditorController());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.resumeSession("missing");
    });
    expect(ok).toBe(false);
    expect(result.current.status).toBe("Saved session was not found.");
  });

  it("returns false when resume throws an Error", async () => {
    mockedGetSession.mockRejectedValue(new Error("kaboom"));
    const { result } = renderHook(() => useEditorController());
    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.resumeSession("s1");
    });
    expect(ok).toBe(false);
    expect(result.current.status).toBe("kaboom");
  });

  it("returns false with a fallback message for non-Error throws", async () => {
    mockedGetSession.mockRejectedValue("x");
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.resumeSession("s1");
    });
    expect(result.current.status).toBe("Could not restore saved session.");
  });
});

describe("removeSavedSession", () => {
  it("removes a session", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.removeSavedSession("s1");
    });
    expect(mockedDelete).toHaveBeenCalledWith("s1");
    expect(result.current.status).toContain("removed");
  });

  it("reports an error on failure", async () => {
    mockedDelete.mockRejectedValue(new Error("cannot delete"));
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.removeSavedSession("s1");
    });
    expect(result.current.status).toBe("cannot delete");
  });

  it("reports a fallback error for non-Error failure", async () => {
    mockedDelete.mockRejectedValue("x");
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.removeSavedSession("s1");
    });
    expect(result.current.status).toBe("Could not remove local session.");
  });
});

describe("clearSavedSessions", () => {
  it("clears all sessions", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.clearSavedSessions();
    });
    expect(mockedClear).toHaveBeenCalled();
    expect(result.current.status).toContain("All local sessions removed");
  });

  it("reports an error on failure", async () => {
    mockedClear.mockRejectedValue(new Error("cannot clear"));
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.clearSavedSessions();
    });
    expect(result.current.status).toBe("cannot clear");
  });

  it("reports a fallback error for non-Error failure", async () => {
    mockedClear.mockRejectedValue("x");
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.clearSavedSessions();
    });
    expect(result.current.status).toBe("Could not clear local sessions.");
  });
});

describe("pageTextItems", () => {
  it("filters textItems down to the active page", async () => {
    mockedEngine.extractTextAndFonts.mockResolvedValue({
      items: [
        { str: "a", pageIndex: 0, rect: { x: 0, y: 0, width: 1, height: 1 } },
        { str: "b", pageIndex: 1, rect: { x: 0, y: 0, width: 1, height: 1 } },
      ],
      fonts: {},
      links: [],
    });
    mockedEngine.loadDocument.mockResolvedValue(makeLoaded({ pageCount: 2 }));
    mockedEngine.getPageSizes.mockResolvedValue([sizes[0], sizes[0]]);
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    expect(result.current.pageTextItems).toEqual([
      { str: "a", pageIndex: 0, rect: { x: 0, y: 0, width: 1, height: 1 } },
    ]);
    act(() => {
      result.current.setPageIndex(1);
    });
    expect(result.current.pageTextItems).toEqual([
      { str: "b", pageIndex: 1, rect: { x: 0, y: 0, width: 1, height: 1 } },
    ]);
  });
});

describe("returnHome", () => {
  it("saves and resets to the home state", async () => {
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    await act(async () => {
      await result.current.returnHome();
    });
    expect(result.current.document).toBeNull();
    expect(result.current.textItems).toEqual([]);
    expect(result.current.pageIndex).toBe(0);
    expect(result.current.activeTool).toBe("select");
    expect(result.current.status).toContain("Choose another PDF");
  });
});

describe("operation actions", () => {
  it("addOperation dispatches and sets status", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      result.current.addOperation(textOp());
    });
    expect(result.current.editState.operations).toHaveLength(1);
    expect(result.current.status).toBe("text added");
  });

  it("addOperations batches operations into one undo entry and sets a count status", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      result.current.addOperations([textOp(), textOp({ id: "text_2" })]);
    });
    expect(result.current.editState.operations).toHaveLength(2);
    expect(result.current.editState.past).toHaveLength(1);
    expect(result.current.status).toBe("2 edits added");
  });

  it("addOperations with one operation uses the per-type status", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      result.current.addOperations([textOp()]);
    });
    expect(result.current.editState.operations).toHaveLength(1);
    expect(result.current.status).toBe("text added");
  });

  it("addOperations with an empty list is a no-op", async () => {
    const { result } = renderHook(() => useEditorController());
    const statusBefore = result.current.status;
    await act(async () => {
      result.current.addOperations([]);
    });
    expect(result.current.editState.operations).toHaveLength(0);
    expect(result.current.status).toBe(statusBefore);
  });

  it("updateOperation patches an operation", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      result.current.addOperation(textOp());
    });
    await act(async () => {
      result.current.updateOperation("text_1", { text: "changed" });
    });
    expect((result.current.editState.operations[0] as TextOperation).text).toBe("changed");
  });

  it("removeSelected removes when there is a selection", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      result.current.addOperation(textOp());
    });
    // add sets selectedId to the new op
    await act(async () => {
      result.current.removeSelected();
    });
    expect(result.current.editState.operations).toHaveLength(0);
    expect(result.current.status).toBe("Selection removed");
  });

  it("removeSelected does nothing without a selection", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      result.current.addOperation(textOp());
      result.current.dispatch({ type: "select", id: undefined });
    });
    const opsBefore = result.current.editState.operations.length;
    await act(async () => {
      result.current.removeSelected();
    });
    expect(result.current.editState.operations).toHaveLength(opsBefore);
  });

  it("removeOperation removes by id", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      result.current.addOperation(textOp());
    });
    await act(async () => {
      result.current.removeOperation("text_1");
    });
    expect(result.current.editState.operations).toHaveLength(0);
    expect(result.current.status).toBe("Selection removed");
  });

  it("restoreHistoryEntry dispatches and sets status", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      result.current.addOperation(textOp());
    });
    const checkpoint = result.current.editState.past[0];
    await act(async () => {
      result.current.restoreHistoryEntry(checkpoint.id);
    });
    expect(result.current.status).toContain("checkpoint");
  });
});

describe("page operations", () => {
  it("insertPageAfter no-ops without a document", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.insertPageAfter();
    });
    expect(mockedEngine.insertBlankPage).not.toHaveBeenCalled();
  });

  it("insertPageAfter inserts a page", async () => {
    mockedEngine.getPageSizes.mockResolvedValue([
      { width: 612, height: 792 },
      { width: 612, height: 792 },
    ]);
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    await act(async () => {
      await result.current.insertPageAfter();
    });
    expect(mockedEngine.insertBlankPage).toHaveBeenCalled();
    expect(result.current.status).toBe("Blank page inserted");
  });

  it("insertPageAfter reports an error", async () => {
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    mockedEngine.insertBlankPage.mockRejectedValue(new Error("insert failed"));
    await act(async () => {
      await result.current.insertPageAfter();
    });
    expect(result.current.status).toBe("insert failed");
  });

  it("insertPageAfter reports a fallback error for non-Error throws", async () => {
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    mockedEngine.insertBlankPage.mockRejectedValue("x");
    await act(async () => {
      await result.current.insertPageAfter();
    });
    expect(result.current.status).toBe("Could not insert page.");
  });

  it("deleteCurrentPage no-ops without a document", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.deleteCurrentPage();
    });
    expect(mockedEngine.deletePage).not.toHaveBeenCalled();
  });

  it("deleteCurrentPage deletes the current page", async () => {
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    await act(async () => {
      await result.current.deleteCurrentPage();
    });
    expect(mockedEngine.deletePage).toHaveBeenCalled();
    expect(result.current.status).toBe("Page deleted");
  });

  it("deleteCurrentPage reports an error", async () => {
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    mockedEngine.deletePage.mockRejectedValue(new Error("delete failed"));
    await act(async () => {
      await result.current.deleteCurrentPage();
    });
    expect(result.current.status).toBe("delete failed");
  });

  it("deleteCurrentPage reports a fallback error", async () => {
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    mockedEngine.deletePage.mockRejectedValue("x");
    await act(async () => {
      await result.current.deleteCurrentPage();
    });
    expect(result.current.status).toBe("Could not delete page.");
  });

  it("rotateCurrentPage no-ops without a document", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.rotateCurrentPage();
    });
    expect(mockedEngine.rotatePage).not.toHaveBeenCalled();
  });

  it("rotateCurrentPage rotates the page", async () => {
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    await act(async () => {
      await result.current.rotateCurrentPage();
    });
    expect(mockedEngine.rotatePage).toHaveBeenCalled();
    expect(result.current.status).toBe("Page rotated");
  });

  it("rotateCurrentPage reports an error", async () => {
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    mockedEngine.rotatePage.mockRejectedValue(new Error("rotate failed"));
    await act(async () => {
      await result.current.rotateCurrentPage();
    });
    expect(result.current.status).toBe("rotate failed");
  });

  it("rotateCurrentPage reports a fallback error", async () => {
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    mockedEngine.rotatePage.mockRejectedValue("x");
    await act(async () => {
      await result.current.rotateCurrentPage();
    });
    expect(result.current.status).toBe("Could not rotate page.");
  });

  it("updateDocumentBytes derives fingerprint from name when fingerprint is missing", async () => {
    mockedEngine.loadDocument.mockResolvedValue(makeLoaded({ fingerprint: undefined }));
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    await act(async () => {
      await result.current.rotateCurrentPage();
    });
    // The new document's fingerprint is `${name}-<ts>` (name fallback branch).
    expect(result.current.document?.fingerprint).toMatch(/^doc\.pdf-\d+$/);
  });

  it("updateDocumentBytes filters operations beyond the new page count", async () => {
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    // Add an operation on page 5 which won't survive a 1-page document.
    await act(async () => {
      result.current.addOperation(textOp({ id: "off", pageIndex: 5 }));
      result.current.addOperation(textOp({ id: "on", pageIndex: 0 }));
    });
    // rotateCurrentPage -> updateDocumentBytes with 1-page sizes
    await act(async () => {
      await result.current.rotateCurrentPage();
    });
    const ids = result.current.editState.operations.map((op) => op.id);
    expect(ids).toContain("on");
    expect(ids).not.toContain("off");
  });
});

describe("runExport", () => {
  it("no-ops without a document", async () => {
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.runExport("pdf");
    });
    expect(mockedExport.export).not.toHaveBeenCalled();
  });

  it("exports successfully", async () => {
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    await act(async () => {
      await result.current.runExport("pdf");
    });
    expect(mockedExport.export).toHaveBeenCalled();
    expect(result.current.status).toBe("PDF exported");
  });

  it("reports an export error", async () => {
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    mockedExport.export.mockRejectedValue(new Error("export failed"));
    await act(async () => {
      await result.current.runExport("txt");
    });
    expect(result.current.status).toBe("export failed");
  });

  it("reports a fallback error for non-Error export throws", async () => {
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    mockedExport.export.mockRejectedValue("x");
    await act(async () => {
      await result.current.runExport("csv");
    });
    expect(result.current.status).toBe("Could not export csv.");
  });
});

describe("imported PDF links", () => {
  const importedLink = {
    pageIndex: 0,
    rect: { x: 10, y: 20, width: 100, height: 30 },
    target: { kind: "url" as const, href: "https://imported.example/" },
    annotationRef: "13R",
  };

  it("seeds imported links as editable operations on a fresh open", async () => {
    mockedEngine.extractTextAndFonts.mockResolvedValue({
      items: [],
      fonts: {},
      links: [importedLink, { ...importedLink, annotationRef: undefined }],
    });
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    expect(result.current.editState.operations).toHaveLength(2);
    const op = result.current.editState.operations[0];
    expect(op.type).toBe("link");
    expect(op).toMatchObject({ imported: true, annotationRef: "13R", target: importedLink.target });
    // Baseline seed: importing must not create undo history.
    expect(result.current.editState.past).toHaveLength(0);
  });

  it("does not re-seed imported links when restoring a saved session", async () => {
    mockedEngine.extractTextAndFonts.mockResolvedValue({ items: [], fonts: {}, links: [importedLink] });
    mockedGetLatest.mockResolvedValue({
      id: "s1",
      name: "saved.pdf",
      updatedAt: 5,
      bytes: new Uint8Array([1]),
      editState: { operations: [textOp()], past: [], future: [] },
      operations: [textOp()],
    } as SavedSession);
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.restoreLatestSession();
    });
    expect(result.current.editState.operations).toHaveLength(1);
    expect(result.current.editState.operations[0].type).toBe("text");
  });

  it("forwards imported annotation ids to the export pipeline for suppression", async () => {
    mockedEngine.extractTextAndFonts.mockResolvedValue({
      items: [],
      fonts: {},
      links: [importedLink, { ...importedLink, annotationRef: undefined }],
    });
    const { result } = renderHook(() => useEditorController());
    await openDocument(result);
    await act(async () => {
      await result.current.runExport("pdf");
    });
    expect(mockedExport.export).toHaveBeenCalledWith(
      "pdf",
      expect.objectContaining({ suppressLinkAnnotationIds: ["13R"] }),
    );
  });
});

describe("refreshRecentSessions", () => {
  it("populates recent sessions", async () => {
    mockedList.mockResolvedValue([
      { id: "s1", name: "a.pdf", updatedAt: 1, operationCount: 0 },
    ]);
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.refreshRecentSessions();
    });
    await waitFor(() => expect(result.current.recentSessions).toHaveLength(1));
  });

  it("falls back to an empty list on error", async () => {
    mockedList.mockRejectedValue(new Error("list failed"));
    const { result } = renderHook(() => useEditorController());
    await act(async () => {
      await result.current.refreshRecentSessions();
    });
    expect(result.current.recentSessions).toEqual([]);
  });
});
