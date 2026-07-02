import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { FindReplaceDialog, type SearchHighlight } from "../components/FindReplaceDialog";
import { Inspector } from "../components/Inspector";
import { PageRail } from "../components/PageRail";
import { PdfCanvas } from "../components/PdfCanvas";
import { StatusBar } from "../components/StatusBar";
import { ToolRibbon } from "../components/ToolRibbon";
import { useEditor } from "../state/editorContext";

export function EditorRoute() {
  const editor = useEditor();
  const navigate = useNavigate();
  const [restoreChecked, setRestoreChecked] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState<SearchHighlight | null>(null);
  const { document, isBusy, restoreLatestSession } = editor;

  const closeFindReplace = useCallback(() => {
    setFindReplaceOpen(false);
    setSearchHighlight(null);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "f") return;
      event.preventDefault();
      setFindReplaceOpen(true);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (document) return;
    if (restoreChecked) {
      navigate("/", { replace: true });
      return;
    }
    let cancelled = false;
    void (async () => {
      const restored = await restoreLatestSession();
      if (cancelled) return;
      setRestoreChecked(true);
      if (!restored) navigate("/", { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [document, restoreChecked, restoreLatestSession, navigate]);

  if (!document) {
    return (
      <div className="editor-loading" role="status" aria-live="polite">
        {isBusy ? "Restoring your document…" : "Loading editor…"}
      </div>
    );
  }

  const { editState } = editor;

  return (
    <AppShell
      header={(
        <ToolRibbon
          activeTool={editor.activeTool}
          canRedo={editState.future.length > 0}
          canUndo={editState.past.length > 0}
          disabled={isBusy}
          historyEntries={editState.past}
          onExport={editor.runExport}
          onFindReplace={() => setFindReplaceOpen(true)}
          onHome={() => {
            navigate("/");
            void editor.returnHome();
          }}
          onRedo={() => editor.dispatch({ type: "redo" })}
          onRemove={editor.removeSelected}
          onDeletePage={editor.deleteCurrentPage}
          onInsertPage={editor.insertPageAfter}
          onRotate={() => editor.setRotation((value) => (value + 90) % 360)}
          onRotatePage={editor.rotateCurrentPage}
          onRestoreHistory={editor.restoreHistoryEntry}
          onToolChange={editor.setActiveTool}
          onUndo={() => editor.dispatch({ type: "undo" })}
          onZoomIn={() => editor.setScale((value) => Math.min(2.4, value + 0.1))}
          onZoomOut={() => editor.setScale((value) => Math.max(0.45, value - 0.1))}
          scale={editor.scale}
          selectedId={editState.selectedId}
        />
      )}
      rail={(
        <PageRail
          activePage={editor.pageIndex}
          pageCount={document.pageCount}
          pdfBytes={document.bytes}
          onSelect={editor.setPageIndex}
        />
      )}
      inspector={(
        <Inspector
          operation={editor.selectedOperation}
          operationCount={editState.operations.length}
          pageTextItems={editor.pageTextItems}
          onExport={editor.runExport}
          onUpdate={editor.updateOperation}
        />
      )}
      status={(
        <StatusBar
          documentName={document.name}
          isBusy={isBusy}
          operationCount={editState.operations.length}
          pageIndex={editor.pageIndex}
          pageCount={document.pageCount}
          scale={editor.scale}
          status={editor.status}
        />
      )}
    >
      <PdfCanvas
        activeTool={editor.activeTool}
        document={document}
        documentFonts={editor.documentFonts}
        onNotice={editor.setStatus}
        onOperationAdd={editor.addOperation}
        onOperationsAdd={editor.addOperations}
        onOperationRemove={editor.removeOperation}
        onOperationSelect={(id) => editor.dispatch({ type: "select", id })}
        onOperationUpdate={editor.updateOperation}
        operations={editor.visibleOperations}
        pageIndex={editor.pageIndex}
        pageSize={editor.pageSizes[editor.pageIndex]}
        rotation={editor.rotation}
        scale={editor.scale}
        searchHighlight={searchHighlight}
        selectedId={editState.selectedId}
        stageRef={editor.pageStageRef}
        textItems={editor.pageTextItems}
      />
      {findReplaceOpen ? (
        <FindReplaceDialog
          textItems={editor.textItems}
          operations={editState.operations}
          pageSizes={editor.pageSizes}
          onAddOperations={editor.addOperations}
          onHighlight={setSearchHighlight}
          onPageChange={editor.setPageIndex}
          onClose={closeFindReplace}
        />
      ) : null}
    </AppShell>
  );
}
