import {
  ChevronDown,
  Download,
  FileDown,
  FilePlus2,
  FileText,
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
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { TOOL_GROUPS } from "../editor/toolRegistry";
import type { EditHistoryEntry } from "../state/editModel";
import type { EditorTool, ExportFormat } from "../types/editor";
import { AkkivoLogo } from "./AkkivoLogo";
import { Button } from "./ui/button";

type ToolRibbonProps = {
  activeTool: EditorTool;
  canRedo: boolean;
  canUndo: boolean;
  disabled: boolean;
  documentName: string;
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
  const [compactMenuPosition, setCompactMenuPosition] = useState<Pick<CSSProperties, "left" | "top">>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const newestHistory = props.historyEntries[props.historyEntries.length - 1];
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | undefined>();
  const activeHistoryId = selectedHistoryId ?? newestHistory?.id;
  const orderedHistory = [...props.historyEntries].reverse();
  const activeMenuRef = useRef<HTMLDivElement | null>(null);
  // Whichever button most recently opened a menu/dialog, so Escape can return
  // focus to it instead of stranding a keyboard user at <body>.
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!openGroup) return;

    activeMenuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]')?.focus();

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!activeMenuRef.current?.contains(event.target as Node)) {
        setOpenGroup(undefined);
      }
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [openGroup]);

  useLayoutEffect(() => {
    if (!openGroup || !activeMenuRef.current) {
      setCompactMenuPosition(undefined);
      return;
    }

    const menuHost = activeMenuRef.current;
    const editingBar = menuHost.closest<HTMLElement>(".tool-ribbon__editing-bar");
    const updatePosition = () => {
      if (!window.matchMedia?.("(max-width: 74rem)").matches) {
        setCompactMenuPosition(undefined);
        return;
      }

      const hostRect = menuHost.getBoundingClientRect();
      const viewportPadding = 16;
      const menuWidth = Math.min(200, window.innerWidth - viewportPadding * 2);
      const left = Math.min(Math.max(hostRect.left, viewportPadding), window.innerWidth - menuWidth - viewportPadding);

      setCompactMenuPosition({ left, top: hostRect.bottom + 6 });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    editingBar?.addEventListener("scroll", updatePosition, { passive: true });
    return () => {
      window.removeEventListener("resize", updatePosition);
      editingBar?.removeEventListener("scroll", updatePosition);
    };
  }, [openGroup]);

  // Escape closes whichever overlay surface is open (tool-variant menu or the
  // history dialog), matching the convention every other dialog in the app
  // already follows (LinkPropertiesDialog, SignatureModal, FindReplaceDialog).
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape") return;
    if (historyOpen) {
      event.stopPropagation();
      setHistoryOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (openGroup) {
      event.stopPropagation();
      setOpenGroup(undefined);
      triggerRef.current?.focus();
    }
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex = currentIndex;

    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = items.length - 1;
    if (event.key === "ArrowDown") nextIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
    if (event.key === "ArrowUp") nextIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;

    event.preventDefault();
    event.stopPropagation();
    items[nextIndex]?.focus();
  };

  return (
    <div className="tool-ribbon" onKeyDown={handleKeyDown}>
      <div className="tool-ribbon__document-bar">
        <AkkivoLogo
          className="tool-ribbon__brand"
          aria-label="Akkivo home"
          disabled={props.disabled}
          title="Back to home"
          onClick={props.onHome}
        />
        <div className="tool-ribbon__filename" title={props.documentName}>
          <FileText aria-hidden="true" />
          <span>{props.documentName}</span>
        </div>
        <div className="tool-ribbon__document-actions" role="toolbar" aria-label="Document actions">
          <button className="icon-button" aria-label="Find and replace" disabled={props.disabled} title="Find & replace" onClick={props.onFindReplace}>
            <Search aria-hidden="true" />
          </button>
          <Button size="sm" variant="primary" disabled={props.disabled} onClick={() => props.onExport("pdf")}>
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
        </div>
      </div>

      <div className="tool-ribbon__editing-bar">
        <div className="tool-group tool-group--compact tool-group--history" role="group" aria-label="Edit history">
          <button className="icon-button" aria-label="Undo" disabled={!props.canUndo || props.disabled} title="Undo" onClick={props.onUndo}>
            <Undo2 aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            aria-label="Undo history"
            disabled={!props.canUndo || props.disabled}
            title="Undo history"
            onClick={(event) => {
              triggerRef.current = event.currentTarget;
              setSelectedHistoryId(newestHistory?.id);
              setHistoryOpen(true);
            }}
          >
            <History aria-hidden="true" />
          </button>
          <button className="icon-button" aria-label="Redo" disabled={!props.canRedo || props.disabled} title="Redo" onClick={props.onRedo}>
            <Redo2 aria-hidden="true" />
          </button>
        </div>

        <div className="tool-group tool-group--tools" role="toolbar" aria-label="Editing tools">
          {TOOL_GROUPS.map((group) => {
            const activeToolInGroup = group.tools.some((tool) => tool.id === props.activeTool);
            const primary = group.tools.find((tool) => tool.id === props.activeTool) ?? group.tools[0];
            const Icon = primary.icon;
            const menuId = `tool-menu-${group.id}`;
            return (
              <div ref={openGroup === group.id ? activeMenuRef : undefined} className="tool-menu" key={group.id}>
                <div className={group.tools.length > 1 ? "tool-menu__split" : undefined}>
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
                    <span>{activeToolInGroup ? primary.label : group.label}</span>
                  </button>
                  {group.tools.length > 1 ? (
                    <button
                      className="tool-menu__trigger"
                      type="button"
                      aria-label={`Choose ${group.label} tool. Current: ${primary.label}`}
                      aria-haspopup="menu"
                      aria-expanded={openGroup === group.id}
                      aria-controls={menuId}
                      disabled={props.disabled}
                      title={`Choose ${group.label} tool. Current: ${primary.label}`}
                      onClick={(event) => {
                        triggerRef.current = event.currentTarget;
                        setOpenGroup((value) => (value === group.id ? undefined : group.id));
                      }}
                    >
                      <ChevronDown aria-hidden="true" />
                    </button>
                  ) : null}
                </div>
                {group.tools.length > 1 && openGroup === group.id ? (
                  <div
                    id={menuId}
                    className="tool-menu__popover"
                    role="menu"
                    aria-label={`${group.label} tools`}
                    style={compactMenuPosition}
                    onKeyDown={handleMenuKeyDown}
                  >
                    {group.tools.map((tool, index) => {
                      const MenuIcon = tool.icon;
                      return (
                        <button
                          key={tool.id}
                          role="menuitemradio"
                          tabIndex={index === 0 ? 0 : -1}
                          className="tool-menu__item"
                          aria-checked={props.activeTool === tool.id}
                          onClick={() => {
                            const trigger = triggerRef.current;
                            props.onToolChange(tool.id);
                            setOpenGroup(undefined);
                            trigger?.focus();
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

        <div className="tool-group tool-group--compact tool-group--utility" role="group" aria-label="Page and view controls">
          <button className="icon-button" aria-label="Remove selected" disabled={props.selectedIds.length === 0 || props.disabled} title="Remove selected" onClick={props.onRemove}>
            <Trash2 aria-hidden="true" />
          </button>
          <button className="icon-button" aria-label="Insert blank page" disabled={props.disabled} title="Insert blank page after current page" onClick={props.onInsertPage}>
            <FilePlus2 aria-hidden="true" />
          </button>
          <button className="icon-button" aria-label="Delete current page" disabled={props.disabled} title="Delete current page" onClick={props.onDeletePage}>
            <FileX2 aria-hidden="true" />
          </button>
          <button className="icon-button" aria-label="Zoom out" disabled={props.disabled} title="Zoom out" onClick={props.onZoomOut}>
            <Minus aria-hidden="true" />
          </button>
          <span className="zoom-readout">{Math.round(props.scale * 100)}%</span>
          <button className="icon-button" aria-label="Zoom in" disabled={props.disabled} title="Zoom in" onClick={props.onZoomIn}>
            <Plus aria-hidden="true" />
          </button>
          <button className="icon-button" aria-label="Rotate view" disabled={props.disabled} title="Rotate view" onClick={props.onRotate}>
            <RotateCw aria-hidden="true" />
          </button>
          <button className="icon-button" aria-label="Rotate page permanently" disabled={props.disabled} title="Rotate page permanently" onClick={props.onRotatePage}>
            <FileDown aria-hidden="true" />
          </button>
        </div>
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
