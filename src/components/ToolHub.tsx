import {
  Cloud,
  Crop,
  FileArchive,
  FileDown,
  FileText,
  Files,
  FolderOpen,
  FormInput,
  Highlighter,
  Image,
  LockKeyhole,
  MousePointer2,
  Plus,
  Scissors,
  ShieldCheck,
  Signature,
  SplitSquareHorizontal,
  Table2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useRef, useState } from "react";
import type { SessionSummary } from "../utils/storage";
import { Button } from "./ui/button";

type ToolHubProps = {
  isBusy: boolean;
  recentSessions: SessionSummary[];
  onBlank: () => Promise<void>;
  onClearSessions: () => Promise<void>;
  onDeleteSession: (id: string) => Promise<void>;
  onOpen: (file: File) => Promise<void>;
  onResume: (id: string) => Promise<void>;
};

const popularTools = [
  { title: "PDF Editor", description: "Edit text, sign, annotate, add images, forms, links, and shapes.", icon: MousePointer2, active: true },
  { title: "Fill & Sign", description: "Create typed, drawn, or uploaded signatures and place form marks.", icon: Signature, active: true },
  { title: "PDF to Excel", description: "Export selected table regions to CSV or XLSX.", icon: Table2, active: true },
  { title: "Merge", description: "Combine PDFs into one document.", icon: Files, active: false },
  { title: "Split", description: "Extract page ranges or split documents.", icon: SplitSquareHorizontal, active: false },
  { title: "Compress", description: "Reduce PDF size locally.", icon: FileArchive, active: false },
  { title: "Crop", description: "Trim margins and resize pages.", icon: Crop, active: false },
  { title: "Delete Pages", description: "Remove unwanted pages.", icon: Scissors, active: true },
  { title: "PDF to PNG", description: "Export rendered pages as images.", icon: Image, active: true },
  { title: "Create Forms", description: "Add text fields, checkboxes, radios, dropdowns, and signature boxes.", icon: FormInput, active: true },
];

const plannedImports = ["Dropbox", "Google Drive", "OneDrive", "Web Address URL"];

const workflowNotes = [
  { label: "Inline edits", value: "Text, images, links, forms" },
  { label: "Document output", value: "PDF, TXT, CSV, XLSX, PNG" },
  { label: "Privacy model", value: "Local browser processing" },
];

const workflowSteps = [
  {
    title: "Import locally",
    description: "Choose a PDF, drag one in, or begin with a blank page. Cloud sources are marked for a later release.",
    icon: UploadCloud,
  },
  {
    title: "Click and match",
    description: "Select text and keep nearby font, color, size, and background so small edits stay visually quiet.",
    icon: MousePointer2,
  },
  {
    title: "Mark up the page",
    description: "Add signatures, images, links, form marks, shapes, highlights, whiteout, and ink overlays.",
    icon: Highlighter,
  },
  {
    title: "Apply and export",
    description: "Write changes over the original bytes, then export PDF, TXT, CSV, XLSX, or rendered PNG pages.",
    icon: FileDown,
  },
];

const landingProof = [
  "Private processing in the browser",
  "Font-aware text replacement",
  "Inline toolbar for selected objects",
  "Exports for documents and tables",
];

