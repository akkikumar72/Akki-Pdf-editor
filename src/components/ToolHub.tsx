import { useEffect, useRef, useState } from "react";
import { AkkiPdfLogoLink } from "./AkkiPdfLogo";
import {
  LumenArrowLeftIcon,
  LumenArrowRightIcon,
  LumenBrainIcon,
  LumenBranchIcon,
  LumenCloudIcon,
  LumenDocumentEditIcon,
  LumenMagicIcon,
  LumenSearchIcon,
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

const navLinks = [
  ["Features", "features"],
  ["Use cases", "use-cases"],
  ["Online PDF", "editor"],
  ["Local mode", "compare"],
  ["FAQ", "faq"],
];

const quickActions = [
  { title: "Edit", Icon: LumenDocumentEditIcon },
  { title: "Annotate", Icon: LumenMagicIcon },
  { title: "Sign", Icon: LumenBranchIcon },
  { title: "Organize", Icon: LumenSearchIcon },
  { title: "Export", Icon: LumenUploadIcon },
  { title: "More", Icon: LumenBrainIcon },
];

const proofPoints = [
  { title: "Powered by", description: "Browser-native PDF editing", Icon: LumenDocumentEditIcon },
  { title: "Privacy model", description: "Local by default", Icon: LumenShieldNetworkIcon },
  { title: "Available on", description: "Web now", Icon: LumenCloudIcon },
  { title: "Runs in", description: "Your browser", Icon: LumenUploadIcon },
];

const featureCards = [
  {
    title: "Edit PDF",
    description: "Update text, links, images, and page-level content directly on the document canvas.",
    bullets: ["Change visible page content", "Move and resize overlays", "Undo-friendly edit model"],
    Icon: LumenDocumentEditIcon,
    image: "/landing/akki-pdf-feature-stack.png",
    imageAlt: "AkkiPDF editor interface with page thumbnails, annotation tools, a signature box, and local file status",
  },
  {
    title: "Annotate PDF",
    description: "Highlight important passages, draw attention to a section, and keep review notes beside the source.",
    bullets: ["Highlight and freehand marks", "Comments and callouts", "Review-ready exports"],
    Icon: LumenMagicIcon,
  },
  {
    title: "Sign & Fill",
    description: "Place signatures, checkboxes, dates, and clean form answers without leaving the page.",
    bullets: ["Signature studio", "Checkboxes and text fields", "Date stamps"],
    Icon: LumenBranchIcon,
  },
  {
    title: "Extract & Export",
    description: "Turn document content into a finished PDF or pull text and tables into reusable files.",
    bullets: ["PDF export", "TXT extraction", "CSV and XLSX tables"],
    Icon: LumenSearchIcon,
  },
];

const audienceSlides = [
  {
    title: "Students & educators",
    description: "Mark up readings, keep notes attached to the source, and export clean study copies.",
    Icon: LumenMagicIcon,
    image: "/landing/akki-carousel-educators.png",
    imageAlt: "Two educators reviewing research notes on a laptop in a study room",
    widgets: ["Highlight notes", "Export study copy"],
  },
  {
    title: "Operators",
    description: "Fill forms, review invoices, extract tables, and keep repeat document work in one tab.",
    Icon: LumenSearchIcon,
    image: "/landing/akki-carousel-operators.png",
    imageAlt: "Professional reviewing reports and PDF tables beside a laptop",
    widgets: ["Extract tables", "Review invoice"],
  },
  {
    title: "Founders & freelancers",
    description: "Sign agreements, fix small PDF issues, and send a polished copy without buying a heavy suite.",
    Icon: LumenBranchIcon,
    image: "/landing/akki-carousel-founders.png",
    imageAlt: "Freelancer signing a document with a tablet and laptop on a studio desk",
    widgets: ["Place signature", "Send clean PDF"],
  },
  {
    title: "Privacy-sensitive work",
    description: "Open documents in the local browser session when uploading to a random server is not acceptable.",
    Icon: LumenShieldNetworkIcon,
    image: "/landing/akki-carousel-privacy.png",
    imageAlt: "Professional working with local documents in a private office setup",
    widgets: ["Local session", "No upload queue"],
  },
];

const standoutCards = [
  {
    title: "Local-first editing",
    description: "Open PDFs in your browser, make changes locally, and export only when you are ready.",
    Icon: LumenShieldNetworkIcon,
  },
  {
    title: "Browser-based workflow",
    description: "Use AkkiPDF in your browser, keep work local to the session, and export only when you are ready.",
    Icon: LumenCloudIcon,
  },
  {
    title: "Edit, sign, export",
    description: "Place text, images, signatures, and checkboxes, then export PDF, TXT, CSV, or XLSX.",
    Icon: LumenDocumentEditIcon,
  },
  {
    title: "Find and reuse content",
    description: "Search long files, pull out useful text, and turn PDF tables into workable data files.",
    Icon: LumenSearchIcon,
  },
];

const browserWorkflowRows = [
  ["PDF editing", "Overlay-based editor", "Update content without uploading the source file"],
  ["Annotations and signatures", "Highlights, notes, fields, and signatures", "Finish common PDF tasks in one tab"],
  ["TXT / CSV / XLSX export", "Readable text and table extraction", "Reuse document content in local files"],
  ["Recent sessions", "Saved in this browser", "Pick up work without creating an account"],
  ["Privacy model", "Client-side by default", "Export only when the document is ready"],
];

const faqItems = [
  {
    question: "Is AkkiPDF a cloud PDF editor?",
    answer: "No. The current product is local-first and client-side. PDFs open in the browser session, and changes are written when you export.",
  },
  {
    question: "What can I edit today?",
    answer: "You can edit visible PDF content through overlays, annotate, add images, sign, fill forms, manage local sessions, and export finished files.",
  },
  {
    question: "Do I need to install anything?",
    answer: "No. AkkiPDF currently runs in your browser. Open a PDF, edit locally, and export the finished file when you are ready.",
  },
];

const footerProduct = ["Open PDF", "Blank PDF", "Features", "FAQ"];
const footerWorkflow = ["Edit PDFs", "Annotate PDFs", "Sign forms", "Export data"];

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
  const audienceCarouselRef = useRef<HTMLDivElement>(null);
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

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  const scrollAudienceCarousel = (direction: -1 | 1) => {
    const carousel = audienceCarouselRef.current;
    if (!carousel) return;
    carousel.scrollBy({ left: direction * carousel.clientWidth * 0.82, behavior: "smooth" });
  };

  return (
    <div className={`tool-hub lumen pdf-landing ${isDragging ? "is-dragging" : ""}`}>
      <header className="lumen-nav" id="lumen-nav" ref={navRef}>
        <nav className="lumen-nav__inner" aria-label="PDF editor">
          <AkkiPdfLogoLink className="lumen-wordmark" href="#editor" aria-label="AkkiPDF home" />
          <div className="lumen-nav__links" aria-label="Landing sections">
            {navLinks.map(([label, id]) => (
              <button className="lumen-nav__link" key={label} type="button" onClick={() => scrollToSection(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="lumen-nav__actions">
            <button className="lumen-nav__secondary" type="button" onClick={() => scrollToSection("compare")}>
              Local browser
            </button>
            <button className="lumen-nav__cta" type="button" disabled={isBusy} onClick={() => inputRef.current?.click()}>
              Open PDF
              <LumenUploadIcon aria-hidden="true" />
            </button>
          </div>
        </nav>
      </header>

      <main className="lumen-main">
        <section
          id="editor"
          className="lumen-hero akki-hero"
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
          <div className="akki-hero__inner">
            <div className="akki-hero__brand">
              <div className="akki-hero__title">
                <span className="akki-hero__mark" aria-hidden="true">
                  <LumenDocumentEditIcon />
                </span>
                <h1>AkkiPDF</h1>
              </div>
              <p>Your local PDF workspace for editing, signing, and exporting.</p>
            </div>

            <div className="akki-upload-shell" aria-label="Local PDF import">
              <button
                className="akki-upload-drop"
                type="button"
                disabled={isBusy}
                onClick={() => inputRef.current?.click()}
              >
                <span className="akki-upload-drop__art" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <strong><LumenUploadIcon aria-hidden="true" /> Click or drag a PDF here</strong>
                <small>Support: PDF | Local browser session | No account required</small>
              </button>

              <div className="akki-upload-actions">
                <div className="akki-upload-actions__left">
                  <button
                    className="akki-upload-icon-button"
                    type="button"
                    aria-label="Choose PDF"
                    disabled={isBusy}
                    onClick={() => inputRef.current?.click()}
                  >
                    <LumenUploadIcon aria-hidden="true" />
                  </button>
                  <Button variant="tonal" disabled={isBusy} onClick={() => void onBlank()}>
                    Blank PDF
                  </Button>
                </div>
                <span className="akki-local-mode-pill"><LumenShieldNetworkIcon aria-hidden="true" /> Local Mode</span>
              </div>

              <input
                className="pdf-file-input"
                ref={inputRef}
                type="file"
                accept="application/pdf"
                onChange={(event) => void acceptFile(event.currentTarget.files?.[0])}
              />
            </div>

            {status ? (
              <p className="akki-hero__status" role="status" aria-live="polite">{status}</p>
            ) : null}

            <div className="akki-action-chips" aria-label="Popular PDF actions">
              {quickActions.map(({ title, Icon }) => (
                <button
                  key={title}
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    if (title === "Edit" || title === "Annotate" || title === "Sign") {
                      inputRef.current?.click();
                    }
                  }}
                >
                  <Icon aria-hidden="true" />
                  {title}
                </button>
              ))}
            </div>

            <div className="akki-proof-strip" aria-label="Product promises">
              {proofPoints.map(({ title, description, Icon }) => (
                <div key={title}>
                  <Icon aria-hidden="true" />
                  <span>{title}</span>
                  <strong>{description}</strong>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="akki-features" id="features" aria-label="AkkiPDF feature highlights">
          <div className="akki-section-inner">
            <header className="akki-section-head">
              <h2>Features of AkkiPDF</h2>
            </header>

            <div className="akki-feature-grid">
              {featureCards.map((feature, index) => (
                <article className={`akki-feature-card ${index === 0 ? "is-wide" : ""}`} key={feature.title}>
                  <div className="akki-feature-card__copy">
                    <h3><feature.Icon aria-hidden="true" /> {feature.title}</h3>
                    <p>{feature.description}</p>
                    <ul>
                      {feature.bullets.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </div>
                  {feature.image ? (
                    <div className="akki-feature-visual akki-feature-visual--image">
                      <img src={feature.image} alt={feature.imageAlt} width="1536" height="1024" loading={index === 0 ? "eager" : "lazy"} />
                    </div>
                  ) : (
                    <div className="akki-feature-visual" aria-hidden="true">
                      <span />
                      <span />
                      <span />
                    </div>
                  )}
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="akki-audience" id="use-cases" aria-label="AkkiPDF use cases">
          <div className="akki-section-inner">
            <header className="akki-section-head">
              <h2>Who needs AkkiPDF</h2>
            </header>

            <div className="akki-audience-carousel" ref={audienceCarouselRef} aria-label="AkkiPDF workflows">
              <div className="akki-audience-track">
                {audienceSlides.map(({ title, description, Icon, image, imageAlt, widgets }) => (
                  <article className="akki-audience-slide" key={title}>
                    <img src={image} alt={imageAlt} width="1672" height="941" loading="lazy" />
                    <div className="akki-audience-slide__shade" aria-hidden="true" />
                    <div className="akki-audience-slide__copy">
                      <h3><Icon aria-hidden="true" /> {title}</h3>
                      <p>{description}</p>
                    </div>
                    <div className="akki-audience-slide__widgets" aria-hidden="true">
                      {widgets.map((widget) => (
                        <span key={widget}>{widget}</span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="akki-audience-note">
              <span>Watch the carousel move through local PDF workflows</span>
              <div className="akki-audience-controls" aria-label="Carousel controls">
                <button type="button" aria-label="Show previous workflow" onClick={() => scrollAudienceCarousel(-1)}>
                  <LumenArrowLeftIcon aria-hidden="true" />
                </button>
                <button type="button" aria-label="Show next workflow" onClick={() => scrollAudienceCarousel(1)}>
                  <LumenArrowRightIcon aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="akki-standout" aria-label="What makes AkkiPDF stand out">
          <div className="akki-section-inner">
            <header className="akki-section-head">
              <h2>What makes AkkiPDF stand out</h2>
            </header>

            <div className="akki-standout-grid">
              {standoutCards.map(({ title, description, Icon }) => (
                <article className="akki-standout-card" key={title}>
                  <div className="akki-standout-card__copy">
                    <span className="akki-standout-card__icon"><Icon aria-hidden="true" /></span>
                    <h3>{title}</h3>
                    <p>{description}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="akki-compare" id="compare" aria-label="Local browser workflow">
          <div className="akki-section-inner">
            <header className="akki-section-head">
              <h2>Built for local browser editing</h2>
            </header>
            <div className="akki-compare-table">
              <div className="akki-compare-table__head">
                <span>Workflow</span>
                <span>AkkiPDF</span>
                <span>Why it matters</span>
              </div>
              {browserWorkflowRows.map(([workflow, akki, why]) => (
                <div className="akki-compare-table__row" key={workflow}>
                  <span>{workflow}</span>
                  <strong>{akki}</strong>
                  <span>{why}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {recentSessions.length ? (
          <section className="akki-recent-section" aria-label="Recent local sessions">
            <div className="akki-section-inner">
              <header className="akki-section-head">
                <h2>Recent local sessions</h2>
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
                        <small>{session.operationCount} edits | {formatRecentTime(session.updatedAt)}</small>
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

        <section className="akki-faq" id="faq" aria-label="AkkiPDF FAQ">
          <div className="akki-section-inner">
            <header className="akki-section-head">
              <h2>Questions before you open a PDF</h2>
            </header>
            <div className="akki-faq-grid">
              {faqItems.map(({ question, answer }) => (
                <article key={question}>
                  <h3>{question}</h3>
                  <p>{answer}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="akki-closing" aria-label="Start editing locally">
          <div className="akki-section-inner">
            <h2>Start with one PDF.</h2>
            <p>Pick a file, make the small edit, and export a clean copy. No account, no upload queue, no document leaving your browser.</p>
            <div className="pdf-landing__closing-actions">
              <Button variant="primary" disabled={isBusy} onClick={() => inputRef.current?.click()}>
                Start editing
              </Button>
              <Button variant="quiet" disabled={isBusy} onClick={() => void onBlank()}>
                Blank PDF
              </Button>
            </div>
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
                  onClick={() => {
                    if (item === "Blank PDF") {
                      void onBlank();
                    } else {
                      scrollToSection(item === "FAQ" ? "faq" : item === "Features" ? "features" : "editor");
                    }
                  }}
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
              <span>PDF | TXT | CSV | XLSX</span>
              <span><LumenShieldNetworkIcon aria-hidden="true" /> Local unless you export</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
