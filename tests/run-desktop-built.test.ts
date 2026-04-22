import { afterEach, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { findMacAppBinary, shouldRunPackagedDesktopApp } from "../scripts/run-desktop-built.mjs";

const tempDirs: string[] = [];

function createTempDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "stave-run-desktop-built-"));
  tempDirs.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("run-desktop-built helpers", () => {
  test("uses the packaged app path on macOS only", () => {
    expect(shouldRunPackagedDesktopApp({ platform: "darwin" })).toBe(true);
    expect(shouldRunPackagedDesktopApp({ platform: "linux" })).toBe(false);
    expect(shouldRunPackagedDesktopApp({ platform: "win32" })).toBe(false);
  });

  test("finds the unpacked Stave.app binary inside release output", () => {
    const releaseRoot = createTempDirectory();
    const appBinaryPath = path.join(releaseRoot, "mac-arm64", "Stave.app", "Contents", "MacOS", "Stave");
    mkdirSync(path.dirname(appBinaryPath), { recursive: true });
    writeFileSync(appBinaryPath, "#!/bin/sh\nexit 0\n");
    chmodSync(appBinaryPath, 0o755);

    expect(findMacAppBinary({ releaseRoot, productName: "Stave" })).toBe(appBinaryPath);
  });

  test("returns null when the unpacked app bundle is missing", () => {
    const releaseRoot = createTempDirectory();
    mkdirSync(path.join(releaseRoot, "mac-arm64"), { recursive: true });

    expect(findMacAppBinary({ releaseRoot, productName: "Stave" })).toBeNull();
  });
});
