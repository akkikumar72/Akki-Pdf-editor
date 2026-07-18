import { Bold, ChevronDown, Copy, Italic, Link2, Move, PaintBucket, Palette, Square, Trash2, Type } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { EditOperation, EditOperationPatch, TextOperation, ViewportRect } from "../types/editor";
import { clampToolbarLeft, getToolbarPlacement, TOOLBAR_FALLBACK_HEIGHT_PX } from "../utils/toolbarPlacement";
import { FontFamilySelect } from "./FontFamilySelect";

type FloatingOperationToolbarProps = {
  operation: EditOperation;
  pageWidth: number;
  rect: ViewportRect;
  scale: number;
  hidden?: boolean;
  moveModeActive?: boolean;
  onDelete: (id: string) => void;
  onDuplicate: (operation: EditOperation) => void;
  onLink: (operation: EditOperation) => void;
  onMoveToggle?: () => void;
  onTextPreview: (id: string, patch?: Partial<TextOperation>) => void;
  onUpdate: (id: string, patch: EditOperationPatch) => void;
};

const FONT_SIZE_OPTIONS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
type OpenMenu = "size" | undefined;

function updateTextStyle(operation: TextOperation, patch: Partial<TextOperation>, onUpdate: FloatingOperationToolbarProps["onUpdate"]) {
  onUpdate(operation.id, patch);
}

