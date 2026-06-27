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
    <div className="grid h-screen grid-rows-[auto_minmax(0,1fr)_auto] bg-background font-sans text-foreground antialiased">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-1.5 focus:text-primary-foreground"
        href="#editor-canvas"
      >
        Skip to editor
      </a>
      <header className="z-20 border-b bg-card">{header}</header>
      <main className="grid min-h-0 grid-cols-[auto_minmax(0,1fr)_auto]">
        <aside className="min-h-0 w-[168px] overflow-y-auto border-r bg-card" aria-label="Pages">
          {rail}
        </aside>
        <section
          className="min-h-0 overflow-auto bg-muted/40"
          id="editor-canvas"
          aria-label="PDF editor canvas"
        >
          {children}
        </section>
        <aside className="min-h-0 w-[320px] overflow-y-auto border-l bg-card" aria-label="Inspector">
          {inspector}
        </aside>
      </main>
      <footer className="z-20 border-t bg-card">{status}</footer>
    </div>
  );
}
