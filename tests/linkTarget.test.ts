import { describe, expect, it } from "vitest";
import {
  createLinkOperation,
  describeLinkTarget,
  draftFromTarget,
  importedLinkOperation,
  normalizeLegacyOperation,
  normalizeLegacyOperations,
  resolveLinkDraft,
} from "../src/editor/linkTarget";
import type { EditOperation, LinkOperation } from "../src/types/editor";

const rect = { x: 10, y: 20, width: 100, height: 30 };

describe("describeLinkTarget", () => {
  it("labels each kind: host, address, number, page", () => {
    expect(describeLinkTarget({ kind: "url", href: "https://example.com/deep?q=1" })).toBe("example.com");
    expect(describeLinkTarget({ kind: "email", href: "mailto:you@example.com" })).toBe("you@example.com");
    expect(describeLinkTarget({ kind: "phone", href: "tel:+123456789" })).toBe("+123456789");
    expect(describeLinkTarget({ kind: "page", pageIndex: 4 })).toBe("Page 5");
  });

  it("falls back to the raw href when the URL cannot be parsed or has no host", () => {
    expect(describeLinkTarget({ kind: "url", href: "not a url" })).toBe("not a url");
    // mailto parses as a URL but has an empty host.
    expect(describeLinkTarget({ kind: "url", href: "mailto:x@y.dev" })).toBe("mailto:x@y.dev");
  });
});

describe("createLinkOperation", () => {
  it("creates a sanitized link, enforcing the drawn-region minimum size when asked", () => {
    const op = createLinkOperation({
      target: { kind: "url", href: "example.com" },
      pageIndex: 1,
      rect: { x: 5, y: 5, width: 10, height: 10 },
      enforceMinSize: true,
    });
    expect(op).not.toBeNull();
    expect(op!.type).toBe("link");
    expect(op!.pageIndex).toBe(1);
    expect(op!.target).toEqual({ kind: "url", href: "https://example.com/" });
    expect(op!.rect).toEqual({ x: 5, y: 5, width: 160, height: 28 });
  });

  it("keeps the exact rect by default and returns null for invalid targets", () => {
    const op = createLinkOperation({ target: { kind: "phone", href: "+123456789" }, pageIndex: 0, rect });
    expect(op!.rect).toEqual(rect);
    expect(createLinkOperation({ target: { kind: "url", href: "javascript:alert(1)" }, pageIndex: 0, rect })).toBeNull();
  });
});

describe("importedLinkOperation", () => {
  it("mirrors an imported annotation as an editable, flagged operation", () => {
    const op = importedLinkOperation({
      pageIndex: 2,
      rect,
      target: { kind: "page", pageIndex: 0 },
      annotationRef: "13R",
    });
    expect(op.type).toBe("link");
    expect(op.imported).toBe(true);
    expect(op.annotationRef).toBe("13R");
    expect(op.pageIndex).toBe(2);
    expect(op.target).toEqual({ kind: "page", pageIndex: 0 });
  });
});

