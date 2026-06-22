import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AkkiPdfLogo, AkkiPdfLogoLink, AkkiPdfMark } from "../src/components/AkkiPdfLogo";

describe("AkkiPdfMark", () => {
  it("renders an svg with a className", () => {
    const { container } = render(<AkkiPdfMark className="mark" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveClass("mark");
  });
});

describe("AkkiPdfLogo", () => {
  it("renders a button with wordmark and merged className", () => {
    render(<AkkiPdfLogo className="extra" />);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("akki-logo");
    expect(button).toHaveClass("extra");
    expect(button).toHaveAttribute("type", "button");
    expect(screen.getByText("AkkiPDF")).toBeInTheDocument();
  });

  it("hides the wordmark and joins className without extras", () => {
    render(<AkkiPdfLogo showWordmark={false} />);
    const button = screen.getByRole("button");
    expect(button.className).toBe("akki-logo");
    expect(screen.queryByText("AkkiPDF")).not.toBeInTheDocument();
  });
});

describe("AkkiPdfLogoLink", () => {
  it("renders an anchor with wordmark and merged className", () => {
    render(<AkkiPdfLogoLink className="extra" href="/" />);
    const link = screen.getByRole("link");
    expect(link).toHaveClass("akki-logo");
    expect(link).toHaveClass("extra");
    expect(screen.getByText("AkkiPDF")).toBeInTheDocument();
  });

  it("hides the wordmark and joins className without extras", () => {
    const { container } = render(<AkkiPdfLogoLink showWordmark={false} />);
    const link = container.querySelector("a") as HTMLAnchorElement;
    expect(link.className).toBe("akki-logo");
    expect(screen.queryByText("AkkiPDF")).not.toBeInTheDocument();
  });
});
