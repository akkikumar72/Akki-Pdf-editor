import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicBrandSurfaces = [
  ".env.example",
  "CONTRIBUTING.md",
  "README.md",
  "THIRD_PARTY_NOTICES.txt",
  "docs/polar-checkout.md",
  "index.html",
  "package.json",
  "plan.md",
  "public/favicon.svg",
  "scripts/smoke-test.sh",
  "src/components/AkkivoLogo.tsx",
  "src/components/LegalNotice.tsx",
  "src/components/ToolHub.tsx",
  "src/components/ToolRibbon.tsx",
  "src/routes/PricingRoute.tsx",
  "src/routes/PricingSuccessRoute.tsx",
  "video/src/AkkiShowcase.tsx",
  "video/src/AkkiShowcasePoster.tsx",
  "video/src/components/EditorWorkspace.tsx",
] as const;

describe("Akkivo branding", () => {
  it.each(publicBrandSurfaces)("uses the new identity on %s", (path) => {
    const source = readFileSync(path, "utf8");
    expect(source).not.toMatch(/AkkiPDF|Akki PDF Editor|Akash Kumar Pathak/);
  });

  it("ships the folded-page favicon palette", () => {
    const favicon = readFileSync("public/favicon.svg", "utf8");
    expect(favicon).toContain("#32d36f");
    expect(favicon).toContain("#68783c");
    expect(favicon.match(/<path/g)).toHaveLength(3);
  });
});
