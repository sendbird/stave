import { describe, expect, test } from "bun:test";
import {
  AGENTS_LIST_DEFAULT_WIDTH,
  AGENTS_LIST_MAX_WIDTH,
  AGENTS_LIST_MIN_WIDTH,
  DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE,
  RIGHT_PANEL_DEFAULT_WIDTH,
  RIGHT_PANEL_MAX_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  WORKSPACE_SIDEBAR_DEFAULT_WIDTH,
  WORKSPACE_SIDEBAR_MAX_WIDTH,
  WORKSPACE_SIDEBAR_MIN_WIDTH,
  createDefaultLayoutState,
  isNarrowWindowForWorkspaceSidebar,
  mergeLayoutPatch,
  normalizeLayoutState,
  normalizeRightPanelWidth,
  normalizeWorkspaceSidebarWidth,
  planWorkspaceSidebarCollapse,
  resolveWorkspaceSidebarCollapsed,
  type LayoutState,
} from "@/store/layout.utils";
import { clampRightPanelWidth } from "@/components/layout/app-shell-layout";

function baseLayout(): LayoutState {
  return {
    workspaceSidebarWidth: 300,
    workspaceSidebarCollapsed: false,
    workspaceSidebarItemDisplayMode: DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE,
    explorerPanelWidth: 360,
    agentsListWidth: AGENTS_LIST_DEFAULT_WIDTH,
    sidebarOverlayVisible: false,
    sidebarOverlayTab: "explorer",
    taskPanelTab: "activity",
    terminalDocked: false,
    editorDiffMode: false,
    editorMarkdownPreviewMode: false,
    turnActivityFloatPos: null,
  };
}

describe("normalizeLayoutState", () => {
  test("keeps the dragged Agents list width inside its range, and gives older layouts the default", () => {
    expect(createDefaultLayoutState().agentsListWidth).toBe(AGENTS_LIST_DEFAULT_WIDTH);
    const { agentsListWidth: _omitted, ...saved } = baseLayout();
    expect(normalizeLayoutState(saved as LayoutState).agentsListWidth).toBe(AGENTS_LIST_DEFAULT_WIDTH);
    for (const [value, expected] of [
      [333.6, 334],
      [10, AGENTS_LIST_MIN_WIDTH],
      [5_000, AGENTS_LIST_MAX_WIDTH],
      [Number.NaN, AGENTS_LIST_DEFAULT_WIDTH],
      ["320", AGENTS_LIST_DEFAULT_WIDTH],
    ] as const) {
      expect(
        normalizeLayoutState({ ...baseLayout(), agentsListWidth: value as number }).agentsListWidth,
      ).toBe(expected);
    }
    expect(
      mergeLayoutPatch({ layout: baseLayout(), patch: { agentsListWidth: 360 } })?.agentsListWidth,
    ).toBe(360);
  });

  test("falls back from the retired automations right-rail selection", () => {
    expect(
      normalizeLayoutState({
        ...baseLayout(),
        sidebarOverlayTab: "automations" as LayoutState["sidebarOverlayTab"],
        sidebarOverlayVisible: true,
      }),
    ).toMatchObject({
      sidebarOverlayTab: "explorer",
      sidebarOverlayVisible: true,
    });
  });

  test("ignores retired center-surface layout fields from persisted state", () => {
    const legacyLayout = {
      ...baseLayout(),
      editorPanelWidth: 720,
      lensPanelWidthByWorkspaceId: { "ws-1": 520 },
      lensDisplayModeByWorkspaceId: { "ws-1": "fullscreen" },
      lensFullscreenByWorkspaceId: { "ws-1": true, "ws-2": false },
      terminalDockHeight: 210,
      editorVisible: true,
    } as unknown as LayoutState;

    const normalized = normalizeLayoutState(legacyLayout);

    expect(normalized).toEqual(baseLayout());
    expect(normalized).not.toHaveProperty("editorPanelWidth");
    expect(normalized).not.toHaveProperty("lensPanelWidthByWorkspaceId");
    expect(normalized).not.toHaveProperty("lensDisplayModeByWorkspaceId");
    expect(normalized).not.toHaveProperty("terminalDockHeight");
    expect(normalized).not.toHaveProperty("editorVisible");
  });

  test("keeps a finite floating turn-activity position and clamps negatives", () => {
    expect(
      normalizeLayoutState({
        ...baseLayout(),
        turnActivityFloatPos: { x: 120, y: -4 },
      }).turnActivityFloatPos,
    ).toEqual({ x: 120, y: 0 });
  });

  test("drops malformed floating turn-activity positions", () => {
    for (const value of [
      { x: Number.NaN, y: 10 },
      { x: "12", y: 10 },
      { x: 12 },
      "top-right",
      undefined,
    ]) {
      expect(
        normalizeLayoutState({
          ...baseLayout(),
          turnActivityFloatPos:
            value as LayoutState["turnActivityFloatPos"],
        }).turnActivityFloatPos,
      ).toBeNull();
    }
  });
});

