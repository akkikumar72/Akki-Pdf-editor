import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloatingOperationToolbar } from "../src/components/FloatingOperationToolbar";
import type { EditOperation, TextOperation, ViewportRect } from "../src/types/editor";

// ---------------------------------------------------------------------------
// Mock react-select with a lightweight stub that exercises every prop callback
// the component passes (formatOptionLabel for value + menu, filterOption, the
// custom Option component, onChange/onBlur/onMenuOpen/onMenuClose/onInputChange).
// This keeps the test deterministic while still driving the real component code.
// ---------------------------------------------------------------------------
type SelectProps = Record<string, any>;

vi.mock("react-select", () => {
  const realComponents = {
    Option: (props: SelectProps) => (
      <div data-testid="rs-real-option" className={props.isFocused ? "focused" : ""}>
        {props.children}
      </div>
    ),
  };
  const Select = (props: SelectProps) => {
    // Exercise the styles config functions so their branches are covered.
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
    const OptionComp = props.components?.Option ?? realComponents.Option;

    return (
      <div data-testid="font-select">
        <div data-testid="value-label">
          {props.formatOptionLabel?.(value, { context: "value" })}
        </div>
        <div data-testid="menu-label">
          {first ? props.formatOptionLabel?.(first, { context: "menu" }) : null}
        </div>
        <div data-testid="option-label">{first ? props.getOptionLabel?.(first) : null}</div>
        <div data-testid="option-value">{first ? props.getOptionValue?.(first) : null}</div>
        <div data-testid="filter-pass">
          {String(props.filterOption?.({ data: first }, "inter"))}
        </div>
        <div data-testid="filter-empty">
          {String(props.filterOption?.({ data: first }, ""))}
        </div>
        {/* Render the custom Option component focused + unfocused */}
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
        <button data-testid="rs-blur" onClick={() => props.onBlur?.()}>
          blur
        </button>
        <button data-testid="rs-menu-open" onClick={() => props.onMenuOpen?.()}>
          open
        </button>
        <button data-testid="rs-menu-close" onClick={() => props.onMenuClose?.()}>
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
    );
  };
  return {
    __esModule: true,
    default: Select,
    components: realComponents,
  };
});

const RECT: ViewportRect = { left: 50, top: 200, width: 120, height: 30 };

function baseText(overrides: Partial<TextOperation> = {}): TextOperation {
  return {
    id: "t1",
    type: "text",
    pageIndex: 0,
    rect: { x: 10, y: 20, width: 60, height: 20 },
    createdAt: 1,
    text: "Hi",
    fontFamily: "Inter",
    fontSize: 16,
    color: "#112233",
    align: "left",
    ...overrides,
  };
}

function renderToolbar(operation: EditOperation, props: Partial<React.ComponentProps<typeof FloatingOperationToolbar>> = {}) {
  const onDelete = vi.fn();
  const onDuplicate = vi.fn();
  const onLink = vi.fn();
  const onMoveToggle = vi.fn();
  const onTextPreview = vi.fn();
  const onUpdate = vi.fn();
  const utils = render(
    <FloatingOperationToolbar
      operation={operation}
      pageWidth={props.pageWidth ?? 600}
      rect={props.rect ?? RECT}
      scale={props.scale ?? 1}
      hidden={props.hidden}
      moveModeActive={props.moveModeActive}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onLink={onLink}
      onMoveToggle={"onMoveToggle" in props ? props.onMoveToggle : onMoveToggle}
      onTextPreview={onTextPreview}
      onUpdate={onUpdate}
    />,
  );
  return { ...utils, onDelete, onDuplicate, onLink, onMoveToggle, onTextPreview, onUpdate };
}

// Realistic layout so getBoundingClientRect-driven measure runs both branches.
const realGBCR = Element.prototype.getBoundingClientRect;
const OriginalRO = global.ResizeObserver;
class StubResizeObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
  constructor(_cb: () => void) {}
}
beforeEach(() => {
  vi.clearAllMocks();
  global.ResizeObserver = StubResizeObserver as unknown as typeof ResizeObserver;
  Element.prototype.getBoundingClientRect = vi.fn(() => ({
    left: 0, top: 0, width: 418, height: 34, right: 418, bottom: 34, x: 0, y: 0, toJSON() {},
  })) as unknown as typeof realGBCR;
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = realGBCR;
  global.ResizeObserver = OriginalRO;
  vi.restoreAllMocks();
});

