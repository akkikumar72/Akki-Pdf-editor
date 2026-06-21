import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as Icons from "../src/components/LumenIcons";

describe("LumenIcons", () => {
  const entries = Object.entries(Icons).filter(
    ([, value]) => typeof value === "function",
  ) as [string, (props: Record<string, unknown>) => JSX.Element][];

  it("exports at least one icon", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)("renders %s as an svg passing props through", (_name, Icon) => {
    const { container } = render(<Icon className="icon" data-testid="icon" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass("icon");
    expect(svg).toHaveAttribute("data-testid", "icon");
  });
});
