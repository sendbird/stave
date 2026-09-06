import type {
  FleetAttentionItem,
  FleetAttentionKind,
  FleetAttentionTier,
} from "@/lib/fleet/attention-projection";
import { projectSidebarStyles } from "@/components/layout/project-workspace-sidebar.styles";
import { getFleetAttentionTier } from "@/lib/fleet/attention-projection";
import {
  classifyTaskStatus,
  compareFleetTaskStatus,
  summarizeFleetRespondingTasks,
  type FleetTaskStatus,
} from "@/lib/fleet/task-status";
import { selectFleetOpenTasks } from "@/lib/fleet/workspace-activity";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import { formatBranchLabel } from "@/lib/source-control-branch-label";
import {
  getRespondingProviderId,
  isDelegatedChildTask,
  isTaskArchived,
} from "@/lib/tasks";
import type { ChatMessage, Task } from "@/types/chat";
import {
  isDefaultWorkspaceName,
  type ProjectAppearanceColorId,
  type ProjectAppearanceIconId,
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

export function getWorkspaceLeadingAttentionKind(
  attentionKind?: FleetAttentionKind,
) {
  return attentionKind === "result-ready" ? undefined : attentionKind;
}

/**
 * The project row's attention alert. A collapsed project hides its workspace
 * rows, so a pending question inside one of them would otherwise be invisible
 * until the user expands the project and finds the stalled agent by hand.
 *
 * Blocking items always win. Review-tier items (a finished result, a PR that is
 * merely ready) are work you have not confirmed yet rather than work that is
 * stalled, so they surface only when nothing is blocking, and they render as a
 * muted dot rather than a warning glyph. Letting them light the full icon would
 * leave it lit almost permanently and stop it reading as "an agent is waiting
 * on you".
 */
export interface ProjectSidebarAttentionAlert {
  kind: FleetAttentionKind;
  tier: FleetAttentionTier;
  attentionItemCount: number;
  workspaceCount: number;
  label: string;
}

const PROJECT_ATTENTION_ALERT_LABEL: Record<FleetAttentionKind, string> = {
  "user-input": "answer needed",
  approval: "approval needed",
  "run-failed": "run failed",
  "pr-changes-requested": "PR changes requested",
  "pr-checks-failed": "PR checks failed",
  "pr-merge-conflict": "PR merge conflict",
  "pr-behind-base": "PR behind base",
  "result-ready": "result ready",
  "pr-ready-to-merge": "PR ready to merge",
};

function formatProjectAttentionAlertLabel(args: {
  kind: FleetAttentionKind;
  attentionItemCount: number;
  workspaceCount: number;
}) {
  const reason = PROJECT_ATTENTION_ALERT_LABEL[args.kind];
  const scope =
    args.workspaceCount > 1
      ? ` across ${formatCountLabel(args.workspaceCount, "workspace")}`
      : "";
  // Review-tier items are finished work nobody has confirmed yet, so claiming
  // they "need attention" would overstate them next to a genuinely blocked agent.
  if (getFleetAttentionTier(args.kind) === "review") {
    if (args.attentionItemCount <= 1) {
      return `1 item to review${scope}: ${reason}`;
    }
    return `${formatCountLabel(args.attentionItemCount, "item")} to review${scope}, latest: ${reason}`;
  }
  if (args.attentionItemCount <= 1) {
    return `1 item needs attention${scope}: ${reason}`;
  }
  return `${formatCountLabel(args.attentionItemCount, "item")} need attention${scope}, most urgent: ${reason}`;
}

function formatCountLabel(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

interface ProjectAttentionTierAccumulator {
  topAttentionItem?: FleetAttentionItem;
  attentionItemCount: number;
  workspaceIds: Set<string>;
}

function createTierAccumulator(): ProjectAttentionTierAccumulator {
  return { attentionItemCount: 0, workspaceIds: new Set<string>() };
}

/**
 * Rolls a project's workspaces up into a single alert so the collapsed project
 * row can show one indicator instead of a pile of badges.
 *
 * Blocking and review items are accumulated separately and blocking is returned
 * whenever it exists, so an unconfirmed result never masks or inflates the
 * count of an agent that is actually waiting on the user.
 */
export function buildProjectSidebarAttentionAlert(args: {
  workspaces: readonly Pick<ProjectSidebarWorkspaceView, "id">[];
  attentionItemsByWorkspaceId: Record<string, FleetAttentionItem[] | undefined>;
}): ProjectSidebarAttentionAlert | null {
  const blocking = createTierAccumulator();
  const review = createTierAccumulator();

  for (const workspace of args.workspaces) {
    for (const attentionItem of args.attentionItemsByWorkspaceId[
      workspace.id
    ] ?? []) {
      const target =
        getFleetAttentionTier(attentionItem.kind) === "blocking"
          ? blocking
          : review;
      target.attentionItemCount += 1;
      target.workspaceIds.add(workspace.id);
      // Lower priority number wins; ties fall back to the older item so the
      // label stays stable while a project keeps accruing requests.
      const { topAttentionItem } = target;
      if (
        !topAttentionItem ||
        attentionItem.priority < topAttentionItem.priority ||
        (attentionItem.priority === topAttentionItem.priority &&
          attentionItem.createdAt.localeCompare(topAttentionItem.createdAt) < 0)
      ) {
        target.topAttentionItem = attentionItem;
      }
    }
  }

  const selected = blocking.topAttentionItem ? blocking : review;
  const topAttentionItem = selected.topAttentionItem;
  if (!topAttentionItem) {
    return null;
  }

  const workspaceCount = selected.workspaceIds.size;
  return {
    kind: topAttentionItem.kind,
    tier: getFleetAttentionTier(topAttentionItem.kind),
    attentionItemCount: selected.attentionItemCount,
    workspaceCount,
    label: formatProjectAttentionAlertLabel({
      kind: topAttentionItem.kind,
      attentionItemCount: selected.attentionItemCount,
      workspaceCount,
    }),
  };
}

/**
 * Row actions stay pinned while the workspace is closing; otherwise they follow
 * the row's hover / keyboard-focus reveal, which the row publishes as custom
 * properties (`projectSidebarStyles.workspaceRow`). Keyboard reveal is
 * `:has(:focus-visible)`, not `:focus-within`, so a mouse click on the row does
 * not latch the actions open.
 */
export function getWorkspaceHoverActionVisibilityStyle(args: {
  isClosing: boolean;
}) {
  return args.isClosing
    ? projectSidebarStyles.rowActionsPinned
    : projectSidebarStyles.rowActionsReveal;
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
    Pick<Task, "id" | "title" | "updatedAt" | "archivedAt" | "parentTaskId">
  >;
  messageCountByTask?: Record<string, number>;
  activeTurnIdsByTask?: Record<string, string | undefined>;
}): WorkspaceHoverPreview {
  const visibleTasks = [...args.tasks]
    .filter((task) => !isTaskArchived(task) && !isDelegatedChildTask(task))
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
  const branch = formatBranchLabel(args.branch);
  if (!name) {
    return branch || "worktree";
  }
  if (branch && name !== branch) {
    return `${name} (${branch})`;
  }
  return name;
}

/**
 * Row label for the Work queue view: the workspace's own label first, its branch
 * second.
 *
 * The Projects tree can afford `label (branch)` because its rows are nested
 * under a project and indented, so the parenthetical still fits. A queue row is
 * flat and already spends its right edge on the project name, so it gets exactly
 * one identifier — and the useful one is whatever the user actually named the
 * workspace.
 *
 * A workspace still carrying the fabricated default name has no label of its
 * own, so it falls through to the branch: `main` says more about which worktree
 * a row points at than a column of identical `Default`s does.
 */
export function formatWorkQueueWorkspaceLabel(args: {
  name: string;
  branch?: string;
  isDefault: boolean;
}) {
  const label =
    args.isDefault || isDefaultWorkspaceName(args.name) ? "" : args.name.trim();
  if (label) {
    return label;
  }
  const branch = formatBranchLabel(args.branch);
  if (branch) {
    return branch;
  }
  return args.isDefault ? "Default" : "worktree";
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

export interface SidebarWorkQueueEntry {
  projectPath: string;
  projectName: string;
  workspaceId: string;
  workspaceName: string;
  branch?: string;
  isDefault: boolean;
  isActive: boolean;
  status: FleetTaskStatus;
}

const SIDEBAR_WORK_QUEUE_STATUS_RANK: Record<FleetTaskStatus, number> = {
  "waiting-input": 0,
  "waiting-approval": 0,
  error: 1,
  running: 2,
  idle: 3,
};

/**
 * Ranks every workspace for the sidebar Work queue view.
 *
 * used by: `src/components/layout/ProjectWorkspaceSidebar.tsx` (Work queue
 * view), `tests/project-workspace-sidebar.test.ts`.
 *
 * Every workspace is returned, uncapped. The Work queue is one of the two
 * sidebar views rather than a strip above the tree, so it has to be able to
 * reach anything the tree can reach — a filtered or capped queue would strand
 * the user in a view they cannot navigate out of. Lane grouping
 * (`buildSidebarWorkQueueLanes`) names *why* a row sits where it does; this
 * function only decides the order inside a lane.
 */
export function buildSidebarWorkQueueEntries(args: {
  projects: ProjectSidebarCollapsedProjectView[];
  recentProjectLastOpenedAtByPath: Record<string, string>;
  statusByWorkspaceId: Record<string, FleetTaskStatus>;
  attentionPriorityByWorkspaceId?: Record<string, number | undefined>;
  activeWorkspaceId: string;
}): SidebarWorkQueueEntry[] {
  const seen = new Set<string>();
  const entries: (SidebarWorkQueueEntry & {
    attentionPriority?: number;
    lastOpenedAt: string;
  })[] = [];

  for (const project of args.projects) {
    for (const workspace of project.workspaces) {
      if (seen.has(workspace.id)) {
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
        isActive: project.isCurrent && workspace.id === args.activeWorkspaceId,
        status: args.statusByWorkspaceId[workspace.id] ?? "idle",
        attentionPriority: args.attentionPriorityByWorkspaceId?.[workspace.id],
        lastOpenedAt:
          args.recentProjectLastOpenedAtByPath[project.projectPath] ?? "",
      });
    }
  }

  entries.sort((left, right) => {
    if (left.isActive !== right.isActive) {
      return left.isActive ? -1 : 1;
    }
    // Compared, not subtracted: two workspaces with no attention item are both
    // `Infinity`, and `Infinity - Infinity` is NaN — a NaN comparator result
    // silently voids every tiebreak below it.
    const leftAttention = left.attentionPriority ?? Number.POSITIVE_INFINITY;
    const rightAttention = right.attentionPriority ?? Number.POSITIVE_INFINITY;
    if (leftAttention !== rightAttention) {
      return leftAttention < rightAttention ? -1 : 1;
    }
    const statusDelta =
      SIDEBAR_WORK_QUEUE_STATUS_RANK[left.status] -
      SIDEBAR_WORK_QUEUE_STATUS_RANK[right.status];
    if (statusDelta !== 0) {
      return statusDelta;
    }
    return right.lastOpenedAt.localeCompare(left.lastOpenedAt);
  });

  return entries.map(
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

/**
 * The responding count yields to the row actions under the same reveal rules.
 * `null` when the row has no hover actions, so the count simply stays visible.
 */
export function getWorkspaceRespondingCountVisibilityStyle(args: {
  hasHoverActions: boolean;
  isClosing: boolean;
}) {
  if (!args.hasHoverActions) {
    return null;
  }

  return args.isClosing
    ? projectSidebarStyles.rowCountHidden
    : projectSidebarStyles.rowCountYields;
}

const WORKSPACE_PROGRESS_TASK_TITLE_MAX = 42;
const UNTITLED_PROGRESS_TASK_FALLBACK = "Untitled Task";

export interface WorkspaceProgressTaskItem {
  taskId: string;
  title: string;
  status: FleetTaskStatus;
  providerId: ProviderId;
}

type WorkspaceProgressTaskSource = Pick<
  Task,
  "id" | "title" | "provider" | "updatedAt" | "archivedAt" | "parentTaskId"
>;

/**
 * Sidebar rows cannot show a full first-message title. Clip on a word
 * boundary so the status mark still has a stable slot.
 */
export function summarizeWorkspaceTaskTitle(title: string) {
  const normalized = title.replace(/\s+/g, " ").trim();
  const source = normalized || UNTITLED_PROGRESS_TASK_FALLBACK;
  if (source.length <= WORKSPACE_PROGRESS_TASK_TITLE_MAX) {
    return source;
  }
  const slice = source.slice(0, WORKSPACE_PROGRESS_TASK_TITLE_MAX);
  const lastSpace = slice.lastIndexOf(" ");
  const clipped = lastSpace >= 16 ? slice.slice(0, lastSpace) : slice;
  return `${clipped.trimEnd()}…`;
}

export function resolveWorkspaceProgressTaskLoaderVariant(
  status: FleetTaskStatus,
) {
  if (status === "running") {
    return "pulse" as const;
  }
  if (status === "waiting-input" || status === "waiting-approval") {
    return "handoff" as const;
  }
  return null;
}

/**
 * Open task rows under a workspace that is currently in flight. The tree is
 * hidden when nothing is responding so idle workspaces stay one line.
 */
export function buildWorkspaceProgressTaskItems(args: {
  tasks: readonly WorkspaceProgressTaskSource[];
  messagesByTask?: Record<string, ChatMessage[]>;
  activeTurnIdsByTask?: Record<string, string | undefined>;
  providerTurnActivityByTask?: Record<
    string,
    ProviderTurnActivitySnapshot | undefined
  >;
  openTaskTabIds?: readonly string[] | null;
}): WorkspaceProgressTaskItem[] {
  const messagesByTask = args.messagesByTask ?? {};
  const activeTurnIdsByTask = args.activeTurnIdsByTask ?? {};
  const providerTurnActivityByTask = args.providerTurnActivityByTask ?? {};
  const tasks = [...args.tasks];
  const responding = summarizeFleetRespondingTasks({
    tasks,
    messagesByTask,
    activeTurnIdsByTask,
    providerTurnActivityByTask,
  });
  if (responding.respondingTaskCount === 0) {
    return [];
  }

  const openTasks = selectFleetOpenTasks(tasks as Task[], {
    openTaskTabIds: args.openTaskTabIds,
    activeTurnIdsByTask,
  });

  return openTasks
    .map((task) => {
      const messages = messagesByTask[task.id] ?? [];
      const status = classifyTaskStatus({
        task,
        messages,
        activeTurnId: activeTurnIdsByTask[task.id] ?? null,
        activity: providerTurnActivityByTask[task.id] ?? null,
      });
      return {
        taskId: task.id,
        title: summarizeWorkspaceTaskTitle(task.title),
        status,
        providerId: getRespondingProviderId({
          fallbackProviderId: task.provider,
          messages,
        }),
        updatedAt: task.updatedAt,
      };
    })
    .sort((left, right) => {
      const statusOrder = compareFleetTaskStatus(left.status, right.status);
      if (statusOrder !== 0) {
        return statusOrder;
      }
      return right.updatedAt.localeCompare(left.updatedAt);
    })
    .map((item) => ({
      taskId: item.taskId,
      title: item.title,
      status: item.status,
      providerId: item.providerId,
    }));
}
