import { expect, test } from "bun:test";
import { RIGHT_RAIL_PANEL_TITLES } from "../src/lib/right-rail-panels";
import {
  normalizeLayoutState,
  normalizeRightRailSelection,
  normalizeSidebarOverlayTab,
  type LayoutState,
} from "../src/store/layout.utils";

test("a saved layout that names the old collaboration panel opens the Task panel on Team", () => {
  expect(normalizeRightRailSelection("collaboration", undefined)).toEqual({
    sidebarOverlayTab: "task",
    taskPanelTab: "team",
  });
  expect(normalizeSidebarOverlayTab("collaboration")).toBe("task");
});

test("a saved layout that names a retired task panel opens the Task panel on its tab", () => {
  expect(RIGHT_RAIL_PANEL_TITLES.task).toBe("Task");
  for (const [panel, tab] of [
    ["activity", "activity"],
    ["results", "results"],
    ["mission", "progress"],
    ["flow", "progress"],
    ["team", "team"],
  ] as const) {
    expect(normalizeRightRailSelection(panel, undefined)).toEqual({
      sidebarOverlayTab: "task",
      taskPanelTab: tab,
    });
    expect(normalizeSidebarOverlayTab(panel)).toBe("task");
  }
  // The retired id is the more specific statement of what was open.
  expect(normalizeRightRailSelection("mission", "results")).toEqual({
    sidebarOverlayTab: "task",
    taskPanelTab: "progress",
  });
});

test("current ids pass through and anything else falls back", () => {
  expect(normalizeRightRailSelection("task", "team")).toEqual({
    sidebarOverlayTab: "task",
    taskPanelTab: "team",
  });
  expect(normalizeRightRailSelection("task", "nope")).toEqual({
    sidebarOverlayTab: "task",
    taskPanelTab: "activity",
  });
  expect(normalizeRightRailSelection("changes", undefined)).toEqual({
    sidebarOverlayTab: "changes",
    taskPanelTab: "activity",
  });
  expect(normalizeSidebarOverlayTab("something-else")).toBe("explorer");
  expect(normalizeSidebarOverlayTab(undefined)).toBe("explorer");
});

test("a whole saved layout from before the merge restores the Task panel", () => {
  const saved = {
    workspaceSidebarWidth: 300,
    workspaceSidebarCollapsed: false,
    workspaceSidebarItemDisplayMode: "expanded",
    explorerPanelWidth: 300,
    sidebarOverlayVisible: true,
    sidebarOverlayTab: "team",
    terminalDocked: false,
    editorDiffMode: false,
    editorMarkdownPreviewMode: false,
    turnActivityFloatPos: null,
  } as unknown as LayoutState;
  expect(normalizeLayoutState(saved)).toMatchObject({
    sidebarOverlayVisible: true,
    sidebarOverlayTab: "task",
    taskPanelTab: "team",
  });
});
