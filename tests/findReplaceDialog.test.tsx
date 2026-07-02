import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FindReplaceDialog } from "../src/components/FindReplaceDialog";
import type { EditOperation, TextItem, TextOperation } from "../src/types/editor";

const items: TextItem[] = [
  { str: "Hello world", pageIndex: 0, rect: { x: 100, y: 700, width: 110, height: 14 }, fontSize: 12 },
  { str: "hello again", pageIndex: 1, rect: { x: 50, y: 600, width: 100, height: 14 }, fontSize: 12 },
];

const PAGE_SIZES = [
  { width: 612, height: 792 },
  { width: 612, height: 792 },
];

type Props = React.ComponentProps<typeof FindReplaceDialog>;

function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    textItems: items,
    operations: [],
    pageSizes: PAGE_SIZES,
    onAddOperations: vi.fn(),
    onHighlight: vi.fn(),
    onPageChange: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

function renderDialog(overrides: Partial<Props> = {}) {
  const props = makeProps(overrides);
  const utils = render(<FindReplaceDialog {...props} />);
  return { ...utils, props };
}

function setQuery(value: string) {
  fireEvent.change(screen.getByLabelText("Find"), { target: { value } });
}

function setReplacement(value: string) {
  fireEvent.change(screen.getByLabelText("Replace with"), { target: { value } });
}

function clickFind() {
  fireEvent.click(screen.getByRole("button", { name: "Find" }));
}

function clickReplace() {
  fireEvent.click(screen.getByRole("button", { name: "Replace" }));
}

function clickReplaceAll() {
  fireEvent.click(screen.getByRole("button", { name: "Replace all" }));
}

function status() {
  return screen.getByRole("status").textContent;
}

function replacementCoveringItem(item: TextItem, id = "cover-1"): TextOperation {
  return {
    id,
    type: "text",
    pageIndex: item.pageIndex,
    rect: { ...item.rect },
    sourceCoverRect: { ...item.rect },
    text: "replaced",
    fontFamily: "Inter",
    fontSize: 12,
    color: "#111827",
    align: "left",
    whiteout: true,
    createdAt: 1,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FindReplaceDialog - find", () => {
  it("focuses the find input on open and asks for text when finding with an empty query", () => {
    renderDialog();
    expect(document.activeElement).toBe(screen.getByLabelText("Find"));
    clickFind();
    expect(status()).toBe("Please enter text to find");
  });

  it("reports when nothing matches", () => {
    renderDialog();
    setQuery("zzz");
    clickFind();
    expect(status()).toBe("No matches found");
  });

  it("cycles through matches, flags each on its page, and wraps with an end-of-document status", () => {
    const { props } = renderDialog();
    setQuery("hello");

    clickFind();
    expect(status()).toBe("Match 1 of 2");
    expect(props.onPageChange).toHaveBeenLastCalledWith(0);
    expect(props.onHighlight).toHaveBeenLastCalledWith({
      pageIndex: 0,
      rect: {
        x: 100,
        y: 700,
        width: 110 * (5 / 11),
        height: 14,
      },
    });

    clickFind();
    expect(status()).toBe("Match 2 of 2");
    expect(props.onPageChange).toHaveBeenLastCalledWith(1);

    clickFind();
    expect(status()).toBe("Reached end of the document");
    expect(props.onPageChange).toHaveBeenLastCalledWith(0);
  });

  it("finds via Enter in the find input and ignores other keys", () => {
    renderDialog();
    setQuery("hello");
    fireEvent.keyDown(screen.getByLabelText("Find"), { key: "a" });
    expect(status()).toBe("");
    fireEvent.keyDown(screen.getByLabelText("Find"), { key: "Enter" });
    expect(status()).toBe("Match 1 of 2");
  });

  it("respects the Match case option and resets the search when toggled", () => {
    renderDialog();
    setQuery("Hello");
    clickFind();
    expect(status()).toBe("Match 1 of 2");

    fireEvent.click(screen.getByLabelText("Match case"));
    expect(status()).toBe("");
    clickFind();
    expect(status()).toBe("Match 1 of 1");
  });

  it("resets the current match when the query changes", () => {
    const { props } = renderDialog();
    setQuery("hello");
    clickFind();
    expect(status()).toBe("Match 1 of 2");
    setQuery("hello ");
    expect(status()).toBe("");
    expect(props.onHighlight).toHaveBeenLastCalledWith(null);
  });

  it("skips items already masked by a replacement operation", () => {
    renderDialog({ operations: [replacementCoveringItem(items[0])] });
    setQuery("hello");
    clickFind();
    expect(status()).toBe("Match 1 of 1");
  });
});

