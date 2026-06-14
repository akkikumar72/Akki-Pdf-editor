import type { ReactNode } from "react";

type AppShellProps = {
  header: ReactNode;
  rail: ReactNode;
  inspector: ReactNode;
  status: ReactNode;
  children: ReactNode;
};

export function AppShell({ header, rail, inspector, status, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#editor-canvas">Skip to editor</a>
      <header className="app-header">{header}</header>
      <main className="app-main">
        <aside className="page-rail" aria-label="Pages">{rail}</aside>
        <section className="canvas-region" id="editor-canvas" aria-label="PDF editor canvas">
          {children}
        </section>
        <aside className="inspector" aria-label="Inspector">{inspector}</aside>
      </main>
      <footer className="status-region">{status}</footer>
    </div>
  );
}
