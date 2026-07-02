import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { draftFromTarget, resolveLinkDraft, type LinkDraft, type LinkKind } from "../editor/linkTarget";
import type { LinkTarget, ViewportRect } from "../types/editor";
import { clampToolbarLeft, getToolbarPlacement, TOOLBAR_FALLBACK_HEIGHT_PX } from "../utils/toolbarPlacement";
import { Button } from "./ui/button";

/** A link create/edit request anchored to a page position, resolved when the user confirms, deletes, or cancels. */
export type LinkDialogRequest = {
  anchor: ViewportRect;
  /** Present when editing an existing link operation. */
  target?: LinkTarget;
  onConfirm: (target: LinkTarget) => void;
  /** Present when editing — removes the link operation. */
  onDelete?: () => void;
  onCancel: () => void;
};

type LinkPropertiesDialogProps = {
  request: LinkDialogRequest;
  pageCount: number;
  pageWidth: number;
  scale: number;
};

const KIND_ROWS: Array<{ kind: LinkKind; label: string; inputLabel: string; placeholder: string }> = [
  { kind: "url", label: "Link to external URL", inputLabel: "External URL", placeholder: "https://example.com" },
  { kind: "email", label: "Link to email address", inputLabel: "Email address", placeholder: "you@example.com" },
  { kind: "phone", label: "Link to phone number", inputLabel: "Phone number", placeholder: "+1234567890" },
  { kind: "page", label: "Link to internal page", inputLabel: "Page number", placeholder: "Page number" },
];

/**
 * Sejda-parity link properties popover: four radio target kinds, each with an
 * inline input, plus Delete link (when editing) and Close. Replaces the old
 * single-URL inline popover for the link tool.
 */
export function LinkPropertiesDialog({ request, pageCount, pageWidth, scale }: LinkPropertiesDialogProps) {
  const isEditing = Boolean(request.target);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const activeInputRef = useRef<HTMLInputElement | null>(null);
  const [size, setSize] = useState({ width: 300, height: TOOLBAR_FALLBACK_HEIGHT_PX });
  const [draft, setDraft] = useState<LinkDraft>(() => draftFromTarget(request.target));
  const [error, setError] = useState<string | null>(null);
  const stageWidth = pageWidth * scale;

  useLayoutEffect(() => {
    const node = popoverRef.current;
    /* v8 ignore next -- the ref is attached to the unconditionally-rendered root div, so this guard never executes */
    if (!node) return;
    const measure = () => {
      const next = node.getBoundingClientRect();
      if (next.width > 0 && next.height > 0) setSize({ width: next.width, height: next.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [request]);

  useEffect(() => {
    activeInputRef.current?.focus();
    activeInputRef.current?.select();
  }, [request, draft.kind]);

  const placement = getToolbarPlacement(request.anchor, size.width, size.height);
  const left = clampToolbarLeft(placement.left, size.width, stageWidth, request.anchor);

  const confirm = () => {
    const resolved = resolveLinkDraft(draft, pageCount);
    if ("error" in resolved) {
      setError(resolved.error);
      return;
    }
    request.onConfirm(resolved.target);
  };

  const setKind = (kind: LinkKind) => {
    setError(null);
    setDraft((current) => ({ ...current, kind }));
  };

  const setValue = (kind: LinkKind, value: string) => {
    setError(null);
    setDraft((current) => ({ ...current, kind, [kind]: value }));
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      request.onCancel();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      confirm();
      return;
    }
    if (event.key !== "Tab") return;
    /* v8 ignore next -- popoverRef is attached to the always-rendered root div, so the optional-chaining null branch never executes */
    const focusable = Array.from(popoverRef.current?.querySelectorAll<HTMLElement>("input, button") ?? []);
    /* v8 ignore next -- the dialog always renders the kind inputs and action buttons, so this guard never executes */
    if (focusable.length === 0) return;
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    const nextIndex = event.shiftKey
      ? (currentIndex - 1 + focusable.length) % focusable.length
      : (currentIndex + 1) % focusable.length;
    focusable[nextIndex]?.focus();
  };

  const draftValueFor = (kind: LinkKind) =>
    kind === "url" ? draft.url : kind === "email" ? draft.email : kind === "phone" ? draft.phone : draft.page;

  return (
    <div
      ref={popoverRef}
      className="inline-popover link-popover"
      data-placement={placement.placement}
      role="dialog"
      aria-label={isEditing ? "Edit link" : "Add link"}
      style={{ left, top: placement.top }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      <p className="inline-popover__title">{isEditing ? "Edit link" : "Add link"}</p>
      <div className="link-popover__kinds" role="radiogroup" aria-label="Link type">
        {KIND_ROWS.map((row) => {
          const active = draft.kind === row.kind;
          return (
            <label key={row.kind} className={`link-popover__kind ${active ? "is-active" : ""}`}>
              <span className="link-popover__choice">
                <input
                  type="radio"
                  name="link-kind"
                  aria-label={row.label}
                  checked={active}
                  onChange={() => setKind(row.kind)}
                />
                <span>{row.label}</span>
              </span>
              <input
                ref={active ? (node) => { activeInputRef.current = node; } : undefined}
                type={row.kind === "page" ? "number" : "text"}
                min={row.kind === "page" ? 1 : undefined}
                max={row.kind === "page" ? pageCount : undefined}
                aria-label={row.inputLabel}
                placeholder={row.placeholder}
                value={draftValueFor(row.kind)}
                onFocus={() => setKind(row.kind)}
                onChange={(event) => setValue(row.kind, event.currentTarget.value)}
              />
            </label>
          );
        })}
      </div>
      {error ? <p className="link-popover__error" role="alert">{error}</p> : null}
      <div className="inline-popover__actions">
        {request.onDelete ? (
          <Button type="button" variant="quiet" size="sm" className="link-popover__delete" onClick={request.onDelete}>
            Delete link
          </Button>
        ) : null}
        <Button type="button" variant="quiet" size="sm" onClick={request.onCancel}>Close</Button>
        <Button type="button" variant="primary" size="sm" onClick={confirm}>
          {isEditing ? "Save link" : "Add link"}
        </Button>
      </div>
    </div>
  );
}
