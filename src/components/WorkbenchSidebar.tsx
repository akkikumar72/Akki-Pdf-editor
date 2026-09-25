import { useEffect, useRef, useState, type ReactNode } from "react";
import { TOOL_BY_ID } from "../editor/toolRegistry";
import { WORKSPACE_TOOL_SECTIONS, workspaceToolLabel } from "../editor/workspaceTools";
import type { EditorTool, ExportFormat } from "../types/editor";
import type { EditHistoryEntry } from "../state/editModel";
import { WorkbenchIcon, type WorkbenchIconName } from "./WorkbenchIcon";

const destinations: { id: string; label: string; icon: WorkbenchIconName; description: string }[] = [
  { id: "tools", label: "All tools", icon: "squares-four", description: "Everything you need, within reach." },
  { id: "pages", label: "Pages", icon: "files", description: "Navigate and organize your document." },
  { id: "annotate", label: "Annotate", icon: "highlighter", description: "Leave a clear mark. Keep the context." },
  { id: "forms", label: "Forms", icon: "textbox", description: "Build fields people can fill in." },
  { id: "sign", label: "Sign", icon: "signature", description: "Add your signature and finishing touches." },
  {
    id: "history",
    label: "History",
    icon: "clock-counter-clockwise",
    description: "A little room to change your mind.",
  },
  { id: "export", label: "Export", icon: "download-simple", description: "Your document, ready for its next step." },
  { id: "help", label: "Help", icon: "question", description: "A few things worth knowing." },
];

type Props = {
  activeTool: EditorTool;
  disabled: boolean;
  pageCount: number;
  scale: number;
  historyEntries: EditHistoryEntry[];
  canRedo: boolean;
  selectedCount: number;
  pages: ReactNode;
  onToolChange: (tool: EditorTool) => void;
  onHome: () => void;
  onFind: () => void;
  onInsertPage: () => void;
  onDeletePage: () => void;
  onRotatePage: () => void;
  onRotateView: () => void;
  onFit: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onRestoreHistory: (id: string) => void;
  onExport: (format: ExportFormat) => void;
  onProperties: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
};

const exports: { format: ExportFormat; title: string; detail: string; extension: string }[] = [
  { format: "pdf", title: "Edited PDF", detail: "Your document with all edits applied", extension: "PDF" },
  { format: "txt", title: "Plain text", detail: "Extract document text", extension: "TXT" },
  { format: "csv", title: "CSV spreadsheet", detail: "Extract detected table data", extension: "CSV" },
  { format: "xlsx", title: "Excel workbook", detail: "Table data in a workbook", extension: "XLSX" },
];

