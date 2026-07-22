import { describe, expect, test } from "bun:test";
import {
  resolvePastedFileAbsolutePath,
  toWorkspaceRelativeFilePath,
} from "../src/components/session/chat-input.attachments";

function makeFile(overrides: { path?: string } = {}) {
  const file = new File(["content"], "App.tsx", { type: "text/plain" });
  if (overrides.path !== undefined) {
    Object.defineProperty(file, "path", { value: overrides.path });
  }
  return file;
}

describe("resolvePastedFileAbsolutePath", () => {
  test("prefers the preload getPathForFile bridge", () => {
    expect(
      resolvePastedFileAbsolutePath({
        file: makeFile({ path: "/legacy/App.tsx" }),
        getPathForFile: () => "/repo/src/App.tsx",
      }),
    ).toBe("/repo/src/App.tsx");
  });

  test("falls back to legacy File.path when the bridge returns empty", () => {
    expect(
      resolvePastedFileAbsolutePath({
        file: makeFile({ path: "/repo/src/App.tsx" }),
        getPathForFile: () => "",
      }),
    ).toBe("/repo/src/App.tsx");
  });

  test("falls back to legacy File.path when the bridge throws", () => {
    expect(
      resolvePastedFileAbsolutePath({
        file: makeFile({ path: "/repo/src/App.tsx" }),
        getPathForFile: () => {
          throw new Error("not a file");
        },
      }),
    ).toBe("/repo/src/App.tsx");
  });

  test("returns null when no path source is available", () => {
    expect(resolvePastedFileAbsolutePath({ file: makeFile() })).toBeNull();
  });

  test("returns null without the bridge when File.path is blank", () => {
    expect(
      resolvePastedFileAbsolutePath({ file: makeFile({ path: "  " }) }),
    ).toBeNull();
  });
});

describe("toWorkspaceRelativeFilePath", () => {
  test("returns a workspace-relative path for files inside the root", () => {
    expect(toWorkspaceRelativeFilePath({
      absolutePath: "/repo/src/App.tsx",
      rootPath: "/repo",
    })).toBe("src/App.tsx");
  });

  test("returns null for files outside the workspace root", () => {
    expect(toWorkspaceRelativeFilePath({
      absolutePath: "/other/src/App.tsx",
      rootPath: "/repo",
    })).toBeNull();
  });

  test("matches windows roots case-insensitively", () => {
    expect(toWorkspaceRelativeFilePath({
      absolutePath: "c:\\Repo\\src\\App.tsx",
      rootPath: "C:\\repo",
    })).toBe("src/App.tsx");
  });
});
