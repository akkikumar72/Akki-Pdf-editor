import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AkkivoLogo, AkkivoLogoLink, AkkivoMark } from "../src/components/AkkivoLogo";

describe("AkkivoMark", () => {
  it("renders the folded-page mark with a className", () => {
    const { container } = render(<AkkivoMark className="mark" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass("mark");
    expect(container.querySelectorAll("[data-face]")).toHaveLength(2);
    expect(container.querySelector("[data-fold='true']")).toBeInTheDocument();
  });
});

describe("AkkivoLogo", () => {
  it("renders a button with wordmark and merged className", () => {
    render(<AkkivoLogo className="extra" />);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("akkivo-logo");
    expect(button).toHaveClass("extra");
    expect(button).toHaveAttribute("type", "button");
    expect(screen.getByText("Akkivo")).toBeInTheDocument();
  });

  it("hides the wordmark and joins className without extras", () => {
    render(<AkkivoLogo showWordmark={false} />);
    const button = screen.getByRole("button");
    expect(button.className).toBe("akkivo-logo");
    expect(screen.queryByText("Akkivo")).not.toBeInTheDocument();
  });
});

describe("AkkivoLogoLink", () => {
  it("renders an anchor with wordmark and merged className", () => {
    render(<AkkivoLogoLink className="extra" href="/" />);
    const link = screen.getByRole("link");
    expect(link).toHaveClass("akkivo-logo");
    expect(link).toHaveClass("extra");
    expect(screen.getByText("Akkivo")).toBeInTheDocument();
  });

  it("hides the wordmark and joins className without extras", () => {
    const { container } = render(<AkkivoLogoLink showWordmark={false} />);
    const link = container.querySelector("a") as HTMLAnchorElement;
    expect(link.className).toBe("akkivo-logo");
    expect(screen.queryByText("Akkivo")).not.toBeInTheDocument();
  });
});
