import { readFileSync } from "node:fs";
import { join } from "node:path";

const projectRoot = process.cwd();

function assertSame(source, built) {
  const sourceText = readFileSync(join(projectRoot, source), "utf8");
  const builtText = readFileSync(join(projectRoot, "dist", built), "utf8");
  if (sourceText !== builtText) throw new Error(`dist/${built} does not match ${source}`);
}

assertSame("LICENSE", "LICENSE.txt");
assertSame("THIRD_PARTY_NOTICES.txt", "THIRD_PARTY_NOTICES.txt");

for (const relativePath of [
  "pdfjs/cmaps/LICENSE",
  "pdfjs/standard_fonts/LICENSE_LIBERATION",
  "pdfjs/standard_fonts/LICENSE_FOXIT",
]) {
  readFileSync(join(projectRoot, "dist", relativePath));
}

console.log("Verified deployed licence, third-party notices, and PDF.js data licences.");