describe("FindReplaceDialog - replace", () => {
  it("finds first when Replace is pressed without a current match", () => {
    const { props } = renderDialog();
    setQuery("hello");
    clickReplace();
    expect(status()).toBe("Match 1 of 2");
    expect(props.onAddOperations).not.toHaveBeenCalled();
  });

  it("replaces the current match with a whole-item replacement operation", () => {
    const { props } = renderDialog();
    setQuery("hello");
    setReplacement("Howdy");
    clickFind();
    clickReplace();
    expect(props.onAddOperations).toHaveBeenCalledTimes(1);
    const [created] = (props.onAddOperations as ReturnType<typeof vi.fn>).mock.calls[0][0] as TextOperation[];
    expect(created.type).toBe("text");
    expect(created.text).toBe("Howdy world");
    expect(created.whiteout).toBe(true);
    expect(created.pageIndex).toBe(0);
    expect(status()).toBe("Replaced 1 occurrence");
  });

  it("moves to the next remaining match after the replaced item drops out", () => {
    const { props, rerender } = renderDialog();
    setQuery("hello");
    clickFind();
    // Parent applies the replacement -> item 0 becomes masked.
    rerender(<FindReplaceDialog {...props} operations={[replacementCoveringItem(items[0])]} />);
    expect(props.onPageChange).toHaveBeenLastCalledWith(1);
    expect(props.onHighlight).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageIndex: 1 }),
    );
  });

  it("clamps the cursor to the last remaining match when the tail match disappears", () => {
    const { props, rerender } = renderDialog();
    setQuery("hello");
    clickFind();
    clickFind();
    expect(status()).toBe("Match 2 of 2");
    rerender(<FindReplaceDialog {...props} operations={[replacementCoveringItem(items[1])]} />);
    expect(props.onPageChange).toHaveBeenLastCalledWith(0);
  });

  it("clears the flag when no matches remain", () => {
    const { props, rerender } = renderDialog();
    setQuery("hello");
    clickFind();
    rerender(
      <FindReplaceDialog
        {...props}
        operations={[replacementCoveringItem(items[0], "c1"), replacementCoveringItem(items[1], "c2")]}
      />,
    );
    expect(props.onHighlight).toHaveBeenLastCalledWith(null);
  });

  it("falls back to the default page height when page sizes are unavailable", () => {
    const { props } = renderDialog({ pageSizes: [] });
    setQuery("hello");
    clickFind();
    clickReplace();
    expect(props.onAddOperations).toHaveBeenCalledTimes(1);
  });
});

describe("FindReplaceDialog - replace all", () => {
  it("asks for text with an empty query and reports when nothing matches", () => {
    const { props } = renderDialog();
    clickReplaceAll();
    expect(status()).toBe("Please enter text to find");
    setQuery("zzz");
    clickReplaceAll();
    expect(status()).toBe("No matches found");
    expect(props.onAddOperations).not.toHaveBeenCalled();
  });

  it("replaces every occurrence in one batch, one operation per item", () => {
    const { props } = renderDialog();
    setQuery("hello");
    setReplacement("hi");
    clickReplaceAll();
    const created = (props.onAddOperations as ReturnType<typeof vi.fn>).mock.calls[0][0] as TextOperation[];
    expect(created).toHaveLength(2);
    expect(created.map((op) => op.text)).toEqual(["hi world", "hi again"]);
    expect(status()).toBe("Replaced 2 occurrences");
  });

  it("groups multiple matches inside one item into a single operation", () => {
    const multi: TextItem[] = [
      { str: "abc abc", pageIndex: 0, rect: { x: 10, y: 700, width: 70, height: 12 }, fontSize: 10 },
    ];
    const { props } = renderDialog({ textItems: multi });
    setQuery("abc");
    setReplacement("x");
    clickReplaceAll();
    const created = (props.onAddOperations as ReturnType<typeof vi.fn>).mock.calls[0][0] as TextOperation[];
    expect(created).toHaveLength(1);
    expect(created[0].text).toBe("x x");
    expect(status()).toBe("Replaced 2 occurrences");
  });

  it("uses the singular status for a single replaced occurrence", () => {
    const single: TextItem[] = [
      { str: "only once", pageIndex: 0, rect: { x: 10, y: 700, width: 70, height: 12 }, fontSize: 10 },
    ];
    renderDialog({ textItems: single });
    setQuery("once");
    setReplacement("twice");
    clickReplaceAll();
    expect(status()).toBe("Replaced 1 occurrence");
  });
});

describe("FindReplaceDialog - dismissal", () => {
  it("closes on Escape and via the close button", () => {
    const { props } = renderDialog();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "a" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTitle("Close find and replace"));
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  it("clears the match flag on unmount", () => {
    const { props, unmount } = renderDialog();
    (props.onHighlight as ReturnType<typeof vi.fn>).mockClear();
    unmount();
    expect(props.onHighlight).toHaveBeenCalledWith(null);
  });
});

describe("FindReplaceDialog - operations filtering", () => {
  it("ignores non-replacement operations when filtering searchable items", () => {
    const whiteout: EditOperation = {
      id: "w1",
      type: "whiteout",
      pageIndex: 0,
      rect: { x: 100, y: 700, width: 110, height: 14 },
      color: "#fff",
      createdAt: 1,
    };
    renderDialog({ operations: [whiteout] });
    setQuery("hello");
    clickFind();
    expect(status()).toBe("Match 1 of 2");
  });
});
