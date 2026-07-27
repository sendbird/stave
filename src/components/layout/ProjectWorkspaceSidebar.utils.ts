import type { FleetNeedKind } from "@/lib/fleet/attention-projection";
import type { FleetTaskStatus } from "@/lib/fleet/task-status";
import { hasFleetTaskAttentionStatus } from "@/lib/fleet/task-status";
import { isLegacyBranchTask, isTaskArchived } from "@/lib/tasks";
import type { Task } from "@/types/chat";
import type {
  ProjectAppearanceColorId,
  ProjectAppearanceIconId,
} from "@/store/project.utils";

export interface ProjectSidebarWorkspaceView {
  id: string;
  name: string;
  isDefault: boolean;
  branch?: string;
}

export interface ProjectSidebarCollapsedProjectView {
  projectPath: string;
  projectName: string;
  appearanceIcon?: ProjectAppearanceIconId;
  appearanceColor?: ProjectAppearanceColorId;
  workspaces: ProjectSidebarWorkspaceView[];
  /**
   * Per-project map of workspace id -> filesystem path. Scoped to THIS
   * project so non-current project rows resolve their own worktree paths
   * instead of falling back to the active project's top-level store map.
   */
  workspacePathById: Record<string, string>;
  activeWorkspaceId: string;
  isCurrent: boolean;
}

export const WORKSPACE_SHORTCUT_COUNT = 9;
const WORKSPACE_HOVER_PREVIEW_TASK_LIMIT = 2;
const UNTITLED_TASK_FALLBACK = "Untitled task";

const WORKSPACE_ROW_ACTION_REVEAL_CLASSES =
  "group-hover/workspace-row:pointer-events-auto group-hover/workspace-row:opacity-100 group-has-[:focus-visible]/workspace-row:pointer-events-auto group-has-[:focus-visible]/workspace-row:opacity-100";

export function getWorkspaceLeadingNeedKind(needKind?: FleetNeedKind) {
  return needKind === "result-ready" ? undefined : needKind;
}

export function getWorkspaceHoverActionVisibilityClasses(args: {
  isClosing: boolean;
}) {
  return args.isClosing
    ? "pointer-events-auto opacity-100"
    : `pointer-events-none opacity-0 ${WORKSPACE_ROW_ACTION_REVEAL_CLASSES}`;
}

export interface CollapsedWorkspaceEntry {
  projectPath: string;
  projectName: string;
  workspaceId: string;
  workspaceName: string;
  isDefault: boolean;
  branch?: string;
  isActive: boolean;
  startsProjectGroup: boolean;
}

export interface WorkspaceShortcutTarget {
  projectPath: string;
  workspaceId: string;
}

export interface WorkspaceHoverPreview {
  isEmpty: boolean;
  taskCount: number;
  messageCount: number;
  runningTaskCount: number;
  taskTitles: string[];
  moreTaskCount: number;
}

function parseTaskUpdatedAt(value: string) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function getPreviewTaskTitle(title: string) {
  const normalized = title.trim();
  return normalized || UNTITLED_TASK_FALLBACK;
}

export function buildWorkspaceHoverPreview(args: {
  tasks: Array<
    Pick<Task, "id" | "title" | "updatedAt" | "archivedAt"> &
      Partial<Pick<Task, "coliseumParentTaskId">>
  >;
  messageCountByTask?: Record<string, number>;
  activeTurnIdsByTask?: Record<string, string | undefined>;
}): WorkspaceHoverPreview {
  // Legacy branches are ephemeral fan-out children — hide from hover previews.
  const visibleTasks = [...args.tasks]
    .filter((task) => !isLegacyBranchTask(task) && !isTaskArchived(task))
    .sort(
      (left, right) =>
        parseTaskUpdatedAt(right.updatedAt) -
        parseTaskUpdatedAt(left.updatedAt),
    );
  const taskTitles = visibleTasks
    .slice(0, WORKSPACE_HOVER_PREVIEW_TASK_LIMIT)
    .map((task) => getPreviewTaskTitle(task.title));

  return {
    isEmpty: visibleTasks.length === 0,
    taskCount: visibleTasks.length,
    messageCount: visibleTasks.reduce(
      (sum, task) => sum + Math.max(0, args.messageCountByTask?.[task.id] ?? 0),
      0,
    ),
    runningTaskCount: visibleTasks.filter((task) =>
      Boolean(args.activeTurnIdsByTask?.[task.id]),
    ).length,
    taskTitles,
    moreTaskCount: Math.max(visibleTasks.length - taskTitles.length, 0),
  };
}

