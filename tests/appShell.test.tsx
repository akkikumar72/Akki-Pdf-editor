import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "../src/components/AppShell";

describe("AppShell", () => {
  it("renders all regions and children", () => {
    render(
      <AppShell
        header={<div>HEADER</div>}
        rail={<div>RAIL</div>}
        inspector={<div>INSPECTOR</div>}
        status={<div>STATUS</div>}
      >
        <div>CANVAS</div>
      </AppShell>,
    );

    expect(screen.getByText("HEADER")).toBeInTheDocument();
    expect(screen.getByText("RAIL")).toBeInTheDocument();
    expect(screen.getByText("INSPECTOR")).toBeInTheDocument();
    expect(screen.getByText("STATUS")).toBeInTheDocument();
    expect(screen.getByText("CANVAS")).toBeInTheDocument();
    expect(screen.getByText("Skip to editor")).toHaveAttribute("href", "#editor-canvas");
  });
});
