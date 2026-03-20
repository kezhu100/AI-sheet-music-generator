import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const apiRoot = path.join(repoRoot, "apps", "api");

const args = new Set(process.argv.slice(2));
const isCheckMode = args.has("--check");
const isApiOnly = args.has("--api-only");
const isAppMode = args.has("--app");
const shouldSkipBrowserOpen = args.has("--no-open") || process.env.APP_START_NO_OPEN === "1";
const isWindows = process.platform === "win32";
const pythonExecutable = resolveApiPythonExecutable();
const webCommand = createWebCommand();
const apiCommand = createApiCommand(pythonExecutable);
const preflightCommand = createPreflightCommand(pythonExecutable);
const runtimeEnv = createRuntimeEnv();
const rootNodeModulesPath = path.join(repoRoot, "node_modules");
const defaultWebUrl = process.env.PORT ? `http://127.0.0.1:${process.env.PORT}` : "http://127.0.0.1:3000";
const defaultWebPort = Number(new URL(defaultWebUrl).port);

const children = [];
let shuttingDown = false;
let shutdownPromise = null;
let currentWebUrl = defaultWebUrl;
let detectedWebUrlPromise = Promise.resolve(defaultWebUrl);
let resolveDetectedWebUrl = null;

if (isAppMode && !isApiOnly) {
  detectedWebUrlPromise = new Promise((resolve) => {
    resolveDetectedWebUrl = (url) => resolve(url);
  });
}

try {
  if (isCheckMode) {
    if (isAppMode) {
      await runAppCheck();
    } else {
      printCheckSummary();
    }
    process.exit(0);
  }

  if (!pythonExecutable) {
    printMissingPythonMessage(isAppMode ? "npm run app" : "npm run dev");
    process.exit(1);
  }

  if (isAppMode) {
    ensureWorkspaceDependenciesInstalled();
    await checkAppModePorts();
    const passed = await runPreflight();
    if (!passed) {
      process.exit(1);
    }
  }

  if (!isApiOnly) {
    children.push(startProcess("web", webCommand.command, webCommand.args, { cwd: repoRoot }));
  }

  children.push(startProcess("api", apiCommand.command, apiCommand.args, { cwd: repoRoot }));

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

  if (isAppMode) {
    await waitForAppReadiness();
    await openBrowserSafely(currentWebUrl);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  await shutdownChildren({ exitCode: 1 });
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

function createApiCommand(pythonPath) {
  const args = ["-m", "uvicorn", "app.main:app"];
  if (!isAppMode) {
    args.push("--reload");
  }
  args.push("--app-dir", "apps/api", "--host", "127.0.0.1", "--port", "8000");

  return {
    command: pythonPath,
    args
  };
}

function createPreflightCommand(pythonPath) {
  return {
    command: pythonPath,
    args: ["-m", "app.runtime_preflight"]
  };
}

async function runAppCheck() {
  console.log("Local app startup check");
  console.log(`- repo root: ${repoRoot}`);
  console.log(`- web command: ${webCommand.command} ${webCommand.args.join(" ")}`);
  console.log(
    `- api command: ${
      pythonExecutable ? `${apiCommand.command} ${apiCommand.args.join(" ")}` : "missing apps/api/venv Python interpreter"
    }`
  );
  console.log(`- ffmpeg: ${describeFfmpegSource(runtimeEnv.FFMPEG_EXECUTABLE)}`);

  if (!pythonExecutable) {
    printMissingPythonMessage("npm run app");
    process.exit(1);
  }

  ensureWorkspaceDependenciesInstalled();
  await checkAppModePorts();
  const passed = await runPreflight();
  process.exit(passed ? 0 : 1);
}

async function runPreflight() {
  return new Promise((resolve) => {
    const child = spawn(preflightCommand.command, preflightCommand.args, {
      cwd: apiRoot,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
      env: runtimeEnv
    });

    child.on("exit", (code) => resolve((code ?? 1) === 0));
    child.on("error", (error) => {
      console.error("App-mode runtime preflight could not start the API Python interpreter.");
      console.error(`Interpreter: ${preflightCommand.command}`);
      console.error(`Details: ${error.message}`);
      console.error("Recreate apps/api/venv or install a usable Python runtime into that venv, then rerun `npm run app`.");
      resolve(false);
    });
  });
}

function startProcess(name, command, childArgs, options) {
  const stdio = isAppMode && name === "web" ? ["ignore", "pipe", "pipe"] : "inherit";
  const child = spawn(command, childArgs, {
    cwd: options.cwd,
    stdio,
    shell: false,
    windowsHide: true,
    env: runtimeEnv
  });

  if (isAppMode && name === "web") {
    attachWebOutputReaders(child);
  }

  child.on("error", (error) => {
    if (name === "api" && isAppMode) {
      console.error("The local API process could not start in app mode.");
      console.error(`Interpreter: ${command}`);
      console.error(`Details: ${error.message}`);
      console.error("Check apps/api/venv and the installed API requirements, then rerun `npm run app`.");
      return;
    }

    console.error(`[${name}] Failed to start: ${error.message}`);
  });

  return child;
}

async function waitForAppReadiness() {
  await waitForUrl("http://127.0.0.1:8000/api/v1/runtime", "API runtime");
  if (!isApiOnly) {
    currentWebUrl = await resolveWebAppUrl();
    await waitForUrl(currentWebUrl, "web app");
  }
}

async function waitForUrl(url, label, timeoutMs = 120000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        console.log(`[ready] ${label} is available at ${url}`);
        return;
      }
    } catch {
      // Keep polling until timeout.
    }

    await sleep(1000);
  }

  throw new Error(`${label} did not become ready within ${Math.round(timeoutMs / 1000)} seconds.`);
}

