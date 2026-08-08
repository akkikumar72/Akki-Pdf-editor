import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import packageJson from "../package.json";

describe("third-party notices", () => {
  it("covers every direct runtime dependency and required non-package attribution", () => {
    const notice = readFileSync(join(process.cwd(), "THIRD_PARTY_NOTICES.txt"), "utf8");

    for (const dependencyName of Object.keys(packageJson.dependencies)) {
      expect(notice).toContain(`${dependencyName}@`);
    }
    expect(notice).toContain("Solar by 480 Design under CC BY 4.0");
    expect(notice).toContain("Phosphor Icons");
    expect(notice).toContain("Better Auth Inc.");
    expect(notice).toContain("non-OSI Remotion License");
  });
});
