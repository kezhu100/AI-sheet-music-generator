import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const scanRoots = [
  resolve(repoRoot, "packages/music-engine/src"),
  resolve(repoRoot, "packages/music-engine/tests"),
  resolve(repoRoot, "packages/shared-types/src")
];

const sourceExtensions = new Set([".ts", ".tsx"]);
const relativeJsSpecifierPattern = /(?:from|export\s+\*\s+from|export\s+\{[\s\S]*?\}\s+from)\s+["'](\.\.?\/[^"']+)\.js["']/g;
const violations = [];

function collectFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(entryPath));
      continue;
    }

    if (entry.isFile() && sourceExtensions.has(extname(entry.name))) {
      files.push(entryPath);
    }
  }

  return files;
}

for (const root of scanRoots) {
  if (!statSync(root).isDirectory()) {
    continue;
  }

  for (const filePath of collectFiles(root)) {
    const fileContents = readFileSync(filePath, "utf8");
    let match;
    while ((match = relativeJsSpecifierPattern.exec(fileContents)) !== null) {
      violations.push(`${relative(repoRoot, filePath)} -> ${match[1]}.js`);
    }
  }
}

if (violations.length > 0) {
  console.error("Workspace TypeScript source files must use extensionless relative imports/exports:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("ok - workspace TypeScript relative imports/exports are extensionless");
