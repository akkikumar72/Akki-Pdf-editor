import { useRef, useState } from "react";
import {
  ArrowRight,
  Cloud,
  FileText,
  PenLine,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import type { SessionSummary } from "../utils/storage";
import { AkkiPdfMark } from "./AkkiPdfLogo";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card } from "./ui/card";

type ToolHubProps = {
  isBusy: boolean;
  status?: string;
  recentSessions: SessionSummary[];
  onBlank: () => Promise<void>;
  onClearSessions: () => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
  onOpen: (file: File) => Promise<void>;
  onResume: (id: string) => Promise<void>;
};

const plannedImports = ["Google Drive", "Dropbox", "Web URL"];

const highlights = [
  {
    icon: ShieldCheck,
    title: "Private by default",
    description: "Your file is parsed and edited entirely in this browser tab.",
  },
  {
    icon: PenLine,
    title: "Edit in context",
    description: "Text, signatures, images, shapes, forms, and markup.",
  },
  {
    icon: FileText,
    title: "Export cleanly",
    description: "Save back to PDF, or pull out TXT, CSV, and XLSX.",
  },
];

function formatRecentTime(value: number) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 font-heading font-semibold text-foreground">
      <AkkiPdfMark className="size-6 text-primary" aria-hidden="true" />
      AkkiPDF
    </span>
  );
}

export function ToolHub({
  isBusy,
  status,
  recentSessions,
  onBlank,
  onClearSessions,
  onDeleteSession,
  onOpen,
  onResume,
}: ToolHubProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const acceptFile = async (file?: File) => {
    if (!file) return;
    await onOpen(file);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <nav
          className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-6"
          aria-label="AkkiPDF"
        >
          <Wordmark />
          <Button size="sm" disabled={isBusy} onClick={() => inputRef.current?.click()}>
            <Upload aria-hidden="true" />
            Choose file
          </Button>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section
          id="editor"
          aria-label="Import PDF"
          onDragLeave={() => setIsDragging(false)}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            void acceptFile(event.dataTransfer.files[0]);
          }}
          className="mx-auto grid w-full max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24"
        >
          <div className="flex flex-col items-start gap-6">
            <Badge variant="secondary" className="gap-1.5">
              <Sparkles aria-hidden="true" className="size-3.5" />
              Local-first PDF workbench
            </Badge>
            <h1 className="font-heading text-balance font-semibold text-5xl tracking-tight lg:text-6xl">
              Edit PDFs with a lighter touch.
            </h1>
            <p className="max-w-xl text-pretty text-lg text-muted-foreground">
              Open a document, make small precise changes, sign, annotate, and export — without
              sending the file away.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" loading={isBusy} onClick={() => inputRef.current?.click()}>
                Start editing
                <ArrowRight aria-hidden="true" />
              </Button>
              <Button size="lg" variant="outline" disabled={isBusy} onClick={() => void onBlank()}>
                Blank PDF
              </Button>
            </div>
            {status ? (
              <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                {status}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">Drop a PDF anywhere on this section.</p>
            )}
          </div>

          {/* Dropzone card */}
          <Card
            className={`items-center gap-4 border-dashed p-10 text-center transition-colors ${
              isDragging ? "border-primary bg-accent/50" : ""
            }`}
          >
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Upload aria-hidden="true" className="size-5" />
            </span>
            <div className="flex flex-col gap-1">
              <strong className="font-heading font-semibold text-lg">Bring in a PDF</strong>
              <small className="text-muted-foreground text-sm">or create a blank one.</small>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button disabled={isBusy} onClick={() => inputRef.current?.click()}>
                <Upload aria-hidden="true" />
                Choose file
              </Button>
              <Button variant="outline" disabled={isBusy} onClick={() => void onBlank()}>
                Blank PDF
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              {plannedImports.map((source) => (
                <Button
                  key={source}
                  size="sm"
                  variant="ghost"
                  disabled
                  title={`${source} import is planned after local-first v1`}
                  className="text-muted-foreground"
                >
                  <Cloud aria-hidden="true" />
                  {source}
                </Button>
              ))}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(event) => void acceptFile(event.currentTarget.files?.[0])}
            />
          </Card>
        </section>

        {/* Highlights */}
        <section
          aria-label="Editor highlights"
          className="mx-auto grid w-full max-w-6xl gap-4 px-6 pb-16 sm:grid-cols-3"
        >
          {highlights.map(({ icon: Icon, title, description }) => (
            <Card key={title} className="gap-3 p-6">
              <span className="flex size-10 items-center justify-center rounded-lg bg-muted text-foreground">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <strong className="font-heading font-semibold">{title}</strong>
              <span className="text-muted-foreground text-sm">{description}</span>
            </Card>
          ))}
        </section>

        {/* Recent sessions */}
        {recentSessions.length ? (
          <section aria-label="Recent local sessions" className="border-t bg-muted/30 py-16">
            <div className="mx-auto w-full max-w-6xl px-6">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <p className="text-muted-foreground text-sm">Local sessions</p>
                  <h2 className="font-heading font-semibold text-2xl tracking-tight">
                    Pick up where you left off.
                  </h2>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isBusy}
                  title="Clear all recent local sessions"
                  onClick={() => void onClearSessions()}
                >
                  Clear all
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {recentSessions.slice(0, 3).map((session) => (
                  <Card key={session.id} className="flex-row items-center justify-between gap-2 p-2">
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void onResume(session.id)}
                      className="flex flex-1 cursor-pointer flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left hover:bg-accent/60"
                    >
                      <span className="font-medium text-sm">{session.name}</span>
                      <small className="text-muted-foreground text-xs">
                        {session.operationCount} edits · {formatRecentTime(session.updatedAt)}
                      </small>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={isBusy}
                      title={`Remove ${session.name} from browser storage`}
                      aria-label={`Remove ${session.name}`}
                      onClick={() => void onDeleteSession(session.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* Closing CTA */}
        <section aria-label="Start editing locally" className="border-t py-20">
          <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-6 text-center">
            <h2 className="font-heading text-balance font-semibold text-3xl tracking-tight">
              Start with one PDF.
            </h2>
            <p className="text-pretty text-muted-foreground">
              Pick a file, make the small edit, and export a clean copy. No account, no upload
              queue, no document leaving your browser.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" loading={isBusy} onClick={() => inputRef.current?.click()}>
                Start editing
                <ArrowRight aria-hidden="true" />
              </Button>
              <Button size="lg" variant="ghost" disabled={isBusy} onClick={() => void onBlank()}>
                Blank PDF
              </Button>
            </div>
            <small className="text-muted-foreground text-xs">
              Private by default · local sessions · export-ready
            </small>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <Wordmark />
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <ShieldCheck aria-hidden="true" className="size-4" />
            Local unless you export · PDF · TXT · CSV · XLSX
          </p>
          <span className="text-muted-foreground text-xs">© 2026 AkkiPDF</span>
        </div>
      </footer>
    </div>
  );
}
