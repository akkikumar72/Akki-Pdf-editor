import type { ReactNode } from "react";

type AppShellProps = {
  header: ReactNode;
  studio?: boolean;
  rail: ReactNode;
  inspector?: ReactNode;
  status: ReactNode;
  children: ReactNode;
  /**
   * Optional wrapper around the canvas + inspector only (not header, page rail,
   * or status). Used so high-frequency preview state does not re-render ToolRibbon.
   */
  wrapStage?: (stage: ReactNode) => ReactNode;
};

export function AppShell({ header, rail, inspector, status, children, wrapStage, studio = false }: AppShellProps) {
  const stage = (
    <>
      <section className="canvas-region" id="editor-canvas" aria-label="PDF editor canvas">
        {children}
      </section>
      {inspector ? (
        <aside className="inspector" id="editor-properties" aria-label="Properties">
          {inspector}
        </aside>
      ) : null}
    </>
  );

  return (
    <div className={`app-shell${studio ? " app-shell--studio" : ""}`}>
      <a className="skip-link" href="#editor-canvas">
        Skip to editor
      </a>
      <header className="app-header">{header}</header>
      <main className="app-main">
        <aside className={studio ? "studio-sidebar" : "page-rail"} aria-label={studio ? "Workspace" : "Pages"}>
          {rail}
        </aside>
        {wrapStage ? wrapStage(stage) : stage}
      </main>
      <footer className="status-region">{status}</footer>
    </div>
  );
}
