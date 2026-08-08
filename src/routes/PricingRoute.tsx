import { AkkiPdfLogoLink } from "../components/AkkiPdfLogo";
import { LegalNotice } from "../components/LegalNotice";
import { parsePolarCheckoutUrl, SOURCE_VERSION_URL, SUPPORTER_CHECKOUT_ENV } from "../config/pricing";
import "../styles/pricing.css";

const freeFeatures = [
  "Unlimited local PDF editing",
  "Text, signatures, forms, images, and redaction",
  "Local sessions in this browser",
  "PDF, TXT, CSV, and XLSX exports",
];

const supporterFeatures = [
  "Funds the open-source editor",
  "One-time, pay-what-you-want contribution",
  "Same private local editor as Community",
  "No subscription or feature lock-in",
];

const proFeatures = [
  "Hosted AI and OCR credits",
  "Ask a PDF with page citations",
  "Saved extraction templates",
  "Polar-managed subscription and billing",
];

function FeatureList({ items }: { items: readonly string[] }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item}>
          <span aria-hidden="true">✓</span>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function PricingRoute() {
  const supporterCheckoutUrl = parsePolarCheckoutUrl(import.meta.env.VITE_POLAR_SUPPORTER_CHECKOUT_URL);

  return (
    <div className="pricing-page">
      <header className="pricing-nav">
        <AkkiPdfLogoLink className="pricing-wordmark" href="/" aria-label="AkkiPDF home" />
        <nav aria-label="Pricing navigation">
          <a href={SOURCE_VERSION_URL} rel="noreferrer" target="_blank">
            Source code
          </a>
          <a className="pricing-nav__cta" href="/">
            Open editor
          </a>
        </nav>
      </header>

      <main>
        <section className="pricing-hero" aria-labelledby="pricing-title">
          <p className="pricing-kicker">Open source first. Paid convenience later.</p>
          <h1 id="pricing-title">The editor stays free.</h1>
          <p>
            Pay only to support development today. Pro will launch after its hosted AI features and licence activation
            are ready to verify.
          </p>

          <div className="pricing-boundary" aria-label="Local and optional paid boundary">
            <article>
              <span>Always local</span>
              <strong>Your PDF and every core editing tool</strong>
              <small>$0 · no account · no upload</small>
            </article>
            <div aria-hidden="true">
              <span>Only when you choose</span>
            </div>
            <article>
              <span>Optional payment</span>
              <strong>Supporter checkout hosted by Polar</strong>
              <small>Taxes and receipts handled at checkout</small>
            </article>
          </div>
        </section>

        <section className="pricing-plans" aria-labelledby="plans-title">
          <div className="pricing-section-heading">
            <p className="pricing-kicker">Rollout 01</p>
            <h2 id="plans-title">Choose what is useful now.</h2>
          </div>

          <div className="pricing-grid">
            <article className="pricing-card">
              <span className="pricing-card__status">Available now</span>
              <h3>Community</h3>
              <p>Everything needed to edit and export a PDF privately.</p>
              <div className="pricing-card__price">
                <strong>$0</strong>
                <span>forever</span>
              </div>
              <a className="pricing-cta pricing-cta--secondary" href="/">
                Open the editor
              </a>
              <FeatureList items={freeFeatures} />
            </article>

            <article className="pricing-card pricing-card--supporter">
              <span className="pricing-card__status">Founding supporter</span>
              <h3>Supporter</h3>
              <p>Fund careful, local-first development without buying unfinished features.</p>
              <div className="pricing-card__price">
                <strong>Choose</strong>
                <span>one-time amount</span>
              </div>
              {supporterCheckoutUrl ? (
                <a className="pricing-cta" href={supporterCheckoutUrl}>
                  Continue to Polar
                </a>
              ) : (
                <button className="pricing-cta" type="button" disabled title={`Set ${SUPPORTER_CHECKOUT_ENV}`}>
                  Polar checkout opening soon
                </button>
              )}
              <FeatureList items={supporterFeatures} />
              <small className="pricing-card__fine-print">A contribution does not unlock Pro features.</small>
            </article>

            <article className="pricing-card pricing-card--future">
              <span className="pricing-card__status">Coming after AI beta</span>
              <h3>Pro</h3>
              <p>Hosted document intelligence for people who prefer managed AI.</p>
              <div className="pricing-card__price">
                <strong>$59</strong>
                <span>per year · planned</span>
              </div>
              <button className="pricing-cta pricing-cta--secondary" type="button" disabled>
                Not for sale yet
              </button>
              <FeatureList items={proFeatures} />
            </article>
          </div>
        </section>

        <section className="pricing-promise" aria-labelledby="pricing-promise-title">
          <div>
            <p className="pricing-kicker">The boundary</p>
            <h2 id="pricing-promise-title">Local work is not a teaser.</h2>
          </div>
          <dl>
            <div>
              <dt>Free means complete</dt>
              <dd>Core editing and export stay available without an account or payment.</dd>
            </div>
            <div>
              <dt>AI is explicit</dt>
              <dd>No document will be sent to an AI provider unless the user starts that workflow.</dd>
            </div>
            <div>
              <dt>Open source is real</dt>
              <dd>The Community edition is available under AGPL-3.0-only, including the production source.</dd>
            </div>
          </dl>
          <p className="pricing-promise__licence-note">
            Supporter payments and future Pro subscriptions do not purchase alternative source-code terms. A commercial
            source licence requires a separate written agreement.
          </p>
        </section>
      </main>

      <footer className="pricing-footer">
        <LegalNotice />
      </footer>
    </div>
  );
}
