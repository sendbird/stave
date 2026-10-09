import { i18n } from "@/i18n";
import type {
  FleetAttentionItem,
  FleetAttentionKind,
  FleetAttentionTier,
} from "@/lib/fleet/attention-projection";
import { repositorySidebarStyles } from "@/components/layout/repository-workspace-sidebar.styles";
import { getFleetAttentionTier } from "@/lib/fleet/attention-projection";
import {
  classifyTaskStatus,
  compareFleetTaskStatus,
  summarizeFleetRespondingTasks,
  type FleetTaskStatus,
} from "@/lib/fleet/task-status";
import { selectFleetOpenTasks } from "@/lib/fleet/workspace-activity";
import {
  compareWithinWorkQueueLane,
  getWorkQueueLeadingAttentionKind,
} from "@/lib/fleet/work-attention-order";
import type { ProviderId } from "@/lib/providers/provider.types";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import { formatBranchLabel } from "@/lib/source-control-branch-label";
import {
  getRespondingProviderId,
  isDelegatedTask,
  isTaskArchived,
} from "@/lib/tasks";
import type { ChatMessage, Task } from "@/types/chat";
import {
  isDefaultWorkspaceName,
  type RepositoryAppearanceColorId,
  type RepositoryAppearanceIconId,
} from "@/store/repository.utils";

export interface RepositorySidebarWorkspaceView {
  id: string;
  name: string;
  isDefault: boolean;
  branch?: string;
}

export interface RepositorySidebarCollapsedRepositoryView {
  repositoryPath: string;
  repositoryName: string;
  appearanceIcon?: RepositoryAppearanceIconId;
  appearanceColor?: RepositoryAppearanceColorId;
  workspaces: RepositorySidebarWorkspaceView[];
  /**
   * Per-repository map of workspace id -> filesystem path. Scoped to THIS
   * repository so non-current repository rows resolve their own worktree paths
   * instead of falling back to the active repository's top-level store map.
   */
  workspacePathById: Record<string, string>;
  activeWorkspaceId: string;
  isCurrent: boolean;
}

export const WORKSPACE_SHORTCUT_COUNT = 9;
const WORKSPACE_HOVER_PREVIEW_TASK_LIMIT = 2;
const UNTITLED_TASK_FALLBACK = "Untitled task";

/** The work queue's leading attention kind; see `work-attention-order.ts`. */
export const getWorkspaceLeadingAttentionKind = getWorkQueueLeadingAttentionKind;

/**
 * The repository row's attention alert. A collapsed repository hides its workspace
 * rows, so a pending question inside one of them would otherwise be invisible
 * until the user expands the repository and finds the stalled agent by hand.
 *
 * Blocking items always win. Review-tier items (a finished result, a PR that is
 * merely ready) are work you have not confirmed yet rather than work that is
 * stalled, so they surface only when nothing is blocking, and they render as a
 * muted dot rather than a warning glyph. Letting them light the full icon would
 * leave it lit almost permanently and stop it reading as "an agent is waiting
 * on you".
 */
export interface RepositorySidebarAttentionAlert {
  kind: FleetAttentionKind;
  tier: FleetAttentionTier;
  attentionItemCount: number;
  workspaceCount: number;
  label: string;
}

const REPOSITORY_ATTENTION_ALERT_LABEL: Record<FleetAttentionKind, string> = {
  get "user-input"() { return i18n.t("workspace:repositoryWorkspaceSidebar.answerNeeded"); },
  get approval() { return i18n.t("workspace:repositoryWorkspaceSidebar.approvalNeeded"); },
  get "run-failed"() { return i18n.t("workspace:repositoryWorkspaceSidebar.runFailed"); },
  get "pr-changes-requested"() { return i18n.t("workspace:repositoryWorkspaceSidebar.prChangesRequested"); },
  get "pr-checks-failed"() { return i18n.t("workspace:repositoryWorkspaceSidebar.prChecksFailed"); },
  get "pr-merge-conflict"() { return i18n.t("workspace:repositoryWorkspaceSidebar.prMergeConflict"); },
  get "pr-behind-base"() { return i18n.t("workspace:repositoryWorkspaceSidebar.prBehindBase"); },
  get "result-ready"() { return i18n.t("workspace:repositoryWorkspaceSidebar.resultReady"); },
  get "pr-ready-to-merge"() { return i18n.t("workspace:repositoryWorkspaceSidebar.prReadyToMerge"); },
  "agent-run-sign-off": "run sign-off",
  get "agent-run-blocked"() { return i18n.t("workspace:repositoryWorkspaceSidebar.runBlocked"); },
  get "agent-run-stuck"() { return i18n.t("workspace:repositoryWorkspaceSidebar.runStuck"); },
};

