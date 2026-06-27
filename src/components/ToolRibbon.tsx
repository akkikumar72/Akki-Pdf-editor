import { Download, Save } from "lucide-react";
import { useState } from "react";
import { TOOL_GROUPS } from "../editor/toolRegistry";
import type { EditorTool, ExportFormat } from "../types/editor";
import { AkkiPdfMark } from "./AkkiPdfLogo";
import { Button } from "./ui/button";

type ToolRibbonProps = {
  activeTool: EditorTool;
  disabled: boolean;
  onExport: (format: ExportFormat) => void;
  onHome: () => void;
  onToolChange: (tool: EditorTool) => void;
};

export function ToolRibbon(props: ToolRibbonProps) {
  const [openGroup, setOpenGroup] = useState<string>();

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
      <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto" role="toolbar" aria-label="Editing tools">
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
    </div>
  );
}
