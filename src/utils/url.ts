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
  return url.toString();
}

export function isSafeUrl(raw: string | undefined | null): boolean {
  return sanitizeUrl(raw) !== null;
}