function formatRepositoryAttentionAlertLabel(args: {
  kind: FleetAttentionKind;
  attentionItemCount: number;
  workspaceCount: number;
}) {
  const reason = REPOSITORY_ATTENTION_ALERT_LABEL[args.kind];
  const scope =
    args.workspaceCount > 1
      ? ` across ${formatCountLabel(args.workspaceCount, "workspace")}`
      : "";
  // Review-tier items are finished work nobody has confirmed yet, so claiming
  // they "need attention" would overstate them next to a genuinely blocked agent.
  if (getFleetAttentionTier(args.kind) === "review") {
    if (args.attentionItemCount <= 1) {
      return i18n.t("workspace:repositoryWorkspaceSidebar.text1", { scope: scope, reason: reason });
    }
    return i18n.t("workspace:repositoryWorkspaceSidebar.valueToReviewvalueLatestValue", { value1: formatCountLabel(args.attentionItemCount, "item"), scope: scope, reason: reason });
  }
  if (args.attentionItemCount <= 1) {
    return i18n.t("workspace:repositoryWorkspaceSidebar.text2", { scope: scope, reason: reason });
  }
  return i18n.t("workspace:repositoryWorkspaceSidebar.valueNeedAttentionvalueMostUrgentValue", { value1: formatCountLabel(args.attentionItemCount, "item"), scope: scope, reason: reason });
}

function formatCountLabel(count: number, singular: string) {
  return `${count} ${count === 1 ? singular : `${singular}s`}`;
}

interface RepositoryAttentionTierAccumulator {
  topAttentionItem?: FleetAttentionItem;
  attentionItemCount: number;
  workspaceIds: Set<string>;
}

function createTierAccumulator(): RepositoryAttentionTierAccumulator {
  return { attentionItemCount: 0, workspaceIds: new Set<string>() };
}

/**
 * Rolls a repository's workspaces up into a single alert so the collapsed repository
 * row can show one indicator instead of a pile of badges.
 *
 * Blocking and review items are accumulated separately and blocking is returned
 * whenever it exists, so an unconfirmed result never masks or inflates the
 * count of an agent that is actually waiting on the user.
 */
export function buildRepositorySidebarAttentionAlert(args: {
  workspaces: readonly Pick<RepositorySidebarWorkspaceView, "id">[];
  attentionItemsByWorkspaceId: Record<string, FleetAttentionItem[] | undefined>;
}): RepositorySidebarAttentionAlert | null {
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
      // label stays stable while a repository keeps accruing requests.
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
    label: formatRepositoryAttentionAlertLabel({
      kind: topAttentionItem.kind,
      attentionItemCount: selected.attentionItemCount,
      workspaceCount,
    }),
  };
}

/**
 * Row actions stay pinned while the workspace is closing; otherwise they follow
 * the row's hover / keyboard-focus reveal, which the row publishes as custom
 * properties (`repositorySidebarStyles.workspaceRow`). Keyboard reveal is
 * `:has(:focus-visible)`, not `:focus-within`, so a mouse click on the row does
 * not latch the actions open.
 */
export function getWorkspaceHoverActionVisibilityStyle(args: {
  isClosing: boolean;
}) {
  return args.isClosing
    ? repositorySidebarStyles.rowActionsPinned
    : repositorySidebarStyles.rowActionsReveal;
}

export interface CollapsedWorkspaceEntry {
  repositoryPath: string;
  repositoryName: string;
  workspaceId: string;
  workspaceName: string;
  isDefault: boolean;
  branch?: string;
  isActive: boolean;
  startsRepositoryGroup: boolean;
}

export interface WorkspaceShortcutTarget {
  repositoryPath: string;
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
    .filter((task) => !isTaskArchived(task) && !isDelegatedTask(task))
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
    return i18n.t("workspace:repositoryWorkspaceSidebar.default");
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
 * under a repository and indented, so the parenthetical still fits. A queue row is
 * flat and already spends its right edge on the repository name, so it gets exactly
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
  return args.isDefault ? i18n.t("workspace:repositoryWorkspaceSidebar.default") : "worktree";
}

function normalizeWorkspaceSearchText(value: string) {
  return value.trim().toLowerCase();
}

