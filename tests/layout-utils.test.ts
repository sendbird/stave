import { describe, expect, test } from "bun:test";
import {
  AGENTS_LIST_DEFAULT_WIDTH,
  AGENTS_LIST_MAX_WIDTH,
  AGENTS_LIST_MIN_WIDTH,
  DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE,
  createDefaultLayoutState,
  mergeLayoutPatch,
  normalizeLayoutState,
  type LayoutState,
} from "@/store/layout.utils";

function baseLayout(): LayoutState {
  return {
    workspaceSidebarWidth: 300,
    workspaceSidebarCollapsed: false,
    workspaceSidebarItemDisplayMode: DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE,
    explorerPanelWidth: 300,
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
