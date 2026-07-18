import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { TOOL_GROUPS } from "../editor/toolRegistry";
import type { EditHistoryEntry } from "../state/editModel";
import type { EditorTool, ExportFormat } from "../types/editor";
import {
  IconCheck,
  IconChevronDown,
  IconDownload,
  IconFileDown,
  IconFilePlus,
  IconFileText,
  IconFileX,
  IconHistory,
  IconMinus,
  IconPlus,
  IconRedo,
  IconRotate,
  IconSave,
  IconSearch,
  IconSpreadsheet,
  IconTrash,
  IconUndo,
  IconX,
} from "./AppIcons";
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

const EXPORT_OPTIONS: Array<{
  format: ExportFormat;
  label: string;
  description: string;
  Icon: typeof IconFileText;
}> = [
  { format: "pdf", label: "Edited PDF", description: "Flatten visible edits into a clean PDF", Icon: IconFileText },
  { format: "txt", label: "Text", description: "Extract readable text from the document", Icon: IconFileText },
  { format: "csv", label: "CSV", description: "Export marked table regions as rows", Icon: IconSpreadsheet },
  { format: "xlsx", label: "Excel", description: "Create a workbook from extracted tables", Icon: IconSpreadsheet },
];

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
          if (group.tools.length === 1) {
            return (
              <div className="tool-menu" key={group.id}>
                <button
                  className="tool-button"
                  aria-pressed={activeToolInGroup}
                  disabled={props.disabled}
                  title={primary.description}
                  onClick={() => {
                    if (activeToolInGroup && group.primary !== "select") {
                      props.onToolChange("select");
                      setOpenGroup(undefined);
                      return;
                    }
                    props.onToolChange(group.primary);
                    setOpenGroup(undefined);
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span>{group.label}</span>
                </button>
              </div>
            );
          }

          return (
            <div className="tool-menu" key={group.id}>
              <Menu.Root
                modal={false}
                open={openGroup === group.id}
                onOpenChange={(open) => setOpenGroup(open ? group.id : undefined)}
              >
                <Menu.Trigger
                  className="tool-button"
                  aria-pressed={activeToolInGroup}
                  disabled={props.disabled}
                  title={primary.description}
                  onClick={(event) => {
                    // Clicking an already-active multi-tool group returns to Select, matching the editor's neutral mode behavior.
                    if (activeToolInGroup && group.primary !== "select") {
                      event.preventDefault();
                      props.onToolChange("select");
                      setOpenGroup(undefined);
                      return;
                    }
                    props.onToolChange(group.primary);
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span>{group.label}</span>
                  <IconChevronDown aria-hidden="true" className="tool-button__chevron" />
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner className="tool-menu__positioner" sideOffset={8}>
                    <Menu.Popup className="tool-menu__popover" aria-label={`${group.label} tools`}>
                      <Menu.Group className="tool-menu__group">
                        {group.tools.map((tool) => {
                          const MenuIcon = tool.icon;
                          const isActive = props.activeTool === tool.id;
                          return (
                            <Menu.Item
                              key={tool.id}
                              className="tool-menu__item"
                              data-active={isActive ? "" : undefined}
                              aria-current={isActive ? "true" : undefined}
                              onClick={() => {
                                props.onToolChange(tool.id);
                                setOpenGroup(undefined);
                              }}
                            >
                              <MenuIcon aria-hidden="true" />
                              <span className="tool-menu__item-copy">
                                <strong>{tool.label}</strong>
                                <small>{tool.description}</small>
                              </span>
                              {isActive ? <IconCheck aria-hidden="true" className="tool-menu__check" /> : null}
                            </Menu.Item>
                          );
                        })}
                      </Menu.Group>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            </div>
          );
        })}
      </div>

      <div className="tool-group tool-group--compact tool-group--utility" aria-label="History and page controls">
        <button className="icon-button" disabled={!props.canUndo || props.disabled} title="Undo" onClick={props.onUndo}>
          <IconUndo aria-hidden="true" />
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
          <IconHistory aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={!props.canRedo || props.disabled} title="Redo" onClick={props.onRedo}>
          <IconRedo aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={props.selectedIds.length === 0 || props.disabled} title="Remove selected" onClick={props.onRemove}>
          <IconTrash aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={props.disabled} title="Find & replace" onClick={props.onFindReplace}>
          <IconSearch aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={props.disabled} title="Insert blank page after current page" onClick={props.onInsertPage}>
          <IconFilePlus aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={props.disabled} title="Delete current page" onClick={props.onDeletePage}>
          <IconFileX aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={props.disabled} title="Zoom out" onClick={props.onZoomOut}>
          <IconMinus aria-hidden="true" />
        </button>
        <span className="zoom-readout">{Math.round(props.scale * 100)}%</span>
        <button className="icon-button" disabled={props.disabled} title="Zoom in" onClick={props.onZoomIn}>
          <IconPlus aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={props.disabled} title="Rotate view" onClick={props.onRotate}>
          <IconRotate aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={props.disabled} title="Rotate page permanently" onClick={props.onRotatePage}>
          <IconFileDown aria-hidden="true" />
        </button>
      </div>

      <div className="tool-group tool-group--export" aria-label="Export">
        <Button variant="primary" disabled={props.disabled} onClick={() => props.onExport("pdf")}>
          <IconSave aria-hidden="true" data-icon="inline-start" />
          Apply
        </Button>
        <Menu.Root modal={false}>
          <Menu.Trigger className="export-menu" aria-label="Export format" disabled={props.disabled}>
            <IconDownload aria-hidden="true" />
            <span>Export</span>
            <IconChevronDown aria-hidden="true" className="export-menu__chevron" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className="export-menu__positioner" sideOffset={8}>
              <Menu.Popup className="export-menu__popup" aria-label="Export formats">
                <Menu.Group className="export-menu__group">
                  <Menu.GroupLabel className="export-menu__label">Export as</Menu.GroupLabel>
                  {EXPORT_OPTIONS.map(({ format, label, description, Icon: ExportIcon }) => (
                    <Menu.Item
                      key={format}
                      className="export-menu__item"
                      onClick={() => props.onExport(format)}
                    >
                      <ExportIcon aria-hidden="true" />
                      <span>
                        <strong>{label}</strong>
                        <small>{description}</small>
                      </span>
                    </Menu.Item>
                  ))}
                </Menu.Group>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
        <IconFileDown aria-hidden="true" className="tool-ribbon__end-icon" />
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
                <IconX aria-hidden="true" />
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
