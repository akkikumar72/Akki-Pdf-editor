import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { Inspector } from "../components/Inspector";
import { PageRail } from "../components/PageRail";
import { PdfCanvas } from "../components/PdfCanvas";
import { StatusBar } from "../components/StatusBar";
import { ToolRibbon } from "../components/ToolRibbon";
import { useEditor } from "../state/editorContext";
import { pdfRectToViewport } from "../utils/coordinates";
import type { PdfRect } from "../types/editor";

export function EditorRoute() {
  const editor = useEditor();
  const navigate = useNavigate();
  const [restoreChecked, setRestoreChecked] = useState(false);
  const { document, isBusy, restoreLatestSession } = editor;
  const { setPageIndex, pageStageRef, pageSizes, scale } = editor;

  const locateMatch = useCallback(
    (matchPage: number, rect: PdfRect) => {
      setPageIndex(matchPage);
      // The stage re-renders for the new page on the next frame; wait for it before
      // computing the on-screen position of the matched rect and scrolling to it.
      window.requestAnimationFrame(() => {
        const stage = pageStageRef.current;
        const pageHeight = pageSizes[matchPage]?.height;
        if (!stage || pageHeight === undefined) return;
        const viewportRect = pdfRectToViewport(rect, pageHeight, scale);
        const scroller = stage.closest(".document-scroll");
        if (!(scroller instanceof HTMLElement)) return;
        const targetTop = stage.offsetTop + viewportRect.top - scroller.clientHeight / 2 + viewportRect.height / 2;
        scroller.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
      });
    },
    [pageSizes, pageStageRef, scale, setPageIndex],
  );

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
          onFindReplace={() => {
            const panel = window.document.getElementById("find-replace-panel");
            panel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            window.requestAnimationFrame(() => {
              const input = window.document.getElementById("find-replace-query");
              if (input instanceof HTMLInputElement) input.focus();
            });
          }}
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
          pageTextItems={editor.textItems.filter((item) => item.pageIndex === editor.pageIndex)}
          allTextItems={editor.textItems}
          pageHeights={editor.pageSizes.map((size) => size.height)}
          onExport={editor.runExport}
          onUpdate={editor.updateOperation}
          onAddOperation={editor.addOperation}
          onLocateMatch={locateMatch}
          onNotice={editor.setStatus}
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
