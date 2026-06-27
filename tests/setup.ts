import "@testing-library/jest-dom/vitest";

// jsdom lacks ResizeObserver (used by react-select and FloatingOperationToolbar).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (!("ResizeObserver" in globalThis)) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

// jsdom does not implement scrollIntoView (react-select calls it).
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
