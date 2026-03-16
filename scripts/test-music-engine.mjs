import { readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const testsRoot = resolve(scriptDir, "../packages/music-engine/.test-dist/music-engine/tests");

function collectTestFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTestFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".test.js")) {
      files.push(entryPath);
    }
  }

  return files;
}

if (!statSync(testsRoot).isDirectory()) {
  console.error(`Compiled test directory not found: ${testsRoot}`);
  process.exit(1);
}

const testFiles = collectTestFiles(testsRoot);
if (testFiles.length === 0) {
  console.error(`No compiled test files found under ${testsRoot}`);
  process.exit(1);
}

for (const testFile of testFiles) {
  const result = spawnSync(process.execPath, [testFile], {
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
