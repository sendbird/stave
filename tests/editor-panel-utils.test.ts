import { describe, expect, test } from "bun:test";
import {
  buildExplorerIndex,
  buildSourceControlSections,
  buildSourceControlSummary,
  collectAncestorFolders,
  getExplorerExpandedPathsAfterCreate,
  normalizeRelativeInputPath,
} from "@/components/layout/editor-panel.utils";

describe("normalizeRelativeInputPath", () => {
  test("normalizes safe relative paths", () => {
    expect(normalizeRelativeInputPath({ value: "./src\\components/app.tsx/" })).toBe("src/components/app.tsx");
  });

  test("rejects absolute and parent-relative paths", () => {
    expect(normalizeRelativeInputPath({ value: "/etc/passwd" })).toBeNull();
    expect(normalizeRelativeInputPath({ value: "../secret.txt" })).toBeNull();
  });
});

describe("collectAncestorFolders", () => {
  test("returns each ancestor folder in order", () => {
    expect(collectAncestorFolders({ path: "src/components/layout" })).toEqual([
      "src",
      "src/components",
      "src/components/layout",
    ]);
  });
});

describe("getExplorerExpandedPathsAfterCreate", () => {
  test("expands ancestor folders for new files", () => {
    expect(getExplorerExpandedPathsAfterCreate({
      path: "src/components/layout/EditorPanel.tsx",
      type: "file",
    })).toEqual([
      "src",
      "src/components",
      "src/components/layout",
    ]);
  });

  test("expands the created folder as well for new directories", () => {
    expect(getExplorerExpandedPathsAfterCreate({
      path: "src/components/layout",
      type: "folder",
    })).toEqual([
      "src",
      "src/components",
      "src/components/layout",
    ]);
  });

  test("keeps root-level file creation collapsed", () => {
    expect(getExplorerExpandedPathsAfterCreate({
      path: "README.md",
      type: "file",
    })).toEqual([]);
  });
});

describe("buildExplorerIndex", () => {
  test("builds a sorted explorer tree and supporting folder metadata in one pass", () => {
    const index = buildExplorerIndex({
      files: [
        "src/lib/utils.ts",
        "README.md",
        "src/components/App.tsx",
        "src/components/ui/button.tsx",
      ],
    });

    expect(index.topFolders).toEqual(["src", "README.md"]);
    expect(index.folderPaths).toEqual([
      "src",
      "src/components",
      "src/components/ui",
      "src/lib",
    ]);
    expect(index.tree.map((node) => `${node.type}:${node.name}`)).toEqual([
      "folder:src",
      "file:README.md",
    ]);
    expect(index.tree[0]?.children.map((node) => `${node.type}:${node.name}`)).toEqual([
      "folder:components",
      "folder:lib",
    ]);
  });

  test("filters files while preserving matching ancestor folders", () => {
    const index = buildExplorerIndex({
      files: [
        "src/components/App.tsx",
        "src/components/ui/button.tsx",
        "src/lib/utils.ts",
      ],
      filter: "button",
    });

    expect(index.tree).toHaveLength(1);
    expect(index.tree[0]?.path).toBe("src");
    expect(index.tree[0]?.children[0]?.path).toBe("src/components");
    expect(index.tree[0]?.children[0]?.children[0]?.path).toBe("src/components/ui");
    expect(index.tree[0]?.children[0]?.children[0]?.children[0]?.path).toBe("src/components/ui/button.tsx");
  });
});

describe("buildSourceControlSummary", () => {
  test("counts staged, mixed, working-tree, untracked, and conflict states independently", () => {
    const summary = buildSourceControlSummary({
      items: [
        { code: "MM", path: "src/mixed.ts" },
        { code: " M", path: "src/unstaged.ts" },
        { code: "M ", path: "src/staged.ts" },
        { code: "??", path: "src/new.ts" },
        { code: "UU", path: "src/conflict.ts" },
      ],
    });

    expect(summary).toEqual({
      totalCount: 5,
      stagedCount: 2,
      unstagedCount: 2,
      untrackedCount: 1,
      conflictCount: 1,
      mixedCount: 1,
      committableCount: 2,
      workingTreeCount: 4,
    });
  });
});

describe("buildSourceControlSections", () => {
  test("groups change items into stable UI sections with action metadata", () => {
    const sections = buildSourceControlSections({
      items: [
        { code: "UU", path: "src/conflict.ts" },
        { code: "MM", path: "src/mixed.ts" },
        { code: " M", path: "src/unstaged.ts" },
        { code: "M ", path: "src/staged.ts" },
        { code: "??", path: "src/new.ts" },
      ],
    });

    expect(sections.map((section) => section.id)).toEqual([
      "conflicted",
      "mixed",
      "unstaged",
      "staged",
      "untracked",
    ]);
    expect(sections[1]?.items[0]).toMatchObject({
      fileName: "mixed.ts",
      hasMixedChanges: true,
      canStage: true,
      canUnstage: true,
      canDiscard: true,
    });
    expect(sections[3]?.items[0]).toMatchObject({
      fileName: "staged.ts",
      canStage: false,
      canUnstage: true,
      canDiscard: false,
    });
    expect(sections[4]?.items[0]).toMatchObject({
      fileName: "new.ts",
      canStage: true,
      canUnstage: false,
      canDiscard: true,
    });
  });

  test("keeps rename metadata readable for the row detail line", () => {
    const sections = buildSourceControlSections({
      items: [{ code: "R ", path: "src/old.ts -> src/new.ts" }],
    });

    expect(sections[0]?.items[0]).toMatchObject({
      fileName: "new.ts",
      pathLabel: "src/old.ts -> src/new.ts",
      pathDetail: "renamed from src/old.ts",
    });
  });
});
