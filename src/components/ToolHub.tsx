import {
  Cloud,
  Crop,
  FileArchive,
  FileText,
  Files,
  FolderOpen,
  FormInput,
  Image,
  LockKeyhole,
  MousePointer2,
  Plus,
  Scissors,
  ShieldCheck,
  Signature,
  SplitSquareHorizontal,
  Table2,
  UploadCloud,
} from "lucide-react";
import { useRef, useState } from "react";

type ToolHubProps = {
  isBusy: boolean;
  onBlank: () => Promise<void>;
  onOpen: (file: File) => Promise<void>;
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

export function ToolHub({ isBusy, onBlank, onOpen }: ToolHubProps) {
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
          <div>
            <p className="tool-hub__eyebrow">Online-style PDF editor, local-first</p>
            <h1>We help with your PDF tasks.</h1>
            <p>
              Open a PDF, edit it in place with inline controls, sign it, add forms and annotations,
              then apply changes and export without uploading the file.
            </p>
          </div>
          <div className="tool-hub__drop">
            <UploadCloud aria-hidden="true" />
            <strong>Upload PDF file</strong>
            <div className="tool-hub__actions">
              <button className="button button--primary" disabled={isBusy} onClick={() => inputRef.current?.click()}>
                <FolderOpen aria-hidden="true" />
                Choose File
              </button>
              <button className="button" disabled={isBusy} onClick={() => void onBlank()}>
                <Plus aria-hidden="true" />
                Blank document
              </button>
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
          </div>
        </section>

        <section id="tools" className="tool-hub__tools" aria-label="PDF tool directory">
          <div className="tool-hub__section-head">
            <h2>Choose one of the PDF tools</h2>
            <p>V1 routes active tools into the editor workbench; planned processors stay visible but disabled.</p>
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
