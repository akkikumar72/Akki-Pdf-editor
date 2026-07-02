import { describe, expect, it } from "vitest";
import { safeImageSrc } from "../src/utils/safeImage";

describe("safeImageSrc", () => {
  it("passes data:image/(png|jpeg|jpg) payloads through", () => {
    expect(safeImageSrc("data:image/png;base64,AAAA")).toBe("data:image/png;base64,AAAA");
    expect(safeImageSrc("data:image/jpeg;base64,BBBB")).toBe("data:image/jpeg;base64,BBBB");
    expect(safeImageSrc("data:image/jpg;base64,CCCC")).toBe("data:image/jpg;base64,CCCC");
  });

  it("drops everything else", () => {
    expect(safeImageSrc(undefined)).toBeUndefined();
    expect(safeImageSrc("")).toBeUndefined();
    expect(safeImageSrc("https://example.com/x.png")).toBeUndefined();
    expect(safeImageSrc("javascript:alert(1)")).toBeUndefined();
    expect(safeImageSrc("data:image/svg+xml;base64,AAAA")).toBeUndefined();
    expect(safeImageSrc("data:text/html;base64,AAAA")).toBeUndefined();
  });
});
