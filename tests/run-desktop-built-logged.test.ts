import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import {
  createDesktopBuiltLogPath,
  resolveDesktopPackagingCommand,
  resolveDesktopBuiltLogDir,
  rotateDesktopBuiltLogs,
} from "../scripts/run-desktop-built-logged.mjs";

const tempDirs: string[] = [];

function createTempDirectory() {
  const directory = mkdtempSync(path.join(tmpdir(), "stave-desktop-built-logged-"));
  tempDirs.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("run-desktop-built-logged helpers", () => {
  test("packages a fresh release bundle before running on macOS", () => {
    const command = resolveDesktopPackagingCommand({ platform: "darwin" });

    expect(command).not.toBeNull();
    expect(command?.command).toContain("electron-builder");
    expect(command?.args).toEqual(["--config", "electron-builder.yml", "--dir"]);
  });

  test("skips the packaging step outside macOS", () => {
    expect(resolveDesktopPackagingCommand({ platform: "linux" })).toBeNull();
    expect(resolveDesktopPackagingCommand({ platform: "win32" })).toBeNull();
  });

  test("resolves the default log directory under the OS temp folder", () => {
    expect(resolveDesktopBuiltLogDir()).toBe(path.join(tmpdir(), "stave-logs"));
  });

  test("creates a timestamped log path", () => {
    const logDir = createTempDirectory();
    const logPath = createDesktopBuiltLogPath({
      logDir,
      now: new Date(2026, 3, 10, 12, 34, 56),
    });

    expect(logPath).toBe(path.join(logDir, "desktop-built-20260410-123456.log"));
  });

  test("rotates logs by age and keeps only the newest retained files", () => {
    const logDir = createTempDirectory();
    const now = new Date(2026, 3, 10, 12, 0, 0);
    const nowMs = now.getTime();

    for (let index = 0; index < 12; index += 1) {
      const name = `desktop-built-20260410-1200${String(index).padStart(2, "0")}.log`;
      writeFileSync(path.join(logDir, name), "log\n");
    }

    const oldLog = path.join(logDir, "desktop-built-20260301-000000.log");
    writeFileSync(oldLog, "old\n");

    const keptLog = path.join(logDir, "desktop-built-20260410-999999.log");
    writeFileSync(keptLog, "keep\n");

    for (const [offset, fileName] of [
      [0, "desktop-built-20260410-120000.log"],
      [1, "desktop-built-20260410-120001.log"],
      [2, "desktop-built-20260410-120002.log"],
      [3, "desktop-built-20260410-120003.log"],
      [4, "desktop-built-20260410-120004.log"],
      [5, "desktop-built-20260410-120005.log"],
      [6, "desktop-built-20260410-120006.log"],
      [7, "desktop-built-20260410-120007.log"],
      [8, "desktop-built-20260410-120008.log"],
      [9, "desktop-built-20260410-120009.log"],
      [10, "desktop-built-20260410-120010.log"],
      [11, "desktop-built-20260410-120011.log"],
    ]) {
      const filePath = path.join(logDir, fileName);
      const mtimeMs = nowMs - offset * 60_000;
      writeFileSync(filePath, "log\n");
      const time = new Date(mtimeMs);
      utimesSync(filePath, time, time);
    }

    const oldTime = new Date(nowMs - (8 * 24 * 60 * 60 * 1000));
    utimesSync(oldLog, oldTime, oldTime);

    const newestTime = new Date(nowMs + 1_000);
    utimesSync(keptLog, newestTime, newestTime);

    rotateDesktopBuiltLogs({ logDir, now });

    const remaining = readdirSync(logDir)
      .filter((name) => name.startsWith("desktop-built-"))
      .sort();

    expect(remaining.includes("desktop-built-20260301-000000.log")).toBe(false);
    expect(remaining.length).toBe(10);
    expect(remaining.includes("desktop-built-20260410-999999.log")).toBe(true);
  });
});
