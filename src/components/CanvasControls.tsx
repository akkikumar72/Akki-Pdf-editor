import {
  FileDown,
  FilePlus2,
  FileX2,
  History,
  Minus,
  Plus,
  Redo2,
  RotateCw,
  Trash2,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import type { EditHistoryEntry } from "../state/editModel";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

type CanvasControlsProps = {
  canRedo: boolean;
  canUndo: boolean;
  disabled: boolean;
  selectedId?: string;
  scale: number;
  historyEntries: EditHistoryEntry[];
  onUndo: () => void;
  onRedo: () => void;
  onRemove: () => void;
  onInsertPage: () => void;
  onDeletePage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotate: () => void;
  onRotatePage: () => void;
  onRestoreHistory: (id: string) => void;
};

export function CanvasControls(props: CanvasControlsProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const newestHistory = props.historyEntries[props.historyEntries.length - 1];
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | undefined>();
  const activeHistoryId = selectedHistoryId ?? newestHistory?.id;
  const orderedHistory = [...props.historyEntries].reverse();

  return (
    <div
      className="pointer-events-auto flex items-center gap-0.5 rounded-full border bg-card/95 px-1.5 py-1 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/80"
      role="toolbar"
      aria-label="Page and view controls"
    >
      <Button variant="ghost" size="icon-sm" disabled={!props.canUndo || props.disabled} title="Undo" onClick={props.onUndo}>
        <Undo2 aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!props.canUndo || props.disabled}
        title="Undo history"
        onClick={() => {
          setSelectedHistoryId(newestHistory?.id);
          setHistoryOpen(true);
        }}
      >
        <History aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon-sm" disabled={!props.canRedo || props.disabled} title="Redo" onClick={props.onRedo}>
        <Redo2 aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon-sm" disabled={!props.selectedId || props.disabled} title="Remove selected" onClick={props.onRemove}>
        <Trash2 aria-hidden="true" />
      </Button>

      <span className="mx-0.5 h-5 w-px bg-border" />

      <Button variant="ghost" size="icon-sm" disabled={props.disabled} title="Insert blank page after current page" onClick={props.onInsertPage}>
        <FilePlus2 aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon-sm" disabled={props.disabled} title="Delete current page" onClick={props.onDeletePage}>
        <FileX2 aria-hidden="true" />
      </Button>

      <span className="mx-0.5 h-5 w-px bg-border" />

      <Button variant="ghost" size="icon-sm" disabled={props.disabled} title="Zoom out" onClick={props.onZoomOut}>
        <Minus aria-hidden="true" />
      </Button>
      <span className="w-11 text-center text-muted-foreground text-xs tabular-nums">{Math.round(props.scale * 100)}%</span>
      <Button variant="ghost" size="icon-sm" disabled={props.disabled} title="Zoom in" onClick={props.onZoomIn}>
        <Plus aria-hidden="true" />
      </Button>

      <span className="mx-0.5 h-5 w-px bg-border" />

      <Button variant="ghost" size="icon-sm" disabled={props.disabled} title="Rotate view" onClick={props.onRotate}>
        <RotateCw aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon-sm" disabled={props.disabled} title="Rotate page permanently" onClick={props.onRotatePage}>
        <FileDown aria-hidden="true" />
      </Button>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
          <DialogHeader className="border-border border-b px-4 py-3 text-left">
            <DialogTitle className="text-base">Undo changes</DialogTitle>
            <DialogDescription>Restore the document to a saved edit checkpoint.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[min(26rem,60vh)] overflow-y-auto p-1">
            {orderedHistory.length ? orderedHistory.map((entry) => (
              <label
                key={entry.id}
                className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 hover:bg-accent"
              >
                <input
                  type="radio"
                  name="history-entry"
                  className="accent-primary"
                  checked={activeHistoryId === entry.id}
                  onChange={() => setSelectedHistoryId(entry.id)}
                />
                <span className="flex flex-1 flex-col">
                  <strong className="text-sm">{entry.label}</strong>
                  <small className="text-muted-foreground text-xs">{entry.operations.length} edits before this change</small>
                </span>
                <time
                  className="whitespace-nowrap font-mono text-muted-foreground text-xs"
                  dateTime={new Date(entry.timestamp).toISOString()}
                >
                  {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </time>
              </label>
            )) : (
              <p className="px-3 py-6 text-center text-muted-foreground text-sm">No edit history yet.</p>
            )}
          </div>
          <DialogFooter className="flex-row justify-end border-border border-t px-4 py-3">
            <Button variant="ghost" size="sm" onClick={() => setHistoryOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!activeHistoryId}
              onClick={() => {
                if (!activeHistoryId) return;
                props.onRestoreHistory(activeHistoryId);
                setHistoryOpen(false);
              }}
            >
              Revert selected
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
