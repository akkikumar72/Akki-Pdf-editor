const DEFAULT_SOURCE_REPOSITORY_URL = "https://github.com/akkikumar72/Akki-Pdf-editor";

export type SourceLinks = {
  isVersionPinned: boolean;
  licenseUrl: string;
  repositoryUrl: string;
  versionUrl: string;
};

function parseGitHubRepositoryUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    const pathSegments = url.pathname.split("/").filter(Boolean);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "github.com" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      pathSegments.length !== 2
    ) {
      return null;
    }
    return `https://github.com/${pathSegments.join("/")}`;
  } catch {
    return null;
  }
}

export function getSourceLinks(repositoryValue: unknown, commitValue: unknown): SourceLinks {
  const repositoryUrl = parseGitHubRepositoryUrl(repositoryValue) ?? DEFAULT_SOURCE_REPOSITORY_URL;
  const commitSha =
    typeof commitValue === "string" && /^[0-9a-f]{7,40}$/i.test(commitValue) ? commitValue.toLowerCase() : null;

  return {
    isVersionPinned: commitSha !== null,
    licenseUrl: commitSha ? `${repositoryUrl}/blob/${commitSha}/LICENSE` : "/LICENSE.txt",
    repositoryUrl,
    versionUrl: commitSha ? `${repositoryUrl}/tree/${commitSha}` : repositoryUrl,
  };
}

export const SOURCE_LINKS = getSourceLinks(
  import.meta.env.VITE_SOURCE_REPOSITORY_URL,
  import.meta.env.VITE_SOURCE_COMMIT_SHA,
);
export const SOURCE_REPOSITORY_URL = SOURCE_LINKS.repositoryUrl;
export const SOURCE_VERSION_URL = SOURCE_LINKS.versionUrl;
export const LICENSE_URL = SOURCE_LINKS.licenseUrl;
export function getSourceLinkLabel(isVersionPinned: boolean): string {
  return isVersionPinned ? "Corresponding source" : "Source repository";
}
export const SOURCE_LINK_LABEL = getSourceLinkLabel(SOURCE_LINKS.isVersionPinned);
export const COPYRIGHT_HOLDER = "Akkivo";

export const SUPPORTER_CHECKOUT_ENV = "VITE_POLAR_SUPPORTER_CHECKOUT_URL";

const BUY_CHECKOUT_LINK_PATH = /^\/polar_cl_[A-Za-z0-9_-]+\/?$/;
const API_CHECKOUT_LINK_PATH = /^\/v1\/checkout-links\/polar_cl_[A-Za-z0-9_-]+\/redirect\/?$/;

function isPersistentPolarCheckoutLink(url: URL): boolean {
  if (url.hostname === "buy.polar.sh") return BUY_CHECKOUT_LINK_PATH.test(url.pathname);
  if (url.hostname === "api.polar.sh" || url.hostname === "sandbox-api.polar.sh") {
    return API_CHECKOUT_LINK_PATH.test(url.pathname);
  }
  return false;
}

/**
 * Polar Checkout Links are public and persistent. Restricting both host and
 * path rejects temporary /checkout/polar_c_* Checkout Session URLs, which
 * expire and must never be configured as the product CTA. No Polar API token
 * belongs in a VITE_* variable.
 */
export function parsePolarCheckoutUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const url = new URL(value.trim());
    if (
      url.protocol !== "https:" ||
      url.port ||
      url.username ||
      url.password ||
      url.hash ||
      !isPersistentPolarCheckoutLink(url)
    ) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
