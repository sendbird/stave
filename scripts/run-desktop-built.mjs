import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const productName = "Stave";

export function shouldRunPackagedDesktopApp(args = {}) {
  return (args.platform ?? process.platform) === "darwin";
}

function resolveLocalBin(name) {
  const binaryName = process.platform === "win32" ? `${name}.cmd` : name;
  return path.join(repoRoot, "node_modules", ".bin", binaryName);
}

function spawnCommand(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(args.command, args.args ?? [], {
      cwd: args.cwd ?? repoRoot,
      env: args.env ?? process.env,
      stdio: "inherit",
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed: ${args.command} ${args.args?.join(" ") ?? ""} (${signal ?? code ?? "unknown"})`));
    });
  });
}

function collectAppBundleDirectories(args) {
  const discovered = [];
  const queue = [{ directory: args.rootDirectory, depth: 0 }];

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || next.depth > args.maxDepth || !existsSync(next.directory)) {
      continue;
    }

    const entries = readdirSync(next.directory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const fullPath = path.join(next.directory, entry.name);
      if (entry.name.endsWith(".app")) {
        discovered.push(fullPath);
        continue;
      }
      queue.push({ directory: fullPath, depth: next.depth + 1 });
    }
  }

  return discovered;
}

export function findMacAppBinary(args) {
  const releaseRoot = args.releaseRoot;
  if (!existsSync(releaseRoot)) {
    return null;
  }

  const appBundleDirectories = collectAppBundleDirectories({
    rootDirectory: releaseRoot,
    maxDepth: 3,
  }).sort((left, right) => left.localeCompare(right));

  for (const appBundlePath of appBundleDirectories) {
    const binaryPath = path.join(appBundlePath, "Contents", "MacOS", args.productName);
    if (existsSync(binaryPath) && statSync(binaryPath).isFile()) {
      return binaryPath;
    }
  }

  return null;
}

export function findMacAppBundle(args) {
  const releaseRoot = args.releaseRoot;
  if (!existsSync(releaseRoot)) {
    return null;
  }

  const appBundleDirectories = collectAppBundleDirectories({
    rootDirectory: releaseRoot,
    maxDepth: 3,
  }).sort((left, right) => left.localeCompare(right));

  return appBundleDirectories.find((appBundlePath) => {
    const binaryPath = path.join(appBundlePath, "Contents", "MacOS", args.productName);
    return existsSync(binaryPath) && statSync(binaryPath).isFile();
  }) ?? null;
}

async function runPackagedMacApp() {
  await spawnCommand({
    command: resolveLocalBin("electron-builder"),
    args: ["--config", "electron-builder.yml", "--dir"],
  });

  const appBundlePath = findMacAppBundle({
    releaseRoot: path.join(repoRoot, "release"),
    productName,
  });

  if (!appBundlePath) {
    throw new Error("Unable to locate the unpacked Stave.app bundle under release/ after electron-builder --dir.");
  }

  await spawnCommand({
    command: "open",
    args: ["-n", appBundlePath],
  });
}

async function runUnpackagedDesktopApp() {
  await spawnCommand({
    command: resolveLocalBin("electron"),
    args: ["."],
    env: {
      ...process.env,
      STAVE_RUNTIME_PROFILE: "production",
    },
  });
}

async function main() {
  if (shouldRunPackagedDesktopApp()) {
    await runPackagedMacApp();
    return;
  }

  await runUnpackagedDesktopApp();
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
