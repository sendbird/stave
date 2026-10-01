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
  const rail = normalizeRightRailSelection(
    layout.sidebarOverlayTab,
    layout.taskPanelTab,
  );
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
    sidebarOverlayTab: rail.sidebarOverlayTab,
    taskPanelTab: rail.taskPanelTab,
    turnActivityFloatPos: normalizeTurnActivityFloatPos(
      layout.turnActivityFloatPos,
    ),
  };
}

/**
 * The rail panel and Task tab a saved or patched layout selects. A value that
 * names no panel falls back to Explorer. A panel id the rail no longer has is
 * read as the Task tab that replaced it, which wins over any stored tab: the
 * old id is the more specific statement of what the user had open.
 */
export function normalizeRightRailSelection(
  panel: unknown,
  tab: unknown,
): { sidebarOverlayTab: RightRailPanelId; taskPanelTab: TaskPanelTab } {
  const retiredPanelTab = taskPanelTabForRetiredPanel(panel);
  if (retiredPanelTab) {
    return { sidebarOverlayTab: "task", taskPanelTab: retiredPanelTab };
  }
  return {
    sidebarOverlayTab: RIGHT_RAIL_PANEL_IDS.includes(panel as RightRailPanelId)
      ? (panel as RightRailPanelId)
      : "explorer",
    taskPanelTab: isTaskPanelTab(tab) ? tab : DEFAULT_TASK_PANEL_TAB,
  };
}

export function normalizeSidebarOverlayTab(value: unknown): RightRailPanelId {
  return normalizeRightRailSelection(value, undefined).sidebarOverlayTab;
}

/** The Task tab a retired rail panel id stands for, or null for any other value. */
function taskPanelTabForRetiredPanel(value: unknown): TaskPanelTab | null {
  // temporary-migration: right-rail-mission-panel
  // The Task Collaboration panel became the Team panel; a saved layout
  // still names it by its old id.
  if (value === "collaboration") return "team";
  // end temporary-migration: right-rail-mission-panel
  // temporary-migration: right-rail-task-panel
  // Turn Activity, Task Results, Mission, Flow and Team were rail panels of
  // their own; they are tabs of the Task panel now, and a saved layout still
  // names them by their panel ids.
  if (value === "activity" || value === "results" || value === "team") {
    return value;
  }
  if (value === "mission" || value === "flow") return "progress";
  // end temporary-migration: right-rail-task-panel
  return null;
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
    workspaceSidebarWidth: WORKSPACE_SIDEBAR_MIN_WIDTH,
    workspaceSidebarCollapsed: false,
    workspaceSidebarItemDisplayMode: DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE,
    explorerPanelWidth: 300,
    sidebarOverlayVisible: false,
    sidebarOverlayTab: "explorer",
    taskPanelTab: DEFAULT_TASK_PANEL_TAB,
    terminalDocked: false,
    editorDiffMode: false,
    editorMarkdownPreviewMode: false,
    turnActivityFloatPos: null,
  };
}
