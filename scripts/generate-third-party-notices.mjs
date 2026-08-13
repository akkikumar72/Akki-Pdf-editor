import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const projectRoot = process.cwd();
const require = createRequire(join(projectRoot, "package.json"));
const packageJson = JSON.parse(readFileSync(join(projectRoot, "package.json"), "utf8"));
const noticePath = join(projectRoot, "THIRD_PARTY_NOTICES.txt");

function normalizeNoticeText(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

const fallbackLicences = new Map([
  [
    "@pdf-lib/fontkit@1.1.1",
    `MIT License

Copyright (c) Andrew Dillon and contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

Note: the published @pdf-lib/fontkit 1.1.1 package declares MIT and names
Andrew Dillon as author, but omits a licence file. This copy records the
declared licence and package authorship rather than silently dropping it.`,
  ],
  [
    "jsesc@3.1.0",
    `MIT License

Copyright (c) Mathias Bynens

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
  ],
]);

function locatePackageJson(name, fromDirectory) {
  try {
    return require.resolve(`${name}/package.json`, { paths: [fromDirectory] });
  } catch {
    // Some packages do not export package.json. Resolve their entry point and
    // walk upward until the matching package metadata is found.
  }

  try {
    let directory = dirname(require.resolve(name, { paths: [fromDirectory] }));
    while (directory !== dirname(directory)) {
      const candidate = join(directory, "package.json");
      if (existsSync(candidate)) {
        const candidatePackage = JSON.parse(readFileSync(candidate, "utf8"));
        if (candidatePackage.name === name) return candidate;
      }
      directory = dirname(directory);
    }
  } catch {
    return null;
  }
  return null;
}

function collectRuntimePackages() {
  const packages = new Map();
  const visitedPaths = new Set();

  function visit(name, fromDirectory = projectRoot) {
    const packagePath = locatePackageJson(name, fromDirectory);
    if (!packagePath) throw new Error(`Unable to resolve runtime dependency ${name}`);
    if (visitedPaths.has(packagePath)) return;
    visitedPaths.add(packagePath);

    const dependency = JSON.parse(readFileSync(packagePath, "utf8"));
    const key = `${dependency.name}@${dependency.version}`;
    if (!packages.has(key)) {
      const packageDirectory = dirname(packagePath);
      const licenceFiles = readdirSync(packageDirectory)
        .filter((file) => /^(licen[sc]e|copying|notice)(\..*)?$/i.test(file))
        .sort();
      const licenceSections = licenceFiles.map((file) => ({
        file,
        text: normalizeNoticeText(readFileSync(join(packageDirectory, file), "utf8")),
      }));
      const fallback = fallbackLicences.get(key);
      if (!licenceSections.length && !fallback) {
        throw new Error(`${key} declares ${dependency.license ?? "no licence"} but ships no licence file`);
      }
      packages.set(key, {
        declaredLicence: dependency.license ?? "Not declared",
        key,
        licenceSections: licenceSections.length
          ? licenceSections
          : [{ file: "DECLARED-LICENCE-FALLBACK", text: normalizeNoticeText(fallback) }],
      });
    }

    for (const childName of Object.keys(dependency.dependencies ?? {})) {
      visit(childName, dirname(packagePath));
    }
  }

  for (const dependencyName of Object.keys(packageJson.dependencies ?? {})) visit(dependencyName);
  return [...packages.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function devDependencySummary() {
  return Object.keys(packageJson.devDependencies ?? {})
    .sort()
    .map((name) => {
      const packagePath = locatePackageJson(name, projectRoot);
      if (!packagePath) throw new Error(`Unable to resolve development dependency ${name}`);
      const dependency = JSON.parse(readFileSync(packagePath, "utf8"));
      return `- ${dependency.name}@${dependency.version}: ${dependency.license ?? "licence not declared"}`;
    })
    .join("\n");
}

const runtimePackages = collectRuntimePackages();
const packageSections = runtimePackages
  .map(({ declaredLicence, key, licenceSections }) => {
    const texts = licenceSections.map(({ file, text }) => `--- ${file} ---\n\n${text}`).join("\n\n");
    return `================================================================================
${key}
Declared licence: ${declaredLicence}
================================================================================

${texts}`;
  })
  .join("\n\n");

const notice = `THIRD-PARTY NOTICES FOR AKKIVO

Akkivo's original source code is licensed under AGPL-3.0-only. Third-party
software and assets remain subject to their respective licences and are not
relicensed under the AGPL. This generated file records the complete licence
and notice files shipped by the installed production dependency closure.

RUNTIME AND DISTRIBUTED ASSET NOTES

- PDF.js CMaps are distributed under the terms in
  /pdfjs/cmaps/LICENSE.
- PDF.js Liberation font data is distributed under SIL Open Font License 1.1
  with its reserved font names. See /pdfjs/standard_fonts/LICENSE_LIBERATION.
- PDF.js Foxit/PDFium font data uses BSD-style terms. See
  /pdfjs/standard_fonts/LICENSE_FOXIT.
- Nine inlined icons are adapted from Solar by 480 Design under CC BY 4.0:
  document-add-bold-duotone, branching-paths-up-bold-duotone,
  rounded-magnifer-bold-duotone, magic-stick-3-bold-duotone,
  cloud-upload-bold-duotone, cloud-bold-duotone,
  shield-network-bold-duotone, plain-2-bold-duotone, and
  trash-bin-minimalistic-bold-duotone. The SVG geometry is unchanged; the
  icons were converted to React components, renamed, and use currentColor.
  Source: https://icon-sets.iconify.design/solar/
  Licence: https://creativecommons.org/licenses/by/4.0/
- LumenBrainIcon is adapted from ph:brain-duotone by Phosphor Icons under MIT.
  Source: https://icon-sets.iconify.design/ph/brain-duotone/
- Google Fonts are requested remotely and are not included in the repository.
  Each remains under its family-specific licence. The families are primarily
  OFL-1.1; Satisfy is Apache-2.0. Source: https://github.com/google/fonts

PHOSPHOR ICONS MIT LICENCE

Copyright (c) 2023 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

REPOSITORY TOOLING

The tracked .agents/skills/better-icons material is from Better Icons,
Copyright (c) 2026 Better Auth Inc., under the MIT License. Other tracked
agent-tooling provenance has not been established and is excluded from any
blanket statement that all repository tooling is Akkivo-authored.

Copyright (c) 2026 Better Auth Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

DEVELOPMENT DEPENDENCIES

Development packages are not included in the deployed browser application.
They retain their own terms:

${devDependencySummary()}

The Remotion packages use the separate, non-OSI Remotion License. They are
development-only video tooling and are not covered by Akkivo's AGPL grant.
Commercial organizations may require a paid Remotion licence. Complete terms:
https://www.remotion.dev/docs/license

PRODUCTION DEPENDENCY LICENCE TEXTS

${packageSections}
`;

writeFileSync(noticePath, notice, "utf8");
console.log(`Generated ${noticePath} for ${runtimePackages.length} production packages.`);
