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
    editorPanelWidth: 720,
    explorerPanelWidth: 300,
    lensPanelWidthByWorkspaceId: {},
    lensDisplayModeByWorkspaceId: {},
    terminalDockHeight: 210,
    editorVisible: false,
    sidebarOverlayVisible: false,
    sidebarOverlayTab: "explorer",
    terminalDocked: false,
    editorDiffMode: false,
    editorMarkdownPreviewMode: false,
  };
}

describe("normalizeLayoutState — lens display mode", () => {
  test("keeps a valid tri-state mode as-is", () => {
    const normalized = normalizeLayoutState({
      ...baseLayout(),
      lensDisplayModeByWorkspaceId: { "ws-1": "cover-chat" },
    });

    expect(normalized.lensDisplayModeByWorkspaceId).toEqual({
      "ws-1": "cover-chat",
    });
  });

  test("drops invalid mode strings", () => {
    const normalized = normalizeLayoutState({
      ...baseLayout(),
      lensDisplayModeByWorkspaceId: {
        "ws-1": "bogus-mode" as never,
      },
    });

    expect(normalized.lensDisplayModeByWorkspaceId).toEqual({});
  });

  test("migrates legacy lensFullscreenByWorkspaceId=true to fullscreen mode", () => {
    const legacyLayout = {
      ...baseLayout(),
      lensDisplayModeByWorkspaceId: undefined,
      lensFullscreenByWorkspaceId: { "ws-1": true, "ws-2": false },
    } as unknown as LayoutState;

    const normalized = normalizeLayoutState(legacyLayout);

    expect(normalized.lensDisplayModeByWorkspaceId).toEqual({
      "ws-1": "fullscreen",
    });
  });

  test("prefers the new field over the legacy one when both are present", () => {
    const mixedLayout = {
      ...baseLayout(),
      lensDisplayModeByWorkspaceId: { "ws-1": "normal" },
      lensFullscreenByWorkspaceId: { "ws-1": true },
    } as unknown as LayoutState;

    const normalized = normalizeLayoutState(mixedLayout);

    expect(normalized.lensDisplayModeByWorkspaceId).toEqual({
      "ws-1": "normal",
    });
  });
});
