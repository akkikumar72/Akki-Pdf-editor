import type { AnchorHTMLAttributes, ButtonHTMLAttributes, SVGProps } from "react";
import { IconPdfEdit } from "./AppIcons";

type AkkiPdfMarkProps = SVGProps<SVGSVGElement>;

export function AkkiPdfMark({ className, ...props }: AkkiPdfMarkProps) {
  return <IconPdfEdit className={className} {...props} />;
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
