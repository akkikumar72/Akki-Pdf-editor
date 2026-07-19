import type { ReactNode } from "react";

type AppShellProps = {
  header: ReactNode;
  rail: ReactNode;
  inspector: ReactNode;
  status: ReactNode;
  children: ReactNode;
  /**
   * Optional wrapper around the canvas + inspector only (not header, page rail,
   * or status). Used so high-frequency preview state does not re-render ToolRibbon.
   */
  wrapStage?: (stage: ReactNode) => ReactNode;
};

export function AppShell({ header, rail, inspector, status, children, wrapStage }: AppShellProps) {
  const stage = (
    <>
      <section className="canvas-region" id="editor-canvas" aria-label="PDF editor canvas">
        {children}
      </section>
      <aside className="inspector" aria-label="Inspector">{inspector}</aside>
    </>
  );

  return (
    <div className="app-shell">
      <a className="skip-link" href="#editor-canvas">Skip to editor</a>
      <header className="app-header">{header}</header>
      <main className="app-main">
        <aside className="page-rail" aria-label="Pages">{rail}</aside>
        {wrapStage ? wrapStage(stage) : stage}
      </main>
      <footer className="status-region">{status}</footer>
    </div>
  );
}