export function formatWorkspaceDisplayName(args: {
  name: string;
  branch?: string;
  isDefault: boolean;
}) {
  if (args.isDefault) {
    return "Default";
  }

  const name = args.name.trim();
  const branch = args.branch?.trim() ?? "";
  if (!name) {
    return branch || "worktree";
  }
  if (branch && name !== branch) {
    return `${name} (${branch})`;
  }
  return name;
}

function normalizeWorkspaceSearchText(value: string) {
  return value.trim().toLowerCase();
}

export function workspaceMatchesSidebarSearch(args: {
  workspace: ProjectSidebarWorkspaceView;
  projectName: string;
  query: string;
}) {
  const query = normalizeWorkspaceSearchText(args.query);
  if (!query) {
    return true;
  }

  const searchable = [
    args.projectName,
    args.workspace.name,
    args.workspace.branch ?? "",
    formatWorkspaceDisplayName({
      name: args.workspace.name,
      branch: args.workspace.branch,
      isDefault: args.workspace.isDefault,
    }),
  ]
    .join(" ")
    .toLowerCase();

  return searchable.includes(query);
}

export function filterProjectSidebarProjects(args: {
  projects: ProjectSidebarCollapsedProjectView[];
  query: string;
}) {
  const query = normalizeWorkspaceSearchText(args.query);
  if (!query) {
    return args.projects;
  }

  return args.projects
    .map((project) => ({
      ...project,
      workspaces: project.workspaces.filter((workspace) =>
        workspaceMatchesSidebarSearch({
          workspace,
          projectName: project.projectName,
          query,
        }),
      ),
    }))
    .filter((project) => project.workspaces.length > 0);
}

export function buildCollapsedWorkspaceEntries(args: {
  projects: ProjectSidebarCollapsedProjectView[];
  activeWorkspaceId: string;
}): CollapsedWorkspaceEntry[] {
  return args.projects.reduce<CollapsedWorkspaceEntry[]>((entries, project) => {
    const startsAfterPreviousProject = entries.length > 0;

    for (const [workspaceIndex, workspace] of project.workspaces.entries()) {
      entries.push({
        projectPath: project.projectPath,
        projectName: project.projectName,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        isDefault: workspace.isDefault,
        branch: workspace.branch,
        isActive: project.isCurrent && workspace.id === args.activeWorkspaceId,
        startsProjectGroup: startsAfterPreviousProject && workspaceIndex === 0,
      });
    }

    return entries;
  }, []);
}

export interface SidebarActiveWorkspaceEntry {
  projectPath: string;
  projectName: string;
  workspaceId: string;
  workspaceName: string;
  branch?: string;
  isDefault: boolean;
  isActive: boolean;
  status: FleetTaskStatus;
}

const SIDEBAR_ACTIVE_WORKSPACE_STATUS_RANK: Record<FleetTaskStatus, number> = {
  "waiting-input": 0,
  "waiting-approval": 0,
  error: 1,
  running: 2,
  idle: 3,
};

/**
 * Ranks and caps a sidebar "Active workspaces" list: attention (waiting on
 * the user) and error/running workspaces surface first, the remainder is
 * filled out with the most recently opened workspace per project.
 */
