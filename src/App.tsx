import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { pdfjs } from "react-pdf";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { AppShell } from "./components/AppShell";
import { Inspector } from "./components/Inspector";
import { PageRail } from "./components/PageRail";
import { PdfCanvas } from "./components/PdfCanvas";
import { StatusBar } from "./components/StatusBar";
import { ToolRibbon } from "./components/ToolRibbon";
import { ToolHub } from "./components/ToolHub";
import { shiftOperationsForDeletedPage, shiftOperationsForInsertedPage } from "./editor/pageOperations";
import { exportPipeline } from "./engine/exportPipeline";
import { pdfEngine } from "./engine/pdfEngine";
import { editReducer, getSelectedOperation, initialEditState } from "./state/editModel";
import type { EditState } from "./state/editModel";
import type { EditOperation, EditorTool, ExportFormat, LoadedPdf, TextItem } from "./types/editor";
import { clearSessions, deleteSession, getLatestSession, getSession, listSessions, saveSession } from "./utils/storage";
import type { SavedSession, SessionSummary } from "./utils/storage";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

export function App() {
  const [document, setDocument] = useState<LoadedPdf | null>(null);
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [pageSizes, setPageSizes] = useState<Array<{ width: number; height: number }>>([]);
  const [pageIndex, setPageIndex] = useState(0);
  const [scale, setScale] = useState(1.18);
  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [rotation, setRotation] = useState(0);
  const [status, setStatus] = useState("Drop a PDF to start. Files stay in this browser.");
  const [isBusy, setIsBusy] = useState(false);
  const [recentSessions, setRecentSessions] = useState<SessionSummary[]>([]);
  const [didAttemptRestore, setDidAttemptRestore] = useState(false);
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
    const [items, sizes] = await Promise.all([
      pdfEngine.getTextContent(loaded.bytes),
      pdfEngine.getPageSizes(loaded.bytes),
    ]);
    setDocument(loaded);
    setTextItems(items);
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

  const openFile = useCallback(async (file: File, password?: string) => {
    setIsBusy(true);
    setStatus(`Opening ${file.name}...`);
    try {
      const loaded = await pdfEngine.loadDocument(file, password);
      await loadPdfState(loaded);
      setPageIndex(0);
      setStatus(`${loaded.name} opened · ${loaded.pageCount} pages · local session`);
    } catch (error) {
      if (error instanceof Error && /password/i.test(error.message)) {
        const passwordValue = window.prompt("This PDF is password protected. Enter password:");
        if (passwordValue) {
          await openFile(file, passwordValue);
          return;
        }
      }
      setStatus(error instanceof Error ? error.message : "Could not open PDF.");
    } finally {
      setIsBusy(false);
    }
  }, [loadPdfState]);

  const openBlank = useCallback(async () => {
    setIsBusy(true);
    setStatus("Creating blank PDF...");
    try {
      const loaded = await pdfEngine.createBlankDocument();
      await loadPdfState(loaded);
      setPageIndex(0);
      setStatus("Blank PDF created · local session");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create blank PDF.");
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

  useEffect(() => {
    let cancelled = false;
    async function restoreLatestSession() {
      try {
        const latest = await getLatestSession();
        if (cancelled) return;
        await refreshRecentSessions();
        if (latest) {
          setIsBusy(true);
          await loadSavedSession(latest, `${latest.name} restored from this browser`);
        }
      } catch {
        if (!cancelled) setStatus("Drop a PDF to start. Files stay in this browser.");
      } finally {
        if (!cancelled) {
          setIsBusy(false);
          setDidAttemptRestore(true);
        }
      }
    }
    if (!didAttemptRestore) void restoreLatestSession();
    return () => {
      cancelled = true;
    };
  }, [didAttemptRestore, loadSavedSession, refreshRecentSessions]);

  const resumeSession = useCallback(async (id: string) => {
    setIsBusy(true);
    try {
      const session = await getSession(id);
      if (!session) {
        setStatus("Saved session was not found.");
        return;
      }
      await loadSavedSession(session);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not restore saved session.");
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
      await exportPipeline.export(format, {
        filename: document.name,
        bytes: document.bytes,
        operations: editState.operations,
        textItems,
        pageStage: pageStageRef.current,
      });
      setStatus(`${format.toUpperCase()} exported`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `Could not export ${format}.`);
    } finally {
      setIsBusy(false);
    }
  }, [document, editState.operations, textItems]);

  const hasDocument = Boolean(document);

  if (!hasDocument) {
    return (
      <ToolHub
        isBusy={isBusy}
        recentSessions={recentSessions}
        onBlank={openBlank}
        onClearSessions={clearSavedSessions}
        onDeleteSession={removeSavedSession}
        onOpen={openFile}
        onResume={resumeSession}
      />
    );
  }

  return (
    <AppShell
      header={(
        <ToolRibbon
          activeTool={activeTool}
          canRedo={editState.future.length > 0}
          canUndo={editState.past.length > 0}
          disabled={!hasDocument || isBusy}
          historyEntries={editState.past}
          onExport={runExport}
          onHome={returnHome}
          onRedo={() => dispatch({ type: "redo" })}
          onRemove={removeSelected}
          onDeletePage={deleteCurrentPage}
          onInsertPage={insertPageAfter}
          onRotate={() => setRotation((value) => (value + 90) % 360)}
          onRotatePage={rotateCurrentPage}
          onRestoreHistory={restoreHistoryEntry}
          onSaveLocal={() => void saveCurrentSession(false)}
          onToolChange={setActiveTool}
          onUndo={() => dispatch({ type: "undo" })}
          onZoomIn={() => setScale((value) => Math.min(2.4, value + 0.1))}
          onZoomOut={() => setScale((value) => Math.max(0.45, value - 0.1))}
          scale={scale}
          selectedId={editState.selectedId}
        />
      )}
      rail={document ? (
        <PageRail
          activePage={pageIndex}
          pageCount={document.pageCount}
          pdfBytes={document.bytes}
          onSelect={setPageIndex}
        />
      ) : null}
      inspector={document ? (
        <Inspector
          operation={selectedOperation}
          operationCount={editState.operations.length}
          pageTextItems={textItems.filter((item) => item.pageIndex === pageIndex)}
          onExport={runExport}
          onUpdate={updateOperation}
        />
      ) : null}
      status={(
        <StatusBar
          documentName={document?.name}
          isBusy={isBusy}
          operationCount={editState.operations.length}
          pageIndex={pageIndex}
          pageCount={document?.pageCount ?? 0}
          scale={scale}
          status={status}
        />
      )}
    >
      {document ? (
        <PdfCanvas
          activeTool={activeTool}
          document={document}
          onOperationAdd={addOperation}
          onOperationRemove={removeOperation}
          onOperationSelect={(id) => dispatch({ type: "select", id })}
          onOperationUpdate={updateOperation}
          operations={visibleOperations}
          pageIndex={pageIndex}
          pageSize={pageSizes[pageIndex]}
          rotation={rotation}
          scale={scale}
          selectedId={editState.selectedId}
          stageRef={pageStageRef}
          textItems={textItems.filter((item) => item.pageIndex === pageIndex)}
        />
      ) : null}
    </AppShell>
  );
}
