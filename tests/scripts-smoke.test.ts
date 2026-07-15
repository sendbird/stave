import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "bun:test";
import packageJson from "../package.json";

describe("package scripts", () => {
  test("contains expected dev/build scripts", () => {
    const scripts = packageJson.scripts as Record<string, string>;
    expect(typeof scripts.dev).toBe("string");
    expect(typeof scripts["dev:all"]).toBe("string");
    expect(typeof scripts["dev:desktop"]).toBe("string");
    expect(typeof scripts["build:desktop"]).toBe("string");
    expect(scripts["test:isolated"]).toBe(
      "node scripts/run-tests-isolated.mjs",
    );
  });

  test("desktop packaging scripts rebuild Electron native dependencies automatically", () => {
    const scripts = packageJson.scripts as Record<string, string>;

    expect(scripts["rebuild:electron-deps"]).toBe("node scripts/rebuild-electron-deps.mjs");
    expect(scripts["package:desktop:dir"].startsWith("bun run rebuild:electron-deps && ")).toBe(true);
    expect(scripts["package:desktop:dir"].endsWith("electron-builder --config electron-builder.yml --dir")).toBe(true);
    expect(scripts["run:desktop:packaged"].startsWith("bun run rebuild:electron-deps && ")).toBe(true);
    expect(scripts["run:desktop:packaged"].endsWith("node scripts/run-desktop-built.mjs")).toBe(true);
    expect(scripts["run:desktop:packaged:logged"].startsWith("bun run rebuild:electron-deps && ")).toBe(true);
    expect(scripts["run:desktop:packaged:logged"].endsWith("node scripts/run-desktop-built-logged.mjs")).toBe(true);
    expect(scripts["package:desktop"]).toBe("bun run package:desktop:dir");
    expect(scripts["run:desktop:built"]).toBe("bun run run:desktop:packaged");
    expect(scripts["desktop:built:logged"]).toBe("bun run run:desktop:packaged:logged");
    expect(scripts["test:ci"]).toContain("bun run test:isolated");
    expect(scripts["package:linux:dir"].startsWith("bun run rebuild:electron-deps && ")).toBe(true);
    expect(scripts["package:linux:appimage"].startsWith("bun run rebuild:electron-deps && ")).toBe(true);
    expect(scripts["package:linux:deb"].startsWith("bun run rebuild:electron-deps && ")).toBe(true);
  });

  test("electron-builder skips its own native rebuild because packaging scripts rebuild first", () => {
    const config = readFileSync(path.join(import.meta.dirname, "..", "electron-builder.yml"), "utf8");
    expect(config.includes("npmRebuild: false")).toBe(true);
  });

  test("electron-builder unpacks the bundled portless CLI for Orbit", () => {
    const config = readFileSync(path.join(import.meta.dirname, "..", "electron-builder.yml"), "utf8");
    expect(config.includes("- node_modules/portless/dist/**")).toBe(true);
  });

  test("node-invoked mjs scripts use Node-compatible entrypoint guards", () => {
    for (const scriptPath of [
      "scripts/run-desktop-built.mjs",
      "scripts/run-desktop-built-logged.mjs",
      "scripts/prepare-macos-release-bundle.mjs",
    ]) {
      const source = readFileSync(path.join(import.meta.dirname, "..", scriptPath), "utf8");
      expect(source.includes("import.meta.main")).toBe(false);
      expect(source.includes("process.argv[1]")).toBe(true);
    }
  });
});
