import { MIN_EDITOR_PANEL_WIDTH } from "@/store/layout.utils";

export const MIN_CHAT_PANEL_WIDTH = 420;
export const MIN_EXPLORER_PANEL_WIDTH = 200;
export const PANEL_SEPARATOR_WIDTH = 1;

export function clampPanelWidth(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function resolveDesktopRightPanelWidths(args: {
  contentRowWidth: number;
  preferredEditorWidth: number;
  preferredSidebarWidth: number;
  showDesktopEditor: boolean;
  showDesktopSidebar: boolean;
}) {
  let desktopEditorWidth = args.preferredEditorWidth;
  let desktopSidebarWidth = args.preferredSidebarWidth;

  if (args.contentRowWidth <= 0) {
    return {
      desktopEditorWidth,
      desktopSidebarWidth,
    };
  }

  if (args.showDesktopEditor && args.showDesktopSidebar) {
    const maxSidebarWidth = Math.max(
      MIN_EXPLORER_PANEL_WIDTH,
      args.contentRowWidth
        - MIN_CHAT_PANEL_WIDTH
        - MIN_EDITOR_PANEL_WIDTH
        - (PANEL_SEPARATOR_WIDTH * 2),
    );

    desktopSidebarWidth = clampPanelWidth(
      args.preferredSidebarWidth,
      MIN_EXPLORER_PANEL_WIDTH,
      maxSidebarWidth,
    );

    const maxEditorWidth = Math.max(
      MIN_EDITOR_PANEL_WIDTH,
      args.contentRowWidth
        - MIN_CHAT_PANEL_WIDTH
        - desktopSidebarWidth
        - (PANEL_SEPARATOR_WIDTH * 2),
    );

    desktopEditorWidth = clampPanelWidth(
      args.preferredEditorWidth,
      MIN_EDITOR_PANEL_WIDTH,
      maxEditorWidth,
    );

    return {
      desktopEditorWidth,
      desktopSidebarWidth,
    };
  }

  if (args.showDesktopEditor) {
    desktopEditorWidth = clampPanelWidth(
      args.preferredEditorWidth,
      MIN_EDITOR_PANEL_WIDTH,
      Math.max(
        MIN_EDITOR_PANEL_WIDTH,
        args.contentRowWidth - MIN_CHAT_PANEL_WIDTH - PANEL_SEPARATOR_WIDTH,
      ),
    );
  }

  if (args.showDesktopSidebar) {
    desktopSidebarWidth = clampPanelWidth(
      args.preferredSidebarWidth,
      MIN_EXPLORER_PANEL_WIDTH,
      Math.max(
        MIN_EXPLORER_PANEL_WIDTH,
        args.contentRowWidth - MIN_CHAT_PANEL_WIDTH - PANEL_SEPARATOR_WIDTH,
      ),
    );
  }

  return {
    desktopEditorWidth,
    desktopSidebarWidth,
  };
}
