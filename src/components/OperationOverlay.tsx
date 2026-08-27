import type { DocumentFonts, EditOperation } from "../types/editor";
import { resolveFont } from "../engine/fontResolver";
import { SIGNATURE_FONTS } from "../editor/signatureFonts";
import { describeLinkTarget } from "../editor/linkTarget";
import { cssFamilyForFontKey, ensureEmbeddedFontLoaded } from "../engine/fontRegistry";
import { NEW_TEXT_PLACEHOLDER } from "../editor/operationFactory";
import { pdfRectToViewport } from "../utils/coordinates";
import { textBaselineTopPaddingPx } from "../utils/textMetrics";
import { caretRangeFromClientPoint, getLastPointerDownPoint } from "../utils/caret";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { safeImageSrc } from "../utils/safeImage";

type OperationOverlayProps = {
  operation: EditOperation;
  pageHeight: number;
  scale: number;
  selected: boolean;
  editing?: boolean;
  dragging?: boolean;
  erasing?: boolean;
  moveModeActive?: boolean;
  documentFonts?: DocumentFonts;
  onPointerDown: (id: string, event: React.PointerEvent<HTMLDivElement>) => void;
  onStartTextEdit?: (id: string) => void;
  onTextChange?: (id: string, text: string) => void;
  onTextCommit?: () => void;
};

function readEditableText(element: HTMLDivElement) {
  // `textContent` drops the visual line break represented by a contenteditable
  // `<br>`. Browsers expose the rendered plain text through `innerText`; the
  // small fallback keeps DOM-only test environments correct too.
  if (element.textContent === null) return "";
  if (typeof element.innerText === "string") return element.innerText.replace(/\r\n?/g, "\n");
  return [...element.childNodes]
    .map((node) => {
      if (node.nodeName === "BR") return "\n";
      /* v8 ignore next -- valid children of an HTMLDivElement always expose string textContent; only Document and DocumentType return null, and neither can be appended here */
      return node.textContent ?? "";
    })
    .join("");
}

