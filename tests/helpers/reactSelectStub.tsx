// Shared `react-select` test stub for FontFamilySelect. Used by
// fontFamilySelect.test.tsx, floatingOperationToolbar.test.tsx, and
// inspector.test.tsx so all three suites drive the exact same deterministic
// surface instead of maintaining three near-identical ~80-line mocks.
//
// Usage:
//   vi.mock("react-select", async () => {
//     const { reactSelectStub } = await import("./helpers/reactSelectStub");
//     return reactSelectStub();
//   });
//
// (Exported as a factory rather than a plain module object so this file
// doesn't mix component exports with the module-shape export, which would
// trip the `react-refresh/only-export-components` lint rule.)
//
// Renders every prop callback the real `FontFamilySelect` wires up (styles
// config functions, the custom Option component, formatOptionLabel,
// onChange/onBlur/onMenuOpen/onMenuClose/onInputChange) behind stable
// data-testid hooks. Both the toolbar-style testids (`rs-*`, `font-select`,
// `value-label`, ...) and the inspector-style testids (`inspector-font-*`)
// are rendered together — only one `FontFamilySelect` instance mounts per
// test, so the unused set is simply inert extra markup.

type StubFontOption = { label: string; value: string };

type StubStyleSlot = (...args: unknown[]) => unknown;

type StubOptionProps = {
  data: StubFontOption;
  isFocused: boolean;
  innerProps: Record<string, unknown>;
  getStyles: () => Record<string, unknown>;
  children?: React.ReactNode;
};

type SelectProps = {
  styles?: Partial<Record<string, StubStyleSlot>>;
  value?: StubFontOption | null;
  options?: StubFontOption[];
  components?: { Option?: (props: StubOptionProps) => React.ReactNode };
  formatOptionLabel?: (option: StubFontOption | null | undefined, meta: { context: string }) => React.ReactNode;
  getOptionLabel?: (option: StubFontOption) => string;
  getOptionValue?: (option: StubFontOption) => string;
  filterOption?: (candidate: { data: StubFontOption }, input: string) => boolean;
  onChange?: (value: StubFontOption | null | undefined) => void;
  onBlur?: () => void;
  onMenuOpen?: () => void;
  onMenuClose?: () => void;
  onInputChange?: (value: string, meta: { action: string }) => void;
};

export function reactSelectStub() {
  const RealOption = (props: StubOptionProps) => (
    <div data-testid="rs-real-option" className={props.isFocused ? "focused" : ""}>
      {props.children}
    </div>
  );

  const Select = (props: SelectProps) => {
    // Exercise every styles-config slot so the real component's branches stay covered.
    const s = props.styles ?? {};
    s.control?.({}, { isFocused: true, menuIsOpen: true });
    s.control?.({}, { isFocused: false, menuIsOpen: false });
    s.valueContainer?.({});
    s.singleValue?.({});
    s.indicatorSeparator?.();
    s.dropdownIndicator?.({});
    s.menuPortal?.({});
    s.menu?.({});
    s.menuList?.({});
    s.option?.({}, { isSelected: true, isFocused: false });
    s.option?.({}, { isSelected: false, isFocused: true });
    s.option?.({}, { isSelected: false, isFocused: false });
    s.input?.({});

    const value = props.value;
    const first = props.options?.[0];
    const OptionComp = props.components?.Option ?? RealOption;

    return (
      <div data-testid="font-select">
        <div data-testid="inspector-font-select">
          <div data-testid="value-label">
            {props.formatOptionLabel?.(value, { context: "value" })}
          </div>
          <div data-testid="inspector-font-value">
            {props.formatOptionLabel?.(value, { context: "value" })}
          </div>
          <div data-testid="menu-label">
            {first ? props.formatOptionLabel?.(first, { context: "menu" }) : null}
          </div>
          <div data-testid="option-label">{first ? props.getOptionLabel?.(first) : null}</div>
          <div data-testid="option-value">{first ? props.getOptionValue?.(first) : null}</div>
          <div data-testid="filter-pass">
            {first ? String(props.filterOption?.({ data: first }, "inter")) : ""}
          </div>
          <div data-testid="filter-empty">
            {first ? String(props.filterOption?.({ data: first }, "")) : ""}
          </div>
          {/* Render the custom Option component focused + unfocused. */}
          {first ? (
            <OptionComp data={first} isFocused innerProps={{}} getStyles={() => ({})}>
              {props.formatOptionLabel?.(first, { context: "menu" })}
            </OptionComp>
          ) : null}
          {first ? (
            <OptionComp data={first} isFocused={false} innerProps={{}} getStyles={() => ({})}>
              x
            </OptionComp>
          ) : null}
          <button data-testid="rs-change" onClick={() => props.onChange?.(props.options?.[1] ?? first)}>
            change
          </button>
          <button data-testid="rs-change-null" onClick={() => props.onChange?.(null)}>
            change-null
          </button>
          <button
            type="button"
            data-testid="inspector-font-change"
            onClick={() => props.onChange?.(props.options?.find((o) => o.label === "Arial") ?? first)}
          >
            change-font
          </button>
          <button data-testid="rs-blur" onClick={() => props.onBlur?.()}>
            blur
          </button>
          <button type="button" data-testid="inspector-font-blur" onClick={() => props.onBlur?.()}>
            blur
          </button>
          <button data-testid="rs-menu-open" onClick={() => props.onMenuOpen?.()}>
            open
          </button>
          <button type="button" data-testid="inspector-font-open" onClick={() => props.onMenuOpen?.()}>
            open
          </button>
          <button data-testid="rs-menu-close" onClick={() => props.onMenuClose?.()}>
            close
          </button>
          <button type="button" data-testid="inspector-font-close" onClick={() => props.onMenuClose?.()}>
            close
          </button>
          <button
            data-testid="rs-input-change"
            onClick={() => props.onInputChange?.("Times", { action: "input-change" })}
          >
            input
          </button>
          <button
            data-testid="rs-input-menuclose"
            onClick={() => props.onInputChange?.("", { action: "menu-close" })}
          >
            input-mc
          </button>
          <button
            data-testid="rs-input-setvalue"
            onClick={() => props.onInputChange?.("", { action: "set-value" })}
          >
            input-sv
          </button>
          <button
            data-testid="rs-input-other"
            onClick={() => props.onInputChange?.("zz", { action: "input-blur" })}
          >
            input-other
          </button>
          <input
            data-testid="rs-input-query"
            onChange={(e) => props.onInputChange?.(e.currentTarget.value, { action: "input-change" })}
          />
          <div data-testid="visible-count">{props.options?.length}</div>
          <div data-testid="visible-first">{props.options?.[0]?.label}</div>
        </div>
      </div>
    );
  };

  return { __esModule: true, default: Select, components: { Option: RealOption } };
}
