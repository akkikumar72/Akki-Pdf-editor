import { Bold, ChevronDown, Copy, Italic, Link2, Move, Palette, Trash2, Type } from "lucide-react";
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Select, { components, type GroupBase, type OptionProps, type SingleValue, type StylesConfig } from "react-select";
import { FONT_CHOICES } from "../engine/fontResolver";
import type { FontChoice } from "../engine/fontResolver";
import type { EditOperation, TextOperation, ViewportRect } from "../types/editor";
import { clampToolbarLeft, getToolbarPlacement, TOOLBAR_FALLBACK_HEIGHT_PX } from "../utils/toolbarPlacement";

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
  onUpdate: (id: string, patch: Partial<EditOperation>) => void;
};

const FONT_SIZE_OPTIONS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
type OpenMenu = "size" | undefined;
type FontOption = FontChoice & { value: string };
const FontPreviewContext = createContext<((font: FontOption) => void) | undefined>(undefined);

function updateTextStyle(operation: TextOperation, patch: Partial<TextOperation>, onUpdate: FloatingOperationToolbarProps["onUpdate"]) {
  onUpdate(operation.id, patch as Partial<EditOperation>);
}

const fontOptions: FontOption[] = FONT_CHOICES.map((font) => ({ ...font, value: font.label }));

function fontPreviewPatch(font: FontOption): Partial<TextOperation> {
  return {
    fontFamily: font.label,
    cssFontFamily: undefined,
    detectedFontName: undefined,
    embeddedFontKey: undefined,
  };
}

function normalizeFontSearch(value: string) {
  return value.trim().toLowerCase();
}

function fontSearchScore(font: FontOption, query: string) {
  if (!query) return 1;
  const label = font.label.toLowerCase();
  const aliases = [font.metricCompatibleWith, font.displayAlias, ...(font.aliases ?? [])].filter(Boolean).map((value) => value!.toLowerCase());
  if (label === query) return 100;
  if (label.startsWith(query)) return 80;
  if (label.includes(query)) return 60;
  if (aliases.some((alias) => alias === query)) return 45;
  if (aliases.some((alias) => alias.startsWith(query))) return 35;
  if (aliases.some((alias) => alias.includes(query))) return 20;
  return 0;
}

function renderFontLabel(font: FontOption) {
  return (
    <span className="floating-toolbar__font-row" style={{ fontFamily: font.cssFamily }}>
      <span>{font.label}</span>
      {font.metricCompatibleWith || font.displayAlias ? (
        <span className="floating-toolbar__font-alt">({font.metricCompatibleWith ?? font.displayAlias})</span>
      ) : null}
    </span>
  );
}

function FontOptionRow(props: OptionProps<FontOption, false, GroupBase<FontOption>>) {
  const previewFont = useContext(FontPreviewContext);
  const { data } = props;
  const previewRef = useRef(previewFont);

  useEffect(() => {
    previewRef.current = previewFont;
  }, [previewFont]);

  useEffect(() => {
    if (props.isFocused) {
      previewRef.current?.(data);
    }
  }, [data, props.isFocused]);

  return (
    <components.Option {...props}>
      {renderFontLabel(data)}
    </components.Option>
  );
}