function OperationOverlayComponent({
  operation,
  pageHeight,
  scale,
  selected,
  editing,
  dragging = false,
  erasing = false,
  moveModeActive = false,
  documentFonts,
  onPointerDown,
  onStartTextEdit,
  onTextChange,
  onTextCommit,
}: OperationOverlayProps) {
  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => onPointerDown(operation.id, event);
  const textRef = useRef<HTMLDivElement | null>(null);
  const wasEditing = useRef(false);
  const editingText = useRef(operation.type === "text" ? operation.text : "");
  if (operation.type === "text" && editing && !wasEditing.current) {
    editingText.current = operation.text;
  }
  wasEditing.current = Boolean(editing);
  const rect = pdfRectToViewport(operation.rect, pageHeight, scale);
  const embeddedFontKey = operation.type === "text" ? operation.embeddedFontKey : undefined;
  const embeddedFontBytes = embeddedFontKey ? documentFonts?.[embeddedFontKey]?.bytes : undefined;
  const [embeddedFamily, setEmbeddedFamily] = useState<string | undefined>(
    embeddedFontKey && embeddedFontBytes ? cssFamilyForFontKey(embeddedFontKey) : undefined,
  );
  const [embeddedReady, setEmbeddedReady] = useState(!embeddedFontKey || !embeddedFontBytes);

  useEffect(() => {
    if (!embeddedFontKey || !embeddedFontBytes) {
      setEmbeddedFamily(undefined);
      setEmbeddedReady(true);
      return;
    }
    let cancelled = false;
    setEmbeddedReady(false);
    void ensureEmbeddedFontLoaded(embeddedFontKey, embeddedFontBytes).then((family) => {
      if (cancelled) return;
      setEmbeddedFamily(family);
      setEmbeddedReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [embeddedFontKey, embeddedFontBytes]);
  const style = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    opacity: operation.opacity ?? 1,
  };

  const className = [
    `operation operation--${operation.type}`,
    selected ? "is-selected" : "",
    editing ? "is-editing" : "",
    dragging ? "is-dragging" : "",
    erasing ? "is-erasing" : "",
    moveModeActive ? "is-move-mode" : "",
  ].filter(Boolean).join(" ");

  useEffect(() => {
    if (!editing || operation.type !== "text" || !textRef.current) return;
    const element = textRef.current;
    element.focus({ preventScroll: true });
    const selection = window.getSelection();
    if (!selection) return;
    // Reference parity (Sejda): a box still holding the untouched placeholder
    // gets its whole content selected, so the very first keystroke replaces it —
    // no manual select-and-delete before typing.
    if (editingText.current === NEW_TEXT_PLACEHOLDER) {
      const range = document.createRange();
      range.selectNodeContents(element);
      selection.removeAllRanges();
      selection.addRange(range);
      return;
    }
    // Reference parity: drop the caret where the user clicked. Fall back to the
    // start of the run when the click point can't be resolved inside this run.
    const point = getLastPointerDownPoint();
    if (point) {
      const clicked = caretRangeFromClientPoint(point.x, point.y);
      if (clicked && element.contains(clicked.startContainer)) {
        selection.removeAllRanges();
        selection.addRange(clicked);
        return;
      }
    }
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }, [editing, operation.type]);

  switch (operation.type) {
    case "text": {
      const baselinePadding = textBaselineTopPaddingPx(rect.height, operation.fontSize, scale);
      const showText = embeddedReady;
      return (
        <div
          ref={textRef}
          className={className}
          contentEditable={Boolean(editing)}
          suppressContentEditableWarning
          role={editing ? "textbox" : undefined}
          aria-label={editing ? "Edit text overlay" : undefined}
          tabIndex={selected ? 0 : undefined}
          style={{
            ...style,
            // Gate on `embeddedFontKey` (props), not just `embeddedFamily` (state).
            // When the user picks a catalog font, the update clears `embeddedFontKey`
            // in the same render — but `embeddedFamily` stays stale until the effect
            // runs. Preferring the stale face would leave the overlay looking unchanged
            // after an Inspector/toolbar font change (tooltip preview hid the bug by
            // clearing the key in its live patch too).
            fontFamily: [
              embeddedFontKey && embeddedFamily ? `"${embeddedFamily}"` : null,
              operation.cssFontFamily ?? resolveFont(operation.fontFamily).cssFamily,
            ].filter(Boolean).join(", "),
            fontSize: operation.fontSize * scale,
            fontWeight: operation.fontWeight ?? (operation.bold ? 700 : 400),
            fontStyle: operation.fontStyle ?? (operation.italic ? "italic" : "normal"),
            letterSpacing: operation.letterSpacing ? operation.letterSpacing * scale : undefined,
            color: operation.color,
            textAlign: operation.align,
            // Reference parity: the editable run carries no fill of its own — the
            // dedicated `.operation--source-cover` masks the original glyphs. This
            // keeps a moved/edited run as pure text (no white box clipping the line
            // above or trailing behind when dragged). The guarded fallback only
            // paints when a whiteout run somehow lacks its source cover.
            background:
              operation.whiteout && !operation.sourceCoverRect
                ? operation.whiteoutColor ?? "#fff"
                : "transparent",
            paddingTop: baselinePadding,
            opacity: showText ? (operation.opacity ?? 1) : 0,
          }}
          onPointerDown={handlePointerDown}
          onDoubleClick={(event) => {
            event.stopPropagation();
            onStartTextEdit?.(operation.id);
          }}
          onInput={(event) => {
            if (!editing) return;
            onTextChange?.(operation.id, readEditableText(event.currentTarget));
          }}
          onBlur={(event) => {
            if (!editing) return;
            // Clicking the inline toolbar must not end the edit session —
            // reference behavior: style controls (bold, size, font) apply to the
            // still-active text box, and typing can resume right after.
            const next = event.relatedTarget as HTMLElement | null;
            if (next?.closest(".floating-toolbar")) return;
            onTextCommit?.();
          }}
          onKeyDown={(event) => {
            if (!editing) return;
            if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) {
              event.preventDefault();
              onTextCommit?.();
              textRef.current?.blur();
            }
          }}
        >
          {editing ? editingText.current : operation.text}
        </div>
      );
    }

    case "whiteout":
      return (
        <div
          className={className}
          style={{ ...style, background: operation.color }}
          onPointerDown={handlePointerDown}
        />
      );

    case "redaction":
      return (
        <div
          className={`${className} operation--redaction-${operation.mode}`}
          style={{
            ...style,
            background: operation.fillColor,
            borderColor: operation.borderColor ?? operation.fillColor,
            borderWidth: (operation.borderWidth ?? 0) * scale,
          }}
          onPointerDown={handlePointerDown}
        >
          {operation.overlayText ? <span>{operation.overlayText}</span> : null}
        </div>
      );

    case "image": {
      const src = safeImageSrc(operation.dataUrl);
      return <div className={className} style={style} onPointerDown={handlePointerDown}>{src ? <img src={src} alt="" draggable={false} /> : null}</div>;
    }

    case "signature": {
      // Handwriting faces come from the signature studio's own catalog; a
      // legacy family saved before the studio existed still resolves through
      // the general font stack.
      const signatureFamily =
        SIGNATURE_FONTS.find((font) => font.label === operation.fontFamily)?.cssFamily ??
        resolveFont(operation.fontFamily).cssFamily;
      return (
        <div
          className={className}
          style={{
            ...style,
            color: operation.color,
            fontFamily: signatureFamily,
          }}
          onPointerDown={handlePointerDown}
        >
          {operation.mode === "image" ? (safeImageSrc(operation.value) ? <img src={safeImageSrc(operation.value)} alt="Signature" draggable={false} /> : null) : operation.value}
        </div>
      );
    }

    case "stamp":
      return (
        <div
          className={className}
          style={{
            ...style,
            color: operation.color,
            borderColor: operation.borderColor,
          }}
          onPointerDown={handlePointerDown}
        >
          <span className="operation__stamp-label">{operation.label}</span>
          {operation.subline ? <span className="operation__stamp-subline">{operation.subline}</span> : null}
        </div>
      );

    case "shape": {
      if (operation.kind === "line" || operation.kind === "arrow") {
        // Linear shapes render as SVG (a bordered box can't represent a diagonal
        // line). New operations preserve exact drag endpoints; older saved
        // sessions fall back to the original bottom-left -> top-right diagonal.
        const width = Math.max(1, rect.width);
        const height = Math.max(1, rect.height);
        const strokeWidth = Math.max(1, operation.strokeWidth * scale);
        const markerId = `arrowhead-${operation.id}`;
        const start = operation.start ?? { x: operation.rect.x, y: operation.rect.y };
        const end = operation.end ?? {
          x: operation.rect.x + operation.rect.width,
          y: operation.rect.y + operation.rect.height,
        };
        const x1 = (start.x - operation.rect.x) * scale;
        const y1 = (operation.rect.y + operation.rect.height - start.y) * scale;
        const x2 = (end.x - operation.rect.x) * scale;
        const y2 = (operation.rect.y + operation.rect.height - end.y) * scale;
        return (
          <div
            className={`${className} operation--shape-${operation.kind}`}
            style={style}
            onPointerDown={handlePointerDown}
          >
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ overflow: "visible" }}>
              {operation.kind === "arrow" ? (
                <defs>
                  <marker
                    id={markerId}
                    markerWidth="10"
                    markerHeight="10"
                    refX="8"
                    refY="3"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M0,0 L8,3 L0,6 Z" fill={operation.stroke} />
                  </marker>
                </defs>
              ) : null}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={operation.stroke}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                markerEnd={operation.kind === "arrow" ? `url(#${markerId})` : undefined}
              />
            </svg>
          </div>
        );
      }
      return (
        <div
          className={`${className} operation--shape-${operation.kind}`}
          style={{
            ...style,
            borderColor: operation.stroke,
            borderWidth: Math.max(1, operation.strokeWidth * scale),
            background: operation.fill === "transparent" ? "transparent" : operation.fill,
          }}
          onPointerDown={handlePointerDown}
        />
      );
    }

    case "ink": {
      const width = Math.max(1, operation.rect.width);
      const height = Math.max(1, operation.rect.height);
      const points = operation.points.map((point) => `${(point.x - operation.rect.x) * scale},${(operation.rect.height - (point.y - operation.rect.y)) * scale}`).join(" ");
      return (
        <div
          className={`${className} operation--ink-${operation.variant ?? "ink"}`}
          style={{ ...style, mixBlendMode: operation.variant === "freehand-highlight" ? "multiply" : undefined }}
          onPointerDown={handlePointerDown}
        >
          <svg viewBox={`0 0 ${width * scale} ${height * scale}`} preserveAspectRatio="none">
            <polyline points={points} fill="none" stroke={operation.stroke} strokeWidth={operation.strokeWidth * scale} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      );
    }

    case "annotation": {
      if (operation.kind === "highlight") {
        return (
          <div
            className={className}
            style={{ ...style, background: operation.color }}
            onPointerDown={handlePointerDown}
          />
        );
      }
      if (operation.kind === "strikeout" || operation.kind === "underline") {
        return (
          <div
            className={`${className} operation--annotation-${operation.kind}`}
            style={{ ...style, borderColor: operation.color, color: operation.color }}
            onPointerDown={handlePointerDown}
          />
        );
      }
      if (operation.kind === "callout") {
        const anchor = operation.anchor ?? { x: operation.rect.x - 48, y: operation.rect.y + operation.rect.height / 2 };
        const elbow = operation.elbow;
        const localPoint = (point: { x: number; y: number }) => ({
          x: (point.x - operation.rect.x) * scale,
          y: (operation.rect.y + operation.rect.height - point.y) * scale,
        });
        const anchorPoint = localPoint(anchor);
        const elbowPoint = elbow ? localPoint(elbow) : undefined;
        const boxEdge = anchor.x <= operation.rect.x
          ? { x: 0, y: rect.height / 2 }
          : { x: rect.width, y: rect.height / 2 };
        const leaderPoints = [anchorPoint, elbowPoint, boxEdge]
          .filter((point): point is { x: number; y: number } => Boolean(point))
          .map((point) => `${point.x},${point.y}`)
          .join(" ");
        return (
          <div
            className={`${className} operation--annotation-callout`}
            style={{ ...style, color: operation.textColor ?? "#111827" }}
            onPointerDown={handlePointerDown}
          >
            <svg className="operation__callout-leader" width={rect.width} height={rect.height} aria-hidden="true">
              <polyline
                points={leaderPoints}
                fill="none"
                stroke={operation.color}
                strokeWidth={Math.max(1, (operation.strokeWidth ?? 1.5) * scale)}
                strokeLinejoin="round"
              />
              <circle cx={anchorPoint.x} cy={anchorPoint.y} r={Math.max(2, 2.5 * scale)} fill={operation.color} />
            </svg>
            <div
              className="operation__callout-box"
              style={{
                background: operation.fillColor ?? "#ffffff",
                borderColor: operation.color,
                borderWidth: Math.max(1, (operation.strokeWidth ?? 1.5) * scale),
                fontSize: (operation.fontSize ?? 12) * scale,
              }}
            >
              {operation.text ?? "Callout"}
            </div>
          </div>
        );
      }
      return (
        <div className={className} style={{ ...style, color: operation.color, borderColor: operation.color }} onPointerDown={handlePointerDown}>
          {operation.text ?? operation.kind}
        </div>
      );
    }

    case "link":
      // Imported PDF links stay visually quiet (dashed outline only) so the
      // original page content shows through; user-created links keep their
      // kind-aware label (URL host, address, number, "Page N").
      return (
        <div
          className={`${className}${operation.imported ? " operation--link-imported" : ""}`}
          style={style}
          onPointerDown={handlePointerDown}
        >
          {operation.imported ? null : <span>{describeLinkTarget(operation.target)}</span>}
        </div>
      );

    case "form-field": {
      const fieldStyle = {
        ...style,
        color: operation.textColor ?? "#111827",
        background: operation.fillColor ?? "#ffffff",
        borderColor: operation.borderColor ?? "#94a3b8",
        borderWidth: operation.borderStyle === "underline" ? 0 : Math.max(0, (operation.borderWidth ?? 1) * scale),
        borderBottomWidth: operation.borderStyle === "underline" ? Math.max(0, (operation.borderWidth ?? 1) * scale) : undefined,
        borderStyle: operation.borderStyle === "dashed" ? "dashed" : "solid",
        fontFamily: resolveFont(operation.fontFamily).cssFamily,
        fontSize: Math.max(9, (operation.fontSize ?? 11) * scale),
        textAlign: operation.align ?? "left",
        transform: operation.rotation ? `rotate(${operation.rotation}deg)` : undefined,
      } as const;
      let content: ReactNode;
      if (operation.kind === "checkbox") {
        content = <span className="operation__form-choice" aria-hidden="true">{operation.checked ? "✓" : ""}</span>;
      } else if (operation.kind === "radio") {
        content = <span className="operation__form-radio" aria-hidden="true">{operation.checked ? "●" : ""}</span>;
      } else if (operation.kind === "dropdown") {
        content = <><span>{operation.value || operation.options?.[0] || operation.name}</span><span aria-hidden="true">⌄</span></>;
      } else if (operation.kind === "listbox") {
        const visible = operation.options?.slice(0, 4) ?? [];
        content = visible.length
          ? <span className="operation__form-list">{visible.map((option) => <span key={option} className={operation.selectedValues?.includes(option) ? "is-selected" : ""}>{option}</span>)}</span>
          : <span>{operation.name}</span>;
      } else if (operation.kind === "button") {
        content = <strong>{operation.buttonLabel || "Button"}</strong>;
      } else if (operation.kind === "signature") {
        content = <span className="operation__form-placeholder">Sign here</span>;
      } else if (operation.kind === "date") {
        content = <><span>{operation.value || operation.dateFormat || "yyyy-MM-dd"}</span><span aria-hidden="true">▣</span></>;
      } else {
        content = <span className={operation.value ? "" : "operation__form-placeholder"}>{operation.value || operation.name}</span>;
      }
      return (
        <div
          className={`${className} operation--form-field operation--form-${operation.kind}${operation.readOnly ? " is-read-only" : ""}${operation.required ? " is-required" : ""}`}
          style={fieldStyle}
          title={operation.tooltip || operation.name}
          onPointerDown={handlePointerDown}
        >
          {content}
        </div>
      );
    }

    case "form-mark": {
      const glyph = operation.mark === "check" ? "\u2713" : operation.mark === "cross" ? "\u2717" : "\u25CF";
      return (
        <div
          className={className}
          style={{ ...style, color: operation.color, fontSize: Math.max(8, rect.height * 0.85) }}
          onPointerDown={handlePointerDown}
        >
          <span aria-hidden="true">{glyph}</span>
        </div>
      );
    }

    default: {
      const exhaustive: never = operation;
      void exhaustive;
      return <div className={className} style={style} onPointerDown={handlePointerDown} />;
    }
  }
}

// Memoized so a drag/resize gesture (which now only re-renders the moving
// overlay -- see PdfCanvas's gestureOverride) doesn't force every other
// overlay on the page to re-render too, as long as their props stay referentially
// stable (see PdfCanvas's handleOverlayPointerDownById/handleStartTextEdit/etc.).
export const OperationOverlay = memo(OperationOverlayComponent);
