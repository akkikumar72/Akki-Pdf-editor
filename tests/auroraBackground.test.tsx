import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuroraBackground } from "../src/components/AuroraBackground";

describe("AuroraBackground", () => {
  it("renders with default props", () => {
    const { container } = render(<AuroraBackground />);
    const el = container.querySelector(".aurora-bg") as HTMLElement;
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("aria-hidden", "true");
    expect(el.style.getPropertyValue("--aurora-amplitude")).toBe("1");
    expect(el.style.getPropertyValue("--aurora-speed")).toBe("18s");
    expect(el.style.getPropertyValue("--aurora-color-a")).toBe("var(--color-accent)");
    expect(container.querySelectorAll(".aurora-bg__band")).toHaveLength(3);
    expect(container.querySelector(".aurora-bg__grain")).toBeInTheDocument();
  });

  it("renders with custom props", () => {
    const { container } = render(
      <AuroraBackground
        amplitude={2}
        blend={0.9}
        colorStops={["#111", "#222", "#333"]}
        speed={30}
      />,
    );
    const el = container.querySelector(".aurora-bg") as HTMLElement;
    expect(el.style.getPropertyValue("--aurora-amplitude")).toBe("2");
    expect(el.style.getPropertyValue("--aurora-blend")).toBe("0.9");
    expect(el.style.getPropertyValue("--aurora-color-a")).toBe("#111");
    expect(el.style.getPropertyValue("--aurora-color-b")).toBe("#222");
    expect(el.style.getPropertyValue("--aurora-color-c")).toBe("#333");
    expect(el.style.getPropertyValue("--aurora-speed")).toBe("30s");
  });
});
