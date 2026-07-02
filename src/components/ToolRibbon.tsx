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
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { useState } from "react";
import { TOOL_GROUPS } from "../editor/toolRegistry";
import type { EditHistoryEntry } from "../state/editModel";
import type { EditorTool, ExportFormat } from "../types/editor";
import { AkkiPdfLogo } from "./AkkiPdfLogo";
import { Button } from "./ui/button";

type ToolRibbonProps = {
  activeTool: EditorTool;
  canRedo: boolean;
  canUndo: boolean;
  disabled: boolean;
  historyEntries: EditHistoryEntry[];
  scale: number;
  selectedIds: string[];
  onExport: (format: ExportFormat) => void;
  onDeletePage: () => void;
  onFindReplace: () => void;
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
    <div className="tool-ribbon">
      <AkkiPdfLogo
        className="tool-ribbon__brand"
        aria-label="AkkiPDF home"
        disabled={props.disabled}
        title="Back to home"
        onClick={props.onHome}
      />

      <div className="tool-group tool-group--tools" role="toolbar" aria-label="Editing tools">
        {TOOL_GROUPS.map((group) => {
          const activeToolInGroup = group.tools.some((tool) => tool.id === props.activeTool);
          const primary = group.tools.find((tool) => tool.id === props.activeTool) ?? group.tools[0];
          const Icon = primary.icon;
          return (
            <div className="tool-menu" key={group.id}>
              <button
                className="tool-button"
                aria-pressed={activeToolInGroup}
                disabled={props.disabled}
                title={primary.description}
                onClick={() => {
                  // Clicking the already-active tool toggles it back to the neutral Select tool.
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
                  setOpenGroup((value) => value === group.id ? undefined : group.id);
                }}
              >
                <Icon aria-hidden="true" />
                <span>{group.label}</span>
              </button>
              {group.tools.length > 1 && openGroup === group.id ? (
                <div className="tool-menu__popover" role="menu">
                  {group.tools.map((tool) => {
                    const MenuIcon = tool.icon;
                    return (
                      <button
                        key={tool.id}
                        role="menuitem"
                        className="tool-menu__item"
                        aria-pressed={props.activeTool === tool.id}
                        onClick={() => {
                          props.onToolChange(tool.id);
                          setOpenGroup(undefined);
                        }}
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

      <div className="tool-group tool-group--compact tool-group--utility" aria-label="History and page controls">
        <button className="icon-button" disabled={!props.canUndo || props.disabled} title="Undo" onClick={props.onUndo}>
          <Undo2 aria-hidden="true" />
        </button>
        <button
          className="icon-button"
          disabled={!props.canUndo || props.disabled}
          title="Undo history"
          onClick={() => {
            setSelectedHistoryId(newestHistory?.id);
            setHistoryOpen(true);
          }}
        >
          <History aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={!props.canRedo || props.disabled} title="Redo" onClick={props.onRedo}>
          <Redo2 aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={props.selectedIds.length === 0 || props.disabled} title="Remove selected" onClick={props.onRemove}>
          <Trash2 aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={props.disabled} title="Find & replace" onClick={props.onFindReplace}>
          <Search aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={props.disabled} title="Insert blank page after current page" onClick={props.onInsertPage}>
          <FilePlus2 aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={props.disabled} title="Delete current page" onClick={props.onDeletePage}>
          <FileX2 aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={props.disabled} title="Zoom out" onClick={props.onZoomOut}>
          <Minus aria-hidden="true" />
        </button>
        <span className="zoom-readout">{Math.round(props.scale * 100)}%</span>
        <button className="icon-button" disabled={props.disabled} title="Zoom in" onClick={props.onZoomIn}>
          <Plus aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={props.disabled} title="Rotate view" onClick={props.onRotate}>
          <RotateCw aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={props.disabled} title="Rotate page permanently" onClick={props.onRotatePage}>
          <FileDown aria-hidden="true" />
        </button>
      </div>

      <div className="tool-group tool-group--export" aria-label="Export">
        <Button variant="primary" disabled={props.disabled} onClick={() => props.onExport("pdf")}>
          <Save aria-hidden="true" />
          Apply
        </Button>
        <div className="export-menu">
          <Download aria-hidden="true" />
          <select
            aria-label="Export format"
            disabled={props.disabled}
            defaultValue=""
            onChange={(event) => {
              const value = event.currentTarget.value as ExportFormat | "";
              if (value) props.onExport(value);
              event.currentTarget.value = "";
            }}
          >
            <option value="" disabled>Export</option>
            <option value="pdf">Edited PDF</option>
            <option value="txt">Text</option>
            <option value="csv">CSV</option>
            <option value="xlsx">Excel</option>
          </select>
        </div>
        <FileDown aria-hidden="true" className="tool-ribbon__end-icon" />
      </div>

      {historyOpen ? (
        <div className="history-dialog__backdrop" role="presentation" onClick={() => setHistoryOpen(false)}>
          <section
            className="history-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-dialog-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="history-dialog__head">
              <div>
                <h2 id="history-dialog-title">Undo changes</h2>
                <p>Restore the document to a saved edit checkpoint.</p>
              </div>
              <button className="icon-button" title="Close history" onClick={() => setHistoryOpen(false)}>
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="history-dialog__list">
              {orderedHistory.length ? orderedHistory.map((entry) => (
                <label className="history-dialog__row" key={entry.id}>
                  <input
                    type="radio"
                    name="history-entry"
                    checked={activeHistoryId === entry.id}
                    onChange={() => setSelectedHistoryId(entry.id)}
                  />
                  <span className="history-dialog__meta">
                    <strong>{entry.label}</strong>
                    <small>{entry.operations.length} edits before this change</small>
                  </span>
                  <time dateTime={new Date(entry.timestamp).toISOString()}>
                    {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </time>
                </label>
              )) : (
                <p className="history-dialog__empty">No edit history yet.</p>
              )}
            </div>
            <div className="history-dialog__actions">
              <Button variant="quiet" size="sm" onClick={() => setHistoryOpen(false)}>Cancel</Button>
              <Button
                variant="primary"
                size="sm"
                disabled={!activeHistoryId}
                onClick={() => {
                  /* v8 ignore next -- the button is disabled whenever activeHistoryId is falsy, so this guard never executes */
                  if (!activeHistoryId) return;
                  props.onRestoreHistory(activeHistoryId);
                  setHistoryOpen(false);
                }}
              >
                Revert selected
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
