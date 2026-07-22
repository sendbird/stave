import { describe, expect, test } from "bun:test";
import {
  buildEditorBulkClosePlan,
  buildEditorTabBreadcrumbsPath,
  getEditorTabCloseRequest,
  resolveEditorTabAbsolutePath,
} from "../src/components/panes/editor-tab-actions";
import type { EditorTab } from "../src/types/chat";

function makeTab(overrides: Partial<EditorTab> & { id: string }): EditorTab {
  return {
    filePath: overrides.id.replace(/^file:/, ""),
    kind: "text",
    language: "typescript",
    content: "",
    hasConflict: false,
    isDirty: false,
    ...overrides,
  };
}

const tabs: EditorTab[] = [
  makeTab({ id: "file:src/a.ts" }),
  makeTab({ id: "file:src/b.ts", isDirty: true }),
  makeTab({ id: "file:src/c.ts" }),
  makeTab({ id: "file:src/d.ts" }),
];

describe("buildEditorBulkClosePlan", () => {
  test("others excludes the anchor tab and reports dirty tabs", () => {
    const plan = buildEditorBulkClosePlan({
      editorTabs: tabs,
      anchorTabId: "file:src/c.ts",
      kind: "others",
    });
    expect(plan?.tabIds).toEqual([
      "file:src/a.ts",
      "file:src/b.ts",
      "file:src/d.ts",
    ]);
    expect(plan?.dirtyTabIds).toEqual(["file:src/b.ts"]);
    expect(plan?.description).toContain("1 unsaved tab(s)");
  });

  test("right only includes tabs after the anchor", () => {
    const plan = buildEditorBulkClosePlan({
      editorTabs: tabs,
      anchorTabId: "file:src/b.ts",
      kind: "right",
    });
    expect(plan?.tabIds).toEqual(["file:src/c.ts", "file:src/d.ts"]);
    expect(plan?.dirtyTabIds).toEqual([]);
  });

  test("right returns null at the last tab", () => {
    const plan = buildEditorBulkClosePlan({
      editorTabs: tabs,
      anchorTabId: "file:src/d.ts",
      kind: "right",
    });
    expect(plan).toBeNull();
  });

  test("saved skips dirty tabs", () => {
    const plan = buildEditorBulkClosePlan({
      editorTabs: tabs,
      anchorTabId: "file:src/a.ts",
      kind: "saved",
    });
    expect(plan?.tabIds).toEqual([
      "file:src/a.ts",
      "file:src/c.ts",
      "file:src/d.ts",
    ]);
  });

  test("all includes every tab", () => {
    const plan = buildEditorBulkClosePlan({
      editorTabs: tabs,
      anchorTabId: "file:src/a.ts",
      kind: "all",
    });
    expect(plan?.tabIds).toHaveLength(4);
    expect(plan?.dirtyTabIds).toEqual(["file:src/b.ts"]);
  });

  test("bulk close preserves pinned tabs", () => {
    const plan = buildEditorBulkClosePlan({
      editorTabs: tabs,
      anchorTabId: "file:src/a.ts",
      kind: "all",
      pinnedTabIds: ["file:src/b.ts", "file:src/d.ts"],
    });
    expect(plan?.tabIds).toEqual(["file:src/a.ts", "file:src/c.ts"]);
    expect(plan?.dirtyTabIds).toEqual([]);
  });
});

describe("getEditorTabCloseRequest", () => {
  test("returns file name and dirty flag", () => {
    expect(
      getEditorTabCloseRequest({ editorTabs: tabs, tabId: "file:src/b.ts" }),
    ).toEqual({ tabId: "file:src/b.ts", fileName: "b.ts", isDirty: true });
  });

  test("returns null for unknown tabs", () => {
    expect(
      getEditorTabCloseRequest({ editorTabs: tabs, tabId: "file:missing.ts" }),
    ).toBeNull();
  });
});

describe("path helpers", () => {
  test("resolveEditorTabAbsolutePath joins workspace root and relative path", () => {
    expect(
      resolveEditorTabAbsolutePath({
        filePath: "src/a.ts",
        workspaceRootPath: "/repo/",
      }),
    ).toBe("/repo/src/a.ts");
    expect(
      resolveEditorTabAbsolutePath({
        filePath: "src/a.ts",
        workspaceRootPath: "",
      }),
    ).toBe("src/a.ts");
  });

  test("buildEditorTabBreadcrumbsPath joins segments", () => {
    expect(buildEditorTabBreadcrumbsPath({ filePath: "src/lib/a.ts" })).toBe(
      "src > lib > a.ts",
    );
  });
});
