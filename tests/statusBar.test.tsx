import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBar } from "../src/components/StatusBar";

describe("StatusBar", () => {
  it("renders busy state with a loader and page count", () => {
    const { container } = render(
      <StatusBar
        documentName="report.pdf"
        isBusy
        operationCount={3}
        pageIndex={0}
        pageCount={5}
        scale={1.234}
        status="Working"
      />,
    );

    expect(screen.getByText("Working")).toBeInTheDocument();
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
    expect(screen.getByText("Page 1/5")).toBeInTheDocument();
    expect(screen.getByText("3 edits")).toBeInTheDocument();
    expect(screen.getByText("123%")).toBeInTheDocument();
    expect(container.querySelector(".spin")).toBeInTheDocument();
  });

  it("shows Selected N objects while a multi-selection exists", () => {
    render(
      <StatusBar
        isBusy={false}
        operationCount={2}
        pageIndex={0}
        pageCount={1}
        scale={1}
        selectedCount={2}
        status="Ready"
      />,
    );
    expect(screen.getByText("Selected 2 objects")).toBeInTheDocument();
    expect(screen.queryByText("Ready")).not.toBeInTheDocument();
  });

  it("shows Moving N objects while a group drag is live, beating the selection readout", () => {
    render(
      <StatusBar
        isBusy={false}
        movingCount={3}
        operationCount={3}
        pageIndex={0}
        pageCount={1}
        scale={1}
        selectedCount={3}
        status="Ready"
      />,
    );
    expect(screen.getByText("Moving 3 objects")).toBeInTheDocument();
  });

  it("keeps the plain status for a single selection", () => {
    render(
      <StatusBar
        isBusy={false}
        movingCount={1}
        operationCount={1}
        pageIndex={0}
        pageCount={1}
        scale={1}
        selectedCount={1}
        status="Ready"
      />,
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("renders idle state, no document, and no pages", () => {
    const { container } = render(
      <StatusBar
        isBusy={false}
        operationCount={0}
        pageIndex={0}
        pageCount={0}
        scale={1}
        status="Ready"
      />,
    );

    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("No document")).toBeInTheDocument();
    expect(screen.getByText("Page -")).toBeInTheDocument();
    expect(screen.getByText("0 edits")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
    expect(container.querySelector(".spin")).not.toBeInTheDocument();
  });
});
