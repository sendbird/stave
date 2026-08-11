import {
  RIGHT_RAIL_PANEL_IDS,
  type RightRailPanelId,
} from "@/lib/right-rail-panels";
import type { EditorTab } from "@/types/chat";

export interface LayoutState {
  workspaceSidebarWidth: number;
  workspaceSidebarCollapsed: boolean;
  workspaceSidebarItemDisplayMode: WorkspaceSidebarItemDisplayMode;
  explorerPanelWidth: number;
  sidebarOverlayVisible: boolean;
  sidebarOverlayTab: RightRailPanelId;
  terminalDocked: boolean;
  editorDiffMode: boolean;
  editorMarkdownPreviewMode: boolean;
  /**
   * Persisted drag position of the floating turn activity card, in pixels
   * from the top-left of the message pane. `null` means "never dragged":
   * the card anchors to its default top-right corner.
   */
  turnActivityFloatPos: TurnActivityFloatPosition | null;
}

export interface TurnActivityFloatPosition {
  x: number;
  y: number;
}

export function normalizeTurnActivityFloatPos(
  value: unknown,
): TurnActivityFloatPosition | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const candidate = value as { x?: unknown; y?: unknown };
  if (
    typeof candidate.x !== "number" ||
    !Number.isFinite(candidate.x) ||
    typeof candidate.y !== "number" ||
    !Number.isFinite(candidate.y)
  ) {
    return null;
  }
  return { x: Math.max(0, candidate.x), y: Math.max(0, candidate.y) };
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
    explorerPanelWidth: layout.explorerPanelWidth,
    sidebarOverlayVisible: layout.sidebarOverlayVisible,
    terminalDocked: layout.terminalDocked,
    editorDiffMode: layout.editorDiffMode,
    editorMarkdownPreviewMode: Boolean(layout.editorMarkdownPreviewMode),
    sidebarOverlayTab: RIGHT_RAIL_PANEL_IDS.includes(layout.sidebarOverlayTab)
      ? layout.sidebarOverlayTab
      : "explorer",
    turnActivityFloatPos: normalizeTurnActivityFloatPos(
      layout.turnActivityFloatPos,
    ),
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
