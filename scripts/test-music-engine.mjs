import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const compiledRoot = resolve(scriptDir, "../packages/music-engine/.test-dist/music-engine");
const testsRoot = resolve(compiledRoot, "tests");

const relativeSpecifierPattern =
  /((?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["'])(\.\.?\/[^"']+)(["'])/g;

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

function collectCompiledJsFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectCompiledJsFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(entryPath);
    }
  }

  return files;
}

function rewriteRelativeSpecifiers(filePath) {
  const normalizedCompiledRoot = `${compiledRoot}${compiledRoot.endsWith("\\") || compiledRoot.endsWith("/") ? "" : "/"}`.replaceAll("\\", "/");
  const normalizedFilePath = filePath.replaceAll("\\", "/");

  if (!normalizedFilePath.startsWith(normalizedCompiledRoot)) {
    throw new Error(`Refusing to rewrite file outside compiled test output: ${filePath}`);
  }

  const source = readFileSync(filePath, "utf8");
  const rewritten = source.replace(relativeSpecifierPattern, (_match, prefix, specifier, suffix) => {
    if (extname(specifier) !== "") {
      return `${prefix}${specifier}${suffix}`;
    }

    return `${prefix}${specifier}.js${suffix}`;
  });

  if (rewritten !== source) {
    writeFileSync(filePath, rewritten, "utf8");
  }
}

if (!statSync(testsRoot).isDirectory()) {
  console.error(`Compiled test directory not found: ${testsRoot}`);
  process.exit(1);
}

for (const compiledFile of collectCompiledJsFiles(compiledRoot)) {
  rewriteRelativeSpecifiers(compiledFile);
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
