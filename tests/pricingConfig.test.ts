import { describe, expect, it } from "vitest";
import { getCopyrightHolder, getSourceLinkLabel, getSourceLinks, parsePolarCheckoutUrl } from "../src/config/pricing";

describe("getSourceLinks", () => {
  it("pins source and licence links to a valid deployed commit", () => {
    expect(getSourceLinks("https://github.com/example/fork/", "ABCDEF1234567")).toEqual({
      isVersionPinned: true,
      licenseUrl: "https://github.com/example/fork/blob/abcdef1234567/LICENSE",
      repositoryUrl: "https://github.com/example/fork",
      versionUrl: "https://github.com/example/fork/tree/abcdef1234567",
    });
  });

  it("uses the canonical repository and deployed licence when configuration is missing", () => {
    expect(getSourceLinks(undefined, undefined)).toEqual({
      isVersionPinned: false,
      licenseUrl: "/LICENSE.txt",
      repositoryUrl: "https://github.com/akkikumar72/Akki-Pdf-editor",
      versionUrl: "https://github.com/akkikumar72/Akki-Pdf-editor",
    });
  });

  it("rejects unsafe or ambiguous repository and commit values", () => {
    for (const repository of [
      "http://github.com/example/fork",
      "https://user@github.com/example/fork",
      "https://gitlab.com/example/fork",
      "https://github.com/example/fork/tree/main",
      "https://github.com/example/fork?tab=readme",
      "https://github.com/example/fork#readme",
      42,
      "not a URL",
    ]) {
      const links = getSourceLinks(repository, "not-a-sha");
      expect(links.repositoryUrl).toBe("https://github.com/akkikumar72/Akki-Pdf-editor");
      expect(links.isVersionPinned).toBe(false);
    }
  });

  it("labels pinned source and resolves a configurable rights holder", () => {
    expect(getSourceLinkLabel(true)).toBe("Corresponding source");
    expect(getSourceLinkLabel(false)).toBe("Source repository");
    expect(getCopyrightHolder("  Example Owner  ")).toBe("Example Owner");
    expect(getCopyrightHolder("   ")).toBe("Akash Kumar Pathak");
    expect(getCopyrightHolder(undefined)).toBe("Akash Kumar Pathak");
  });
});

describe("parsePolarCheckoutUrl", () => {
  it("accepts persistent production and sandbox Checkout Links and preserves parameters", () => {
    expect(parsePolarCheckoutUrl("https://buy.polar.sh/polar_cl_example?theme=light")).toBe(
      "https://buy.polar.sh/polar_cl_example?theme=light",
    );
    expect(parsePolarCheckoutUrl("https://buy.polar.sh/polar_cl_example/")).toBe(
      "https://buy.polar.sh/polar_cl_example/",
    );
    expect(parsePolarCheckoutUrl("https://api.polar.sh/v1/checkout-links/polar_cl_example/redirect")).toBe(
      "https://api.polar.sh/v1/checkout-links/polar_cl_example/redirect",
    );
    expect(parsePolarCheckoutUrl("https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_example/redirect")).toBe(
      "https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_example/redirect",
    );
  });

  it("rejects missing, malformed, temporary-session, or unsafe URLs", () => {
    expect(parsePolarCheckoutUrl(undefined)).toBeNull();
    expect(parsePolarCheckoutUrl(42)).toBeNull();
    expect(parsePolarCheckoutUrl("   ")).toBeNull();
    expect(parsePolarCheckoutUrl("not a URL")).toBeNull();
    expect(parsePolarCheckoutUrl("http://buy.polar.sh/polar_cl_example")).toBeNull();
    expect(parsePolarCheckoutUrl("https://example.com/polar_cl_example")).toBeNull();
    expect(parsePolarCheckoutUrl("https://user@buy.polar.sh/polar_cl_example")).toBeNull();
    expect(parsePolarCheckoutUrl("https://:secret@buy.polar.sh/polar_cl_example")).toBeNull();
    expect(parsePolarCheckoutUrl("https://buy.polar.sh:8443/polar_cl_example")).toBeNull();
    expect(parsePolarCheckoutUrl("https://buy.polar.sh/polar_cl_example#fragment")).toBeNull();
    expect(parsePolarCheckoutUrl("https://polar.sh/checkout/polar_c_temporary")).toBeNull();
    expect(parsePolarCheckoutUrl("https://buy.polar.sh/checkout/polar_c_temporary")).toBeNull();
    expect(parsePolarCheckoutUrl("https://api.polar.sh/v1/checkout-links/polar_c_temporary/redirect")).toBeNull();
    expect(parsePolarCheckoutUrl("https://sandbox-api.polar.sh/v1/checkout-links/polar_cl_example")).toBeNull();
  });
});
