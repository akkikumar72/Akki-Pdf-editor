import { describe, expect, it } from "vitest";
import { isSafeUrl, sanitizeEmailToMailto, sanitizeLinkTarget, sanitizeTel, sanitizeUrl } from "../src/utils/url";

describe("sanitizeUrl", () => {
  it("accepts http, https, and mailto", () => {
    expect(sanitizeUrl("https://example.com/path")).toBe("https://example.com/path");
    expect(sanitizeUrl("http://example.com")).toBe("http://example.com/");
    expect(sanitizeUrl("mailto:hi@example.com")).toBe("mailto:hi@example.com");
  });

  it("upgrades a bare host to https", () => {
    expect(sanitizeUrl("example.com")).toBe("https://example.com/");
  });

  it("rejects dangerous schemes", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(sanitizeUrl("  JavaScript:alert(1)")).toBeNull();
    expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejects empty and control-character inputs", () => {
    expect(sanitizeUrl("")).toBeNull();
    expect(sanitizeUrl("   ")).toBeNull();
    expect(sanitizeUrl(undefined)).toBeNull();
    expect(sanitizeUrl("java\u0000script:alert(1)")).toBeNull();
  });

  it("returns null when the candidate cannot be parsed as a URL", () => {
    // Matches the scheme regex (so it is not prefixed with https://) but is not a valid URL.
    expect(sanitizeUrl("http://")).toBeNull();
  });

  it("isSafeUrl mirrors sanitizeUrl", () => {
    expect(isSafeUrl("https://example.com")).toBe(true);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
  });
});

describe("sanitizeEmailToMailto", () => {
  it("normalizes bare and mailto-prefixed addresses", () => {
    expect(sanitizeEmailToMailto("you@example.com")).toBe("mailto:you@example.com");
    expect(sanitizeEmailToMailto("MAILTO:you@example.com")).toBe("mailto:you@example.com");
    expect(sanitizeEmailToMailto("  you@example.com  ")).toBe("mailto:you@example.com");
  });

  it("rejects empty and implausible addresses", () => {
    expect(sanitizeEmailToMailto("")).toBeNull();
    expect(sanitizeEmailToMailto(undefined)).toBeNull();
    expect(sanitizeEmailToMailto("not-an-email")).toBeNull();
    expect(sanitizeEmailToMailto("two@ats@example.com")).toBeNull();
    expect(sanitizeEmailToMailto("no-tld@example")).toBeNull();
    expect(sanitizeEmailToMailto("spaces in@example.com")).toBeNull();
  });
});

describe("sanitizeTel", () => {
  it("normalizes bare and tel-prefixed numbers, stripping separators", () => {
    expect(sanitizeTel("+1234567890")).toBe("tel:+1234567890");
    expect(sanitizeTel("tel:+1234567890")).toBe("tel:+1234567890");
    expect(sanitizeTel("+1 (555) 000-12.34")).toBe("tel:+15550001234");
    expect(sanitizeTel("5550001234")).toBe("tel:5550001234");
  });

  it("rejects empty, alphabetic, too-short, and too-long inputs", () => {
    expect(sanitizeTel("")).toBeNull();
    expect(sanitizeTel(undefined)).toBeNull();
    expect(sanitizeTel("call-me")).toBeNull();
    expect(sanitizeTel("12")).toBeNull();
    expect(sanitizeTel("1234567890123456")).toBeNull();
    expect(sanitizeTel("tel:javascript:alert(1)")).toBeNull();
  });
});

describe("sanitizeLinkTarget", () => {
  it("sanitizes each href kind through its own validator", () => {
    expect(sanitizeLinkTarget({ kind: "url", href: "example.com" })).toEqual({ kind: "url", href: "https://example.com/" });
    expect(sanitizeLinkTarget({ kind: "url", href: "javascript:alert(1)" })).toBeNull();
    expect(sanitizeLinkTarget({ kind: "email", href: "you@example.com" })).toEqual({ kind: "email", href: "mailto:you@example.com" });
    expect(sanitizeLinkTarget({ kind: "email", href: "nope" })).toBeNull();
    expect(sanitizeLinkTarget({ kind: "phone", href: "+123456789" })).toEqual({ kind: "phone", href: "tel:+123456789" });
    expect(sanitizeLinkTarget({ kind: "phone", href: "abc" })).toBeNull();
  });

  it("accepts non-negative integer page indexes only", () => {
    expect(sanitizeLinkTarget({ kind: "page", pageIndex: 0 })).toEqual({ kind: "page", pageIndex: 0 });
    expect(sanitizeLinkTarget({ kind: "page", pageIndex: 3 })).toEqual({ kind: "page", pageIndex: 3 });
    expect(sanitizeLinkTarget({ kind: "page", pageIndex: -1 })).toBeNull();
    expect(sanitizeLinkTarget({ kind: "page", pageIndex: 1.5 })).toBeNull();
  });
});