export function WorkbenchSidebar(props: Props) {
  const [active, setActive] = useState("tools");
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 1000);
  const searchRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const destination = destinations.find((item) => item.id === active)!;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setActive("tools");
        setCollapsed(false);
        requestAnimationFrame(() => searchRef.current?.focus());
      }
      if (event.key === "Escape" && window.innerWidth < 1000 && !event.defaultPrevented) {
        setCollapsed(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const chooseTool = (tool: EditorTool) => {
    props.onToolChange(tool);
    if (window.innerWidth < 1000) setCollapsed(true);
  };
  const sections = WORKSPACE_TOOL_SECTIONS.filter((section) => {
    if (active === "annotate") return ["Annotate & draw", "Shapes"].includes(section.label);
    if (active === "forms") return section.label === "Form fields";
    if (active === "sign") return section.label === "Sign & stamp";
    return true;
  }).map((section) => ({
    ...section,
    tools: section.tools.filter((id) =>
      `${workspaceToolLabel(id)} ${TOOL_BY_ID[id].description} ${section.label}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    ),
  }));
  const toolPanel = ["tools", "annotate", "forms", "sign"].includes(active);

  return (
    <div className={`workspace-sidebar${collapsed ? " is-collapsed" : ""}`}>
      <nav className="workspace-nav" aria-label="Workspace tools" ref={navRef}>
        <button type="button" title="Back to documents" disabled={props.disabled} onClick={props.onHome}>
          <WorkbenchIcon name="folder-open" />
          <span>Documents</span>
        </button>
        {destinations.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === "help" ? "workspace-nav__help" : undefined}
            aria-label={item.label}
            aria-pressed={active === item.id && !collapsed}
            aria-controls="workspace-panel"
            title={item.label}
            onClick={() => {
              setActive(item.id);
              setQuery("");
              setCollapsed(false);
            }}
          >
            <WorkbenchIcon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      {!collapsed && (
        <section className="workspace-panel" id="workspace-panel" aria-label={`${destination.label} panel`}>
          <div className="workspace-panel__heading">
            <div>
              <span className="studio-eyebrow">Your workspace</span>
              <h2>{destination.label}</h2>
            </div>
            <button
              className="studio-icon-button"
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              onClick={() => {
                setCollapsed(true);
                navRef.current?.querySelector<HTMLButtonElement>(`button[aria-label="${destination.label}"]`)?.focus();
              }}
            >
              <WorkbenchIcon name="x" />
            </button>
          </div>
          <p className="workspace-panel__description">{destination.description}</p>
          {toolPanel && (
            <>
              <label className="workspace-search">
                <WorkbenchIcon name="magnifying-glass" />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search tools…"
                  aria-label="Search tools"
                />
                {query ? (
                  <button aria-label="Clear tool search" onClick={() => setQuery("")}>
                    <WorkbenchIcon name="x" />
                  </button>
                ) : (
                  <kbd>⌘ K</kbd>
                )}
              </label>
              <div
                className="workspace-tool-list"
                role="toolbar"
                aria-label="Editing tools"
                aria-orientation="vertical"
              >
                {sections.map(
                  (section) =>
                    section.tools.length > 0 && (
                      <section className="workspace-tool-section" key={section.label} aria-label={section.label}>
                        <h3>{section.label}</h3>
                        <div className="workspace-tool-grid">
                          {section.tools.map((id) => {
                            const tool = TOOL_BY_ID[id];
                            const Icon = tool.icon;
                            return (
                              <button
                                type="button"
                                key={id}
                                data-tool={id}
                                aria-pressed={props.activeTool === id}
                                disabled={props.disabled}
                                title={tool.description}
                                onClick={() => chooseTool(id)}
                              >
                                <Icon aria-hidden="true" />
                                <span>{workspaceToolLabel(id)}</span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ),
                )}
                {sections.every((section) => section.tools.length === 0) && (
                  <div className="workspace-empty">
                    <WorkbenchIcon name="magnifying-glass" />
                    <strong>No matching tools</strong>
                    <p>Try text, signature, crop, or forms.</p>
                    <button onClick={() => setQuery("")}>Show all tools</button>
                  </div>
                )}
              </div>
              {active === "tools" && (
                <button
                  className="workspace-action"
                  disabled={props.disabled}
                  aria-label="Find text from sidebar"
                  onClick={props.onFind}
                >
                  <WorkbenchIcon name="magnifying-glass" />
                  Find and replace<kbd>⌘ F</kbd>
                </button>
              )}
              <div className="workspace-tip">
                <WorkbenchIcon name="pencil-line" />
                <strong>{workspaceToolLabel(props.activeTool)}</strong>
                <p>{TOOL_BY_ID[props.activeTool].description}</p>
              </div>
              {props.selectedCount > 0 && (
                <div className="workspace-selection">
                  <strong>{props.selectedCount} selected</strong>
                  <button disabled={props.disabled} aria-label="Open selected properties" onClick={props.onProperties}>
                    Properties
                  </button>
                  <button disabled={props.disabled} aria-label="Duplicate from sidebar" onClick={props.onDuplicate}>
                    Duplicate selected
                  </button>
                  <button disabled={props.disabled} aria-label="Remove from sidebar" onClick={props.onRemove}>
                    Remove selected
                  </button>
                </div>
              )}
            </>
          )}
          {active === "pages" && (
            <>
              <div className="workspace-page-actions">
                <button disabled={props.disabled} onClick={props.onInsertPage}>
                  <WorkbenchIcon name="plus" />
                  Add page
                </button>
                <button disabled={props.disabled} onClick={props.onRotatePage}>
                  <WorkbenchIcon name="arrow-clockwise" />
                  Rotate page
                </button>
                <button disabled={props.disabled || props.pageCount <= 1} onClick={props.onDeletePage}>
                  <WorkbenchIcon name="x" />
                  Delete page
                </button>
                <button disabled={props.disabled} onClick={() => chooseTool("crop")}>
                  <WorkbenchIcon name="crop" />
                  Crop page
                </button>
              </div>
              <div
                className="workspace-pages"
                aria-busy={props.disabled}
                {...(props.disabled ? ({ inert: "" } as Record<string, string>) : {})}
              >
                {props.pages}
              </div>
            </>
          )}
          {active === "history" && (
            <>
              <div className="workspace-page-actions">
                <button disabled={props.disabled || !props.historyEntries.length} onClick={props.onUndo}>
                  <WorkbenchIcon name="arrow-counter-clockwise" />
                  Undo change
                </button>
                <button disabled={props.disabled || !props.canRedo} onClick={props.onRedo}>
                  <WorkbenchIcon name="arrow-clockwise" />
                  Redo change
                </button>
              </div>
              <p className="workspace-caption">Select a checkpoint to restore the document to before that change.</p>
              {props.historyEntries.length === 0 ? (
                <div className="workspace-empty">
                  <WorkbenchIcon name="clock-counter-clockwise" />
                  <strong>A fresh start</strong>
                  <p>Your edits will appear here. You can undo changes as you work.</p>
                </div>
              ) : (
                <ol className="workspace-history">
                  {[...props.historyEntries].reverse().map((entry) => (
                    <li key={entry.id}>
                      <button disabled={props.disabled} onClick={() => props.onRestoreHistory(entry.id)}>
                        <WorkbenchIcon name="clock-counter-clockwise" />
                        <span>
                          <strong>{entry.label}</strong>
                          <small>{entry.operations.length} edits before this change</small>
                        </span>
                        <time>
                          {new Date(entry.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </time>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
          {active === "export" && (
            <>
              <div className="workspace-export-summary">
                <WorkbenchIcon name="files" />
                <div>
                  <strong>Ready when you are</strong>
                  <span>
                    {props.pageCount} {props.pageCount === 1 ? "page" : "pages"} · processed on your device
                  </span>
                </div>
              </div>
              <div className="workspace-export-list">
                {exports.map((item) => (
                  <button key={item.format} disabled={props.disabled} onClick={() => props.onExport(item.format)}>
                    <span className="workspace-file-type">{item.extension}</span>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <WorkbenchIcon name="download-simple" />
                  </button>
                ))}
              </div>
              <p className="workspace-caption">
                Text and table exports depend on selectable text in the PDF. Scanned documents need OCR, which is not
                available here.
              </p>
              <div className="workspace-tip">
                <WorkbenchIcon name="shield-check" />
                <strong>Keep the original</strong>
                <p>Export downloads a new copy. Your original file stays untouched.</p>
              </div>
            </>
          )}
          {active === "help" && (
            <div className="workspace-help">
              <section>
                <h3>Made for local work</h3>
                <p>
                  PDFs and edits stay in this browser. Sessions are saved locally so you can pick up where you left off.
                </p>
              </section>
              <section>
                <h3>Quick controls</h3>
                <dl>
                  <div>
                    <dt>Find tools</dt>
                    <dd>⌘ / Ctrl K</dd>
                  </div>
                  <div>
                    <dt>Find text</dt>
                    <dd>⌘ / Ctrl F</dd>
                  </div>
                  <div>
                    <dt>Undo</dt>
                    <dd>⌘ / Ctrl Z</dd>
                  </div>
                  <div>
                    <dt>Redo</dt>
                    <dd>⌘ / Ctrl ⇧ Z</dd>
                  </div>
                </dl>
              </section>
              <section>
                <h3>Edit with confidence</h3>
                <p>
                  Select an object to change its appearance, duplicate it, or open Properties. Use Pages to insert,
                  rotate, crop, or delete pages.
                </p>
              </section>
              <section className="workspace-notice">
                <h3>About visual redaction</h3>
                <p>
                  Redact and whiteout cover content visually. The original text remains extractable. Do not use these
                  tools to remove sensitive information.
                </p>
              </section>
              <section>
                <h3>What is supported</h3>
                <p>
                  Edit text, annotate, add images and signatures, create forms, organize pages, and export. OCR, PDF
                  merging, encryption, and cloud imports are not available.
                </p>
              </section>
            </div>
          )}
          <div className="workspace-panel__footer">
            <span className="studio-local-dot" />
            Files stay on your device
          </div>
        </section>
      )}
      <div className="workspace-view-controls" role="group" aria-label="Sidebar view controls">
        <button disabled={props.disabled} aria-label="Zoom out from sidebar" onClick={props.onZoomOut}>
          −
        </button>
        <span>{Math.round(props.scale * 100)}%</span>
        <button disabled={props.disabled} aria-label="Zoom in from sidebar" onClick={props.onZoomIn}>
          +
        </button>
        <button disabled={props.disabled} aria-label="Fit page from sidebar" onClick={props.onFit}>
          <WorkbenchIcon name="arrows-out-simple" />
        </button>
        <button disabled={props.disabled} aria-label="Rotate view from sidebar" onClick={props.onRotateView}>
          <WorkbenchIcon name="arrow-clockwise" />
        </button>
      </div>
    </div>
  );
}
