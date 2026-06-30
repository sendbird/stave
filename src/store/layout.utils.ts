import {
  RIGHT_RAIL_PANEL_IDS,
  type RightRailPanelId,
} from "@/lib/right-rail-panels";
import type { EditorTab } from "@/types/chat";

export interface LayoutState {
  workspaceSidebarWidth: number;
  workspaceSidebarCollapsed: boolean;
  workspaceSidebarItemDisplayMode: WorkspaceSidebarItemDisplayMode;
  editorPanelWidth: number;
  explorerPanelWidth: number;
  lensPanelWidthByWorkspaceId: Record<string, number>;
  lensFullscreenByWorkspaceId: Record<string, boolean>;
  terminalDockHeight: number;
  editorVisible: boolean;
  sidebarOverlayVisible: boolean;
  sidebarOverlayTab: RightRailPanelId;
  terminalDocked: boolean;
  editorDiffMode: boolean;
  editorMarkdownPreviewMode: boolean;
}

export const WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODES = [
  "expanded",
  "compact",
] as const;
export type WorkspaceSidebarItemDisplayMode =
  (typeof WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODES)[number];
export const DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE: WorkspaceSidebarItemDisplayMode =
  "expanded";
export const WORKSPACE_SIDEBAR_MIN_WIDTH = 290;
export const MIN_EDITOR_PANEL_WIDTH = 600;
export const DEFAULT_EDITOR_PANEL_WIDTH = 720;
export const MIN_LENS_PANEL_WIDTH = 320;
export const DEFAULT_LENS_PANEL_WIDTH = 520;
export const MAX_LENS_PANEL_WIDTH = 900;

export function mergeLayoutPatch(args: {
  layout: LayoutState;
  patch: Partial<LayoutState>;
}) {
  let changed = false;
  const nextLayout: LayoutState = normalizeLayoutState({ ...args.layout });

  for (const [rawKey, rawValue] of Object.entries(args.patch)) {
    const key = rawKey as keyof LayoutState;
    const value = rawValue as LayoutState[keyof LayoutState];
    if (value === undefined || Object.is(nextLayout[key], value)) {
      continue;
    }
    nextLayout[key] = value as never;
    changed = true;
  }

  const normalizedLayout = normalizeLayoutState(nextLayout);
  return changed ? normalizedLayout : null;
}

export function normalizeLayoutState(layout: LayoutState): LayoutState {
  return {
    workspaceSidebarWidth: layout.workspaceSidebarWidth,
    workspaceSidebarCollapsed: layout.workspaceSidebarCollapsed,
    workspaceSidebarItemDisplayMode: normalizeWorkspaceSidebarItemDisplayMode(
      layout.workspaceSidebarItemDisplayMode,
    ),
    editorPanelWidth: Math.max(MIN_EDITOR_PANEL_WIDTH, layout.editorPanelWidth),
    explorerPanelWidth: layout.explorerPanelWidth,
    lensPanelWidthByWorkspaceId: normalizeLensPanelWidthByWorkspaceId(
      layout.lensPanelWidthByWorkspaceId,
    ),
    lensFullscreenByWorkspaceId: normalizeLensFullscreenByWorkspaceId(
      layout.lensFullscreenByWorkspaceId,
    ),
    terminalDockHeight: layout.terminalDockHeight,
    editorVisible: layout.editorVisible,
    sidebarOverlayVisible: layout.sidebarOverlayVisible,
    terminalDocked: layout.terminalDocked,
    editorDiffMode: layout.editorDiffMode,
    editorMarkdownPreviewMode: Boolean(layout.editorMarkdownPreviewMode),
    sidebarOverlayTab: RIGHT_RAIL_PANEL_IDS.includes(layout.sidebarOverlayTab)
      ? layout.sidebarOverlayTab
      : "explorer",
  };
}

export function normalizeWorkspaceSidebarItemDisplayMode(
  value: unknown,
): WorkspaceSidebarItemDisplayMode {
  return WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODES.includes(
    value as WorkspaceSidebarItemDisplayMode,
  )
    ? (value as WorkspaceSidebarItemDisplayMode)
    : DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE;
}

function normalizeLensPanelWidthByWorkspaceId(
  value: unknown,
): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([workspaceId]) => workspaceId.trim().length > 0)
      .map(([workspaceId, width]) => [
        workspaceId,
        typeof width === "number" && Number.isFinite(width)
          ? Math.max(
              MIN_LENS_PANEL_WIDTH,
              Math.min(MAX_LENS_PANEL_WIDTH, width),
            )
          : DEFAULT_LENS_PANEL_WIDTH,
      ]),
  );
}

function normalizeLensFullscreenByWorkspaceId(
  value: unknown,
): Record<string, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([workspaceId]) => workspaceId.trim().length > 0)
      .map(([workspaceId, fullscreen]) => [workspaceId, fullscreen === true]),
  );
}

export function isDiffEditorTab(
  tab: Pick<EditorTab, "id" | "kind" | "originalContent"> | null | undefined,
) {
  return Boolean(
    tab &&
    tab.kind !== "image" &&
    !tab.id.startsWith("file:") &&
    tab.originalContent !== undefined,
  );
}

export function resolveEditorDiffMode(args: {
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
}) {
  const activeTab = args.editorTabs.find(
    (tab) => tab.id === args.activeEditorTabId,
  );
  return isDiffEditorTab(activeTab);
}
