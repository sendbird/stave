import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyBetterSqlite3ElectronPatch } from "./patch-better-sqlite3-electron.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = path.resolve(scriptDir, "..");
const nativeModules = ["better-sqlite3", "node-pty"];

export function resolveElectronVersion(args = {}) {
  const repoRoot = args.repoRoot ?? defaultRepoRoot;

  // Prefer the actual installed version from node_modules/electron/package.json
  // so that the compiled ABI matches exactly what is on disk, even when
  // package.json contains a semver range like "^41.0.0".
  const installedElectronPkgPath = path.join(repoRoot, "node_modules", "electron", "package.json");
  try {
    const installedPkg = JSON.parse(readFileSync(installedElectronPkgPath, "utf8"));
    if (typeof installedPkg.version === "string" && installedPkg.version.length > 0) {
      return installedPkg.version;
    }
  } catch {
    // Fall through to package.json derivation below.
  }

  // Fallback: strip the semver prefix from the devDependencies range.
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
  const rawElectronVersion = packageJson.devDependencies?.electron;

  if (typeof rawElectronVersion !== "string") {
    throw new Error("Unable to resolve the Electron version from package.json");
  }

  return rawElectronVersion.replace(/^[^\d]*/, "");
}

export function resolveNodeGypBin(args = {}) {
  const repoRoot = args.repoRoot ?? defaultRepoRoot;
  return path.join(repoRoot, "node_modules", ".bin", process.platform === "win32" ? "node-gyp.cmd" : "node-gyp");
}

export function resolveNodeGypDevDir(args = {}) {
  const repoRoot = args.repoRoot ?? defaultRepoRoot;
  return path.join(repoRoot, ".cache", "node-gyp");
}

export function rebuildNativeModule(args) {
  const repoRoot = args.repoRoot ?? defaultRepoRoot;
  const modulePath = path.join(repoRoot, "node_modules", args.moduleName);
  const nodeGypBin = resolveNodeGypBin({ repoRoot });
  const nodeGypDevDir = resolveNodeGypDevDir({ repoRoot });

  const commandArgs = [
    "rebuild",
    "--runtime=electron",
    `--target=${args.electronVersion}`,
    `--arch=${args.arch}`,
    "--dist-url=https://www.electronjs.org/headers",
    "--build-from-source",
    ...(args.gypArgs ?? []),
  ];

  mkdirSync(nodeGypDevDir, { recursive: true });

  const result = spawnSync(nodeGypBin, commandArgs, {
    cwd: modulePath,
    stdio: "inherit",
    env: {
      ...process.env,
      npm_config_devdir: nodeGypDevDir,
    },
  });

  if (result.status !== 0) {
    throw new Error(`node-gyp failed to rebuild '${modulePath}'`);
  }
}

function sqliteModulePath(repoRoot) {
  return path.join(repoRoot, "node_modules", "better-sqlite3");
}

export function resolveSqliteElectronBindingPaths(args) {
  const modulePath = sqliteModulePath(args.repoRoot ?? defaultRepoRoot);
  const platform = args.platform ?? process.platform;
  const arch = args.arch ?? process.arch;
  return {
    built: path.join(modulePath, "build", "Release", "better_sqlite3.node"),
    prebuild: path.join(modulePath, "prebuilds", `${platform}-${arch}.node`),
  };
}

function sqlitePackageUsesPrebuilds(repoRoot) {
  const bindingPath = path.join(sqliteModulePath(repoRoot), "lib", "binding.js");
  if (!existsSync(bindingPath)) return false;
  return readFileSync(bindingPath, "utf8").includes("prebuilds");
}

export function installSqliteElectronPrebuild(args = {}) {
  const repoRoot = args.repoRoot ?? defaultRepoRoot;
  if (!sqlitePackageUsesPrebuilds(repoRoot)) return;

  const { built, prebuild } = resolveSqliteElectronBindingPaths({
    repoRoot,
    platform: args.platform,
    arch: args.arch,
  });
  if (!existsSync(built)) {
    throw new Error(`better-sqlite3 Electron build is missing at ${built}`);
  }
  mkdirSync(path.dirname(prebuild), { recursive: true });
  copyFileSync(built, prebuild);
}

export function rebuildElectronDeps(args = {}) {
  const repoRoot = args.repoRoot ?? defaultRepoRoot;
  const arch = args.arch ?? process.env.npm_config_arch ?? process.env.ARCH ?? process.arch;
  const electronVersion = args.electronVersion ?? resolveElectronVersion({ repoRoot });

  applyBetterSqlite3ElectronPatch({ repoRoot });

  for (const moduleName of nativeModules) {
    rebuildNativeModule({
      repoRoot,
      moduleName,
      electronVersion,
      arch,
      // better-sqlite3 13 treats a host Node prebuild as success and emits an
      // empty gyp target unless force_build is set. The loader then prefers
      // that prebuild over build/Release, so the Electron binary replaces it.
      gypArgs: moduleName === "better-sqlite3" ? ["--force_build=1"] : [],
    });
  }

  installSqliteElectronPrebuild({ repoRoot, arch });
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isDirectExecution()) {
  if (process.env.SKIP_ELECTRON_REBUILD) {
    console.log("SKIP_ELECTRON_REBUILD is set — skipping Electron native module rebuild.");
    process.exit(0);
  }
  try {
    rebuildElectronDeps();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}
