import { describe, expect, test } from "bun:test";
import {
  MIN_CHAT_PANEL_WIDTH,
  MIN_EXPLORER_PANEL_WIDTH,
  PANEL_SEPARATOR_WIDTH,
  resolveDesktopRightPanelWidths,
} from "@/components/layout/app-shell-layout";
import { MIN_EDITOR_PANEL_WIDTH } from "@/store/layout.utils";

describe("resolveDesktopRightPanelWidths", () => {
  test("keeps the right rail width stable when the editor grows", () => {
    const contentRowWidth = 1500;
    const preferredSidebarWidth = 320;

    const layout = resolveDesktopRightPanelWidths({
      contentRowWidth,
      preferredEditorWidth: 900,
      preferredSidebarWidth,
      showDesktopEditor: true,
      showDesktopSidebar: true,
    });

    expect(layout.desktopSidebarWidth).toBe(preferredSidebarWidth);
    expect(layout.desktopEditorWidth).toBe(
      contentRowWidth
        - MIN_CHAT_PANEL_WIDTH
        - preferredSidebarWidth
        - (PANEL_SEPARATOR_WIDTH * 2),
    );
  });

  test("clamps the right rail against the minimum editor width", () => {
    const contentRowWidth = 1500;

    const layout = resolveDesktopRightPanelWidths({
      contentRowWidth,
      preferredEditorWidth: 720,
      preferredSidebarWidth: 900,
      showDesktopEditor: true,
      showDesktopSidebar: true,
    });

    expect(layout.desktopSidebarWidth).toBe(
      contentRowWidth
        - MIN_CHAT_PANEL_WIDTH
        - MIN_EDITOR_PANEL_WIDTH
        - (PANEL_SEPARATOR_WIDTH * 2),
    );
    expect(layout.desktopEditorWidth).toBe(MIN_EDITOR_PANEL_WIDTH);
  });

  test("keeps single-panel widths within their standalone bounds", () => {
    const contentRowWidth = 1200;
    const maxStandaloneWidth = contentRowWidth
      - MIN_CHAT_PANEL_WIDTH
      - PANEL_SEPARATOR_WIDTH;
    const editorOnly = resolveDesktopRightPanelWidths({
      contentRowWidth,
      preferredEditorWidth: 900,
      preferredSidebarWidth: 320,
      showDesktopEditor: true,
      showDesktopSidebar: false,
    });
    const sidebarOnly = resolveDesktopRightPanelWidths({
      contentRowWidth,
      preferredEditorWidth: 720,
      preferredSidebarWidth: 900,
      showDesktopEditor: false,
      showDesktopSidebar: true,
    });

    expect(editorOnly.desktopEditorWidth).toBe(maxStandaloneWidth);
    expect(sidebarOnly.desktopSidebarWidth).toBe(maxStandaloneWidth);
    expect(sidebarOnly.desktopSidebarWidth).toBeGreaterThan(MIN_EXPLORER_PANEL_WIDTH);
  });
});
