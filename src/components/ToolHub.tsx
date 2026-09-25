import { useRef, useState } from "react";
import { AkkivoLogoLink } from "./AkkivoLogo";
import type { SessionSummary } from "../utils/storage";
import { MAX_PDF_BYTES } from "../utils/fileValidation";
import { LegalNotice } from "./LegalNotice";
import { WorkbenchIcon } from "./WorkbenchIcon";

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
  const [search, setSearch] = useState("");
  const [section, setSection] = useState<"workspace" | "recent">("workspace");
  const sessions = recentSessions.filter((session) => session.name.toLowerCase().includes(search.toLowerCase()));
  const openPicker = () => inputRef.current?.click();
  const acceptFile = async (file?: File) => {
    if (!file || isBusy) return;
    await onOpen(file);
  };

  return (
    <div className={`studio-home${isDragging ? " is-dragging" : ""}`}>
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <header className="studio-home__header">
        <AkkivoLogoLink href="/" aria-label="Akkivo home" />
        <span className="studio-header-label">PDF studio</span>
        <span className="studio-local-label">
          <span className="studio-local-dot" />
          Your files. Your device.
        </span>
        <button className="studio-primary-button" disabled={isBusy} onClick={openPicker}>
          <WorkbenchIcon name="plus" />
          Open a PDF
        </button>
      </header>
      <aside className="studio-home__sidebar">
        <div className="studio-home__workspace-name">
          <span className="studio-home__workspace-mark">A</span>
          <div>
            <strong>Personal workspace</strong>
            <small>Saved in this browser</small>
          </div>
        </div>
        <span className="studio-eyebrow">Workspace</span>
        <nav aria-label="Home navigation">
          <button aria-current={section === "workspace" ? "page" : undefined} onClick={() => setSection("workspace")}>
            <WorkbenchIcon name="squares-four" />
            Overview
          </button>
          <button aria-current={section === "recent" ? "page" : undefined} onClick={() => setSection("recent")}>
            <WorkbenchIcon name="clock-counter-clockwise" />
            Recent documents<span>{recentSessions.length}</span>
          </button>
          <button disabled={isBusy} onClick={() => void onBlank()}>
            <WorkbenchIcon name="plus" />
            Blank PDF
          </button>
        </nav>
        <div className="studio-home__privacy">
          <WorkbenchIcon name="shield-check" />
          <strong>A private place to work.</strong>
          <p>Your documents stay on this device. No account, no uploads, just your work.</p>
          <span>
            Local by design
            <WorkbenchIcon name="arrow-up-right" />
          </span>
        </div>
        <a className="studio-home__support" href="/pricing">
          <WorkbenchIcon name="question" />
          Support Akkivo
          <WorkbenchIcon name="arrow-up-right" />
        </a>
      </aside>
      <main className="studio-home__main" id="workspace">
        <div className="studio-home__breadcrumb">
          Workspace<span>/</span>
          {section === "workspace" ? "Overview" : "Recent documents"}
        </div>
        <div className="studio-home__intro">
          <div>
            <h1>{section === "workspace" ? "Your document desk." : "Pick up where you left off."}</h1>
            <p>
              {section === "workspace"
                ? "Edit, sign, and organize PDFs in your browser."
                : "Your PDFs and edits, saved locally in this browser."}
            </p>
          </div>
          <span className="studio-home__edition">LOCAL EDITION / PDF STUDIO</span>
        </div>
        {section === "workspace" && (
          <>
            <section
              className="studio-import"
              aria-label="Import PDF"
              aria-busy={isBusy}
              onDragOver={(event) => {
                event.preventDefault();
                if (!isBusy) setIsDragging(true);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                void acceptFile(event.dataTransfer.files[0]);
              }}
            >
              <div className="studio-import__copy">
                <h2>
                  Paperwork,
                  <br />
                  with a <em>lighter touch.</em>
                </h2>
                <p>
                  Edit a line, leave a note, add your signature.
                  <br />
                  Your document stays yours, from first edit to export.
                </p>
                <div>
                  <button className="studio-primary-button" disabled={isBusy} onClick={openPicker}>
                    <WorkbenchIcon name="folder-open" />
                    {isBusy ? "Opening document…" : "Choose file"}
                    <WorkbenchIcon name="arrow-up-right" />
                  </button>
                  <span>or drop a PDF here</span>
                </div>
                <small>PDF files up to {MAX_PDF_BYTES / (1024 * 1024)} MB · processed on your device</small>
              </div>
              <div className="studio-paper-scene" aria-hidden="true">
                <div className="studio-paper-scene__sheet">
                  <div className="studio-paper-scene__top">
                    <span>A</span>
                    <small>
                      AKKIVO
                      <br />
                      DOCUMENT STUDIO
                    </small>
                  </div>
                  <div className="studio-paper-scene__title">
                    A note worth
                    <br />
                    getting right.
                  </div>
                  <div className="studio-paper-scene__line" />
                  <div className="studio-paper-scene__line" />
                  <div className="studio-paper-scene__line short" />
                  <div className="studio-paper-scene__signature">
                    <s>First draft.</s>
                    <br />
                    Made yours.
                  </div>
                  <div className="studio-paper-scene__footer">
                    <span>EDIT / SIGN / EXPORT</span>
                    <WorkbenchIcon name="check" />
                  </div>
                </div>
                <span className="studio-paper-scene__caption">A little revision goes a long way.</span>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                aria-label="Choose PDF file"
                className="visually-hidden"
                disabled={isBusy}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  void acceptFile(file);
                }}
              />
            </section>
            <div className="studio-home__capabilities" aria-label="Editor capabilities">
              <div>
                <WorkbenchIcon name="pencil-line" />
                <span>
                  <strong>Edit & annotate</strong>
                  <small>Make every detail count</small>
                </span>
              </div>
              <div>
                <WorkbenchIcon name="signature" />
                <span>
                  <strong>Sign & fill</strong>
                  <small>Finish the formalities</small>
                </span>
              </div>
              <div>
                <WorkbenchIcon name="files" />
                <span>
                  <strong>Organize pages</strong>
                  <small>Put things in their place</small>
                </span>
              </div>
              <div>
                <WorkbenchIcon name="download-simple" />
                <span>
                  <strong>Export your way</strong>
                  <small>PDF, text, CSV, or Excel</small>
                </span>
              </div>
            </div>
          </>
        )}
        {section === "recent" && (
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Choose PDF file"
            disabled={isBusy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              void acceptFile(file);
            }}
          />
        )}
        {status && status !== "Drop a PDF to start. Files stay in this browser." && (
          <p className="studio-home__status" role="status" aria-live="polite">
            {status}
          </p>
        )}
        <section className="studio-recents" aria-label="Recent local sessions">
          <header>
            <div>
              <h2>
                Recent documents <span>{recentSessions.length}</span>
              </h2>
              <p>Right where you left them.</p>
            </div>
            {recentSessions.length > 0 && (
              <label className="workspace-search">
                <WorkbenchIcon name="magnifying-glass" />
                <input
                  placeholder="Find a document…"
                  aria-label="Find a recent document"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            )}
          </header>
          {sessions.length > 0 ? (
            <>
              <div className="studio-recents__labels">
                <span>Document name</span>
                <span>Last opened</span>
                <span>Edits</span>
                <span />
              </div>
              <div className="studio-recents__list">
                {sessions.map((session) => (
                  <div className="studio-recents__row" key={session.id}>
                    <button
                      className="studio-recents__open"
                      disabled={isBusy}
                      onClick={() => void onResume(session.id)}
                    >
                      <span className="studio-recents__file">
                        <WorkbenchIcon name="files" />
                      </span>
                      <strong>{session.name}</strong>
                      <span>PDF document</span>
                    </button>
                    <time dateTime={new Date(session.updatedAt).toISOString()}>
                      {new Date(session.updatedAt).toLocaleDateString([], {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </time>
                    <span>{session.operationCount} edits</span>
                    <button
                      className="studio-icon-button"
                      disabled={isBusy}
                      aria-label={`Remove ${session.name}`}
                      title="Remove from browser storage"
                      onClick={() => void onDeleteSession(session.id)}
                    >
                      <WorkbenchIcon name="x" />
                    </button>
                  </div>
                ))}
              </div>
              <button className="studio-recents__clear" disabled={isBusy} onClick={() => void onClearSessions()}>
                Clear local history
              </button>
            </>
          ) : (
            <div className="studio-recents__empty">
              <span>
                <WorkbenchIcon name="folder-open" />
              </span>
              <div>
                <strong>{search ? "No documents match your search." : "Your next project belongs here."}</strong>
                <p>
                  {search
                    ? "Try a different document name."
                    : "Open a PDF or start with a blank page. We’ll keep your recent work here."}
                </p>
              </div>
              {!search && (
                <button disabled={isBusy} onClick={() => void onBlank()}>
                  Create a blank PDF
                  <WorkbenchIcon name="arrow-up-right" />
                </button>
              )}
            </div>
          )}
        </section>
        <footer className="studio-home__footer">
          <span>Thoughtfully simple. Always local.</span>
          <details>
            <summary>Privacy & legal</summary>
            <p>
              Document content is processed locally and saved in this browser. Clearing browser storage removes saved
              sessions. The app loads interface fonts from Google Fonts.
            </p>
            <LegalNotice />
          </details>
          <a href="/pricing">
            Support this project
            <WorkbenchIcon name="arrow-up-right" />
          </a>
        </footer>
      </main>
    </div>
  );
}
