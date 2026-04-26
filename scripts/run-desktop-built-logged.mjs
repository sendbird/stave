import { spawn } from "node:child_process";
import { createWriteStream, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findMacAppBinary, shouldRunPackagedDesktopApp } from "./run-desktop-built.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const productName = "Stave";
const logPrefix = "desktop-built-";
const maxLogFiles = 10;
const maxLogAgeMs = 7 * 24 * 60 * 60 * 1000;

function resolveLocalBin(name) {
  const binaryName = process.platform === "win32" ? `${name}.cmd` : name;
  return path.join(repoRoot, "node_modules", ".bin", binaryName);
}

export function resolveDesktopPackagingCommand(args = {}) {
  if (!shouldRunPackagedDesktopApp({ platform: args.platform })) {
    return null;
  }

  return {
    command: args.command ?? resolveLocalBin("electron-builder"),
    args: ["--config", "electron-builder.yml", "--dir"],
    cwd: repoRoot,
    env: args.env ?? process.env,
  };
}

export function resolveDesktopBuiltLogDir(args = {}) {
  return args.logDir ?? path.join(tmpdir(), "stave-logs");
}

export function createDesktopBuiltLogPath(args = {}) {
  const now = args.now ?? new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
  return path.join(resolveDesktopBuiltLogDir(args), `${logPrefix}${stamp}.log`);
}

export function rotateDesktopBuiltLogs(args = {}) {
  const logDir = resolveDesktopBuiltLogDir(args);
  mkdirSync(logDir, { recursive: true });
  const nowMs = (args.now ?? new Date()).getTime();
  const entries = readdirSync(logDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.startsWith(logPrefix) && entry.name.endsWith(".log"))
    .map((entry) => {
      const filePath = path.join(logDir, entry.name);
      const stats = statSync(filePath);
      return {
        filePath,
        mtimeMs: stats.mtimeMs,
      };
    })
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  for (const entry of entries) {
    if (nowMs - entry.mtimeMs > maxLogAgeMs) {
      rmSync(entry.filePath, { force: true });
    }
  }

  const retained = entries.filter((entry) => nowMs - entry.mtimeMs <= maxLogAgeMs);
  for (const entry of retained.slice(maxLogFiles)) {
    rmSync(entry.filePath, { force: true });
  }
}

function resolveDesktopRuntimeCommand() {
  if (shouldRunPackagedDesktopApp()) {
    const appBinaryPath = findMacAppBinary({
      releaseRoot: path.join(repoRoot, "release"),
      productName,
    });
    if (!appBinaryPath) {
      throw new Error("Unable to locate the unpacked Stave.app binary under release/ after build:desktop.");
    }
    return {
      command: appBinaryPath,
      args: [],
      env: {
        ...process.env,
        STAVE_RUNTIME_PROFILE: "production",
      },
    };
  }

  return {
    command: resolveLocalBin("electron"),
    args: ["."],
    env: {
      ...process.env,
      STAVE_RUNTIME_PROFILE: "production",
    },
  };
}

function spawnLoggedCommand(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(args.command, args.args, {
      cwd: args.cwd ?? repoRoot,
      env: args.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.once("error", reject);

    if (child.stdout) {
      child.stdout.on("data", (chunk) => {
        process.stdout.write(chunk);
        args.logStream.write(chunk);
      });
    }

    if (child.stderr) {
      child.stderr.on("data", (chunk) => {
        process.stderr.write(chunk);
        args.logStream.write(chunk);
      });
    }

    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Desktop app exited from signal ${signal}`));
        return;
      }
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Desktop app exited with code ${code ?? "unknown"}`));
    });
  });
}

async function packageDesktopAppIfNeeded(args) {
  const packagingCommand = resolveDesktopPackagingCommand();
  if (!packagingCommand) {
    return;
  }

  process.stderr.write(
    "[desktop:built:logged] packaging release bundle under release/\n",
  );
  await spawnLoggedCommand({
    ...packagingCommand,
    logStream: args.logStream,
  });
}

async function main() {
  rotateDesktopBuiltLogs();
  const logPath = createDesktopBuiltLogPath();
  mkdirSync(path.dirname(logPath), { recursive: true });
  const logStream = createWriteStream(logPath, { flags: "a" });
  process.stderr.write(`[desktop:built:logged] writing log to ${logPath}\n`);

  try {
    await packageDesktopAppIfNeeded({ logStream });
    const runtime = resolveDesktopRuntimeCommand();
    await spawnLoggedCommand({
      ...runtime,
      logStream,
    });
  } finally {
    await new Promise((resolve) => logStream.end(resolve));
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
