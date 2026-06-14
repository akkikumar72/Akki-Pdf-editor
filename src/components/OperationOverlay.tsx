import type { EditOperation } from "../types/editor";
import { resolveFont } from "../engine/fontResolver";
import { pdfRectToViewport } from "../utils/coordinates";
import { useEffect, useRef } from "react";

type OperationOverlayProps = {
  operation: EditOperation;
  pageHeight: number;
  scale: number;
  selected: boolean;
  editing?: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onStartTextEdit?: (id: string) => void;
  onTextChange?: (id: string, text: string) => void;
  onTextCommit?: () => void;
};

export function OperationOverlay({
  operation,
  pageHeight,
  scale,
  selected,
  editing,
  onPointerDown,
  onStartTextEdit,
  onTextChange,
  onTextCommit,
}: OperationOverlayProps) {
  const textRef = useRef<HTMLDivElement | null>(null);
  const rect = pdfRectToViewport(operation.rect, pageHeight, scale);
  const style = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    opacity: operation.opacity ?? 1,
  };

  const className = `operation operation--${operation.type} ${selected ? "is-selected" : ""} ${editing ? "is-editing" : ""}`;

  useEffect(() => {
    if (!editing || operation.type !== "text" || !textRef.current) return;
    const element = textRef.current;
    element.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, [editing, operation.type]);

  if (operation.type === "text") {
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
          fontFamily: operation.cssFontFamily ?? resolveFont(operation.fontFamily).cssFamily,
          fontSize: operation.fontSize * scale,
          fontWeight: operation.fontWeight ?? (operation.bold ? 700 : 400),
          fontStyle: operation.fontStyle ?? (operation.italic ? "italic" : "normal"),
          letterSpacing: operation.letterSpacing ? operation.letterSpacing * scale : undefined,
          color: operation.color,
          textAlign: operation.align,
          background: operation.whiteout ? operation.whiteoutColor ?? "#fff" : "transparent",
        }}
        onPointerDown={onPointerDown}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onStartTextEdit?.(operation.id);
        }}
        onInput={(event) => {
          if (!editing) return;
          onTextChange?.(operation.id, event.currentTarget.textContent ?? "");
        }}
        onBlur={() => {
          if (editing) onTextCommit?.();
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
        {operation.text}
      </div>
    );
  }

  if (operation.type === "whiteout" || (operation.type === "annotation" && operation.kind === "highlight")) {
    return (
      <div
        className={className}
        style={{ ...style, background: operation.color }}
        onPointerDown={onPointerDown}
      />
    );
  }

  if (operation.type === "image") {
    return <div className={className} style={style} onPointerDown={onPointerDown}><img src={operation.dataUrl} alt="" /></div>;
  }

  if (operation.type === "signature") {
    return (
      <div
        className={className}
        style={{
          ...style,
          color: operation.color,
          fontFamily: resolveFont(operation.fontFamily).cssFamily,
        }}
        onPointerDown={onPointerDown}
      >
        {operation.mode === "image" ? <img src={operation.value} alt="Signature" /> : operation.value}
      </div>
    );
  }

  if (operation.type === "stamp") {
    return (
      <div
        className={className}
        style={{
          ...style,
          color: operation.color,
          borderColor: operation.borderColor,
        }}
        onPointerDown={onPointerDown}
      >
        {operation.label}
      </div>
    );
  }

  if (operation.type === "shape") {
    return (
      <div
        className={`${className} operation--shape-${operation.kind}`}
        style={{
          ...style,
          borderColor: operation.stroke,
          borderWidth: operation.strokeWidth,
          background: operation.fill === "transparent" ? "transparent" : operation.fill,
        }}
        onPointerDown={onPointerDown}
      />
    );
  }

  if (operation.type === "ink") {
    const width = Math.max(1, operation.rect.width);
    const height = Math.max(1, operation.rect.height);
    const points = operation.points.map((point) => `${(point.x - operation.rect.x) * scale},${(operation.rect.height - (point.y - operation.rect.y)) * scale}`).join(" ");
    return (
      <div className={className} style={style} onPointerDown={onPointerDown}>
        <svg viewBox={`0 0 ${width * scale} ${height * scale}`} preserveAspectRatio="none">
          <polyline points={points} fill="none" stroke={operation.stroke} strokeWidth={operation.strokeWidth * scale} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    );
  }

  if (operation.type === "annotation") {
    if (operation.kind === "strikeout" || operation.kind === "underline") {
      return (
        <div
          className={`${className} operation--annotation-${operation.kind}`}
          style={{ ...style, borderColor: operation.color, color: operation.color }}
          onPointerDown={onPointerDown}
        />
      );
    }
    return (
      <div className={className} style={{ ...style, color: operation.color, borderColor: operation.color }} onPointerDown={onPointerDown}>
        {operation.text ?? operation.kind}
      </div>
    );
  }

  if (operation.type === "link") {
    return (
      <div className={className} style={style} onPointerDown={onPointerDown}>
        <span>{operation.href}</span>
      </div>
    );
  }

  if (operation.type === "form-field") {
    return (
      <div className={`${className} operation--form-field operation--form-${operation.kind}`} style={style} onPointerDown={onPointerDown}>
        <span>{operation.checked ? "✓ " : null}{operation.value || operation.name}</span>
      </div>
    );
  }

  if (operation.type === "table-region") {
    return (
      <div className={className} style={style} onPointerDown={onPointerDown}>
        <span>{operation.label}</span>
      </div>
    );
  }

  return (
    <div className={className} style={style} onPointerDown={onPointerDown}>
      {operation.type === "form-mark" ? operation.mark : null}
    </div>
  );
}
