import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-pdf", () => ({
  Document: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Page: (_props: Record<string, unknown>) => <div data-testid="pdf-page" />,
  pdfjs: { GlobalWorkerOptions: {} },
}));

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "worker.js" }));

vi.mock("../src/state/EditorProvider", () => ({
  EditorProvider: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("../src/routes/LandingRoute", () => ({
  LandingRoute: () => <div data-testid="landing">Landing</div>,
}));

vi.mock("../src/routes/EditorRoute", () => ({
  EditorRoute: () => <div>Editor</div>,
}));

import { pdfjs } from "react-pdf";
import { App } from "../src/App";

describe("App", () => {
  it("sets the pdf worker source and mounts the landing route", () => {
    render(<App />);
    expect(screen.getByTestId("landing")).toBeInTheDocument();
    expect((pdfjs.GlobalWorkerOptions as { workerSrc: string }).workerSrc).toBe("worker.js");
  });
});
