import { isColiseumBranch, isTaskArchived } from "@/lib/tasks";
import type { Task } from "@/types/chat";

export interface ProjectSidebarWorkspaceView {
  id: string;
  name: string;
  isDefault: boolean;
  branch?: string;
}

export interface ProjectSidebarCollapsedProjectView {
  projectPath: string;
  projectName: string;
  workspaces: ProjectSidebarWorkspaceView[];
  activeWorkspaceId: string;
  isCurrent: boolean;
}

export const WORKSPACE_SHORTCUT_COUNT = 9;
const WORKSPACE_HOVER_PREVIEW_TASK_LIMIT = 2;
const UNTITLED_TASK_FALLBACK = "Untitled task";

const WORKSPACE_ROW_ACTION_REVEAL_CLASSES =
  "group-hover/workspace-row:pointer-events-auto group-hover/workspace-row:opacity-100 group-has-[:focus-visible]/workspace-row:pointer-events-auto group-has-[:focus-visible]/workspace-row:opacity-100";

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
  // Coliseum branches are ephemeral fan-out children — hide from hover previews.
  const visibleTasks = [...args.tasks]
    .filter((task) => !isColiseumBranch(task) && !isTaskArchived(task))
    .sort((left, right) => parseTaskUpdatedAt(right.updatedAt) - parseTaskUpdatedAt(left.updatedAt));
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
    runningTaskCount: visibleTasks.filter((task) => Boolean(args.activeTurnIdsByTask?.[task.id])).length,
    taskTitles,
    moreTaskCount: Math.max(visibleTasks.length - taskTitles.length, 0),
  };
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
