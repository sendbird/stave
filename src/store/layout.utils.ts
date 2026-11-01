import {
  DEFAULT_TASK_PANEL_TAB,
  isTaskPanelTab,
  RIGHT_RAIL_PANEL_IDS,
  type RightRailPanelId,
  type TaskPanelTab,
} from "@/lib/right-rail-panels";
import type { EditorTab } from "@/types/chat";

export interface LayoutState {
  workspaceSidebarWidth: number;
  workspaceSidebarCollapsed: boolean;
  workspaceSidebarItemDisplayMode: WorkspaceSidebarItemDisplayMode;
  explorerPanelWidth: number;
  /** Width of the Agents view's list, in pixels; dragged on its edge. */
  agentsListWidth: number;
  sidebarOverlayVisible: boolean;
  sidebarOverlayTab: RightRailPanelId;
  /** The Task panel's tab; kept while the rail is closed, so it reopens there. */
  taskPanelTab: TaskPanelTab;
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
/**
 * The repository sidebar's drag range. The default is the width it opened at
 * before it could be narrowed; a double-click on its edge returns there.
 */
export const WORKSPACE_SIDEBAR_MIN_WIDTH = 220;
export const WORKSPACE_SIDEBAR_DEFAULT_WIDTH = 290;
export const WORKSPACE_SIDEBAR_MAX_WIDTH = 340;
/**
 * Below this window width the sidebar folds to its icon rail on its own, so a
 * laptop-width window keeps its room for the conversation. The user can still
 * open it for the moment; that choice lasts until the window crosses back.
 */
export const WORKSPACE_SIDEBAR_AUTO_COLLAPSE_BELOW = 1180;

/** A saved or dragged sidebar width inside the drag range; anything unreadable is the default. */
export function normalizeWorkspaceSidebarWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return WORKSPACE_SIDEBAR_DEFAULT_WIDTH;
  }
  return Math.round(
    Math.min(WORKSPACE_SIDEBAR_MAX_WIDTH, Math.max(WORKSPACE_SIDEBAR_MIN_WIDTH, value)),
  );
}

/** Whether a window this wide folds the sidebar to its rail on its own. */
export function isNarrowWindowForWorkspaceSidebar(windowWidth: number): boolean {
  return windowWidth < WORKSPACE_SIDEBAR_AUTO_COLLAPSE_BELOW;
}

/**
 * Whether the sidebar shows as its rail. In a wide window that is the saved
 * choice; in a narrow one it is the rail unless the user opened it there.
 */
export function resolveWorkspaceSidebarCollapsed(args: {
  savedCollapsed: boolean;
  narrowWindow: boolean;
  openedInNarrowWindow: boolean;
}): boolean {
  return args.narrowWindow ? !args.openedInNarrowWindow : args.savedCollapsed;
}

/**
 * Where a request to fold or open the sidebar is kept. A wide window saves it
 * with the layout. A narrow window keeps it for the session only, so the
 * automatic fold never overwrites the saved choice; opening it there also
 * clears a saved fold, since the user plainly wants it open.
 */
export function planWorkspaceSidebarCollapse(args: {
  collapsed: boolean;
  narrowWindow: boolean;
  savedCollapsed: boolean;
}): { savedCollapsed: boolean; openedInNarrowWindow: boolean } {
  if (!args.narrowWindow) {
    return { savedCollapsed: args.collapsed, openedInNarrowWindow: false };
  }
  return {
    savedCollapsed: args.collapsed ? args.savedCollapsed : false,
    openedInNarrowWindow: !args.collapsed,
  };
}

/** The Agents list's drag range. The default is the width it had before it could be dragged. */
export const AGENTS_LIST_MIN_WIDTH = 240;
export const AGENTS_LIST_DEFAULT_WIDTH = 288;
export const AGENTS_LIST_MAX_WIDTH = 480;

/** A saved Agents list width inside the drag range; anything unreadable is the default. */
export function normalizeAgentsListWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return AGENTS_LIST_DEFAULT_WIDTH;
  }
  return Math.round(
    Math.min(AGENTS_LIST_MAX_WIDTH, Math.max(AGENTS_LIST_MIN_WIDTH, value)),
  );
}

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
  const rail = normalizeRightRailSelection(
    layout.sidebarOverlayTab,
    layout.taskPanelTab,
  );
  return {
    workspaceSidebarWidth: normalizeWorkspaceSidebarWidth(layout.workspaceSidebarWidth),
    workspaceSidebarCollapsed: layout.workspaceSidebarCollapsed,
    workspaceSidebarItemDisplayMode: normalizeWorkspaceSidebarItemDisplayMode(
      layout.workspaceSidebarItemDisplayMode,
    ),
    explorerPanelWidth: layout.explorerPanelWidth,
    // A layout saved before the list could be dragged has no width yet.
    agentsListWidth: normalizeAgentsListWidth(layout.agentsListWidth),
    sidebarOverlayVisible: layout.sidebarOverlayVisible,
    terminalDocked: layout.terminalDocked,
    editorDiffMode: layout.editorDiffMode,
    editorMarkdownPreviewMode: Boolean(layout.editorMarkdownPreviewMode),
    sidebarOverlayTab: rail.sidebarOverlayTab,
    taskPanelTab: rail.taskPanelTab,
    turnActivityFloatPos: normalizeTurnActivityFloatPos(
      layout.turnActivityFloatPos,
    ),
  };
}

/**
 * The rail panel and Task tab a saved or patched layout selects. A value that
 * names no panel falls back to Explorer.
 */
export function normalizeRightRailSelection(
  panel: unknown,
  tab: unknown,
): { sidebarOverlayTab: RightRailPanelId; taskPanelTab: TaskPanelTab } {
  return {
    sidebarOverlayTab: RIGHT_RAIL_PANEL_IDS.includes(panel as RightRailPanelId)
      ? (panel as RightRailPanelId)
      : "explorer",
    taskPanelTab: isTaskPanelTab(tab) ? tab : DEFAULT_TASK_PANEL_TAB,
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

/** The layout a fresh install starts with: rail closed, Explorer and Activity selected. */
export function createDefaultLayoutState(): LayoutState {
  return {
    workspaceSidebarWidth: WORKSPACE_SIDEBAR_DEFAULT_WIDTH,
    workspaceSidebarCollapsed: false,
    workspaceSidebarItemDisplayMode: DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE,
    explorerPanelWidth: 300,
    agentsListWidth: AGENTS_LIST_DEFAULT_WIDTH,
    sidebarOverlayVisible: false,
    sidebarOverlayTab: "explorer",
    taskPanelTab: DEFAULT_TASK_PANEL_TAB,
    terminalDocked: false,
    editorDiffMode: false,
    editorMarkdownPreviewMode: false,
    turnActivityFloatPos: null,
  };
}
