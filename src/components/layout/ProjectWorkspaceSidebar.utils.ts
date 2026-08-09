import type {
  FleetAttentionItem,
  FleetAttentionKind,
  FleetAttentionTier,
} from "@/lib/fleet/attention-projection";
import { getFleetAttentionTier } from "@/lib/fleet/attention-projection";
import type { FleetTaskStatus } from "@/lib/fleet/task-status";
import { hasFleetTaskAttentionStatus } from "@/lib/fleet/task-status";
import { formatBranchLabel } from "@/lib/source-control-branch-label";
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

export function getWorkspaceLeadingAttentionKind(attentionKind?: FleetAttentionKind) {
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
    for (const attentionItem of args.attentionItemsByWorkspaceId[workspace.id] ?? []) {
      const target =
        getFleetAttentionTier(attentionItem.kind) === "blocking" ? blocking : review;
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
  const branch = formatBranchLabel(args.branch);
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
 * Whether a user-issued "remove from Active Workspaces" stamp still applies.
 *
 * A dismissal is not a tombstone: it expires the moment the user deliberately
 * activates the workspace again (`lastActiveAt` moves past `dismissedAt`), so
 * re-opening a hidden workspace restores it without any extra ceremony, and
 * the activation paths themselves never need to know dismissals exist.
 */
export function isSidebarActiveWorkspaceDismissalInEffect(args: {
  dismissedAt?: string;
  lastActiveAt?: string;
}) {
  if (!args.dismissedAt) {
    return false;
  }
  if (!args.lastActiveAt) {
    return true;
  }
  return args.lastActiveAt.localeCompare(args.dismissedAt) <= 0;
}

/**
 * Stamp a workspace as removed from the sidebar Active Workspaces list.
 * Returns the same reference when nothing changes so Zustand subscribers do
 * not re-render.
 */
export function stampSidebarActiveWorkspaceDismissal(args: {
  current: Record<string, string>;
  workspaceId?: string | null;
  at?: string;
}): Record<string, string> {
  const workspaceId = args.workspaceId?.trim();
  if (!workspaceId) {
    return args.current;
  }
  const at = args.at ?? new Date().toISOString();
  if (args.current[workspaceId] === at) {
    return args.current;
  }
  return { ...args.current, [workspaceId]: at };
}

/**
 * Persisted dismissals arrive from storage untyped; keep only plausible
 * `workspaceId -> ISO timestamp` entries so a corrupted cache cannot poison
 * the Active Workspaces filter.
 */
export function normalizeSidebarActiveWorkspaceDismissals(
  raw: unknown,
): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const normalized: Record<string, string> = {};
  for (const [workspaceId, at] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (
      !workspaceId.trim() ||
      typeof at !== "string" ||
      !Number.isFinite(Date.parse(at))
    ) {
      continue;
    }
    normalized[workspaceId] = at;
  }
  return normalized;
}

/** How many dismissal stamps still actively hide a workspace. */
export function countSidebarActiveWorkspaceDismissals(args: {
  dismissedAtByWorkspaceId: Record<string, string>;
  lastActiveAtByWorkspaceId: Record<string, string>;
}) {
  return Object.entries(args.dismissedAtByWorkspaceId).filter(
    ([workspaceId, dismissedAt]) =>
      isSidebarActiveWorkspaceDismissalInEffect({
        dismissedAt,
        lastActiveAt: args.lastActiveAtByWorkspaceId[workspaceId],
      }),
  ).length;
}

/**
 * Ranks and caps a sidebar "Active workspaces" list: attention (waiting on
 * the user) and error/running workspaces surface first, the remainder is
 * filled out with the most recently opened workspace per project.
 *
 * A user-dismissed workspace stays out of the list until the user opens it
 * again — but never while they are standing in it, and never while an agent
 * is waiting on them: hiding a stalled agent would bury the very signal this
 * list exists to surface.
 */
export function buildSidebarActiveWorkspaceEntries(args: {
  projects: ProjectSidebarCollapsedProjectView[];
  recentProjectLastOpenedAtByPath: Record<string, string>;
  statusByWorkspaceId: Record<string, FleetTaskStatus>;
  attentionPriorityByWorkspaceId?: Record<string, number | undefined>;
  dismissedAtByWorkspaceId?: Record<string, string | undefined>;
  lastActiveAtByWorkspaceId?: Record<string, string | undefined>;
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

      // Action-required reasons (a visible attention item, a waiting status) are
      // exempt from dismissal; representative, error, and running reasons are
      // the "unimportant to me" clutter a dismissal is allowed to remove.
      const needsUser =
        attentionPriority !== undefined || hasFleetTaskAttentionStatus(status);
      if (
        !isActive &&
        !needsUser &&
        isSidebarActiveWorkspaceDismissalInEffect({
          dismissedAt: args.dismissedAtByWorkspaceId?.[workspace.id],
          lastActiveAt: args.lastActiveAtByWorkspaceId?.[workspace.id],
        })
      ) {
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
