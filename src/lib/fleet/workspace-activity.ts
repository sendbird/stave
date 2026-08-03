import { isLegacyBranchTask, isTaskArchived } from "@/lib/tasks";
import type { FleetDisplayStatus } from "@/lib/fleet/task-status";
import type { Task } from "@/types/chat";

/**
 * How long a workspace can go untouched before Fleet stops treating it as part
 * of the current working set. Dormant workspaces are still reachable, they just
 * move behind a disclosure so the board reflects what is actually in flight.
 */
export const FLEET_DORMANT_AFTER_MS = 7 * 24 * 60 * 60 * 1_000;

export type FleetWorkspaceActivity = "live" | "recent" | "dormant";

export const FLEET_WORKSPACE_ACTIVITY_ORDER: Record<
  FleetWorkspaceActivity,
  number
> = {
  live: 0,
  recent: 1,
  dormant: 2,
};

function parseTimestamp(value?: string | null) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Open tasks are the only ones Fleet counts. Archived tasks are closed by
 * definition and legacy branch tasks are hidden everywhere else in the app, so
 * neither should keep a workspace looking busy.
 */
export function selectFleetOpenTasks(tasks: readonly Task[]) {
  return tasks.filter(
    (task) => !isTaskArchived(task) && !isLegacyBranchTask(task),
  );
}

/**
 * A workspace is live only while one of its open tasks still owns an active
 * provider turn. Historical error messages and leftover interaction parts can
 * classify a task as error/waiting after its turn has ended; those states stay
 * visible through needs/recent activity, but must not make the Running filter
 * claim that an agent is still in flight.
 */
export function hasFleetLiveTask(args: {
  rows: readonly { taskId: string; status: FleetDisplayStatus }[];
  activeTurnIdsByTask: Record<string, string | undefined>;
}) {
  return args.rows.some(
    ({ taskId, status }) =>
      Boolean(args.activeTurnIdsByTask[taskId]) &&
      status !== "unknown" &&
      status !== "idle",
  );
}

/**
 * Resolve when a workspace was last genuinely worked in.
 *
 * `WorkspaceSummary.updatedAt` deliberately plays no part here: it is a
 * snapshot-write stamp that moves on terminal tab changes, editor tab changes,
 * and debounced flushes, and for a fabricated default row it inherits the
 * project's `lastOpenedAt`. Both make dormant workspaces look fresh.
 *
 * `lastActiveAt` is the authoritative signal, stamped when the user switches
 * into a workspace. Open-task `updatedAt` is the second input: it covers
 * installs that predate the persisted stamp (which would otherwise collapse the
 * whole board into "dormant" on first launch) and it also covers turns
 * dispatched into a background workspace, since sending a message bumps the
 * owning task's `updatedAt`.
 */
export function resolveFleetWorkspaceActivityAt(args: {
  lastActiveAt?: string | null;
  openTasks?: readonly Task[];
}): string | null {
  const candidates = [
    parseTimestamp(args.lastActiveAt),
    ...(args.openTasks ?? []).map((task) => parseTimestamp(task.updatedAt)),
  ].filter((value): value is number => value !== null);

  if (candidates.length === 0) {
    return null;
  }
  return new Date(Math.max(...candidates)).toISOString();
}

export function classifyFleetWorkspaceActivity(args: {
  activityAt: string | null;
  nowMs: number;
  /** An open task still owns an active provider turn. */
  hasLiveTask: boolean;
  /** The workspace contributes at least one item to the attention rail. */
  hasNeeds: boolean;
  isActiveWorkspace: boolean;
  dormantAfterMs?: number;
}): FleetWorkspaceActivity {
  if (args.hasLiveTask) {
    return "live";
  }
  // Something asking for the user, or the workspace they are standing in, stays
  // in the working set no matter how stale its timestamps look.
  if (args.hasNeeds || args.isActiveWorkspace) {
    return "recent";
  }

  const activityMs = parseTimestamp(args.activityAt);
  if (activityMs === null) {
    return "dormant";
  }
  const dormantAfterMs = args.dormantAfterMs ?? FLEET_DORMANT_AFTER_MS;
  return args.nowMs - activityMs <= dormantAfterMs ? "recent" : "dormant";
}

/**
 * The recent-project normalizer fabricates a `Default Workspace` row for every
 * remembered project, stamped with that project's `lastOpenedAt`, and every
 * pruning path in the store explicitly exempts defaults. For a project the user
 * opened once and left, that row is a phantom: no tasks, no messages, no
 * recorded activity, and no worktree work behind it.
 *
 * Fleet hides those rows rather than implying idle agent work. A default that
 * is current, active, holds open tasks or messages, has needs, or carries a
 * real `lastActiveAt` is genuine and always survives.
 */
