import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { CanvasControls } from "../components/CanvasControls";
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
  const { document, isBusy, restoreLatestSession } = editor;

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
          disabled={isBusy}
          onExport={editor.runExport}
          onHome={() => {
            navigate("/");
            void editor.returnHome();
          }}
          onToolChange={editor.setActiveTool}
        />
      )}
      canvasToolbar={(
        <CanvasControls
          canRedo={editState.future.length > 0}
          canUndo={editState.past.length > 0}
          disabled={isBusy}
          selectedId={editState.selectedId}
          scale={editor.scale}
          historyEntries={editState.past}
          onUndo={() => editor.dispatch({ type: "undo" })}
          onRedo={() => editor.dispatch({ type: "redo" })}
          onRemove={editor.removeSelected}
          onInsertPage={editor.insertPageAfter}
          onDeletePage={editor.deleteCurrentPage}
          onZoomIn={() => editor.setScale((value) => Math.min(2.4, value + 0.1))}
          onZoomOut={() => editor.setScale((value) => Math.max(0.45, value - 0.1))}
          onRotate={() => editor.setRotation((value) => (value + 90) % 360)}
          onRotatePage={editor.rotateCurrentPage}
          onRestoreHistory={editor.restoreHistoryEntry}
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
          pageTextItems={editor.textItems.filter((item) => item.pageIndex === editor.pageIndex)}
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
        onOperationRemove={editor.removeOperation}
        onOperationSelect={(id) => editor.dispatch({ type: "select", id })}
        onOperationUpdate={editor.updateOperation}
        operations={editor.visibleOperations}
        pageIndex={editor.pageIndex}
        pageSize={editor.pageSizes[editor.pageIndex]}
        rotation={editor.rotation}
        scale={editor.scale}
        selectedId={editState.selectedId}
        stageRef={editor.pageStageRef}
        textItems={editor.textItems.filter((item) => item.pageIndex === editor.pageIndex)}
      />
    </AppShell>
  );
}
