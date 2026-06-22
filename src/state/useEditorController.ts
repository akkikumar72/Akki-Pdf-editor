import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  shiftOperationsForDeletedPage,
  shiftOperationsForDuplicatedPage,
  shiftOperationsForInsertedPage,
  shiftOperationsForMovedPage,
} from "../editor/pageOperations";
import { exportPipeline } from "../engine/exportPipeline";
import { pdfEngine } from "../engine/pdfEngine";
import { downloadBlob, safeBaseName } from "../utils/download";
import { editReducer, getSelectedOperation, initialEditState } from "./editModel";
import type { EditState } from "./editModel";
import type { DocumentFonts, EditOperation, EditorTool, ExportFormat, LoadedPdf, TextItem } from "../types/editor";
import { validatePdfFile } from "../utils/fileValidation";
import { clearSessions, deleteSession, getLatestSession, getSession, listSessions, saveSession } from "../utils/storage";
import type { SavedSession, SessionSummary } from "../utils/storage";

export function useEditorController() {
  const [document, setDocument] = useState<LoadedPdf | null>(null);
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [documentFonts, setDocumentFonts] = useState<DocumentFonts>({});
  const [pageSizes, setPageSizes] = useState<Array<{ width: number; height: number }>>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [scale, setScale] = useState(1.18);
  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [rotation, setRotation] = useState(0);
  const [status, setStatus] = useState("Drop a PDF to start. Files stay in this browser.");
  const [isBusy, setIsBusy] = useState(false);
  const [recentSessions, setRecentSessions] = useState<SessionSummary[]>([]);
  const [editState, dispatch] = useReducer(editReducer, initialEditState);
  const pageStageRef = useRef<HTMLDivElement>(null);

  const selectedOperation = useMemo(() => getSelectedOperation(editState), [editState]);
  const visibleOperations = useMemo(
    () => editState.operations.filter((operation) => operation.pageIndex === pageIndex),
    [editState.operations, pageIndex],
  );

  const loadPdfState = useCallback(async (
    loaded: LoadedPdf,
    savedEditState?: Partial<Pick<EditState, "operations" | "past" | "future">>,
  ) => {
    const [content, sizes] = await Promise.all([
      pdfEngine.extractTextAndFonts(loaded.bytes),
      pdfEngine.getPageSizes(loaded.bytes),
    ]);
    setDocument(loaded);
    setTextItems(content.items);
    setDocumentFonts(content.fonts);
    setPageSizes(sizes);
    dispatch({
      type: "reset",
      operations: savedEditState?.operations,
      past: savedEditState?.past,
      future: savedEditState?.future,
    });
    setPageIndex((value) => Math.min(value, Math.max(0, loaded.pageCount - 1)));
  }, []);

  const refreshRecentSessions = useCallback(async () => {
    try {
      setRecentSessions(await listSessions());
    } catch {
      setRecentSessions([]);
    }
  }, []);

  const loadSavedSession = useCallback(async (session: SavedSession, statusMessage?: string) => {
    const pageCount = (await pdfEngine.getPageSizes(session.bytes)).length;
    const loaded: LoadedPdf = {
      name: session.name,
      bytes: session.bytes,
      pageCount,
      fingerprint: session.id,
    };
    const savedEditState = session.editState ?? {
      operations: session.operations ?? [],
      past: [],
      future: [],
    };
    await loadPdfState(loaded, savedEditState);
    setPageIndex(Math.min(session.pageIndex ?? 0, Math.max(0, pageCount - 1)));
    setScale(session.scale ?? 1.18);
    setRotation(session.rotation ?? 0);
    setStatus(statusMessage ?? `${session.name} restored from this browser`);
  }, [loadPdfState]);

  const openFile = useCallback(async (file: File, password?: string): Promise<boolean> => {
    if (!password) {
      const validation = await validatePdfFile(file);
      if (!validation.ok) {
        setStatus(validation.reason);
        return false;
      }
    }
    setIsBusy(true);
    setStatus(`Opening ${file.name}...`);
    try {
      const loaded = await pdfEngine.loadDocument(file, password);
      await loadPdfState(loaded);
      setPageIndex(0);
      setStatus(`${loaded.name} opened · ${loaded.pageCount} pages · local session`);
      return true;
    } catch (error) {
      if (error instanceof Error && /password/i.test(error.message)) {
        const passwordValue = window.prompt("This PDF is password protected. Enter password:");
        if (passwordValue) {
          return openFile(file, passwordValue);
        }
      }
      setStatus(error instanceof Error ? error.message : "Could not open PDF.");
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [loadPdfState]);

  const openBlank = useCallback(async (): Promise<boolean> => {
    setIsBusy(true);
    setStatus("Creating blank PDF...");
    try {
      const loaded = await pdfEngine.createBlankDocument();
      await loadPdfState(loaded);
      setPageIndex(0);
      setStatus("Blank PDF created · local session");
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create blank PDF.");
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [loadPdfState]);

  const saveCurrentSession = useCallback(async (silent = false) => {
    if (!document) return;
    const sessionId = document.fingerprint ?? document.name;
    const savedAt = Date.now();
    await saveSession({
      id: sessionId,
      name: document.name,
      updatedAt: savedAt,
      bytes: document.bytes,
      pageIndex,
      scale,
      rotation,
      operations: editState.operations,
      editState: {
        operations: editState.operations,
        past: editState.past,
        future: editState.future,
      },
    });
    await refreshRecentSessions();
    if (!silent) {
      setStatus(`${document.name} saved locally · ${new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
    }
  }, [document, editState.future, editState.operations, editState.past, pageIndex, refreshRecentSessions, rotation, scale]);

  useEffect(() => {
    if (!document) return;
    const timeout = window.setTimeout(() => {
      saveCurrentSession(true).catch(() => undefined);
    }, 600);
    return () => window.clearTimeout(timeout);
  }, [document, editState.future, editState.operations, editState.past, pageIndex, rotation, saveCurrentSession, scale]);

  const restoreLatestSession = useCallback(async (): Promise<boolean> => {
    setIsBusy(true);
    try {
      const latest = await getLatestSession();
      await refreshRecentSessions();
      if (!latest) {
        setStatus("Drop a PDF to start. Files stay in this browser.");
        return false;
      }
      await loadSavedSession(latest, `${latest.name} restored from this browser`);
      return true;
    } catch {
      setStatus("Drop a PDF to start. Files stay in this browser.");
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [loadSavedSession, refreshRecentSessions]);

  const resumeSession = useCallback(async (id: string): Promise<boolean> => {
    setIsBusy(true);
    try {
      const session = await getSession(id);
      if (!session) {
        setStatus("Saved session was not found.");
        return false;
      }
      await loadSavedSession(session);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not restore saved session.");
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [loadSavedSession]);

  const removeSavedSession = useCallback(async (id: string) => {
    try {
      await deleteSession(id);
      await refreshRecentSessions();
      setStatus("Local session removed from this browser.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove local session.");
    }
  }, [refreshRecentSessions]);

  const clearSavedSessions = useCallback(async () => {
    try {
      await clearSessions();
      await refreshRecentSessions();
      setStatus("All local sessions removed from this browser.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not clear local sessions.");
    }
  }, [refreshRecentSessions]);

  const returnHome = useCallback(async () => {
    await saveCurrentSession(true).catch(() => undefined);
    setDocument(null);
    setTextItems([]);
    setDocumentFonts({});
    setPageSizes([]);
    setPageIndex(0);
    setRotation(0);
    setActiveTool("select");
    dispatch({ type: "reset" });
    await refreshRecentSessions();
    setStatus("Choose another PDF or resume a local session.");
  }, [refreshRecentSessions, saveCurrentSession]);

  const addOperation = useCallback((operation: EditOperation) => {
    dispatch({ type: "add", operation });
    setStatus(`${operation.type.replace("-", " ")} added`);
  }, []);

  const updateOperation = useCallback((id: string, patch: Partial<EditOperation>) => {
    dispatch({ type: "update", id, patch });
  }, []);

  const removeSelected = useCallback(() => {
    if (!editState.selectedId) return;
    dispatch({ type: "remove", id: editState.selectedId });
    setStatus("Selection removed");
  }, [editState.selectedId]);

  const removeOperation = useCallback((id: string) => {
    dispatch({ type: "remove", id });
    setStatus("Selection removed");
  }, []);

  const updateDocumentBytes = useCallback(async (
    bytes: Uint8Array,
    nextPageIndex = pageIndex,
    statusMessage = "Document updated",
    nextOperations = editState.operations,
  ) => {
    if (!document) return;
    const next: LoadedPdf = {
      ...document,
      bytes,
      pageCount: (await pdfEngine.getPageSizes(bytes)).length,
      fingerprint: `${document.fingerprint ?? document.name}-${Date.now()}`,
    };
    await loadPdfState(next, {
      operations: nextOperations.filter((operation) => operation.pageIndex < next.pageCount),
    });
    setPageIndex(Math.min(nextPageIndex, Math.max(0, next.pageCount - 1)));
    setStatus(statusMessage);
  }, [document, editState.operations, loadPdfState, pageIndex]);

  const rotateCurrentPage = useCallback(async () => {
    if (!document) return;
    setIsBusy(true);
    try {
      const bytes = await pdfEngine.rotatePage(document.bytes, pageIndex);
      await updateDocumentBytes(bytes, pageIndex, "Page rotated");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not rotate page.");
    } finally {
      setIsBusy(false);
    }
  }, [document, pageIndex, updateDocumentBytes]);

  const insertPageAt = useCallback(async (index: number) => {
    if (!document) return;
    setIsBusy(true);
    try {
      const bytes = await pdfEngine.insertBlankPage(document.bytes, index);
      await updateDocumentBytes(
        bytes,
        index + 1,
        "Blank page inserted",
        shiftOperationsForInsertedPage(editState.operations, index + 1),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not insert page.");
    } finally {
      setIsBusy(false);
    }
  }, [document, editState.operations, updateDocumentBytes]);

  const deletePageAt = useCallback(async (index: number) => {
    if (!document) return;
    setIsBusy(true);
    try {
      const bytes = await pdfEngine.deletePage(document.bytes, index);
      await updateDocumentBytes(
        bytes,
        Math.max(0, index - 1),
        "Page deleted",
        shiftOperationsForDeletedPage(editState.operations, index),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete page.");
    } finally {
      setIsBusy(false);
    }
  }, [document, editState.operations, updateDocumentBytes]);

  const duplicatePageAt = useCallback(async (index: number) => {
    if (!document) return;
    setIsBusy(true);
    try {
      const bytes = await pdfEngine.duplicatePage(document.bytes, index);
      await updateDocumentBytes(
        bytes,
        index + 1,
        "Page duplicated",
        shiftOperationsForDuplicatedPage(editState.operations, index),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not duplicate page.");
    } finally {
      setIsBusy(false);
    }
  }, [document, editState.operations, updateDocumentBytes]);

  const movePage = useCallback(async (from: number, to: number) => {
    if (!document) return;
    const pageCount = document.pageCount;
    const target = Math.max(0, Math.min(to, pageCount - 1));
    if (from === target) return;
    setIsBusy(true);
    try {
      const bytes = await pdfEngine.movePage(document.bytes, from, target);
      await updateDocumentBytes(
        bytes,
        target,
        "Page moved",
        shiftOperationsForMovedPage(editState.operations, from, target),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not move page.");
    } finally {
      setIsBusy(false);
    }
  }, [document, editState.operations, updateDocumentBytes]);

  const movePageUp = useCallback((index: number) => movePage(index, index - 1), [movePage]);
  const movePageDown = useCallback((index: number) => movePage(index, index + 1), [movePage]);

  const extractPages = useCallback(async (indices: number[]) => {
    if (!document) return;
    setIsBusy(true);
    setStatus("Extracting pages...");
    try {
      const sorted = [...new Set(indices)].sort((a, b) => a - b);
      const bytes = await pdfEngine.extractPages(document.bytes, sorted);
      const filename = `${safeBaseName(document.name)}-pages.pdf`;
      downloadBlob(new Blob([bytes.slice().buffer], { type: "application/pdf" }), filename);
      setStatus(`Extracted ${sorted.length} page${sorted.length === 1 ? "" : "s"} to ${filename}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not extract pages.");
    } finally {
      setIsBusy(false);
    }
  }, [document]);

  const mergePdfFile = useCallback(async (file: File, atIndex?: number) => {
    if (!document) return;
    const validation = await validatePdfFile(file);
    if (!validation.ok) {
      setStatus(validation.reason);
      return;
    }
    setIsBusy(true);
    setStatus(`Merging ${file.name}...`);
    try {
      const incoming = new Uint8Array(await file.arrayBuffer());
      const insertAt = atIndex ?? document.pageCount;
      const bytes = await pdfEngine.mergePdf(document.bytes, incoming, insertAt);
      const incomingCount = (await pdfEngine.getPageSizes(incoming)).length;
      await updateDocumentBytes(
        bytes,
        insertAt,
        `Merged ${incomingCount} page${incomingCount === 1 ? "" : "s"} from ${file.name}`,
        editState.operations.map((operation) =>
          operation.pageIndex >= insertAt
            ? { ...operation, pageIndex: operation.pageIndex + incomingCount }
            : operation,
        ),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not merge PDF.");
    } finally {
      setIsBusy(false);
    }
  }, [document, editState.operations, updateDocumentBytes]);

  const insertPageAfter = useCallback(() => insertPageAt(pageIndex), [insertPageAt, pageIndex]);
  const deleteCurrentPage = useCallback(() => deletePageAt(pageIndex), [deletePageAt, pageIndex]);

  const restoreHistoryEntry = useCallback((id: string) => {
    dispatch({ type: "restore-history", id });
    setStatus("Restored selected edit checkpoint");
  }, []);

  const runExport = useCallback(async (format: ExportFormat) => {
    if (!document) return;
    setIsBusy(true);
    setStatus(`Exporting ${format.toUpperCase()}...`);
    try {
      await exportPipeline.export(format, {
        filename: document.name,
        bytes: document.bytes,
        operations: editState.operations,
        textItems,
        fonts: documentFonts,
      });
      setStatus(`${format.toUpperCase()} exported`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Could not export ${format}.`);
    } finally {
      setIsBusy(false);
    }
  }, [document, documentFonts, editState.operations, textItems]);

  return {
    document,
    textItems,
    documentFonts,
    pageSizes,
    pageIndex,
    scale,
    activeTool,
    rotation,
    status,
    isBusy,
    recentSessions,
    editState,
    selectedOperation,
    visibleOperations,
    pageStageRef,
    dispatch,
    setPageIndex,
    setScale,
    setActiveTool,
    setRotation,
    setStatus,
    refreshRecentSessions,
    openFile,
    openBlank,
    restoreLatestSession,
    resumeSession,
    removeSavedSession,
    clearSavedSessions,
    returnHome,
    addOperation,
    updateOperation,
    removeSelected,
    removeOperation,
    insertPageAfter,
    deleteCurrentPage,
    insertPageAt,
    deletePageAt,
    duplicatePageAt,
    movePage,
    movePageUp,
    movePageDown,
    extractPages,
    mergePdfFile,
    rotateCurrentPage,
    restoreHistoryEntry,
    runExport,
  };
}

export type EditorController = ReturnType<typeof useEditorController>;
