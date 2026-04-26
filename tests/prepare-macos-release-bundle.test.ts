import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, readlinkSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { copyMacAppBundle } from "../scripts/prepare-macos-release-bundle.mjs";

const tempDirs: string[] = [];

function createTempDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "stave-macos-bundle-"));
  tempDirs.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("prepare macOS release bundle", () => {
  test("preserves relative framework symlinks when copying the app bundle", () => {
    const workspace = createTempDirectory();
    const sourceAppBundlePath = path.join(workspace, "source", "Stave.app");
    const destinationAppBundlePath = path.join(workspace, "dest", "Stave.app");
    const frameworkRoot = path.join(sourceAppBundlePath, "Contents", "Frameworks", "Electron Framework.framework");
    const versionRoot = path.join(frameworkRoot, "Versions", "A");
    const linkPath = path.join(frameworkRoot, "Electron Framework");

    mkdirSync(versionRoot, { recursive: true });
    writeFileSync(path.join(versionRoot, "Electron Framework"), "framework");
    symlinkSync("Versions/A/Electron Framework", linkPath);

    copyMacAppBundle({
      sourceAppBundlePath,
      destinationAppBundlePath,
    });

    expect(readlinkSync(path.join(destinationAppBundlePath, "Contents", "Frameworks", "Electron Framework.framework", "Electron Framework"))).toBe("Versions/A/Electron Framework");
  });
});
