import { chmodSync, copyFileSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findMacAppBundle } from "./run-desktop-built.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const releaseRoot = path.join(repoRoot, "release");
const productName = "Stave";
const bundleDirectoryName = "Stave";
const archiveName = "Stave-macOS.zip";

export function copyMacAppBundle(args) {
  cpSync(args.sourceAppBundlePath, args.destinationAppBundlePath, {
    recursive: true,
    verbatimSymlinks: true,
  });
}

function main() {
  const appBundlePath = findMacAppBundle({
    releaseRoot,
    productName,
  });

  if (!appBundlePath || !existsSync(appBundlePath)) {
    throw new Error("Unable to locate Stave.app under release/. Run electron-builder --dir before preparing release assets.");
  }

  const installerSourcePath = path.join(repoRoot, "scripts", "install-stave.command");
  const terminalGuideSourcePath = path.join(repoRoot, "scripts", "install-stave-in-terminal.txt");
  const stagingRoot = path.join(releaseRoot, bundleDirectoryName);
  const archivePath = path.join(releaseRoot, archiveName);

  rmSync(stagingRoot, { recursive: true, force: true });
  rmSync(archivePath, { force: true });
  mkdirSync(stagingRoot, { recursive: true });

  copyMacAppBundle({
    sourceAppBundlePath: appBundlePath,
    destinationAppBundlePath: path.join(stagingRoot, `${productName}.app`),
  });
  copyFileSync(installerSourcePath, path.join(stagingRoot, "Install Stave.command"));
  copyFileSync(terminalGuideSourcePath, path.join(stagingRoot, "Install Stave in Terminal.txt"));
  chmodSync(path.join(stagingRoot, "Install Stave.command"), 0o755);

  execFileSync("ditto", ["-c", "-k", "--keepParent", bundleDirectoryName, archiveName], {
    cwd: releaseRoot,
    stdio: "inherit",
  });
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
