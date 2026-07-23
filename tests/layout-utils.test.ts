import { describe, expect, test } from "bun:test";
import {
  DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE,
  normalizeLayoutState,
  type LayoutState,
} from "@/store/layout.utils";

function baseLayout(): LayoutState {
  return {
    workspaceSidebarWidth: 300,
    workspaceSidebarCollapsed: false,
    workspaceSidebarItemDisplayMode: DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE,
    explorerPanelWidth: 300,
    sidebarOverlayVisible: false,
    sidebarOverlayTab: "explorer",
    terminalDocked: false,
    editorDiffMode: false,
    editorMarkdownPreviewMode: false,
  };
}

describe("normalizeLayoutState", () => {
  test("falls back from the retired routines right-rail selection", () => {
    expect(
      normalizeLayoutState({
        ...baseLayout(),
        sidebarOverlayTab: "routines" as LayoutState["sidebarOverlayTab"],
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
});
