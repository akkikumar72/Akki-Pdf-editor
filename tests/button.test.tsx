import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Button } from "../src/components/ui/button";

describe("Button", () => {
  it("renders a native button by default", () => {
    render(<Button>Hello</Button>);
    const btn = screen.getByRole("button", { name: "Hello" });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn).toHaveClass("button");
  });

  it("renders via Slot when asChild is true", () => {
    render(
      <Button asChild className="extra">
        <a href="/">Link</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Link" });
    expect(link.tagName).toBe("A");
    expect(link).toHaveClass("button");
    expect(link).toHaveClass("extra");
  });

  it.each([
    ["default", undefined],
    ["primary", "button--primary"],
    ["quiet", "button--quiet"],
    ["tonal", "button--tonal"],
  ] as const)("applies the %s variant class", (variant, expectedClass) => {
    render(<Button variant={variant}>v</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("button");
    if (expectedClass) expect(btn).toHaveClass(expectedClass);
  });

  it.each([
    ["default", undefined],
    ["sm", "button--sm"],
    ["lg", "button--lg"],
  ] as const)("applies the %s size class", (size, expectedClass) => {
    render(<Button size={size}>s</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveClass("button");
    if (expectedClass) expect(btn).toHaveClass(expectedClass);
  });
});
