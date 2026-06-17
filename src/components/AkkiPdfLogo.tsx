import type { AnchorHTMLAttributes, ButtonHTMLAttributes, SVGProps } from "react";

type AkkiPdfMarkProps = SVGProps<SVGSVGElement>;

export function AkkiPdfMark({ className, ...props }: AkkiPdfMarkProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      <path
        fill="currentColor"
        d="M6 2.75h9.19L19 6.56V19.25A2.25 2.25 0 0 1 16.75 21.5H6A2.25 2.25 0 0 1 3.75 19.25V5.25A2.25 2.25 0 0 1 6 2.75Z"
        opacity=".45"
      />
      <path
        fill="currentColor"
        d="M15.25 2.75V7a1.25 1.25 0 0 0 1.25 1.25H19.5L15.25 2.75Z"
        opacity=".72"
      />
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M7.5 11.25a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5H8.25a.75.75 0 0 1-.75-.75m0 3a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5H8.25a.75.75 0 0 1-.75-.75"
        clipRule="evenodd"
      />
      <path
        fill="currentColor"
        d="M16.72 14.03l3.25 3.25-1.94 1.94-3.25-3.25 1.94-1.94m.98-1.03 1.03-1.03a1.1 1.1 0 0 1 1.56 0l.22.22a1.1 1.1 0 0 1 0 1.56l-1.03 1.03-2.01-2.01Z"
      />
    </svg>
  );
}

type AkkiPdfLogoProps = {
  showWordmark?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function AkkiPdfLogo({ showWordmark = true, className, type = "button", ...props }: AkkiPdfLogoProps) {
  return (
    <button type={type} className={["akki-logo", className].filter(Boolean).join(" ")} {...props}>
      <AkkiPdfMark className="akki-logo__mark" aria-hidden="true" />
      {showWordmark ? <span className="akki-logo__wordmark">AkkiPDF</span> : null}
    </button>
  );
}

type AkkiPdfLogoLinkProps = {
  showWordmark?: boolean;
} & AnchorHTMLAttributes<HTMLAnchorElement>;

export function AkkiPdfLogoLink({ showWordmark = true, className, ...props }: AkkiPdfLogoLinkProps) {
  return (
    <a className={["akki-logo", className].filter(Boolean).join(" ")} {...props}>
      <AkkiPdfMark className="akki-logo__mark" aria-hidden="true" />
      {showWordmark ? <span className="akki-logo__wordmark">AkkiPDF</span> : null}
    </a>
  );
}
