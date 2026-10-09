import { describe, expect, test } from "bun:test";
import {
  needsProcessIsolation,
  partitionTestFiles,
  usesProcessWideModuleMock,
} from "../scripts/run-tests-isolated.mjs";

function moduleMockSource(moduleId: string) {
  return [
    "mock",
    ".module(",
    JSON.stringify(moduleId),
    ", () => ({}));\n",
  ].join("");
}

describe("usesProcessWideModuleMock", () => {
  test("detects a process-wide module mock call", () => {
    expect(
      usesProcessWideModuleMock(
        moduleMockSource("../electron/providers/claude-sdk-runtime"),
      ),
    ).toBe(true);
  });

  test("ignores comments that mention module mocks without a module id", () => {
    expect(
      usesProcessWideModuleMock(
        "// sibling suites mention process-wide module mocks.\n",
      ),
    ).toBe(false);
  });
});

describe("needsProcessIsolation", () => {
  test("isolates Zustand persist rehydration suites", () => {
    expect(
      needsProcessIsolation(
        [".persist", ".setOptions({ storage });\n"].join(""),
      ),
    ).toBe(true);
  });

  test("isolates suites that share the in-process notification store", () => {
    expect(needsProcessIsolation(["list", "Notifications();\n"].join(""))).toBe(
      true,
    );
  });
});

describe("partitionTestFiles", () => {
  test("isolates native subprocess fixtures without isolating async calls", () => {
    const files = ["/repo/git.test.ts", "/repo/shell.test.ts", "/repo/async.test.ts"];
    const sources = new Map([
      [files[0], ['execFile', 'Sync("git", ["init"]);'].join("")],
      [files[1], ['spawn', 'Sync("sh", ["-c", "true"]);'].join("")],
      [files[2], 'spawn("git", ["status"]);'],
    ]);
    expect(partitionTestFiles(files, sources)).toEqual({
      isolated: files.slice(0, 2),
      shared: files.slice(2),
    });
  });
  test("keeps process-wide module mock files isolated from the shared process", () => {
    const isolatedPath = "/repo/tests/leaky.test.ts";
    const sharedPath = "/repo/tests/clean.test.ts";
    const sourcesByFile = new Map([
      [isolatedPath, moduleMockSource("node:child_process")],
      [sharedPath, 'test("ok", () => {});\n'],
    ]);

    expect(
      partitionTestFiles([isolatedPath, sharedPath], sourcesByFile),
    ).toEqual({
      isolated: [isolatedPath],
      shared: [sharedPath],
    });
  });
});
