import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const rootFile = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("production domain metadata", () => {
  it("declares akkivo.app as the canonical public origin", () => {
    const html = rootFile("index.html");

    expect(html).toContain('<link rel="canonical" href="https://akkivo.app/" />');
    expect(html).toContain('<meta property="og:url" content="https://akkivo.app/" />');
  });

  it("keeps Polar documentation on the canonical domain", () => {
    const documentation = `${rootFile("README.md")}\n${rootFile("docs/polar-checkout.md")}`;

    expect(documentation).not.toContain("akki-pdf-editor.vercel.app");
    expect(documentation).toContain("https://akkivo.app/pricing");
    expect(documentation).toContain("https://akkivo.app/pricing/success?checkout_id={CHECKOUT_ID}");
  });
});
