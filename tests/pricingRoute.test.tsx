import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PricingRoute } from "../src/routes/PricingRoute";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("PricingRoute", () => {
  it("keeps local editing free and does not sell unfinished Pro features", () => {
    vi.stubEnv("VITE_POLAR_SUPPORTER_CHECKOUT_URL", "");
    render(<PricingRoute />);

    expect(screen.getByRole("heading", { name: "The editor stays free." })).toBeInTheDocument();
    const community = screen.getByRole("heading", { name: "Community" }).closest("article");
    expect(community).not.toBeNull();
    expect(within(community!).getByText("$0")).toBeInTheDocument();
    expect(within(community!).getByRole("link", { name: "Open the editor" })).toHaveAttribute("href", "/");

    expect(screen.getByRole("button", { name: "Polar checkout opening soon" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Not for sale yet" })).toBeDisabled();
    expect(screen.getByText("A contribution does not unlock Pro features.")).toBeInTheDocument();
    expect(screen.getByText(/do not purchase alternative source-code terms/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Licence" })).toHaveAttribute("href", "/LICENSE.txt");
    expect(screen.getByRole("link", { name: "Third-party notices" })).toHaveAttribute(
      "href",
      "/THIRD_PARTY_NOTICES.txt",
    );
  });

  it("links the Supporter action to a configured Polar Checkout Link", () => {
    vi.stubEnv("VITE_POLAR_SUPPORTER_CHECKOUT_URL", "https://buy.polar.sh/polar_cl_supporter");
    render(<PricingRoute />);

    expect(screen.getByRole("link", { name: "Continue to Polar" })).toHaveAttribute(
      "href",
      "https://buy.polar.sh/polar_cl_supporter",
    );
    expect(screen.queryByRole("button", { name: "Polar checkout opening soon" })).not.toBeInTheDocument();
  });
});
