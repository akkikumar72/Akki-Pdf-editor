import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { FindReplaceDialog, type SearchHighlight } from "../components/FindReplaceDialog";
import { Inspector } from "../components/Inspector";
import { PageRail } from "../components/PageRail";
import { PdfCanvas } from "../components/PdfCanvas";
import { StatusBar } from "../components/StatusBar";
import { ToolRibbon } from "../components/ToolRibbon";
import { createOperationsForTool } from "../editor/operationFactory";
import { useEditor } from "../state/editorContext";
import { TextPreviewProvider } from "../state/TextPreviewProvider";
import type { EditorTool } from "../types/editor";

export function EditorRoute() {
  const editor = useEditor();
  const navigate = useNavigate();
  const [restoreChecked, setRestoreChecked] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [searchHighlight, setSearchHighlight] = useState<SearchHighlight | null>(null);
  const [movingCount, setMovingCount] = useState(0);
  const { document, editState, isBusy, redo, restoreLatestSession, undo } = editor;

  const handleToolChange = (tool: EditorTool) => {
    if (tool === "mark-cross") {
      const size = editor.pageSizes[editor.pageIndex];
      if (!size) {
        editor.setStatus("Could not determine the page center for Cross.");
        return;
      }
      const [operation] = createOperationsForTool({
        activeTool: tool,
        viewportRect: {
          left: size.width * editor.scale / 2,
          top: size.height * editor.scale / 2,
          width: 1,
          height: 1,
        },
        pageHeight: size.height,
        pageWidth: size.width,
        pageIndex: editor.pageIndex,
        scale: editor.scale,
      });
      /* v8 ignore next -- mark-cross is a direct factory tool and always returns exactly one form-mark operation */
      if (operation) editor.addOperation(operation);
      editor.setActiveTool("select");
      editor.setStatus("Cross inserted at page center");
      return;
    }
    if (tool === "crop" && editor.rotation !== 0) {
      editor.setRotation(0);
      editor.setStatus("View reset to original orientation for accurate cropping.");
    }
    editor.setActiveTool(tool);
  };

  const closeProperties = useCallback(() => {
    setPropertiesOpen(false);
    window.requestAnimationFrame(() => editor.pageStageRef.current?.focus());
  }, [editor.pageStageRef]);

  useEffect(() => {
    if (editState.selectedIds.length === 0) setPropertiesOpen(false);
  }, [editState.selectedIds.length]);

  useEffect(() => {
    if (!propertiesOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Gesture handlers are registered later than this drawer listener. Wait
      // until propagation finishes so their preventDefault can claim Escape
      // before the drawer decides whether it should close.
      queueMicrotask(() => {
        if (!event.defaultPrevented) closeProperties();
      });
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [closeProperties, propertiesOpen]);

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
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !document || isBusy) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])"))
      )
        return;

      const key = event.key.toLowerCase();
      const isUndo = (event.metaKey || event.ctrlKey) && key === "z" && !event.shiftKey;
      const isRedo =
        ((event.metaKey || event.ctrlKey) && key === "z" && event.shiftKey) || (event.ctrlKey && key === "y");
      if (!isUndo && !isRedo) return;
      if ((isUndo && editState.past.length === 0) || (isRedo && editState.future.length === 0)) return;

      event.preventDefault();
      void (isUndo ? undo() : redo());
    };

    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [document, editState.future.length, editState.past.length, isBusy, redo, undo]);

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

  return (
    <AppShell
      wrapStage={(stage) => (
        <TextPreviewProvider selectedIds={editState.selectedIds}>{stage}</TextPreviewProvider>
      )}
      header={(
        <ToolRibbon
          activeTool={editor.activeTool}
          canRedo={editState.future.length > 0}
          canUndo={editState.past.length > 0}
          disabled={isBusy}
          documentName={document.name}
          historyEntries={editState.past}
          onExport={editor.runExport}
          onFindReplace={() => setFindReplaceOpen(true)}
          onHome={() => {
            navigate("/");
            void editor.returnHome();
          }}
          onRedo={() => void redo()}
          onRemove={editor.removeSelected}
          onDeletePage={editor.deleteCurrentPage}
          onInsertPage={editor.insertPageAfter}
          onRotate={() => {
            editor.setActiveTool("select");
            editor.setRotation((value) => (value + 90) % 360);
          }}
          onRotatePage={editor.rotateCurrentPage}
          onRestoreHistory={editor.restoreHistoryEntry}
          onToolChange={handleToolChange}
          onUndo={() => void undo()}
          onZoomIn={() => editor.setScale((value) => Math.min(2.4, value + 0.1))}
          onZoomOut={() => editor.setScale((value) => Math.max(0.45, value - 0.1))}
          scale={editor.scale}
          selectedIds={editState.selectedIds}
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
      inspector={propertiesOpen && !isBusy ? (
        <Inspector
          operation={editor.selectedOperation}
          operationCount={editState.operations.length}
          pageCount={document.pageCount}
          pageTextItems={editor.pageTextItems}
          selectedCount={editState.selectedIds.length}
          onDuplicateSelected={editor.duplicateSelected}
          onClose={closeProperties}
          onExport={editor.runExport}
          onRemoveSelected={editor.removeSelected}
          onUpdate={editor.updateOperation}
        />
      ) : undefined}
      status={(
        <StatusBar
          documentName={document.name}
          isBusy={isBusy}
          movingCount={movingCount}
          operationCount={editState.operations.length}
          pageIndex={editor.pageIndex}
          pageCount={document.pageCount}
          scale={editor.scale}
          selectedCount={editState.selectedIds.length}
          status={editor.status}
        />
      )}
    >
      <PdfCanvas
        activeTool={editor.activeTool}
        disabled={isBusy}
        document={document}
        documentFonts={editor.documentFonts}
        onDraggingChange={setMovingCount}
        onNotice={editor.setStatus}
        onOperationAdd={editor.addOperation}
        onOperationsAdd={editor.addOperations}
        onOperationRemove={editor.removeOperation}
        onOperationsRemove={editor.removeOperations}
        onOperationsReplace={editor.replaceOperations}
        onOperationSelect={(ids, additive) => editor.dispatch({ type: "select", ids, additive })}
        onOperationsTranslate={editor.translateOperations}
        onOperationUpdate={editor.updateOperation}
        onCropApply={editor.cropPages}
        propertiesOpen={propertiesOpen}
        onPropertiesOpen={() => setPropertiesOpen(true)}
        operations={editor.visibleOperations}
        pageIndex={editor.pageIndex}
        pageSize={editor.pageSizes[editor.pageIndex]}
        rotation={editor.rotation}
        scale={editor.scale}
        searchHighlight={searchHighlight}
        selectedIds={editState.selectedIds}
        stageRef={editor.pageStageRef}
        textItems={editor.pageTextItems}
      />
      {findReplaceOpen && !isBusy ? (
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
