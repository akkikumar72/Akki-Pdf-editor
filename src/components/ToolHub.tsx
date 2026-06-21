import { useEffect, useRef, useState } from "react";
import { AuroraBackground } from "./AuroraBackground";
import { AkkiPdfLogoLink } from "./AkkiPdfLogo";
import {
  LumenCloudIcon,
  LumenShieldNetworkIcon,
  LumenTrashIcon,
  LumenUploadIcon,
} from "./LumenIcons";
import type { SessionSummary } from "../utils/storage";
import { Button } from "./ui/button";

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

const trustPoints = [
  ["Private by default", "Your file stays in this browser."],
  ["Edit in context", "Text, signatures, images, and markup."],
  ["Export cleanly", "PDF, TXT, CSV, and XLSX."],
];

const footerProduct = ["PDF editor", "Local sessions", "Blank PDF"];
const footerWorkflow = ["Annotate", "Sign", "Export"];

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
  status,
  recentSessions,
  onBlank,
  onClearSessions,
  onDeleteSession,
  onOpen,
  onResume,
}: ToolHubProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const nav = navRef.current;
    /* v8 ignore next -- navRef is attached to an unconditionally-rendered element, so the null guard is unreachable */
    if (!nav) return;

    let ticking = false;
    const onScroll = () => {
      nav.classList.toggle("is-floating", window.scrollY > 24);
      ticking = false;
    };

    const handleScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(onScroll);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    onScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const acceptFile = async (file?: File) => {
    if (!file) return;
    await onOpen(file);
  };

  return (
    <div className={`tool-hub lumen pdf-landing ${isDragging ? "is-dragging" : ""}`}>
      <header className="lumen-nav" id="lumen-nav" ref={navRef}>
        <nav className="lumen-nav__inner" aria-label="PDF editor">
          <AkkiPdfLogoLink className="lumen-wordmark" href="#editor" aria-label="AkkiPDF home" />
          <button className="lumen-nav__cta" type="button" onClick={() => inputRef.current?.click()}>
            Choose file
            <LumenUploadIcon aria-hidden="true" />
          </button>
        </nav>
      </header>

      <main className="lumen-main">
        <section
          id="editor"
          className="lumen-hero"
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
          <AuroraBackground
            colorStops={["var(--color-accent-soft)", "var(--color-sky)", "var(--color-paper-3)"]}
            speed={28}
            amplitude={0.72}
            blend={0.52}
          />

          <div className="pdf-landing__content">
            <div className="pdf-landing__heading">
              <p className="pdf-landing__eyebrow">Local-first PDF workbench</p>
              <h1>Edit PDFs with a lighter touch.</h1>
              <p>Open a document, make small precise changes, sign, annotate, and export without sending the file away.</p>
              <div className="pdf-landing__actions">
                <Button variant="primary" disabled={isBusy} onClick={() => inputRef.current?.click()}>
                  Start editing
                </Button>
                <Button variant="tonal" disabled={isBusy} onClick={() => void onBlank()}>
                  Blank PDF -&gt;
                </Button>
              </div>
              <span className="pdf-landing__drop-copy">Drop a PDF anywhere on this section.</span>
              {status ? (
                <p className="pdf-landing__status" role="status" aria-live="polite">{status}</p>
              ) : null}
            </div>

            <div className="pdf-editor-preview" aria-label="PDF editor preview">
              <div className="pdf-editor-preview__toolbar">
                <span>Text</span>
                <span>Sign</span>
                <span>Annotate</span>
                <strong>118%</strong>
              </div>
              <div className="pdf-editor-preview__body">
                <aside className="pdf-editor-preview__pages" aria-hidden="true">
                  <span />
                  <span />
                </aside>
                <div className="pdf-editor-preview__page">
                  <div className="pdf-editor-preview__doc-lines" aria-hidden="true">
                    <strong />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="pdf-landing__dropzone">
                    <span className="pdf-landing__drop-icon"><LumenUploadIcon aria-hidden="true" /></span>
                    <strong>Bring in a PDF</strong>
                    <small>or create a blank one.</small>
                    <div className="pdf-landing__actions pdf-landing__actions--inside">
                      <Button variant="primary" disabled={isBusy} onClick={() => inputRef.current?.click()}>
                        Choose file
                      </Button>
                      <Button variant="tonal" disabled={isBusy} onClick={() => void onBlank()}>
                        Blank PDF
                      </Button>
                    </div>
                    <div className="pdf-landing__sources" aria-label="Planned import sources">
                      {plannedImports.map((source) => (
                        <button key={source} disabled title={`${source} import is planned after local-first v1`}>
                          <LumenCloudIcon aria-hidden="true" />
                          {source}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf"
                onChange={(event) => void acceptFile(event.currentTarget.files?.[0])}
              />
            </div>

            <div className="pdf-landing__trust" aria-label="Editor highlights">
              {trustPoints.map(([title, description]) => (
                <div key={title}>
                  <LumenShieldNetworkIcon aria-hidden="true" />
                  <strong>{title}</strong>
                  <span>{description}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {recentSessions.length ? (
          <section className="pdf-recent-section" aria-label="Recent local sessions">
            <div className="pdf-recent-section__inner">
              <header className="pdf-recent-section__head">
                <p><span aria-hidden="true" /> Local sessions</p>
                <h2>Pick up where you left off.</h2>
              </header>

              <div className="lumen-recent">
                <div className="lumen-recent__head">
                  <strong>{recentSessions.length} saved in this browser</strong>
                  <button
                    type="button"
                    disabled={isBusy}
                    title="Clear all recent local sessions"
                    onClick={() => void onClearSessions()}
                  >
                    Clear all
                  </button>
                </div>
                <div className="lumen-recent__grid">
                  {recentSessions.slice(0, 3).map((session) => (
                    <div className="lumen-recent__row" key={session.id}>
                      <button disabled={isBusy} onClick={() => void onResume(session.id)}>
                        <span>{session.name}</span>
                        <small>{session.operationCount} edits · {formatRecentTime(session.updatedAt)}</small>
                      </button>
                      <button
                        type="button"
                        className="lumen-recent__delete"
                        disabled={isBusy}
                        title={`Remove ${session.name} from browser storage`}
                        aria-label={`Remove ${session.name}`}
                        onClick={() => void onDeleteSession(session.id)}
                      >
                        <LumenTrashIcon aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="pdf-landing__closing" aria-label="Start editing locally">
          <div>
            <h2>Start with one PDF.</h2>
            <p>
              Pick a file, make the small edit, and export a clean copy. No account, no upload queue, no document leaving your browser.
            </p>
            <div className="pdf-landing__closing-actions">
              <Button variant="primary" disabled={isBusy} onClick={() => inputRef.current?.click()}>
                Start editing -&gt;
              </Button>
              <Button variant="quiet" disabled={isBusy} onClick={() => void onBlank()}>
                Blank PDF
              </Button>
            </div>
            <small>Private by default · local sessions · export-ready</small>
          </div>
        </section>
      </main>

      <footer className="pdf-footer">
        <div className="pdf-footer__inner">
          <p className="pdf-footer__statement">Files stay close.</p>

          <div className="pdf-footer__meta">
            <AkkiPdfLogoLink className="pdf-footer__brand" href="#editor" aria-label="AkkiPDF home" />

            <p className="pdf-footer__col">
              <span>Local workbench</span>
              <span>Browser only</span>
              <span>No upload by default</span>
            </p>

            <nav className="pdf-footer__col" aria-label="Product">
              {footerProduct.map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={isBusy}
                  onClick={() => item === "Blank PDF" ? void onBlank() : document.getElementById("editor")?.scrollIntoView({ behavior: "smooth" })}
                >
                  {item}
                </button>
              ))}
              {footerWorkflow.map((item) => (
                <a key={item} href="#editor">{item}</a>
              ))}
            </nav>

            <p className="pdf-footer__col pdf-footer__copy">
              <span>© 2026 AkkiPDF</span>
              <span>PDF · TXT · CSV · XLSX</span>
              <span><LumenShieldNetworkIcon aria-hidden="true" /> Local unless you export</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
