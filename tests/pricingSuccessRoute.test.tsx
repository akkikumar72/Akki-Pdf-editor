import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PricingSuccessRoute } from "../src/routes/PricingSuccessRoute";

describe("PricingSuccessRoute", () => {
  it("points to the Polar receipt for confirmation without claiming client-side verification", () => {
    render(<PricingSuccessRoute />);

    expect(screen.getByRole("heading", { name: "Thank you for supporting Akkivo." })).toBeInTheDocument();
    expect(screen.getByText(/Polar receipt is the confirmation of payment/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open the editor" })).toHaveAttribute("href", "/");
    expect(screen.queryByRole("link", { name: "View source" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Source repository" })).toHaveAttribute(
      "href",
      "https://github.com/akkikumar72/Akki-Pdf-editor",
    );
    expect(screen.getByText(/Copyright © 2026 Akkivo/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Third-party notices" })).toHaveAttribute(
      "href",
      "/THIRD_PARTY_NOTICES.txt",
    );
  });
});