export function buildSidebarActiveWorkspaceEntries(args: {
  projects: ProjectSidebarCollapsedProjectView[];
  recentProjectLastOpenedAtByPath: Record<string, string>;
  statusByWorkspaceId: Record<string, FleetTaskStatus>;
  attentionPriorityByWorkspaceId?: Record<string, number | undefined>;
  activeWorkspaceId: string;
  limit?: number;
}): SidebarActiveWorkspaceEntry[] {
  const limit = args.limit ?? 5;
  const seen = new Set<string>();
  const entries: (SidebarActiveWorkspaceEntry & {
    attentionPriority?: number;
    lastOpenedAt: string;
  })[] = [];

  for (const project of args.projects) {
    for (const workspace of project.workspaces) {
      if (seen.has(workspace.id)) {
        continue;
      }
      const isActive =
        project.isCurrent && workspace.id === args.activeWorkspaceId;
      const isRepresentativeWorkspace =
        workspace.id === project.activeWorkspaceId;
      const status = args.statusByWorkspaceId[workspace.id] ?? "idle";
      const attentionPriority =
        args.attentionPriorityByWorkspaceId?.[workspace.id];
      const isNoteworthy =
        attentionPriority !== undefined ||
        hasFleetTaskAttentionStatus(status) ||
        status === "error" ||
        status === "running";

      if (!isActive && !isRepresentativeWorkspace && !isNoteworthy) {
        continue;
      }

      seen.add(workspace.id);
      entries.push({
        projectPath: project.projectPath,
        projectName: project.projectName,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        branch: workspace.branch,
        isDefault: workspace.isDefault,
        isActive,
        status,
        attentionPriority,
        lastOpenedAt:
          args.recentProjectLastOpenedAtByPath[project.projectPath] ?? "",
      });
    }
  }

  entries.sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }
    const attentionDelta =
      (left.attentionPriority ?? Number.POSITIVE_INFINITY) -
      (right.attentionPriority ?? Number.POSITIVE_INFINITY);
    if (attentionDelta !== 0) {
      return attentionDelta;
    }
    const statusDelta =
      SIDEBAR_ACTIVE_WORKSPACE_STATUS_RANK[left.status] -
      SIDEBAR_ACTIVE_WORKSPACE_STATUS_RANK[right.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }
    return right.lastOpenedAt.localeCompare(left.lastOpenedAt);
  });

  return entries
    .slice(0, limit)
    .map(
      ({
        attentionPriority: _attentionPriority,
        lastOpenedAt: _lastOpenedAt,
        ...entry
      }) => entry,
    );
}

export function buildVisibleWorkspaceShortcutTargets(args: {
  collapsed: boolean;
  collapsedByProjectPath: Record<string, boolean>;
  projects: ProjectSidebarCollapsedProjectView[];
}): WorkspaceShortcutTarget[] {
  const targets: WorkspaceShortcutTarget[] = [];

  for (const project of args.projects) {
    if (!args.collapsed && args.collapsedByProjectPath[project.projectPath]) {
      continue;
    }

    for (const workspace of project.workspaces) {
      targets.push({
        projectPath: project.projectPath,
        workspaceId: workspace.id,
      });

      if (targets.length >= WORKSPACE_SHORTCUT_COUNT) {
        return targets;
      }
    }
  }

  return targets;
}

export function getWorkspaceShortcutLabel(index: number): string | null {
  if (index < 0 || index >= WORKSPACE_SHORTCUT_COUNT) {
    return null;
  }

  return String(index + 1);
}

/**
 * Copy for the archive confirmation, and whether it may offer branch deletion.
 *
 * Linked worktrees were imported from outside this checkout and stay owned by
 * whatever created them: archive only drops the symlink Stave placed under
 * `.stave/workspaces/`, never the worktree or its branch. Offering a
 * "delete the branch" checkbox there would ask the user to confirm a
 * destructive action that silently never happens, so the option is withheld
 * and the reason stated instead.
 */
export function buildWorkspaceArchiveDialogCopy(args: {
  workspaceName: string;
  isLinkedWorktree: boolean;
}): { description: string; canDeleteBranch: boolean } {
  if (args.isLinkedWorktree) {
    return {
      canDeleteBranch: false,
      description: `Archive workspace "${args.workspaceName}"? It is a linked worktree owned outside this project, so Stave only removes its shortcut — the worktree and its git branch stay untouched.`,
    };
  }

  return {
    canDeleteBranch: true,
    description: `Archive workspace "${args.workspaceName}"? Stave will remove the associated git worktree only when it is clean and will preserve local changes.`,
  };
}

export function getWorkspaceRespondingCountVisibilityClasses(args: {
  hasHoverActions: boolean;
  isClosing: boolean;
}) {
  if (!args.hasHoverActions) {
    return "";
  }

  return args.isClosing
    ? "opacity-0"
    : "group-hover/workspace-row:opacity-0 group-has-[:focus-visible]/workspace-row:opacity-0";
}
