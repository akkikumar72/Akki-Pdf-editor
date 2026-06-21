import { describe, expect, it } from "vitest";
import { isSafeUrl, sanitizeUrl } from "../src/utils/url";

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
