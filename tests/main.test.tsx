import { describe, expect, it, vi } from "vitest";

const render = vi.fn();
const createRoot = vi.fn(() => ({ render }));

vi.mock("react-dom/client", () => ({
  default: { createRoot },
  createRoot,
}));

vi.mock("../src/App", () => ({
  App: () => null,
}));

vi.mock("../src/styles/tokens.css", () => ({}));
vi.mock("../src/styles/app.css", () => ({}));
vi.mock("react-pdf/dist/Page/AnnotationLayer.css", () => ({}));
vi.mock("react-pdf/dist/Page/TextLayer.css", () => ({}));

describe("main", () => {
  it("creates a root on #root and renders", async () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);

    await import("../src/main");

    expect(createRoot).toHaveBeenCalledWith(root);
    expect(render).toHaveBeenCalledTimes(1);
  });
});