export function workspaceMatchesSidebarSearch(args: {
  workspace: RepositorySidebarWorkspaceView;
  repositoryName: string;
  query: string;
}) {
  const query = normalizeWorkspaceSearchText(args.query);
  if (!query) {
    return true;
  }

  const searchable = [
    args.repositoryName,
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

export function filterRepositorySidebarRepositories(args: {
  repositories: RepositorySidebarCollapsedRepositoryView[];
  query: string;
}) {
  const query = normalizeWorkspaceSearchText(args.query);
  if (!query) {
    return args.repositories;
  }

  return args.repositories
    .map((repository) => ({
      ...repository,
      workspaces: repository.workspaces.filter((workspace) =>
        workspaceMatchesSidebarSearch({
          workspace,
          repositoryName: repository.repositoryName,
          query,
        }),
      ),
    }))
    .filter((repository) => repository.workspaces.length > 0);
}

export function buildCollapsedWorkspaceEntries(args: {
  repositories: RepositorySidebarCollapsedRepositoryView[];
  activeWorkspaceId: string;
}): CollapsedWorkspaceEntry[] {
  return args.repositories.reduce<CollapsedWorkspaceEntry[]>((entries, repository) => {
    const startsAfterPreviousRepository = entries.length > 0;

    for (const [workspaceIndex, workspace] of repository.workspaces.entries()) {
      entries.push({
        repositoryPath: repository.repositoryPath,
        repositoryName: repository.repositoryName,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        isDefault: workspace.isDefault,
        branch: workspace.branch,
        isActive: repository.isCurrent && workspace.id === args.activeWorkspaceId,
        startsRepositoryGroup: startsAfterPreviousRepository && workspaceIndex === 0,
      });
    }

    return entries;
  }, []);
}

export interface SidebarWorkQueueEntry {
  repositoryPath: string;
  repositoryName: string;
  workspaceId: string;
  workspaceName: string;
  branch?: string;
  isDefault: boolean;
  isActive: boolean;
  status: FleetTaskStatus;
}

/**
 * Ranks every workspace for the sidebar Work queue view.
 *
 * used by: `src/components/layout/RepositoryWorkspaceSidebar.tsx` (Work queue
 * view), `tests/repository-workspace-sidebar.test.ts`.
 *
 * Every workspace is returned, uncapped. The Work queue is one of the two
 * sidebar views rather than a strip above the tree, so it has to be able to
 * reach anything the tree can reach — a filtered or capped queue would strand
 * the user in a view they cannot navigate out of. Lane grouping
 * (`buildSidebarWorkQueueLanes`) names *why* a row sits where it does; this
 * function only decides the order inside a lane.
 */
export function buildSidebarWorkQueueEntries(args: {
  repositories: RepositorySidebarCollapsedRepositoryView[];
  recentRepositoryLastOpenedAtByPath: Record<string, string>;
  statusByWorkspaceId: Record<string, FleetTaskStatus>;
  attentionPriorityByWorkspaceId?: Record<string, number | undefined>;
  activeWorkspaceId: string;
}): SidebarWorkQueueEntry[] {
  const seen = new Set<string>();
  const entries: (SidebarWorkQueueEntry & {
    attentionPriority?: number;
    lastOpenedAt: string;
  })[] = [];

  for (const repository of args.repositories) {
    for (const workspace of repository.workspaces) {
      if (seen.has(workspace.id)) {
        continue;
      }
      seen.add(workspace.id);
      entries.push({
        repositoryPath: repository.repositoryPath,
        repositoryName: repository.repositoryName,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        branch: workspace.branch,
        isDefault: workspace.isDefault,
        isActive: repository.isCurrent && workspace.id === args.activeWorkspaceId,
        status: args.statusByWorkspaceId[workspace.id] ?? "idle",
        attentionPriority: args.attentionPriorityByWorkspaceId?.[workspace.id],
        lastOpenedAt:
          args.recentRepositoryLastOpenedAtByPath[repository.repositoryPath] ?? "",
      });
    }
  }

  // The shared rule's order inside a lane (`work-attention-order.ts`); the lane
  // itself is added by `buildSidebarWorkQueueLanes`.
  entries.sort((left, right) =>
    compareWithinWorkQueueLane(
      { ...left, activityAt: left.lastOpenedAt },
      { ...right, activityAt: right.lastOpenedAt },
    ),
  );

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
  collapsedByRepositoryPath: Record<string, boolean>;
  repositories: RepositorySidebarCollapsedRepositoryView[];
}): WorkspaceShortcutTarget[] {
  const targets: WorkspaceShortcutTarget[] = [];

  for (const repository of args.repositories) {
    if (!args.collapsed && args.collapsedByRepositoryPath[repository.repositoryPath]) {
      continue;
    }

    for (const workspace of repository.workspaces) {
      targets.push({
        repositoryPath: repository.repositoryPath,
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
      description: i18n.t("workspace:repositoryWorkspaceSidebar.archiveWorkspaceValueItIsALinked", { value1: args.workspaceName }),
    };
  }

  return {
    canDeleteBranch: true,
    description: i18n.t("workspace:repositoryWorkspaceSidebar.archiveWorkspaceValueStaveWillRemoveThe", { value1: args.workspaceName }),
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
    ? repositorySidebarStyles.rowCountHidden
    : repositorySidebarStyles.rowCountYields;
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

/**
 * Delegated-task cadence. The workspace row uses `matrix` so the parent
 * container and these streaming rows do not share one mark.
 */
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
