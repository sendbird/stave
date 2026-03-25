import { describe, expect, test } from "bun:test";
import { rankFileSearchResults, splitFileSearchPath } from "@/components/layout/file-search-utils";

describe("file search utils", () => {
  test("splits a relative file path into file and directory labels", () => {
    expect(splitFileSearchPath({ filePath: "src/components/layout/TopBar.tsx" })).toEqual({
      fileName: "TopBar.tsx",
      directoryPath: "src/components/layout",
    });
  });

  test("prefers exact basename matches ahead of looser path matches", () => {
    const results = rankFileSearchResults({
      files: [
        "src/components/layout/TopBar.tsx",
        "docs/topbar-notes.md",
        "src/components/layout/AppShell.tsx",
      ],
      query: "topbar",
    });

    expect(results[0]?.filePath).toBe("src/components/layout/TopBar.tsx");
  });

  test("matches multi-token queries against file names and parent folders", () => {
    const results = rankFileSearchResults({
      files: [
        "src/components/layout/TopBar.tsx",
        "src/components/layout/KeyboardShortcutsDrawer.tsx",
        "package.json",
      ],
      query: "layout top",
    });

    expect(results[0]?.filePath).toBe("src/components/layout/TopBar.tsx");
  });

  test("supports subsequence queries for quick-open style fuzzy matching", () => {
    const results = rankFileSearchResults({
      files: [
        "src/components/layout/TopBar.tsx",
        "src/components/layout/AppShell.tsx",
      ],
      query: "tbr",
    });

    expect(results[0]?.filePath).toBe("src/components/layout/TopBar.tsx");
  });
});
