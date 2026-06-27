import {
  Download,
  FileDown,
  FilePlus2,
  FileX2,
  History,
  Minus,
  Plus,
  Redo2,
  RotateCw,
  Save,
  Trash2,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { TOOL_GROUPS } from "../editor/toolRegistry";
import type { EditHistoryEntry } from "../state/editModel";
import type { EditorTool, ExportFormat } from "../types/editor";
import { AkkiPdfMark } from "./AkkiPdfLogo";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";

type ToolRibbonProps = {
  activeTool: EditorTool;
  canRedo: boolean;
  canUndo: boolean;
  disabled: boolean;
  historyEntries: EditHistoryEntry[];
  scale: number;
  selectedId?: string;
  onExport: (format: ExportFormat) => void;
  onDeletePage: () => void;
  onHome: () => void;
  onInsertPage: () => void;
  onRedo: () => void;
  onRemove: () => void;
  onRestoreHistory: (id: string) => void;
  onRotate: () => void;
  onRotatePage: () => void;
  onToolChange: (tool: EditorTool) => void;
  onUndo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

export function ToolRibbon(props: ToolRibbonProps) {
  const [openGroup, setOpenGroup] = useState<string>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const newestHistory = props.historyEntries[props.historyEntries.length - 1];
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | undefined>();
  const activeHistoryId = selectedHistoryId ?? newestHistory?.id;
  const orderedHistory = [...props.historyEntries].reverse();

  return (
    <div className="flex h-14 items-center gap-2 px-3">
      <button
        type="button"
        aria-label="AkkiPDF home"
        title="Back to home"
        disabled={props.disabled}
        onClick={props.onHome}
        className="flex shrink-0 cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 font-heading font-semibold text-foreground text-sm hover:bg-accent disabled:opacity-50"
      >
        <AkkiPdfMark className="size-5 text-primary" aria-hidden="true" />
        <span className="hidden sm:inline">AkkiPDF</span>
      </button>

      <div className="h-6 w-px shrink-0 bg-border" />

      {/* Tools */}
      <div
        className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto"
        role="toolbar"
        aria-label="Editing tools"
      >
        {TOOL_GROUPS.map((group) => {
          const activeToolInGroup = group.tools.some((tool) => tool.id === props.activeTool);
          const primary = group.tools.find((tool) => tool.id === props.activeTool) ?? group.tools[0];
          const Icon = primary.icon;
          return (
            <div className="relative" key={group.id}>
              <button
                type="button"
                aria-pressed={activeToolInGroup}
                disabled={props.disabled}
                title={primary.description}
                onClick={() => {
                  if (activeToolInGroup && group.primary !== "select") {
                    props.onToolChange("select");
                    setOpenGroup(undefined);
                    return;
                  }
                  if (group.tools.length === 1) {
                    props.onToolChange(group.primary);
                    setOpenGroup(undefined);
                    return;
                  }
                  props.onToolChange(group.primary);
                  setOpenGroup((value) => (value === group.id ? undefined : group.id));
                }}
                className={`flex cursor-pointer flex-col items-center gap-0.5 rounded-md px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50 [&_svg]:size-4 ${
                  activeToolInGroup
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon aria-hidden="true" />
                <span>{group.label}</span>
              </button>
              {group.tools.length > 1 && openGroup === group.id ? (
                <div
                  role="menu"
                  className="absolute top-full left-0 z-30 mt-1 flex min-w-44 flex-col gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
                >
                  {group.tools.map((tool) => {
                    const MenuIcon = tool.icon;
                    const itemActive = props.activeTool === tool.id;
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        role="menuitem"
                        aria-pressed={itemActive}
                        onClick={() => {
                          props.onToolChange(tool.id);
                          setOpenGroup(undefined);
                        }}
                        className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors [&_svg]:size-4 ${
                          itemActive ? "bg-primary/10 text-primary" : "hover:bg-accent"
                        }`}
                      >
                        <MenuIcon aria-hidden="true" />
                        <span>{tool.label}</span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="h-6 w-px shrink-0 bg-border" />

      {/* Utilities */}
      <div className="flex shrink-0 items-center gap-0.5" aria-label="History and page controls">
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
        <Button variant="ghost" size="icon-sm" disabled={props.disabled} title="Insert blank page after current page" onClick={props.onInsertPage}>
          <FilePlus2 aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={props.disabled} title="Delete current page" onClick={props.onDeletePage}>
          <FileX2 aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={props.disabled} title="Zoom out" onClick={props.onZoomOut}>
          <Minus aria-hidden="true" />
        </Button>
        <span className="w-11 text-center text-muted-foreground text-xs tabular-nums">{Math.round(props.scale * 100)}%</span>
        <Button variant="ghost" size="icon-sm" disabled={props.disabled} title="Zoom in" onClick={props.onZoomIn}>
          <Plus aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={props.disabled} title="Rotate view" onClick={props.onRotate}>
          <RotateCw aria-hidden="true" />
        </Button>
        <Button variant="ghost" size="icon-sm" disabled={props.disabled} title="Rotate page permanently" onClick={props.onRotatePage}>
          <FileDown aria-hidden="true" />
        </Button>
      </div>

      <div className="h-6 w-px shrink-0 bg-border" />

      {/* Export */}
      <div className="flex shrink-0 items-center gap-1.5" aria-label="Export">
        <Button disabled={props.disabled} onClick={() => props.onExport("pdf")}>
          <Save aria-hidden="true" />
          Apply
        </Button>
        <div className="relative flex items-center">
          <Download aria-hidden="true" className="pointer-events-none absolute left-2.5 size-4 text-muted-foreground" />
          <select
            aria-label="Export format"
            disabled={props.disabled}
            defaultValue=""
            onChange={(event) => {
              const value = event.currentTarget.value as ExportFormat | "";
              if (value) props.onExport(value);
              event.currentTarget.value = "";
            }}
            className="h-9 cursor-pointer appearance-none rounded-lg border bg-background py-1.5 pr-3 pl-8 text-sm shadow-xs/5 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:h-8"
          >
            <option value="" disabled>Export</option>
            <option value="pdf">Edited PDF</option>
            <option value="txt">Text</option>
            <option value="csv">CSV</option>
            <option value="xlsx">Excel</option>
          </select>
        </div>
      </div>

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
