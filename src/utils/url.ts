import type { LinkTarget } from "../types/editor";

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Validate a user-supplied link URL for safe storage and PDF export.
 *
 * Returns a normalized absolute URL string when the input uses an allowed
 * scheme (http/https/mailto), or `null` when it is empty, unparseable, or uses
 * a dangerous scheme such as `javascript:` or `data:`. A bare host like
 * `example.com` is upgraded to `https://example.com`.
 */
export function sanitizeUrl(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Reject control characters that can be used to obfuscate schemes.
  // eslint-disable-next-line no-control-regex -- intentional: stripping control chars is the security check
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return null;

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (!SAFE_PROTOCOLS.has(url.protocol)) return null;
  // A mailto: pasted into the generic URL field must not bypass the stricter
  // email validator — a full mailto URI can smuggle cc/bcc/body params.
  if (url.protocol === "mailto:") return sanitizeEmailToMailto(trimmed);
  // Reject embedded credentials: `https://trusted.com@evil.com` reads as a
  // trusted-host link but resolves to evil.com — a classic phishing shape,
  // and no legitimate link target needs userinfo.
  if (url.username || url.password) return null;
  return url.toString();
}

export function isSafeUrl(raw: string | undefined | null): boolean {
  return sanitizeUrl(raw) !== null;
}

/**
 * Validate an email address (bare or `mailto:`-prefixed) and normalize it to a
 * `mailto:` href, or return `null` when it is not a plausible address. Kept
 * separate from `sanitizeUrl` so the general allowlist stays untouched.
 */
export function sanitizeEmailToMailto(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const address = raw.trim().replace(/^mailto:/i, "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return null;
  return `mailto:${address}`;
}

/**
 * Validate a phone number (bare or `tel:`-prefixed; spaces/dashes/dots/parens
 * tolerated) and normalize it to a `tel:` href of digits with an optional
 * leading `+`, or return `null`. `tel:` is deliberately NOT added to the
 * generic `sanitizeUrl` allowlist — only link operations accept phone targets.
 */
export function sanitizeTel(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const compact = raw.trim().replace(/^tel:/i, "").replace(/[\s\-.()]/g, "");
  if (!/^\+?\d{3,15}$/.test(compact)) return null;
  return `tel:${compact}`;
}

/**
 * Run a link target through the kind-appropriate sanitizer. Returns the
 * normalized target, or `null` when its value fails validation. Applied at
 * create, edit, and export — the security invariant for link operations.
 */
export function sanitizeLinkTarget(target: LinkTarget): LinkTarget | null {
  switch (target.kind) {
    case "url": {
      const href = sanitizeUrl(target.href);
      return href ? { kind: "url", href } : null;
    }
    case "email": {
      const href = sanitizeEmailToMailto(target.href);
      return href ? { kind: "email", href } : null;
    }
    case "phone": {
      const href = sanitizeTel(target.href);
      return href ? { kind: "phone", href } : null;
    }
    case "page":
      return Number.isInteger(target.pageIndex) && target.pageIndex >= 0
        ? { kind: "page", pageIndex: target.pageIndex }
        : null;
    /* v8 ignore next 5 -- exhaustiveness guard: every LinkTarget kind is handled above, so this branch is unreachable at runtime */
    default: {
      const exhaustive: never = target;
      void exhaustive;
      return null;
    }
  }
}
