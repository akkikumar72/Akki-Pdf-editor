import { FolderOpen, LockKeyhole, ShieldCheck, UploadCloud } from "lucide-react";
import { useRef, useState } from "react";
import { AkkiPdfMark } from "./AkkiPdfLogo";

type ImporterProps = {
  isBusy: boolean;
  onOpen: (file: File) => Promise<void>;
};

export function Importer({ isBusy, onOpen }: ImporterProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const acceptFile = async (file?: File) => {
    if (!file || file.type !== "application/pdf") return;
    await onOpen(file);
  };

  return (
    <div
      className={`importer ${isDragging ? "is-dragging" : ""}`}
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
      <div className="importer__header">
        <div className="brand-lockup akki-logo">
          <AkkiPdfMark className="akki-logo__mark" aria-hidden="true" />
          <span className="akki-logo__wordmark">AkkiPDF</span>
        </div>
        <span className="privacy-note"><ShieldCheck aria-hidden="true" /> Local only</span>
      </div>

      <section className="drop-target" aria-label="Import PDF">
        <UploadCloud aria-hidden="true" className="drop-target__icon" />
        <h1>Edit the PDF in front of you.</h1>
        <p>
          Add text, whiteout, images, signatures, links, highlights, shapes, ink, and table regions.
          Export an edited PDF, text, spreadsheets, or a page image without uploading the file.
        </p>
        <div className="drop-target__actions">
          <button className="button button--primary" disabled={isBusy} onClick={() => inputRef.current?.click()}>
            <FolderOpen aria-hidden="true" />
            Open PDF
          </button>
          <span><LockKeyhole aria-hidden="true" /> Password prompts stay local</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          onChange={(event) => void acceptFile(event.currentTarget.files?.[0])}
        />
      </section>

      <div className="importer__proof" aria-label="Available tools">
        <span>Text</span>
        <span>Whiteout</span>
        <span>Sign</span>
        <span>Images</span>
        <span>Tables</span>
        <span>PDF/TXT/XLSX/PNG</span>
      </div>
    </div>
  );
}