describe("normalizeLegacyOperation", () => {
  it("passes non-link and already-migrated operations through untouched", () => {
    const whiteout: EditOperation = { id: "w", type: "whiteout", pageIndex: 0, rect, color: "#fff", createdAt: 1 };
    expect(normalizeLegacyOperation(whiteout)).toBe(whiteout);
    const modern: EditOperation = { id: "l", type: "link", pageIndex: 0, rect, createdAt: 1, target: { kind: "url", href: "https://x.dev" } };
    expect(normalizeLegacyOperation(modern)).toBe(modern);
  });

  it("maps legacy { href } links onto the target union by scheme", () => {
    const legacyUrl = { id: "l1", type: "link", pageIndex: 0, rect, createdAt: 1, href: "https://x.dev" } as unknown as EditOperation;
    const legacyMail = { id: "l2", type: "link", pageIndex: 0, rect, createdAt: 1, href: "mailto:a@b.dev" } as unknown as EditOperation;
    expect((normalizeLegacyOperation(legacyUrl) as LinkOperation).target).toEqual({ kind: "url", href: "https://x.dev" });
    expect((normalizeLegacyOperation(legacyMail) as LinkOperation).target).toEqual({ kind: "email", href: "mailto:a@b.dev" });
    expect("href" in normalizeLegacyOperation(legacyUrl)).toBe(false);
  });

  it("does not crash on a link missing both target and href", () => {
    const broken = { id: "l3", type: "link", pageIndex: 0, rect, createdAt: 1 } as unknown as EditOperation;
    expect((normalizeLegacyOperation(broken) as LinkOperation).target).toEqual({ kind: "url", href: "" });
  });

  it("normalizeLegacyOperations maps whole arrays", () => {
    const legacy = { id: "l1", type: "link", pageIndex: 0, rect, createdAt: 1, href: "https://x.dev" } as unknown as EditOperation;
    const out = normalizeLegacyOperations([legacy]);
    expect((out[0] as LinkOperation).target).toEqual({ kind: "url", href: "https://x.dev" });
  });

  it("normalizeLegacyOperations drops retired table-region operations from old sessions", () => {
    const stale = { id: "tr1", type: "table-region", pageIndex: 0, rect, createdAt: 1, label: "Table 1" } as unknown as EditOperation;
    const kept = { id: "l1", type: "link", pageIndex: 0, rect, createdAt: 1, href: "https://x.dev" } as unknown as EditOperation;
    const out = normalizeLegacyOperations([stale, kept]);
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("l1");
  });
});

describe("draftFromTarget", () => {
  it("returns URL defaults when no target exists", () => {
    expect(draftFromTarget(undefined)).toEqual({ kind: "url", url: "", email: "", phone: "", page: "1" });
  });

  it("seeds the matching kind's field, stripping scheme prefixes", () => {
    expect(draftFromTarget({ kind: "url", href: "https://x.dev/" }).url).toBe("https://x.dev/");
    expect(draftFromTarget({ kind: "email", href: "mailto:a@b.dev" })).toMatchObject({ kind: "email", email: "a@b.dev" });
    expect(draftFromTarget({ kind: "phone", href: "tel:+12345678" })).toMatchObject({ kind: "phone", phone: "+12345678" });
    expect(draftFromTarget({ kind: "page", pageIndex: 2 })).toMatchObject({ kind: "page", page: "3" });
  });
});

describe("resolveLinkDraft", () => {
  const base = { kind: "url" as const, url: "", email: "", phone: "", page: "1" };

  it("resolves each valid kind to a sanitized target", () => {
    expect(resolveLinkDraft({ ...base, url: "example.com" }, 1)).toEqual({ target: { kind: "url", href: "https://example.com/" } });
    expect(resolveLinkDraft({ ...base, kind: "email", email: "a@b.dev" }, 1)).toEqual({ target: { kind: "email", href: "mailto:a@b.dev" } });
    expect(resolveLinkDraft({ ...base, kind: "phone", phone: "+12345678" }, 1)).toEqual({ target: { kind: "phone", href: "tel:+12345678" } });
    expect(resolveLinkDraft({ ...base, kind: "page", page: "3" }, 5)).toEqual({ target: { kind: "page", pageIndex: 2 } });
  });

  it("returns kind-specific errors for invalid values", () => {
    expect(resolveLinkDraft({ ...base, url: "javascript:alert(1)" }, 1)).toEqual({ error: "Enter a valid http(s) URL." });
    expect(resolveLinkDraft({ ...base, kind: "email", email: "nope" }, 1)).toEqual({ error: "Enter a valid email address." });
    expect(resolveLinkDraft({ ...base, kind: "phone", phone: "abc" }, 1)).toEqual({ error: "Enter a valid phone number." });
    expect(resolveLinkDraft({ ...base, kind: "page", page: "9" }, 5)).toEqual({ error: "Enter a page between 1 and 5." });
    expect(resolveLinkDraft({ ...base, kind: "page", page: "0" }, 5)).toEqual({ error: "Enter a page between 1 and 5." });
    expect(resolveLinkDraft({ ...base, kind: "page", page: "" }, 5)).toEqual({ error: "Enter a page between 1 and 5." });
  });
});
