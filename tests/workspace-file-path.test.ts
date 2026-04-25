import { describe, expect, test } from "bun:test";
import {
  formatWorkspaceFilePathForDisplay,
  normalizeRelativeWorkspaceFilePath,
  resolveWorkspaceRelativeFilePath,
} from "@/lib/workspace-file-path";

describe("normalizeRelativeWorkspaceFilePath", () => {
  test("normalizes safe relative workspace file paths", () => {
    expect(normalizeRelativeWorkspaceFilePath({ filePath: "./docs\\guide.md/" })).toBe("docs/guide.md");
  });

  test("rejects parent-relative paths", () => {
    expect(normalizeRelativeWorkspaceFilePath({ filePath: "../docs/guide.md" })).toBeNull();
  });
});

describe("resolveWorkspaceRelativeFilePath", () => {
  test("converts workspace absolute paths to relative paths", () => {
    expect(resolveWorkspaceRelativeFilePath({
      filePath: "/tmp/stave/docs/guide.md",
      workspacePath: "/tmp/stave",
    })).toBe("docs/guide.md");
  });

  test("collapses repeated workspace prefixes", () => {
    expect(resolveWorkspaceRelativeFilePath({
      filePath: "/tmp/stave//tmp/stave/docs/guide.md",
      workspacePath: "/tmp/stave",
    })).toBe("docs/guide.md");
  });

  test("rejects absolute paths outside the workspace", () => {
    expect(resolveWorkspaceRelativeFilePath({
      filePath: "/tmp/other/docs/guide.md",
      workspacePath: "/tmp/stave",
    })).toBeNull();
  });
});

describe("formatWorkspaceFilePathForDisplay", () => {
  test("prefers workspace-relative display paths when possible", () => {
    expect(formatWorkspaceFilePathForDisplay({
      filePath: "/tmp/stave//tmp/stave/docs/guide.md",
      workspacePath: "/tmp/stave",
    })).toBe("docs/guide.md");
  });
});
