import type { EditOperation, ImportedLinkAnnotation, LinkOperation, LinkTarget, PdfRect } from "../types/editor";
import { createId } from "../utils/ids";
import { sanitizeEmailToMailto, sanitizeLinkTarget, sanitizeTel, sanitizeUrl } from "../utils/url";

/** Short human label for a link target: URL host, address, number, or "Page N". */
export function describeLinkTarget(target: LinkTarget): string {
  switch (target.kind) {
    case "url": {
      try {
        return new URL(target.href).host || target.href;
      } catch {
        return target.href;
      }
    }
    case "email":
      return target.href.replace(/^mailto:/i, "");
    case "phone":
      return target.href.replace(/^tel:/i, "");
    case "page":
      return `Page ${target.pageIndex + 1}`;
    /* v8 ignore next 5 -- exhaustiveness guard: every LinkTarget kind is handled above, so this branch is unreachable at runtime */
    default: {
      const exhaustive: never = target;
      void exhaustive;
      return "";
    }
  }
}

type CreateLinkInput = {
  target: LinkTarget;
  pageIndex: number;
  rect: PdfRect;
  /** Drawn regions inherit the old factory minimum (160x28); toolbar-attached links keep the exact rect. */
  enforceMinSize?: boolean;
};

/** Build a link operation from a sanitized target, or `null` when the target fails validation. */
export function createLinkOperation({ target, pageIndex, rect, enforceMinSize = false }: CreateLinkInput): LinkOperation | null {
  const safeTarget = sanitizeLinkTarget(target);
  if (!safeTarget) return null;
  return {
    id: createId("link"),
    type: "link",
    pageIndex,
    rect: enforceMinSize
      ? { ...rect, width: Math.max(rect.width, 160), height: Math.max(rect.height, 28) }
      : { ...rect },
    target: safeTarget,
    opacity: 1,
    createdAt: Date.now(),
  };
}

/** Mirror a /Link annotation read from the source PDF as an editable operation. */
export function importedLinkOperation(link: ImportedLinkAnnotation): LinkOperation {
  return {
    id: createId("link"),
    type: "link",
    pageIndex: link.pageIndex,
    rect: link.rect,
    target: link.target,
    imported: true,
    annotationRef: link.annotationRef,
    opacity: 1,
    createdAt: Date.now(),
  };
}

/**
 * Sessions saved before the target-kind union stored links as `{ href }`.
 * Map that legacy shape onto the union (mailto → email, everything else →
 * url) so old IndexedDB data keeps loading without crashing.
 */
export function normalizeLegacyOperation(operation: EditOperation): EditOperation {
  if (operation.type !== "link") return operation;
  const legacy = operation as LinkOperation & { href?: string };
  if (legacy.target) return operation;
  const { href, ...rest } = legacy;
  const legacyHref = typeof href === "string" ? href : "";
  return {
    ...rest,
    target: /^mailto:/i.test(legacyHref)
      ? { kind: "email", href: legacyHref }
      : { kind: "url", href: legacyHref },
  };
}

/**
 * Operation types that no longer exist in the editor (e.g. the retired
 * table-region tool). Saved sessions written before the removal may still
 * carry them, so they are dropped on the way out of IndexedDB.
 */
const RETIRED_OPERATION_TYPES: ReadonlySet<string> = new Set(["table-region"]);

export function normalizeLegacyOperations(operations: EditOperation[]): EditOperation[] {
  return operations
    .filter((operation) => !RETIRED_OPERATION_TYPES.has(operation.type))
    .map(normalizeLegacyOperation);
}

export type LinkKind = LinkTarget["kind"];

/** Per-kind field values for the link properties dialog, so switching kinds never loses input. */
export type LinkDraft = {
  kind: LinkKind;
  url: string;
  email: string;
  phone: string;
  page: string;
};

export function draftFromTarget(target: LinkTarget | undefined): LinkDraft {
  const draft: LinkDraft = { kind: "url", url: "", email: "", phone: "", page: "1" };
  if (!target) return draft;
  draft.kind = target.kind;
  switch (target.kind) {
    case "url":
      draft.url = target.href;
      break;
    case "email":
      draft.email = target.href.replace(/^mailto:/i, "");
      break;
    case "phone":
      draft.phone = target.href.replace(/^tel:/i, "");
      break;
    case "page":
      draft.page = String(target.pageIndex + 1);
      break;
    /* v8 ignore next 5 -- exhaustiveness guard: every LinkTarget kind is handled above, so this branch is unreachable at runtime */
    default: {
      const exhaustive: never = target;
      void exhaustive;
    }
  }
  return draft;
}

/** Validate the draft's active kind into a sanitized target, or return an error message. */
export function resolveLinkDraft(draft: LinkDraft, pageCount: number): { target: LinkTarget } | { error: string } {
  switch (draft.kind) {
    case "url": {
      const href = sanitizeUrl(draft.url);
      return href ? { target: { kind: "url", href } } : { error: "Enter a valid http(s) URL." };
    }
    case "email": {
      const href = sanitizeEmailToMailto(draft.email);
      return href ? { target: { kind: "email", href } } : { error: "Enter a valid email address." };
    }
    case "phone": {
      const href = sanitizeTel(draft.phone);
      return href ? { target: { kind: "phone", href } } : { error: "Enter a valid phone number." };
    }
    case "page": {
      const parsed = Number.parseInt(draft.page, 10);
      return Number.isInteger(parsed) && parsed >= 1 && parsed <= pageCount
        ? { target: { kind: "page", pageIndex: parsed - 1 } }
        : { error: `Enter a page between 1 and ${pageCount}.` };
    }
    /* v8 ignore next 5 -- exhaustiveness guard: every LinkKind is handled above, so this branch is unreachable at runtime */
    default: {
      const exhaustive: never = draft.kind;
      void exhaustive;
      return { error: "Unsupported link type." };
    }
  }
}
