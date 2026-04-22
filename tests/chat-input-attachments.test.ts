import { describe, expect, test } from "bun:test";
import { toWorkspaceRelativeFilePath } from "../src/components/session/chat-input.attachments";

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
