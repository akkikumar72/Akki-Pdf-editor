import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { importedLinkOperation } from "../editor/linkTarget";
import { shiftOperationsForDeletedPage, shiftOperationsForInsertedPage } from "../editor/pageOperations";
import { duplicateOperation } from "../editor/selectionModel";
import { exportPipeline } from "../engine/exportPipeline";
import { pdfEngine } from "../engine/pdfEngine";
import { editReducer, getSelectedOperation, getSelectedOperations, initialEditState } from "./editModel";
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
  const [importedLinkAnnotationIds, setImportedLinkAnnotationIds] = useState<string[]>([]);
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
  const selectedOperations = useMemo(() => getSelectedOperations(editState), [editState]);
  const visibleOperations = useMemo(
    () => editState.operations.filter((operation) => operation.pageIndex === pageIndex),
    [editState.operations, pageIndex],
  );
  // Stable identity across renders that don't touch textItems/pageIndex, so
  // consumers (PdfCanvas's groupEditableTextRuns memo, Inspector) don't re-derive
  // on every unrelated re-render (e.g. a drag/resize commit on another page).
  const pageTextItems = useMemo(
    () => textItems.filter((item) => item.pageIndex === pageIndex),
    [textItems, pageIndex],
  );

  const loadPdfState = useCallback(async (
    loaded: LoadedPdf,
    savedEditState?: Partial<Pick<EditState, "operations" | "past" | "future">>,
    // Callers that already parsed the document for its page sizes (session
    // restore, page insert/delete/rotate) pass them through so the same bytes
    // aren't parsed twice per load.
    precomputedSizes?: Array<{ width: number; height: number }>,
  ) => {
    const [content, sizes] = await Promise.all([
      pdfEngine.extractTextAndFonts(loaded.bytes),
      precomputedSizes ?? pdfEngine.getPageSizes(loaded.bytes),
    ]);
    setDocument(loaded);
    setTextItems(content.items);
    setDocumentFonts(content.fonts);
    setPageSizes(sizes);
    // The full imported-annotation id list (not just surviving ops) so a deleted
    // imported link still suppresses its original annotation at export.
    setImportedLinkAnnotationIds(
      content.links.map((link) => link.annotationRef).filter((ref): ref is string => typeof ref === "string"),
    );
    // Fresh opens seed the baseline with the document's own links (editable,
    // not undoable below the baseline). Restored sessions / page mutations
    // already carry them inside their saved operations.
    dispatch({
      type: "reset",
      operations: savedEditState ? savedEditState.operations : content.links.map(importedLinkOperation),
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
    const sizes = await pdfEngine.getPageSizes(session.bytes);
    const pageCount = sizes.length;
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
    await loadPdfState(loaded, savedEditState, sizes);
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
    /* v8 ignore next 3 -- saveCurrentSession is only invoked internally with silent=true (autosave + returnHome), so the visible-status branch is unreachable from the public API */
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
    setImportedLinkAnnotationIds([]);
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

  const addOperations = useCallback((operations: EditOperation[]) => {
    if (operations.length === 0) return;
    dispatch({ type: "add-many", operations });
    setStatus(
      operations.length === 1
        ? `${operations[0].type.replace("-", " ")} added`
        : `${operations.length} edits added`,
    );
  }, []);

  const updateOperation = useCallback((id: string, patch: Partial<EditOperation>) => {
    dispatch({ type: "update", id, patch });
  }, []);

  const removeSelected = useCallback(() => {
    if (editState.selectedIds.length === 0) return;
    dispatch({ type: "remove-many", ids: editState.selectedIds });
    setStatus(
      editState.selectedIds.length === 1
        ? "Selection removed"
        : `${editState.selectedIds.length} objects removed`,
    );
  }, [editState.selectedIds]);

  const removeOperation = useCallback((id: string) => {
    dispatch({ type: "remove", id });
    setStatus("Selection removed");
  }, []);

  const removeOperations = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    dispatch({ type: "remove-many", ids });
    setStatus(ids.length === 1 ? "Selection removed" : `${ids.length} objects removed`);
  }, []);

  const translateOperations = useCallback((ids: string[], dx: number, dy: number) => {
    dispatch({ type: "translate", ids, dx, dy });
  }, []);

  const duplicateSelected = useCallback(() => {
    const selected = getSelectedOperations(editState);
    if (selected.length === 0) return;
    const duplicates = selected.map(duplicateOperation);
    dispatch({ type: "add-many", operations: duplicates });
    // `add-many` selects only the last added op; a group duplicate must keep
    // the whole new group selected so it can be dragged/styled as a unit.
    if (duplicates.length > 1) {
      dispatch({ type: "select", ids: duplicates.map((operation) => operation.id) });
    }
    setStatus(selected.length === 1 ? "Duplicate added" : `${selected.length} duplicates added`);
  }, [editState]);

  const updateDocumentBytes = useCallback(async (
    bytes: Uint8Array,
    nextPageIndex = pageIndex,
    statusMessage = "Document updated",
    nextOperations = editState.operations,
  ) => {
    /* v8 ignore next -- all callers (insert/delete/rotate page) already early-return when document is null, so this guard never observes a null document */
    if (!document) return;
    const sizes = await pdfEngine.getPageSizes(bytes);
    const next: LoadedPdf = {
      ...document,
      bytes,
      pageCount: sizes.length,
      // Keep the session identity stable across in-place page mutations —
      // re-minting per mutation made every autosave write a brand-new
      // IndexedDB row, orphaning the previous one. Mint only when the
      // document never had a fingerprint.
      fingerprint: document.fingerprint ?? `${document.name}-${Date.now()}`,
    };
    // Undo/redo history survives the reload; a page mutation is an edit, not
    // a fresh document open.
    await loadPdfState(next, {
      operations: nextOperations.filter((operation) => operation.pageIndex < next.pageCount),
      past: editState.past,
      future: editState.future,
    }, sizes);
    setPageIndex(Math.min(nextPageIndex, Math.max(0, next.pageCount - 1)));
    setStatus(statusMessage);
  }, [document, editState.operations, editState.past, editState.future, loadPdfState, pageIndex]);

  const insertPageAfter = useCallback(async () => {
    if (!document) return;
    setIsBusy(true);
    try {
      const bytes = await pdfEngine.insertBlankPage(document.bytes, pageIndex);
      await updateDocumentBytes(
        bytes,
        pageIndex + 1,
        "Blank page inserted",
        shiftOperationsForInsertedPage(editState.operations, pageIndex + 1),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not insert page.");
    } finally {
      setIsBusy(false);
    }
  }, [document, editState.operations, pageIndex, updateDocumentBytes]);

  const deleteCurrentPage = useCallback(async () => {
    if (!document) return;
    setIsBusy(true);
    try {
      const bytes = await pdfEngine.deletePage(document.bytes, pageIndex);
      await updateDocumentBytes(
        bytes,
        Math.max(0, pageIndex - 1),
        "Page deleted",
        shiftOperationsForDeletedPage(editState.operations, pageIndex),
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete page.");
    } finally {
      setIsBusy(false);
    }
  }, [document, editState.operations, pageIndex, updateDocumentBytes]);

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

  const restoreHistoryEntry = useCallback((id: string) => {
    dispatch({ type: "restore-history", id });
    setStatus("Restored selected edit checkpoint");
  }, []);

  const runExport = useCallback(async (format: ExportFormat) => {
    if (!document) return;
    setIsBusy(true);
    setStatus(`Exporting ${format.toUpperCase()}...`);
    try {
      const result = await exportPipeline.export(format, {
        filename: document.name,
        bytes: document.bytes,
        operations: editState.operations,
        textItems,
        fonts: documentFonts,
        suppressLinkAnnotationIds: importedLinkAnnotationIds,
      });
      const skipped = result.skippedOperations.length;
      setStatus(
        skipped > 0
          ? `${format.toUpperCase()} exported · ${skipped} ${skipped === 1 ? "edit" : "edits"} skipped (characters the font could not encode)`
          : `${format.toUpperCase()} exported`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Could not export ${format}.`);
    } finally {
      setIsBusy(false);
    }
  }, [document, documentFonts, editState.operations, importedLinkAnnotationIds, textItems]);

  return {
    document,
    textItems,
    pageTextItems,
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
    selectedOperations,
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
    addOperations,
    updateOperation,
    removeSelected,
    removeOperation,
    removeOperations,
    translateOperations,
    duplicateSelected,
    insertPageAfter,
    deleteCurrentPage,
    rotateCurrentPage,
    restoreHistoryEntry,
    runExport,
  };
}

export type EditorController = ReturnType<typeof useEditorController>;
