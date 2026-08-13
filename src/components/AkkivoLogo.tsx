import type { AnchorHTMLAttributes, ButtonHTMLAttributes, SVGProps } from "react";

type AkkivoMarkProps = SVGProps<SVGSVGElement>;

export function AkkivoMark({ className, ...props }: AkkivoMarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} {...props}>
      <path
        data-face="primary"
        fill="var(--akkivo-mark-primary, #32d36f)"
        d="M2.5 21.5 10.7 2.7l3.4 5.7L8 20.5l-5.5 1Z"
      />
      <path
        data-face="secondary"
        fill="var(--akkivo-mark-secondary, #68783c)"
        d="M10.7 2.7 22 21.5l-6.1-1-3.5-10.3-1.7-7.5Z"
      />
      <path data-fold="true" fill="var(--akkivo-mark-fold, #25482f)" d="m10.7 2.7 3.4 5.7-1.7 1.8-1.7-7.5Z" />
    </svg>
  );
}

type AkkivoLogoProps = {
  showWordmark?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>;

export function AkkivoLogo({ showWordmark = true, className, type = "button", ...props }: AkkivoLogoProps) {
  return (
    <button type={type} className={["akkivo-logo", className].filter(Boolean).join(" ")} {...props}>
      <AkkivoMark className="akkivo-logo__mark" aria-hidden="true" />
      {showWordmark ? <span className="akkivo-logo__wordmark">Akkivo</span> : null}
    </button>
  );
}

type AkkivoLogoLinkProps = {
  showWordmark?: boolean;
} & AnchorHTMLAttributes<HTMLAnchorElement>;

export function AkkivoLogoLink({ showWordmark = true, className, ...props }: AkkivoLogoLinkProps) {
  return (
    <a className={["akkivo-logo", className].filter(Boolean).join(" ")} {...props}>
      <AkkivoMark className="akkivo-logo__mark" aria-hidden="true" />
      {showWordmark ? <span className="akkivo-logo__wordmark">Akkivo</span> : null}
    </a>
  );
}
