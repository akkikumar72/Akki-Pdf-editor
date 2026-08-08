import { AkkiPdfLogoLink } from "../components/AkkiPdfLogo";
import { LegalNotice } from "../components/LegalNotice";
import "../styles/pricing.css";

export function PricingSuccessRoute() {
  return (
    <div className="pricing-page pricing-success">
      <header className="pricing-nav">
        <AkkiPdfLogoLink className="pricing-wordmark" href="/" aria-label="AkkiPDF home" />
      </header>
      <main>
        <section className="pricing-success__card" aria-labelledby="support-thanks-title">
          <span aria-hidden="true">✓</span>
          <p className="pricing-kicker">Returned from Polar</p>
          <h1 id="support-thanks-title">Thank you for supporting AkkiPDF.</h1>
          <p>Your Polar receipt is the confirmation of payment. The editor remains private, local, and ready to use.</p>
          <div>
            <a className="pricing-cta" href="/">
              Open the editor
            </a>
          </div>
        </section>
      </main>
      <footer className="pricing-footer">
        <LegalNotice />
      </footer>
    </div>
  );
}
