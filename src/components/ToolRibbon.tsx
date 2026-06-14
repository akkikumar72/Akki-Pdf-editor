import {
  Download,
  FileDown,
  FilePlus2,
  FileX2,
  Minus,
  Plus,
  Redo2,
  RotateCw,
  Save,
  ScissorsLineDashed,
  Trash2,
  Undo2,
} from "lucide-react";
import { useState } from "react";
import { TOOL_GROUPS } from "../editor/toolRegistry";
import type { EditorTool, ExportFormat } from "../types/editor";

type ToolRibbonProps = {
  activeTool: EditorTool;
  canRedo: boolean;
  canUndo: boolean;
  disabled: boolean;
  scale: number;
  selectedId?: string;
  onExport: (format: ExportFormat) => void;
  onDeletePage: () => void;
  onInsertPage: () => void;
  onRedo: () => void;
  onRemove: () => void;
  onRotate: () => void;
  onRotatePage: () => void;
  onToolChange: (tool: EditorTool) => void;
  onUndo: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
};

export function ToolRibbon(props: ToolRibbonProps) {
  const [openGroup, setOpenGroup] = useState<string>();

  return (
    <div className="tool-ribbon">
      <div className="tool-ribbon__brand">
        <ScissorsLineDashed aria-hidden="true" />
        <div>
          <strong>Akki PDF</strong>
          <span>Local editor</span>
        </div>
      </div>

      <div className="tool-group" role="toolbar" aria-label="Editing tools">
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
                  if (group.tools.length === 1) {
                    props.onToolChange(group.primary);
                    setOpenGroup(undefined);
                    return;
                  }
                  if (!activeToolInGroup) props.onToolChange(group.primary);
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

      <div className="tool-group tool-group--compact" aria-label="History and zoom">
        <button className="icon-button" disabled={!props.canUndo || props.disabled} title="Undo" onClick={props.onUndo}>
          <Undo2 aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={!props.canRedo || props.disabled} title="Redo" onClick={props.onRedo}>
          <Redo2 aria-hidden="true" />
        </button>
        <button className="icon-button" disabled={!props.selectedId || props.disabled} title="Remove selected" onClick={props.onRemove}>
          <Trash2 aria-hidden="true" />
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
        <button className="button button--primary" disabled={props.disabled} onClick={() => props.onExport("pdf")}>
          <Save aria-hidden="true" />
          Apply
        </button>
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
            <option value="png">PNG</option>
          </select>
        </div>
        <FileDown aria-hidden="true" className="tool-ribbon__end-icon" />
      </div>
    </div>
  );
}
