import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const pythonExecutable = resolveApiPythonExecutable();

if (!pythonExecutable) {
  console.error("API virtual environment was not found.");
  console.error("Create `apps/api/venv` and install `apps/api/requirements-dev.txt` before running backend tests.");
  process.exit(1);
}

const child = spawn(
  pythonExecutable,
  ["-m", "unittest", "discover", "apps/api/tests"],
  {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
    env: process.env
  }
);

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (error) => {
  console.error(`Failed to start API tests: ${error.message}`);
  process.exit(1);
});

function resolveApiPythonExecutable() {
  const candidates = [
    path.join(repoRoot, "apps", "api", "venv", "Scripts", "python.exe"),
    path.join(repoRoot, "apps", "api", "venv", "bin", "python")
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}
