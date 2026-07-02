import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { InlineInputDescriptor } from "../editor/operationFactory";
import type { ViewportRect } from "../types/editor";
import { clampToolbarLeft, getToolbarPlacement, TOOLBAR_FALLBACK_HEIGHT_PX } from "../utils/toolbarPlacement";
import { Button } from "./ui/button";

/** A tool-creation input request anchored to a page position, resolved once the user confirms or cancels. */
export type PendingInputRequest = InlineInputDescriptor & {
  anchor: ViewportRect;
  onConfirm: (values: Record<string, string>) => void;
  onCancel: () => void;
};

type InlineInputPopoverProps = {
  request: PendingInputRequest;
  pageWidth: number;
  scale: number;
};

type FieldElement = HTMLInputElement | HTMLTextAreaElement;

export function InlineInputPopover({ request, pageWidth, scale }: InlineInputPopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const firstFieldRef = useRef<FieldElement | null>(null);
  const [size, setSize] = useState({ width: 260, height: TOOLBAR_FALLBACK_HEIGHT_PX });
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(request.fields.map((field) => [field.key, field.defaultValue])),
  );
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
    firstFieldRef.current?.focus();
    firstFieldRef.current?.select();
  }, [request]);

  const placement = getToolbarPlacement(request.anchor, size.width, size.height);
  const left = clampToolbarLeft(placement.left, size.width, stageWidth, request.anchor);

  const confirm = () => request.onConfirm(values);
  const setFieldValue = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      request.onCancel();
      return;
    }
    if (event.key === "Enter" && !event.shiftKey && (event.target as HTMLElement).tagName !== "TEXTAREA") {
      event.preventDefault();
      confirm();
      return;
    }
    if (event.key !== "Tab") return;
    /* v8 ignore next -- popoverRef is attached to the always-rendered root div, so the optional-chaining null branch never executes */
    const focusable = Array.from(popoverRef.current?.querySelectorAll<HTMLElement>("input, textarea, select, button") ?? []);
    /* v8 ignore next -- the popover always renders at least one field and the Cancel/Confirm buttons, so this guard never executes */
    if (focusable.length === 0) return;
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    const nextIndex = event.shiftKey
      ? (currentIndex - 1 + focusable.length) % focusable.length
      : (currentIndex + 1) % focusable.length;
    focusable[nextIndex]?.focus();
  };

  return (
    <div
      ref={popoverRef}
      className="inline-popover"
      data-placement={placement.placement}
      role="dialog"
      aria-label={request.title}
      style={{ left, top: placement.top }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={handleKeyDown}
    >
      <p className="inline-popover__title">{request.title}</p>
      <div className="field-stack">
        {request.fields.map((field, index) => (
          <label key={field.key}>
            <span>{field.label}</span>
            {field.options ? (
              <select
                value={values[field.key]}
                onChange={(event) => setFieldValue(field.key, event.currentTarget.value)}
              >
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            ) : field.multiline ? (
              <textarea
                ref={index === 0 ? (node) => { firstFieldRef.current = node; } : undefined}
                value={values[field.key]}
                placeholder={field.placeholder}
                onChange={(event) => setFieldValue(field.key, event.currentTarget.value)}
              />
            ) : (
              <input
                ref={index === 0 ? (node) => { firstFieldRef.current = node; } : undefined}
                type="text"
                value={values[field.key]}
                placeholder={field.placeholder}
                onChange={(event) => setFieldValue(field.key, event.currentTarget.value)}
              />
            )}
          </label>
        ))}
      </div>
      <div className="inline-popover__actions">
        <Button type="button" variant="quiet" size="sm" onClick={request.onCancel}>Cancel</Button>
        <Button type="button" variant="primary" size="sm" onClick={confirm}>{request.confirmLabel}</Button>
      </div>
    </div>
  );
}