function formatRecentTime(value: number) {
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ToolHub({
  isBusy,
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
    if (!file || file.type !== "application/pdf") return;
    await onOpen(file);
  };

  return (
    <div className={`tool-hub ${isDragging ? "is-dragging" : ""}`}>
      <nav className="tool-hub__nav" aria-label="PDF tools">
        <div className="brand-lockup">
          <FileText aria-hidden="true" />
          <span>Akki PDF</span>
        </div>
        <a href="#tools">All Tools</a>
        <a href="#editor">Edit</a>
        <a href="#editor">Fill & Sign</a>
        <a href="#tools">Split</a>
        <a href="#tools">Compress</a>
        <span className="privacy-note"><ShieldCheck aria-hidden="true" /> Local only</span>
      </nav>

      <main className="tool-hub__main">
        <section
          id="editor"
          className="tool-hub__import"
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
        >
          <div className="tool-hub__story">
            <p className="tool-hub__eyebrow">Online-style PDF editor, local-first</p>
            <h1>Edit PDFs without the upload step.</h1>
            <p>
              Open a document, click existing text, make precise overlay edits with matched styling,
              sign it, add forms and annotations, then export the finished copy from your browser.
            </p>
            <div className="tool-hub__signals" aria-label="Editor highlights">
              {workflowNotes.map((note) => (
                <span key={note.label}>
                  <strong>{note.label}</strong>
                  {note.value}
                </span>
              ))}
            </div>
          </div>
          <div className="tool-hub__drop">
            <div className="tool-hub__drop-head">
              <span><UploadCloud aria-hidden="true" /></span>
              <div>
                <strong>Start editing</strong>
                <small>Drag a PDF here or choose a local file.</small>
              </div>
            </div>
            <div className="tool-hub__actions">
              <Button variant="primary" disabled={isBusy} onClick={() => inputRef.current?.click()}>
                <FolderOpen aria-hidden="true" />
                Choose File
              </Button>
              <Button variant="tonal" disabled={isBusy} onClick={() => void onBlank()}>
                <Plus aria-hidden="true" />
                Blank PDF
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              onChange={(event) => void acceptFile(event.currentTarget.files?.[0])}
            />
            <div className="planned-imports" aria-label="Planned import sources">
              {plannedImports.map((source) => (
                <button key={source} disabled title={`${source} import is planned after local-first v1`}>
                  <Cloud aria-hidden="true" />
                  {source}
                </button>
              ))}
            </div>
            <span className="tool-hub__fineprint"><LockKeyhole aria-hidden="true" /> Password prompts and recent sessions stay in this browser.</span>
            {recentSessions.length ? (
              <div className="tool-hub__recent" aria-label="Recent local sessions">
                <div className="tool-hub__recent-head">
                  <strong>Recent local session</strong>
                  <button
                    type="button"
                    disabled={isBusy}
                    title="Clear all recent local sessions"
                    onClick={() => void onClearSessions()}
                  >
                    Clear all
                  </button>
                </div>
                {recentSessions.slice(0, 3).map((session) => (
                  <div className="tool-hub__recent-row" key={session.id}>
                    <button disabled={isBusy} onClick={() => void onResume(session.id)}>
                      <span>{session.name}</span>
                      <small>{session.operationCount} edits · {formatRecentTime(session.updatedAt)}</small>
                    </button>
                    <button
                      type="button"
                      className="tool-hub__recent-delete"
                      disabled={isBusy}
                      title={`Remove ${session.name} from browser storage`}
                      aria-label={`Remove ${session.name}`}
                      onClick={() => void onDeleteSession(session.id)}
                    >
                      <Trash2 aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <section className="tool-hub__workflow" aria-label="How the editor works">
            <div className="workflow-head">
              <span>Editor flow</span>
              <h2>Import. Edit. Apply. Export.</h2>
              <p>
                A familiar PDF editor path, tuned for local files and precise overlay changes that
                preserve the document's look.
              </p>
            </div>
            <div className="workflow-steps">
              {workflowSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <article className="workflow-step" key={step.title}>
                    <div className="workflow-step__top">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <Icon aria-hidden="true" />
                    </div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </article>
                );
              })}
            </div>
            <div className="workflow-proof" aria-label="Editor capabilities">
              {landingProof.map((item) => (
                <span key={item}>
                  <ShieldCheck aria-hidden="true" />
                  {item}
                </span>
              ))}
            </div>
          </section>
        </section>

        <section id="tools" className="tool-hub__tools" aria-label="PDF tool directory">
          <div className="tool-hub__section-head">
            <h2>Choose one of the PDF tools</h2>
            <p>Active tools open the editor workbench; the rest are visible as the local suite grows.</p>
          </div>
          <div className="tool-grid">
            {popularTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.title}
                  className="tool-card"
                  disabled={!tool.active || isBusy}
                  onClick={() => tool.active && inputRef.current?.click()}
                >
                  <Icon aria-hidden="true" />
                  <span>{tool.title}</span>
                  <small>{tool.description}</small>
                  {!tool.active ? <em>Planned</em> : null}
                </button>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