describe("repository sidebar width and narrow-window fold", () => {
  test("drags between 220 and 340, starts at 290, and reads anything unreadable as the default", () => {
    expect([WORKSPACE_SIDEBAR_MIN_WIDTH, WORKSPACE_SIDEBAR_DEFAULT_WIDTH, WORKSPACE_SIDEBAR_MAX_WIDTH]).toEqual([220, 290, 340]);
    expect(createDefaultLayoutState().workspaceSidebarWidth).toBe(290);
    for (const [value, expected] of [
      [251.4, 251],
      [100, 220],
      [900, 340],
      [Number.NaN, 290],
      ["260", 290],
      [undefined, 290],
    ] as const) {
      expect(normalizeWorkspaceSidebarWidth(value)).toBe(expected);
    }
    expect(normalizeLayoutState({ ...baseLayout(), workspaceSidebarWidth: 120 }).workspaceSidebarWidth).toBe(220);
  });

  test("folds below a 1180px window", () => {
    expect(isNarrowWindowForWorkspaceSidebar(1179)).toBe(true);
    expect(isNarrowWindowForWorkspaceSidebar(1180)).toBe(false);
    expect(isNarrowWindowForWorkspaceSidebar(1024)).toBe(true);
  });

  test("a narrow window shows the rail unless the user opened it there; a wide one keeps the saved choice", () => {
    expect(resolveWorkspaceSidebarCollapsed({ savedCollapsed: false, narrowWindow: true, openedInNarrowWindow: false })).toBe(true);
    expect(resolveWorkspaceSidebarCollapsed({ savedCollapsed: true, narrowWindow: true, openedInNarrowWindow: true })).toBe(false);
    expect(resolveWorkspaceSidebarCollapsed({ savedCollapsed: false, narrowWindow: false, openedInNarrowWindow: true })).toBe(false);
    expect(resolveWorkspaceSidebarCollapsed({ savedCollapsed: true, narrowWindow: false, openedInNarrowWindow: false })).toBe(true);
  });

  test("a narrow window keeps fold requests for the session and never saves the automatic fold", () => {
    // Folding again in a narrow window leaves the saved (wide) choice alone.
    expect(planWorkspaceSidebarCollapse({ collapsed: true, narrowWindow: true, savedCollapsed: false })).toEqual({
      savedCollapsed: false,
      openedInNarrowWindow: false,
    });
    // Opening it there also clears a saved fold.
    expect(planWorkspaceSidebarCollapse({ collapsed: false, narrowWindow: true, savedCollapsed: true })).toEqual({
      savedCollapsed: false,
      openedInNarrowWindow: true,
    });
    // A wide window saves the choice.
    expect(planWorkspaceSidebarCollapse({ collapsed: true, narrowWindow: false, savedCollapsed: false })).toEqual({
      savedCollapsed: true,
      openedInNarrowWindow: false,
    });
  });
});

describe("right panel width", () => {
  test("opens at 360, drags between 320 and 560, and reads anything unreadable as the default", () => {
    expect([RIGHT_PANEL_MIN_WIDTH, RIGHT_PANEL_DEFAULT_WIDTH, RIGHT_PANEL_MAX_WIDTH]).toEqual([320, 360, 560]);
    expect(createDefaultLayoutState().explorerPanelWidth).toBe(360);
    expect(normalizeRightPanelWidth(301)).toBe(320);
    expect(normalizeRightPanelWidth(700)).toBe(560);
    expect(normalizeRightPanelWidth(Number.NaN)).toBe(360);
    expect(normalizeLayoutState({ ...baseLayout(), explorerPanelWidth: 300 }).explorerPanelWidth).toBe(320);
  });

  test("gives the conversation its minimum before widening the panel, but never goes below the panel's own minimum", () => {
    expect(clampRightPanelWidth({ width: 360, containerWidth: null })).toBe(360);
    expect(clampRightPanelWidth({ width: 560, containerWidth: 1328 })).toBe(560);
    // 904px row (1024px window, folded sidebar): 904 - 420 - 1 = 483 of room.
    expect(clampRightPanelWidth({ width: 560, containerWidth: 904 })).toBe(483);
    expect(clampRightPanelWidth({ width: 360, containerWidth: 904 })).toBe(360);
    expect(clampRightPanelWidth({ width: 360, containerWidth: 700 })).toBe(320);
  });
});
