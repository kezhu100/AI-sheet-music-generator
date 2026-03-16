import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const args = new Set(process.argv.slice(2));
const isCheckMode = args.has("--check");
const isApiOnly = args.has("--api-only");
const isWindows = process.platform === "win32";

const pythonExecutable = resolveApiPythonExecutable();
const webCommand = createWebCommand();
const apiCommand = createApiCommand();

if (isCheckMode) {
  printCheckSummary();
  process.exit(0);
}

if (!pythonExecutable) {
  console.error("API virtual environment was not found.");
  console.error("Expected one of these interpreters:");
  console.error(`- ${path.join(repoRoot, "apps", "api", "venv", "Scripts", "python.exe")}`);
  console.error(`- ${path.join(repoRoot, "apps", "api", "venv", "bin", "python")}`);
  console.error("Create the API venv and install requirements first, then rerun `npm run dev`.");
  process.exit(1);
}

const children = [];
let shuttingDown = false;
let shutdownPromise = null;

if (!isApiOnly) {
  children.push(startProcess("web", webCommand.command, webCommand.args, { cwd: repoRoot }));
}

children.push(
  startProcess("api", apiCommand.command, apiCommand.args, {
    cwd: repoRoot
  })
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await shutdownChildren({ signal, exitCode: 0 });
  });
}

for (const child of children) {
  child.on("exit", async (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const exitCode = code ?? (signal ? 1 : 0);
    await shutdownChildren({
      cause: child.pid,
      exitCode,
      signal: signal ?? undefined
    });
  });
}

function resolveApiPythonExecutable() {
  const candidates = [
    path.join(repoRoot, "apps", "api", "venv", "Scripts", "python.exe"),
    path.join(repoRoot, "apps", "api", "venv", "bin", "python")
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function getNpmCommand() {
  return isWindows ? "npm.cmd" : "npm";
}

function getWindowsCommandShell() {
  return process.env.ComSpec || "cmd.exe";
}

function createWebCommand() {
  if (isWindows) {
    return {
      command: getWindowsCommandShell(),
      args: ["/d", "/s", "/c", `${getNpmCommand()} run dev --workspace @ai-sheet-music-generator/web`]
    };
  }

  return {
    command: getNpmCommand(),
    args: ["run", "dev", "--workspace", "@ai-sheet-music-generator/web"]
  };
}

function createApiCommand() {
  return {
    command: pythonExecutable,
    args: ["-m", "uvicorn", "app.main:app", "--reload", "--app-dir", "apps/api", "--host", "127.0.0.1", "--port", "8000"]
  };
}

function startProcess(name, command, childArgs, options) {
  const child = spawn(command, childArgs, {
    cwd: options.cwd,
    stdio: "inherit",
    shell: false,
    windowsHide: true,
    env: process.env
  });

  child.on("error", (error) => {
    console.error(`[${name}] Failed to start: ${error.message}`);
  });

  return child;
}

async function shutdownChildren({ signal = "SIGTERM", exitCode = 0, cause } = {}) {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shuttingDown = true;

  shutdownPromise = (async () => {
    const siblings = children.filter((child) => child.pid && child.pid !== cause);
    await Promise.allSettled(siblings.map((child) => stopChildProcess(child, signal)));
    process.exit(exitCode);
  })();

  return shutdownPromise;
}

function stopChildProcess(child, signal) {
  if (!child.pid || child.exitCode != null || child.killed) {
    return Promise.resolve();
  }

  if (isWindows) {
    return new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        cwd: repoRoot,
        stdio: "ignore",
        shell: false,
        windowsHide: true,
        env: process.env
      });

      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
  }

  return new Promise((resolve) => {
    child.kill(signal);

    const timeoutId = setTimeout(() => {
      child.kill("SIGKILL");
    }, 3000);

    child.on("exit", () => {
      clearTimeout(timeoutId);
      resolve();
    });
  });
}

function printCheckSummary() {
  console.log("Dev startup wiring check");
  console.log(`- repo root: ${repoRoot}`);
  console.log(`- web command: ${webCommand.command} ${webCommand.args.join(" ")}`);
  console.log(
    `- api command: ${
      pythonExecutable
        ? `${apiCommand.command} ${apiCommand.args.join(" ")}`
        : "missing apps/api/venv Python interpreter"
    }`
  );
}