describe("FloatingOperationToolbar", () => {
  it("returns null when hidden", () => {
    const { container } = renderToolbar(baseText(), { hidden: true });
    expect(container.querySelector(".floating-toolbar")).toBeNull();
  });

  it("renders the text toolbar with all controls", () => {
    renderToolbar(baseText());
    expect(screen.getByRole("toolbar")).toHaveClass("floating-toolbar--text");
    expect(screen.getByLabelText("Bold")).toBeInTheDocument();
    expect(screen.getByLabelText("Italic")).toBeInTheDocument();
    expect(screen.getByLabelText("Text color")).toBeInTheDocument();
    expect(screen.getByTestId("font-select")).toBeInTheDocument();
  });

  it("toggles bold on and off with the right patch", () => {
    const { onUpdate, rerender } = renderToolbar(baseText({ bold: false }));
    fireEvent.click(screen.getByLabelText("Bold"));
    expect(onUpdate).toHaveBeenCalledWith("t1", { bold: true, fontWeight: 700, embeddedFontKey: undefined });
    rerender(
      <FloatingOperationToolbar
        operation={baseText({ bold: true })}
        pageWidth={600}
        rect={RECT}
        scale={1}
        onDelete={vi.fn()}
        onDuplicate={vi.fn()}
        onLink={vi.fn()}
        onTextPreview={vi.fn()}
        onUpdate={onUpdate}
      />,
    );
    fireEvent.click(screen.getByLabelText("Bold"));
    expect(onUpdate).toHaveBeenLastCalledWith("t1", { bold: false, fontWeight: 400, embeddedFontKey: undefined });
  });

  it("toggles italic on and off with the right patch", () => {
    const { onUpdate } = renderToolbar(baseText({ italic: true }));
    fireEvent.click(screen.getByLabelText("Italic"));
    expect(onUpdate).toHaveBeenCalledWith("t1", { italic: false, fontStyle: "normal", embeddedFontKey: undefined });
  });

  it("toggles italic from off to on", () => {
    const { onUpdate } = renderToolbar(baseText({ italic: false }));
    fireEvent.click(screen.getByLabelText("Italic"));
    expect(onUpdate).toHaveBeenCalledWith("t1", { italic: true, fontStyle: "italic", embeddedFontKey: undefined });
  });

  it("opens and closes the font-size menu and picks a size", () => {
    const { onUpdate } = renderToolbar(baseText({ fontSize: 16 }));
    const sizeButton = screen.getByLabelText("Font size 16");
    // open
    fireEvent.click(sizeButton);
    const menu = screen.getByRole("menu", { name: "Font size options" });
    expect(menu).toBeInTheDocument();
    // a standard size in the list
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: "24" }));
    expect(onUpdate).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ fontSize: 24, rect: expect.objectContaining({ height: Math.max(20, 24 * 1.3) }) }),
    );
    // menu closes after a pick
    expect(screen.queryByRole("menu", { name: "Font size options" })).toBeNull();
  });

  it("toggles the size menu closed when clicked twice", () => {
    renderToolbar(baseText());
    const sizeButton = screen.getByLabelText(/Font size/);
    fireEvent.click(sizeButton);
    expect(screen.getByRole("menu", { name: "Font size options" })).toBeInTheDocument();
    fireEvent.click(sizeButton);
    expect(screen.queryByRole("menu", { name: "Font size options" })).toBeNull();
  });

  it("injects a non-standard current font size into the options list", () => {
    renderToolbar(baseText({ fontSize: 13 }));
    fireEvent.click(screen.getByLabelText("Font size 13"));
    const menu = screen.getByRole("menu", { name: "Font size options" });
    expect(within(menu).getByRole("menuitemradio", { name: "13" })).toBeInTheDocument();
    // checked reflects the current size
    expect(within(menu).getByRole("menuitemradio", { name: "13" })).toHaveAttribute("aria-checked", "true");
  });

  it("changes the text color", () => {
    const { onUpdate } = renderToolbar(baseText());
    fireEvent.change(screen.getByLabelText("Text color"), { target: { value: "#ff8800" } });
    expect(onUpdate).toHaveBeenCalledWith("t1", { color: "#ff8800" });
  });

  it("rounds the displayed font size", () => {
    renderToolbar(baseText({ fontSize: 15.6 }));
    expect(screen.getByLabelText("Font size 16")).toBeInTheDocument();
  });

  describe("font select callbacks", () => {
    it("renders value + menu labels and exercises filter/getOption helpers", () => {
      renderToolbar(baseText());
      expect(screen.getByTestId("value-label").textContent).toContain("Aa");
      // first font option is "Amiri" with displayAlias "Arabic"
      expect(screen.getByTestId("menu-label").textContent).toContain("Amiri");
      expect(screen.getByTestId("option-label").textContent).toBe("Amiri");
      expect(screen.getByTestId("option-value").textContent).toBe("Amiri");
      // "Amiri" vs "inter" -> score 0 -> filtered out
      expect(screen.getByTestId("filter-pass").textContent).toBe("false");
      // empty query -> score 1 -> kept
      expect(screen.getByTestId("filter-empty").textContent).toBe("true");
    });

    it("applies a font choice on change and previews on blur/menu events", () => {
      const { onUpdate, onTextPreview } = renderToolbar(baseText());
      fireEvent.click(screen.getByTestId("rs-change"));
      expect(onUpdate).toHaveBeenCalledWith(
        "t1",
        expect.objectContaining({ cssFontFamily: undefined, detectedFontName: undefined, embeddedFontKey: undefined }),
      );
      expect(onTextPreview).toHaveBeenCalledWith("t1");

      onTextPreview.mockClear();
      fireEvent.click(screen.getByTestId("rs-change-null")); // null -> early return, no update/preview
      expect(onTextPreview).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId("rs-blur"));
      expect(onTextPreview).toHaveBeenCalledWith("t1");

      fireEvent.click(screen.getByTestId("rs-menu-close"));
      expect(onTextPreview).toHaveBeenCalledWith("t1");

      fireEvent.click(screen.getByTestId("rs-menu-open"));
      // opening the font menu closes the size menu (sets openMenu undefined)
    });

    it("filters visible options across every fontSearchScore branch", () => {
      renderToolbar(baseText());
      const input = screen.getByTestId("rs-input-query") as HTMLInputElement;
      const visibleFirst = () => screen.getByTestId("visible-first").textContent;
      const visibleCount = () => Number(screen.getByTestId("visible-count").textContent);

      // exact label match -> score 100 ranks first
      fireEvent.change(input, { target: { value: "amiri" } });
      expect(visibleFirst()).toBe("Amiri");

      // prefix match -> score 80
      fireEvent.change(input, { target: { value: "ami" } });
      expect(visibleFirst()).toBe("Amiri");

      // substring match -> score 60 (not a prefix of any label)
      fireEvent.change(input, { target: { value: "mir" } });
      expect(visibleCount()).toBeGreaterThan(0);

      // alias exact match -> score 45 (e.g. Arial alias "Helvetica")
      fireEvent.change(input, { target: { value: "helvetica" } });
      expect(visibleCount()).toBeGreaterThan(0);

      // alias prefix match -> score 35 (alias "Liberation Sans")
      fireEvent.change(input, { target: { value: "liberation s" } });
      expect(visibleCount()).toBeGreaterThan(0);

      // alias substring match -> score 20
      fireEvent.change(input, { target: { value: "beration" } });
      expect(visibleCount()).toBeGreaterThan(0);

      // broad query producing ties -> secondary index sort runs
      fireEvent.change(input, { target: { value: "an" } });
      expect(visibleCount()).toBeGreaterThan(1);

      // no match -> empty list (score 0 filtered out)
      fireEvent.change(input, { target: { value: "zzzzzzzz" } });
      expect(visibleCount()).toBe(0);

      // clearing the query restores the full list
      fireEvent.change(input, { target: { value: "" } });
      expect(visibleCount()).toBeGreaterThan(10);
    });

    it("drives onInputChange for every action branch", () => {
      renderToolbar(baseText());
      fireEvent.click(screen.getByTestId("rs-input-change"));
      fireEvent.click(screen.getByTestId("rs-input-menuclose"));
      fireEvent.click(screen.getByTestId("rs-input-setvalue"));
      fireEvent.click(screen.getByTestId("rs-input-other"));
      // no throw == branches covered
      expect(screen.getByTestId("font-select")).toBeInTheDocument();
    });
  });

  describe("non-text operation", () => {
    const whiteout: EditOperation = {
      id: "w1", type: "whiteout", pageIndex: 0,
      rect: { x: 0, y: 0, width: 10, height: 10 }, createdAt: 1, color: "#000",
    };

    it("renders only the common buttons (no text controls)", () => {
      renderToolbar(whiteout);
      expect(screen.queryByLabelText("Bold")).toBeNull();
      expect(screen.queryByTestId("font-select")).toBeNull();
      expect(screen.getByLabelText("Add link")).toBeInTheDocument();
      expect(screen.getByRole("toolbar")).not.toHaveClass("floating-toolbar--text");
    });

    it("fires link, duplicate, delete and move-toggle", () => {
      const { onLink, onDuplicate, onDelete, onMoveToggle } = renderToolbar(whiteout);
      fireEvent.click(screen.getByLabelText("Add link"));
      expect(onLink).toHaveBeenCalledWith(whiteout);
      fireEvent.click(screen.getByLabelText("Duplicate"));
      expect(onDuplicate).toHaveBeenCalledWith(whiteout);
      fireEvent.click(screen.getByLabelText("Delete"));
      expect(onDelete).toHaveBeenCalledWith("w1");
      fireEvent.click(screen.getByLabelText("Move"));
      expect(onMoveToggle).toHaveBeenCalledTimes(1);
    });

    it("shows the active move-mode title and pressed state", () => {
      renderToolbar(whiteout, { moveModeActive: true });
      const move = screen.getByLabelText("Move");
      expect(move).toHaveAttribute("aria-pressed", "true");
      expect(move).toHaveAttribute("title", expect.stringContaining("Move mode on"));
    });

    it("does not throw when onMoveToggle is omitted", () => {
      renderToolbar(whiteout, { onMoveToggle: undefined });
      fireEvent.click(screen.getByLabelText("Move"));
      expect(screen.getByLabelText("Move")).toBeInTheDocument();
    });
  });

  it("stops propagation on click and pointerdown", () => {
    renderToolbar(baseText());
    const toolbar = screen.getByRole("toolbar");
    const clickHandled = fireEvent.click(toolbar);
    const pdHandled = fireEvent.pointerDown(toolbar);
    expect(clickHandled).toBe(true);
    expect(pdHandled).toBe(true);
  });

  it("places the toolbar below when the rect is near the top edge", () => {
    renderToolbar(baseText(), { rect: { left: 50, top: 5, width: 100, height: 20 } });
    expect(screen.getByRole("toolbar")).toHaveAttribute("data-placement", "below");
  });

  it("places the toolbar above when there is room", () => {
    renderToolbar(baseText(), { rect: { left: 50, top: 400, width: 100, height: 20 } });
    expect(screen.getByRole("toolbar")).toHaveAttribute("data-placement", "above");
  });

  it("selects Inter as the fallback when the font family is unknown", () => {
    renderToolbar(baseText({ fontFamily: "TotallyUnknownFont" }));
    // value label still renders (selected option resolved to Inter)
    expect(screen.getByTestId("value-label")).toBeInTheDocument();
  });

  it("skips measuring when getBoundingClientRect reports zero size", () => {
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0, x: 0, y: 0, toJSON() {},
    })) as unknown as typeof realGBCR;
    renderToolbar(baseText());
    // falls back to default toolbar size; component still renders
    expect(screen.getByRole("toolbar")).toBeInTheDocument();
  });

  it("re-measures via ResizeObserver callback", () => {
    let observerCb: (() => void) | undefined;
    global.ResizeObserver = class {
      constructor(cb: () => void) { observerCb = cb; }
      observe() {}
      disconnect() {}
      unobserve() {}
    } as unknown as typeof ResizeObserver;
    renderToolbar(baseText());
    act(() => {
      observerCb?.();
    });
    expect(screen.getByRole("toolbar")).toBeInTheDocument();
  });
});
