import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const repoRoot = path.join(import.meta.dirname, "..");

describe("release packaging workflow", () => {
  test("publishes an internal macOS zip bundle built from the unpacked app", () => {
    const workflow = readFileSync(path.join(repoRoot, ".github", "workflows", "release.yml"), "utf8");
    const bundlePrep = readFileSync(path.join(repoRoot, "scripts", "prepare-macos-release-bundle.mjs"), "utf8");

    expect(workflow).toContain("Package unpacked macOS app bundle");
    expect(workflow).toContain("Prepare internal macOS release bundle");
    expect(workflow).toContain("./node_modules/.bin/electron-builder --config electron-builder.yml --dir");
    expect(workflow).toContain("node scripts/prepare-macos-release-bundle.mjs");
    expect(workflow).toContain("files: release/Stave-macOS.zip");
    expect(bundlePrep).toContain("Install Stave.command");
    expect(bundlePrep).toContain("Install Stave in Terminal.txt");
    expect(bundlePrep).toContain("verbatimSymlinks: true");
  });

  test("ships an installer helper that removes quarantine after copying the app", () => {
    const installer = readFileSync(path.join(repoRoot, "scripts", "install-stave.command"), "utf8");

    expect(installer).toContain("$HOME/Applications");
    expect(installer).toContain("ditto \"$SOURCE_APP\" \"$TARGET_APP\"");
    expect(installer).toContain("xattr -dr com.apple.quarantine");
    expect(installer).toContain("open \"$TARGET_APP\"");
  });

  test("ships a non-executable Terminal fallback guide for Gatekeeper-blocked installs", () => {
    const terminalGuide = readFileSync(path.join(repoRoot, "scripts", "install-stave-in-terminal.txt"), "utf8");

    expect(terminalGuide).toContain("Install Stave.command");
    expect(terminalGuide).toContain("Type: sh ");
    expect(terminalGuide).toContain("~/Applications");
    expect(terminalGuide).toContain("quarantine");
  });
});