async function openBrowserSafely(url) {
  if (isApiOnly || shouldSkipBrowserOpen || !canAttemptBrowserOpen()) {
    return;
  }

  const command = getBrowserOpenCommand(url);
  if (!command) {
    return;
  }

  await new Promise((resolve) => {
    const child = spawn(command.command, command.args, {
      cwd: repoRoot,
      stdio: "ignore",
      shell: false,
      windowsHide: true,
      env: process.env
    });
    child.on("error", () => resolve());
    child.on("exit", () => resolve());
  });
}

function canAttemptBrowserOpen() {
  if (process.env.CI === "1" || String(process.env.CI).toLowerCase() === "true") {
    return false;
  }

  if (process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    return false;
  }

  return true;
}

function getBrowserOpenCommand(url) {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/c", "start", "", url]
    };
  }

  if (process.platform === "darwin") {
    return {
      command: "open",
      args: [url]
    };
  }

  return {
    command: "xdg-open",
    args: [url]
  };
}

function attachWebOutputReaders(child) {
  let stdoutBuffer = "";
  let stderrBuffer = "";

  child.stdout?.on("data", (chunk) => {
    const text = chunk.toString();
    process.stdout.write(text);
    stdoutBuffer += text;
    stdoutBuffer = maybeCaptureWebUrl(stdoutBuffer);
  });

  child.stderr?.on("data", (chunk) => {
    const text = chunk.toString();
    process.stderr.write(text);
    stderrBuffer += text;
    stderrBuffer = maybeCaptureWebUrl(stderrBuffer);
  });
}

function maybeCaptureWebUrl(buffer) {
  const lines = buffer.split(/\r?\n/);
  const trailing = lines.pop() ?? "";

  for (const line of lines) {
    const nextUrl = extractWebUrlFromLine(line);
    if (nextUrl) {
      currentWebUrl = nextUrl;
      if (resolveDetectedWebUrl) {
        resolveDetectedWebUrl(nextUrl);
        resolveDetectedWebUrl = null;
      }
    }
  }

  return trailing;
}

function extractWebUrlFromLine(line) {
  const match = line.match(/https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0):(\d+)/i);
  if (!match) {
    return null;
  }

  return `http://127.0.0.1:${match[1]}`;
}

async function resolveWebAppUrl(timeoutMs = 30000) {
  if (!isAppMode || isApiOnly) {
    return currentWebUrl;
  }

  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => resolve(currentWebUrl), timeoutMs);
  });

  const resolvedUrl = await Promise.race([detectedWebUrlPromise, timeoutPromise]);
  return typeof resolvedUrl === "string" ? resolvedUrl : currentWebUrl;
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
      pythonExecutable ? `${apiCommand.command} ${apiCommand.args.join(" ")}` : "missing apps/api/venv Python interpreter"
    }`
  );
  console.log(`- ffmpeg: ${describeFfmpegSource(runtimeEnv.FFMPEG_EXECUTABLE)}`);
}

function printMissingPythonMessage(commandName) {
  console.error("API virtual environment was not found.");
  console.error("Expected one of these interpreters:");
  console.error(`- ${path.join(repoRoot, "apps", "api", "venv", "Scripts", "python.exe")}`);
  console.error(`- ${path.join(repoRoot, "apps", "api", "venv", "bin", "python")}`);
  console.error(`Create the API venv and install requirements first, then rerun \`${commandName}\`.`);
}

function ensureWorkspaceDependenciesInstalled() {
  if (existsSync(rootNodeModulesPath)) {
    return;
  }

  console.error("Root npm dependencies are not installed.");
  console.error(`Expected to find: ${rootNodeModulesPath}`);
  console.error("Run `npm install` from the repository root, then rerun `npm run app`.");
  process.exit(1);
}

function createRuntimeEnv() {
  const localFfmpeg = resolveBundledFfmpegExecutable();
  if (localFfmpeg) {
    return {
      ...process.env,
      FFMPEG_EXECUTABLE: localFfmpeg,
    };
  }

  const configuredFfmpeg = process.env.FFMPEG_EXECUTABLE?.trim();
  if (configuredFfmpeg) {
    console.warn(
      `[startup] Bundled ffmpeg could not be resolved. Falling back to configured FFMPEG_EXECUTABLE: ${configuredFfmpeg}`
    );
    return process.env;
  }

  console.warn(
    "[startup] Bundled ffmpeg could not be resolved. Falling back to a system ffmpeg on PATH if one is available."
  );
  return process.env;
}

function resolveBundledFfmpegExecutable() {
  try {
    const installer = require("@ffmpeg-installer/ffmpeg");
    if (installer?.path && existsSync(installer.path)) {
      return installer.path;
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`[startup] Unable to load bundled ffmpeg package: ${detail}`);
  }

  return null;
}

function describeFfmpegSource(ffmpegExecutable) {
  if (ffmpegExecutable) {
    return `FFMPEG_EXECUTABLE=${ffmpegExecutable}`;
  }

  return "system PATH fallback";
}

async function checkAppModePorts() {
  if (!isApiOnly) {
    const isWebPortAvailable = await isPortAvailable(defaultWebPort);
    if (!isWebPortAvailable) {
      console.warn(`Port ${defaultWebPort} is in use, Next.js will select another port.`);
    }
  }

  const isApiPortAvailable = await isPortAvailable(8000);
  if (!isApiPortAvailable) {
    console.error("Port 8000 is already in use, so the local API cannot start in app mode.");
    console.error("Stop the process using port 8000, then rerun `npm run app`.");
    process.exit(1);
  }
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