export function isPhantomDefaultWorkspace(args: {
  isDefault: boolean;
  isCurrentProject: boolean;
  isActiveWorkspace: boolean;
  openTaskCount: number;
  /** Across every task, archived included — history counts as evidence. */
  messageCount: number;
  hasNeeds: boolean;
  lastActiveAt?: string | null;
  /**
   * Whether the workspace's stored state was actually resolved. Suppressing on
   * an unresolved read would hide real work behind a transient failure, so an
   * unknown workspace is always kept.
   */
  hasResolvedState: boolean;
}) {
  if (!args.isDefault || !args.hasResolvedState) {
    return false;
  }
  if (args.isCurrentProject || args.isActiveWorkspace || args.hasNeeds) {
    return false;
  }
  if (args.openTaskCount > 0 || args.messageCount > 0) {
    return false;
  }
  return parseTimestamp(args.lastActiveAt) === null;
}

/**
 * Board-level filters operate on workspaces, not individual tasks: the board is
 * a view of agent workspaces, and "needs me" already has its own permanent rail.
 */
export type FleetBoardFilter = "active" | "running" | "blocked" | "all";

export const FLEET_BOARD_FILTER_OPTIONS: ReadonlyArray<{
  value: FleetBoardFilter;
  label: string;
  hint: string;
}> = [
  { value: "active", label: "Active", hint: "Worked in recently" },
  { value: "running", label: "Running", hint: "An agent turn is in flight" },
  { value: "blocked", label: "Blocked", hint: "Waiting on you" },
  { value: "all", label: "All", hint: "Include dormant workspaces" },
];

export function matchesFleetBoardFilter(args: {
  filter: FleetBoardFilter;
  activity: FleetWorkspaceActivity;
  hasBlockingNeed: boolean;
  query?: string;
  searchableText: readonly string[];
}) {
  const filterMatches =
    args.filter === "all" ||
    (args.filter === "active" && args.activity !== "dormant") ||
    (args.filter === "running" && args.activity === "live") ||
    (args.filter === "blocked" && args.hasBlockingNeed);
  if (!filterMatches) {
    return false;
  }

  const query = args.query?.trim().toLowerCase() ?? "";
  if (!query) {
    return true;
  }
  return args.searchableText.some((value) =>
    value.toLowerCase().includes(query),
  );
}

export function isFleetBoardFilterActive(args: {
  filter: FleetBoardFilter;
  query?: string;
}) {
  return args.filter !== "active" || Boolean(args.query?.trim());
}

export function compareFleetWorkspaceActivity(
  left: { activity: FleetWorkspaceActivity; activityAt: string | null },
  right: { activity: FleetWorkspaceActivity; activityAt: string | null },
) {
  const order =
    FLEET_WORKSPACE_ACTIVITY_ORDER[left.activity] -
    FLEET_WORKSPACE_ACTIVITY_ORDER[right.activity];
  if (order !== 0) {
    return order;
  }
  return (right.activityAt ?? "").localeCompare(left.activityAt ?? "");
}

/**
 * Merge a fresh activity stamp into the persisted map. Returns the same
 * reference when nothing changes so Zustand subscribers do not re-render.
 */
export function stampWorkspaceActive(args: {
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
 * Fold several activity maps into one, keeping the newest stamp per workspace.
 * Order-independent on purpose: the same workspace is remembered both in the
 * top-level map and inside its recent-project entry, and either copy can be the
 * fresher one depending on when the last flush landed.
 */
export function mergeWorkspaceActivityStamps(
  ...maps: Array<Record<string, string> | undefined>
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const map of maps) {
    for (const [workspaceId, at] of Object.entries(map ?? {})) {
      const existing = merged[workspaceId];
      if (!existing || existing.localeCompare(at) < 0) {
        merged[workspaceId] = at;
      }
    }
  }
  return merged;
}

/** Drop stamps for workspaces the app no longer knows about. */
export function pruneWorkspaceActivityStamps(args: {
  current: Record<string, string>;
  knownWorkspaceIds: ReadonlySet<string>;
}): Record<string, string> {
  const entries = Object.entries(args.current).filter(([workspaceId]) =>
    args.knownWorkspaceIds.has(workspaceId),
  );
  return entries.length === Object.keys(args.current).length
    ? args.current
    : Object.fromEntries(entries);
}