const fontSelectStyles: StylesConfig<FontOption, false> = {
  control: (base, state) => ({
    ...base,
    minHeight: "2.15rem",
    height: "2.15rem",
    minWidth: "4.85rem",
    border: 0,
    borderRadius: 0,
    boxShadow: state.isFocused ? "inset 0 0 0 2px var(--ring)" : "none",
    background: state.menuIsOpen ? "var(--accent)" : "transparent",
    color: "var(--primary)",
    cursor: "pointer",
  }),
  valueContainer: (base) => ({
    ...base,
    height: "2.15rem",
    padding: "0 0 0 0.55rem",
  }),
  singleValue: (base) => ({
    ...base,
    display: "flex",
    alignItems: "center",
    color: "var(--primary)",
    fontFamily: "var(--font-sans)",
    fontSize: "0.98rem",
    fontWeight: 700,
  }),
  indicatorSeparator: () => ({ display: "none" }),
  dropdownIndicator: (base) => ({
    ...base,
    padding: "0 0.45rem 0 0.1rem",
    color: "var(--primary)",
  }),
  menuPortal: (base) => ({ ...base, zIndex: 1000 }),
  menu: (base) => ({
    ...base,
    width: "min(22rem, calc(100vw - 1rem))",
    border: "1px solid var(--border)",
    borderRadius: "0.5rem",
    boxShadow: "0 18px 44px -28px oklch(0% 0 0 / 0.62)",
    overflow: "hidden",
  }),
  menuList: (base) => ({
    ...base,
    maxHeight: "22rem",
    padding: "0.35rem 0",
  }),
  option: (base, state) => ({
    ...base,
    minHeight: "2.25rem",
    padding: "0.45rem 0.75rem",
    background: state.isSelected || state.isFocused ? "var(--accent)" : "var(--popover)",
    color: state.isSelected || state.isFocused ? "var(--primary)" : "var(--popover-foreground)",
    cursor: "pointer",
  }),
  input: (base) => ({
    ...base,
    color: "var(--primary)",
    margin: 0,
    padding: 0,
  }),
};

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
  const [fontInputValue, setFontInputValue] = useState("");
  const isText = operation.type === "text";
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
  // "Inter" is always present in FONT_CHOICES, so it is the guaranteed fallback.
  const interFontOption = fontOptions.find((font) => font.label === "Inter")!;
  const selectedFontOption = isText
    ? fontOptions.find((font) => font.label === operation.fontFamily) ?? interFontOption
    : fontOptions[0];
  const visibleFontOptions = useMemo(() => {
    const query = normalizeFontSearch(fontInputValue);
    if (!query) return fontOptions;
    return fontOptions
      .map((font, index) => ({ font, index, score: fontSearchScore(font, query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map((entry) => entry.font);
  }, [fontInputValue]);
  const previewFont = (font: FontOption) => {
    /* v8 ignore next -- previewFont is only wired up inside the isText branch */
    if (isText) {
      onTextPreview(operation.id, fontPreviewPatch(font));
    }
  };

  if (hidden) return null;

  return (
    <div
      ref={toolbarRef}
      className="absolute z-40 flex items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-lg"
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
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary [&_svg]:size-4"
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
            className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary [&_svg]:size-4"
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
          <div className="relative" title="Font size">
            <button
              type="button"
              className="flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-muted-foreground text-sm transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4"
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
              <div className="absolute top-full left-0 z-50 mt-1 grid max-h-64 grid-cols-3 gap-0.5 overflow-y-auto rounded-lg border bg-popover p-1 shadow-md" role="menu" aria-label="Font size options">
                {fontSizeOptions.map((size) => (
                  <button
                    key={size}
                    type="button"
                    role="menuitemradio"
                    aria-checked={currentFontSize === size}
                    className="cursor-pointer rounded-md px-2 py-1 text-center text-sm hover:bg-accent aria-checked:bg-primary/10 aria-checked:text-primary"
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
          <div className="relative">
            <FontPreviewContext.Provider value={previewFont}>
              <Select<FontOption, false>
                aria-label="Font family"
                className="floating-toolbar__font-control"
                classNamePrefix="font-select"
                components={{ Option: FontOptionRow }}
                filterOption={(candidate, input) => {
                  const option = candidate.data;
                  return fontSearchScore(option, normalizeFontSearch(input)) > 0;
                }}
                formatOptionLabel={(font, context) => (
                  context.context === "value"
                    ? <span>Aa</span>
                    : renderFontLabel(font)
                )}
                getOptionLabel={(font) => font.label}
                getOptionValue={(font) => font.value}
                isSearchable
                menuPlacement="bottom"
                /* v8 ignore next -- document is always defined in the browser/runtime */
                menuPortalTarget={typeof document === "undefined" ? undefined : document.body}
                menuPosition="fixed"
                options={visibleFontOptions}
                placeholder="Aa"
                styles={fontSelectStyles}
                value={selectedFontOption}
                onBlur={() => onTextPreview(operation.id)}
                onChange={(value: SingleValue<FontOption>) => {
                  /* v8 ignore next -- the font select is not clearable, so value is always set */
                  if (!value) return;
                  updateTextStyle(
                    operation,
                    {
                      fontFamily: value.label,
                      cssFontFamily: undefined,
                      detectedFontName: undefined,
                      embeddedFontKey: undefined,
                    },
                    onUpdate,
                  );
                  onTextPreview(operation.id);
                }}
                onMenuClose={() => onTextPreview(operation.id)}
                onMenuOpen={() => setOpenMenu(undefined)}
                onInputChange={(value, meta) => {
                  if (meta.action === "input-change") setFontInputValue(value);
                  if (meta.action === "menu-close" || meta.action === "set-value") setFontInputValue("");
                  return value;
                }}
              />
            </FontPreviewContext.Provider>
          </div>
          <label className="flex h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4" title="Text color">
            <Palette aria-hidden="true" />
            <input
              aria-label="Text color"
              type="color"
              className="size-5 cursor-pointer rounded border-0 bg-transparent p-0"
              value={operation.color}
              onChange={(event) => updateTextStyle(operation, { color: event.currentTarget.value }, onUpdate)}
            />
          </label>
        </>
      ) : null}

      <button type="button" className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary [&_svg]:size-4" aria-label="Add link" title="Add link" onClick={() => onLink(operation)}>
        <Link2 aria-hidden="true" />
      </button>
      <button
        type="button"
        className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary [&_svg]:size-4"
        aria-label="Move"
        aria-pressed={moveModeActive}
        title={moveModeActive ? "Move mode on — drag to reposition" : "Move — drag overlay to reposition"}
        onClick={() => onMoveToggle?.()}
      >
        <Move aria-hidden="true" />
      </button>
      <button type="button" className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary [&_svg]:size-4" aria-label="Duplicate" title="Duplicate" onClick={() => onDuplicate(operation)}>
        <Copy aria-hidden="true" />
      </button>
      <button type="button" className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground aria-pressed:bg-primary/10 aria-pressed:text-primary [&_svg]:size-4" aria-label="Delete" title="Delete" onClick={() => onDelete(operation.id)}>
        <Trash2 aria-hidden="true" />
      </button>
    </div>
  );
}