export function FloatingOperationToolbar({
  operation,
  pageWidth,
  rect,
  scale,
  hidden = false,
  moveModeActive = false,
  onDelete,
  onDuplicate,
  onLink,
  onMoveToggle,
  onTextPreview,
  onUpdate,
}: FloatingOperationToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const [toolbarSize, setToolbarSize] = useState({ width: 418, height: TOOLBAR_FALLBACK_HEIGHT_PX });
  const [openMenu, setOpenMenu] = useState<OpenMenu>();
  const isText = operation.type === "text";
  const isShape = operation.type === "shape";
  const stageWidth = pageWidth * scale;

  useLayoutEffect(() => {
    const node = toolbarRef.current;
    if (!node) return;
    const measure = () => {
      const next = node.getBoundingClientRect();
      if (next.width > 0 && next.height > 0) {
        setToolbarSize({ width: next.width, height: next.height });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isText, operation.id]);

  const toolbarPlacement = getToolbarPlacement(rect, toolbarSize.width, toolbarSize.height);
  const toolbarTop = toolbarPlacement.top;
  const toolbarLeft = clampToolbarLeft(toolbarPlacement.left, toolbarSize.width, stageWidth, rect);
  const currentFontSize = isText ? Math.round(operation.fontSize) : 14;
  const fontSizeOptions = useMemo(() => {
    if (!isText || FONT_SIZE_OPTIONS.includes(currentFontSize)) return FONT_SIZE_OPTIONS;
    return [...FONT_SIZE_OPTIONS, currentFontSize].sort((a, b) => a - b);
  }, [currentFontSize, isText]);

  if (hidden) return null;

  return (
    <div
      ref={toolbarRef}
      className={`floating-toolbar ${isText ? "floating-toolbar--text" : ""}`}
      data-placement={toolbarPlacement.placement}
      aria-label="Inline edit tools"
      role="toolbar"
      style={{ left: toolbarLeft, top: toolbarTop }}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {isText ? (
        <>
          <button
            type="button"
            className="floating-toolbar__button"
            aria-pressed={Boolean(operation.bold)}
            aria-label="Bold"
            title="Bold"
            onClick={() =>
              updateTextStyle(
                operation,
                {
                  bold: !operation.bold,
                  fontWeight: operation.bold ? 400 : 700,
                  embeddedFontKey: undefined,
                },
                onUpdate,
              )}
          >
            <Bold aria-hidden="true" />
          </button>
          <button
            type="button"
            className="floating-toolbar__button"
            aria-pressed={Boolean(operation.italic)}
            aria-label="Italic"
            title="Italic"
            onClick={() =>
              updateTextStyle(
                operation,
                {
                  italic: !operation.italic,
                  fontStyle: operation.italic ? "normal" : "italic",
                  embeddedFontKey: undefined,
                },
                onUpdate,
              )}
          >
            <Italic aria-hidden="true" />
          </button>
          <div className="floating-toolbar__menu" title="Font size">
            <button
              type="button"
              className="floating-toolbar__select"
              aria-expanded={openMenu === "size"}
              aria-haspopup="menu"
              aria-label={`Font size ${currentFontSize}`}
              onClick={() => setOpenMenu((value) => value === "size" ? undefined : "size")}
            >
              <Type aria-hidden="true" />
              <span>{currentFontSize}</span>
              <ChevronDown aria-hidden="true" />
            </button>
            {openMenu === "size" ? (
              <div className="floating-toolbar__popover floating-toolbar__popover--size" role="menu" aria-label="Font size options">
                {fontSizeOptions.map((size) => (
                  <button
                    key={size}
                    type="button"
                    role="menuitemradio"
                    aria-checked={currentFontSize === size}
                    onClick={() => {
                      updateTextStyle(
                        operation,
                        {
                          fontSize: size,
                          rect: {
                            ...operation.rect,
                            height: Math.max(operation.rect.height, size * 1.3),
                          },
                        },
                        onUpdate,
                      );
                      setOpenMenu(undefined);
                    }}
                  >
                    {size}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="floating-toolbar__menu floating-toolbar__font-select">
            <FontFamilySelect
              className="floating-toolbar__font-control"
              value={operation.fontFamily}
              variant="toolbar"
              onCommit={(patch) => updateTextStyle(operation, patch, onUpdate)}
              onMenuOpen={() => setOpenMenu(undefined)}
              onPreview={(patch) => onTextPreview(operation.id, patch)}
            />
          </div>
          <label className="floating-toolbar__color" title="Text color">
            <Palette aria-hidden="true" />
            <input
              aria-label="Text color"
              type="color"
              value={operation.color}
              onChange={(event) => updateTextStyle(operation, { color: event.currentTarget.value }, onUpdate)}
            />
          </label>
        </>
      ) : null}

      {isShape ? (
        <>
          <label className="floating-toolbar__color" title="Border color">
            <Palette aria-hidden="true" />
            <input
              aria-label="Border color"
              type="color"
              value={operation.stroke}
              onChange={(event) => onUpdate(operation.id, { stroke: event.currentTarget.value })}
            />
          </label>
          <label className="floating-toolbar__color" title="Fill color">
            <PaintBucket aria-hidden="true" />
            <input
              aria-label="Fill color"
              type="color"
              value={operation.fill && operation.fill !== "transparent" ? operation.fill : "#ffffff"}
              onChange={(event) => onUpdate(operation.id, { fill: event.currentTarget.value })}
            />
          </label>
          <button
            type="button"
            className="floating-toolbar__button"
            aria-label="No fill"
            aria-pressed={!operation.fill || operation.fill === "transparent"}
            title="No fill (transparent)"
            onClick={() => onUpdate(operation.id, { fill: "transparent" })}
          >
            <Square aria-hidden="true" />
          </button>
          <label className="floating-toolbar__width" title="Border width">
            <span className="visually-hidden">Border width</span>
            <select
              aria-label="Border width"
              value={operation.strokeWidth}
              onChange={(event) => onUpdate(operation.id, { strokeWidth: Number(event.currentTarget.value) })}
            >
              {[1, 2, 3, 4, 6, 8].map((width) => (
                <option key={width} value={width}>{width}px</option>
              ))}
            </select>
          </label>
        </>
      ) : null}

      <button type="button" className="floating-toolbar__button" aria-label="Add link" title="Add link" onClick={() => onLink(operation)}>
        <Link2 aria-hidden="true" />
      </button>
      <button
        type="button"
        className="floating-toolbar__button"
        aria-label="Move"
        aria-pressed={moveModeActive}
        title={moveModeActive ? "Move mode on — drag to reposition" : "Move — drag overlay to reposition"}
        onClick={() => onMoveToggle?.()}
      >
        <Move aria-hidden="true" />
      </button>
      <button type="button" className="floating-toolbar__button" aria-label="Duplicate" title="Duplicate" onClick={() => onDuplicate(operation)}>
        <Copy aria-hidden="true" />
      </button>
      <button type="button" className="floating-toolbar__button" aria-label="Delete" title="Delete" onClick={() => onDelete(operation.id)}>
        <Trash2 aria-hidden="true" />
      </button>
    </div>
  );
}
