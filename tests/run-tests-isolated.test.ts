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
