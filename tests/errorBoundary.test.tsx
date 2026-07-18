import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "../src/components/ErrorBoundary";

function Bomb(): never {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders children when nothing throws", () => {
    render(
      <ErrorBoundary>
        <div>all good</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("all good")).toBeInTheDocument();
  });

  it("catches a render error, logs it, and shows the recovery fallback", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong.")).toBeInTheDocument();
    expect(screen.getByText(/autosaved locally/i)).toBeInTheDocument();
    expect(errorSpy).toHaveBeenCalledWith(
      "Unhandled render error",
      expect.any(Error),
      expect.anything(),
    );
  });

  it("reloads the page from the fallback action", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      reload,
    } as Location);
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    screen.getByRole("button", { name: "Reload editor" }).click();
    expect(reload).toHaveBeenCalled();
  });

  it("navigates home from the fallback action", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign,
    } as Location);
    render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>,
    );
    screen.getByRole("button", { name: "Back to home" }).click();
    expect(assign).toHaveBeenCalledWith("/");
  });
});
