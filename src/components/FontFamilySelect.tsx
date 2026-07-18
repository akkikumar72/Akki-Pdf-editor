import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import Select, { components, type GroupBase, type OptionProps, type SingleValue, type StylesConfig } from "react-select";
import { FONT_CHOICES, type FontChoice } from "../engine/fontResolver";
import type { TextOperation } from "../types/editor";
import { fontFamilyPatch } from "./fontFamilyPatch";

export type FontOption = FontChoice & { value: string };

const fontOptions: FontOption[] = FONT_CHOICES.map((font) => ({ ...font, value: font.label }));

const FontPreviewContext = createContext<((font: FontOption) => void) | undefined>(undefined);

function fontPreviewPatch(font: FontOption): Partial<TextOperation> {
  return fontFamilyPatch(font.label);
}

function normalizeFontSearch(value: string) {
  return value.trim().toLowerCase();
}

function fontSearchScore(font: FontOption, query: string) {
  if (!query) return 1;
  const label = font.label.toLowerCase();
  const aliases = [font.metricCompatibleWith, font.displayAlias, ...(font.aliases ?? [])]
    .filter(Boolean)
    .map((value) => value!.toLowerCase());
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
    <span className="font-family-select__row" style={{ fontFamily: font.cssFamily }}>
      <span>{font.label}</span>
      {font.metricCompatibleWith || font.displayAlias ? (
        <span className="font-family-select__alt">({font.metricCompatibleWith ?? font.displayAlias})</span>
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

function buildStyles(variant: "toolbar" | "inspector"): StylesConfig<FontOption, false> {
  const isToolbar = variant === "toolbar";
  return {
    control: (base, state) => ({
      ...base,
      minHeight: isToolbar ? "2.15rem" : "2.4rem",
      height: isToolbar ? "2.15rem" : "2.4rem",
      minWidth: isToolbar ? "4.85rem" : "100%",
      border: isToolbar ? 0 : "var(--rule-hair) solid var(--color-rule)",
      borderRadius: isToolbar ? 0 : "var(--radius-sm)",
      boxShadow: state.isFocused ? "inset 0 0 0 2px var(--color-focus)" : "none",
      background: state.menuIsOpen
        ? "var(--color-accent-soft)"
        : isToolbar
          ? "transparent"
          : "var(--color-paper)",
      color: isToolbar ? "var(--color-accent)" : "var(--color-ink-2)",
      cursor: "pointer",
    }),
    valueContainer: (base) => ({
      ...base,
      height: isToolbar ? "2.15rem" : "2.4rem",
      padding: isToolbar ? "0 0 0 0.55rem" : "0 0.65rem",
    }),
    singleValue: (base) => ({
      ...base,
      display: "flex",
      alignItems: "center",
      color: isToolbar ? "var(--color-accent)" : "var(--color-ink-2)",
      fontFamily: "var(--font-ui)",
      fontSize: isToolbar ? "0.98rem" : "0.92rem",
      fontWeight: isToolbar ? 700 : 500,
    }),
    indicatorSeparator: () => ({ display: "none" }),
    dropdownIndicator: (base) => ({
      ...base,
      padding: isToolbar ? "0 0.45rem 0 0.1rem" : "0 0.5rem",
      color: isToolbar ? "var(--color-accent)" : "var(--color-ink-3)",
    }),
    menuPortal: (base) => ({ ...base, zIndex: 1000 }),
    menu: (base) => ({
      ...base,
      width: "min(22rem, calc(100vw - 1rem))",
      border: "var(--rule-hair) solid var(--color-rule-2)",
      borderRadius: "var(--radius-md)",
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
      background: state.isSelected || state.isFocused ? "var(--color-accent-soft)" : "var(--color-paper)",
      color: state.isSelected || state.isFocused ? "var(--color-accent)" : "var(--color-ink-2)",
      cursor: "pointer",
    }),
    input: (base) => ({
      ...base,
      color: isToolbar ? "var(--color-accent)" : "var(--color-ink-2)",
      margin: 0,
      padding: 0,
    }),
  };
}

type FontFamilySelectProps = {
  value: string;
  variant?: "toolbar" | "inspector";
  /** Live-preview while browsing options (hover/keyboard). Pass `undefined` to clear. */
  onPreview: (patch?: Partial<TextOperation>) => void;
  onCommit: (patch: Partial<TextOperation>) => void;
  onMenuOpen?: () => void;
  className?: string;
  "aria-label"?: string;
};

export function FontFamilySelect({
  value,
  variant = "toolbar",
  onPreview,
  onCommit,
  onMenuOpen,
  className,
  "aria-label": ariaLabel = "Font family",
}: FontFamilySelectProps) {
  const [fontInputValue, setFontInputValue] = useState("");
  const styles = useMemo(() => buildStyles(variant), [variant]);

  /* v8 ignore start -- "Inter" is always present in fontOptions, so the trailing fontOptions[0] fallback is unreachable */
  const selectedFontOption =
    fontOptions.find((font) => font.label === value)
    ?? fontOptions.find((font) => font.label === "Inter")
    ?? fontOptions[0];
  /* v8 ignore stop */

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
    onPreview(fontPreviewPatch(font));
  };

  return (
    <FontPreviewContext.Provider value={previewFont}>
      <Select<FontOption, false>
        aria-label={ariaLabel}
        className={className}
        classNamePrefix="font-select"
        components={{ Option: FontOptionRow }}
        filterOption={(candidate, input) => {
          const option = candidate.data;
          return fontSearchScore(option, normalizeFontSearch(input)) > 0;
        }}
        formatOptionLabel={(font, context) =>
          context.context === "value"
            ? variant === "toolbar"
              ? <span>Aa</span>
              : <span>{font.label}</span>
            : renderFontLabel(font)
        }
        getOptionLabel={(font) => font.label}
        getOptionValue={(font) => font.value}
        isSearchable
        menuPlacement="bottom"
        /* v8 ignore next -- SSR safety guard; `document` is always defined in the browser/jsdom runtime */
        menuPortalTarget={typeof document === "undefined" ? undefined : document.body}
        menuPosition="fixed"
        options={visibleFontOptions}
        placeholder={variant === "toolbar" ? "Aa" : "Font"}
        styles={styles}
        value={selectedFontOption}
        onBlur={() => onPreview()}
        onChange={(next: SingleValue<FontOption>) => {
          if (!next) return;
          onCommit(fontPreviewPatch(next));
          onPreview();
        }}
        onMenuClose={() => onPreview()}
        onMenuOpen={onMenuOpen}
        onInputChange={(input, meta) => {
          if (meta.action === "input-change") setFontInputValue(input);
          if (meta.action === "menu-close" || meta.action === "set-value") setFontInputValue("");
          return input;
        }}
      />
    </FontPreviewContext.Provider>
  );
}
