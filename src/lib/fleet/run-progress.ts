import { i18n } from "@/i18n/runtime";
import { formatDuration } from "@/i18n/format";
import { resolveToolNameLeaf } from "@/lib/providers/tool-activity";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import { isTerminalWorkGraphStatus } from "@/lib/work-graph/work-graph.types";

/**
 * How a workspace or task row draws its agent work, decided once so every
 * surface agrees:
 *
 * - `busy`: Stave itself is doing something to the workspace (creating,
 *   archiving). System work, drawn with the gray spinner.
 * - `stalled`: a live turn that has reported nothing past the stall threshold.
 *   It must not look like work, so its mark stands still in the warning tone.
 * - `waiting`: the turn's own loop is blocked on helpers it started, so it
 *   has its own mark instead of the working motion.
 * - `working`: everything else a live turn does, drawn with the one working
 *   motion in the provider's tone.
 * - `none`: nothing runs, or the turn waits on a person, which the attention
 *   mark already says.
 */
export type RunIndicatorKind = "busy" | "stalled" | "waiting" | "working" | "none";

/** Precedence: system work, then a quiet turn, then a blocked one, then work. */
export function resolveRunIndicatorKind(args: {
  busy: boolean;
  running: boolean;
  stalled: boolean;
  waiting: boolean;
  pendingInteraction: boolean;
}): RunIndicatorKind {
  if (args.busy) {
    return "busy";
  }
  if (!args.running || args.pendingInteraction) {
    return "none";
  }
  if (args.stalled) {
    return "stalled";
  }
  return args.waiting ? "waiting" : "working";
}

/**
 * A main-loop call that blocks the turn until helpers report back. Only calls
 * a runtime reports as blocking count:
 *
 * - Claude's `Agent` / `Task` call. Stave forces these to run in the foreground
 *   (`run_in_background: false` in the Claude runtime), so the main loop waits
 *   for the subagent's result.
 * - Codex's collaboration `wait` call, which waits on spawned workers. A Codex
 *   `spawn_agent` returns at once and the main loop keeps working, so it is not
 *   a wait.
 */
export function isBlockingWaitToolName(toolName: string | undefined) {
  if (!toolName) {
    return false;
  }
  const raw = toolName.trim();
  const leaf = resolveToolNameLeaf(raw);
  if (raw.toLowerCase().startsWith("collaboration:")) {
    return leaf === "wait";
  }
  return !/__|:|\./.test(raw) && (leaf === "agent" || leaf === "task");
}

export interface TurnWaitTarget {
  /**
   * Live helpers the open blocking calls wait on, each counted once. A call
   * whose helpers cannot be named counts as one. 0 when every named helper
   * has already ended.
   */
  helperCount: number;
  /** When the oldest blocking call started. */
  since: number;
}

/**
 * Whether the turn's own loop is blocked on helpers: every call the main loop
 * still has running is a blocking wait. Work inside a helper does not count,
 * so a subagent's own tool calls never make its parent look busy, and a main
 * loop that runs anything of its own is working, not waiting.
 */
export function resolveTurnWaitTarget(
  activity: Pick<ProviderTurnActivitySnapshot, "workGraph" | "workItemsById">,
): TurnWaitTarget | null {
  const graph = activity.workGraph;
  if (!graph) {
    return null;
  }
  let since: number | null = null;
  // Helpers are counted from what each blocking call waits on, never from the
  // whole graph: a Codex `wait` on one of two workers waits on one.
  const liveTargetKeys = new Set<string>();
  let unnamedWaits = 0;
  for (const id of graph.orderedWorkItemIds) {
    const item = graph.workItemsById[id];
    if (!item || item.nodeKey !== graph.rootKey || isTerminalWorkGraphStatus(item.status)) {
      continue;
    }
    const toolName = item.toolUseId
      ? activity.workItemsById[item.toolUseId]?.toolName
      : undefined;
    if (item.status === "pending") {
      // The model is still writing the call: that is the main loop working.
      return null;
    }
    if (!isBlockingWaitToolName(toolName)) {
      // A spawn that returned at once (Codex `spawn_agent`, a Stave delegation)
      // stays open in the graph for the helper's lifetime. That is the
      // helper's work, not the main loop's, so it neither works nor waits.
      if (item.kind === "delegation") {
        continue;
      }
      return null;
    }
    since = since === null ? item.startedAt : Math.min(since, item.startedAt);
    // A Codex `wait` names the workers it waits on; a Claude `Agent` / `Task`
    // call waits on the one subagent it spawned.
    const spawnedKey = item.toolUseId ? graph.nodeKeyBySpawnToolUseId[item.toolUseId] : undefined;
    const targetKeys = item.targetNodeKeys ?? (spawnedKey ? [spawnedKey] : null);
    if (!targetKeys) {
      unnamedWaits += 1;
      continue;
    }
    for (const key of targetKeys) {
      const node = graph.nodesByKey[key];
      // A worker the graph has not seen under that identity has not been seen
      // ending either, so the call is still waiting on it.
      if (!node || !isTerminalWorkGraphStatus(node.status)) {
        liveTargetKeys.add(key);
      }
    }
  }
  if (since === null) {
    return null;
  }
  return { helperCount: liveTargetKeys.size + unnamedWaits, since };
}

type RunActivity = Pick<
  ProviderTurnActivitySnapshot,
  "turnId" | "startedAt" | "stalledAt" | "pendingInteraction" | "completedAt" | "turnError"
>;

function isLiveRun(activity: RunActivity, activeTurnId: string | null | undefined) {
  return Boolean(activeTurnId) && activity.turnId === activeTurnId && activity.completedAt == null;
}

/**
 * The task a workspace row speaks for when several run at once. A quiet turn
 * leads, because the row's attention mark says the same; then a turn working
 * on its own over one waiting on a person, then the most recently started.
 */
export function selectWorkspaceRunTask<TTask extends { id: string; archivedAt?: string | null }>(args: {
  tasks: readonly TTask[];
  activeTurnIdsByTask: Record<string, string | undefined>;
  activityByTask: Record<string, ProviderTurnActivitySnapshot | undefined>;
}): { taskId: string; activeTurnId: string; activity: ProviderTurnActivitySnapshot } | null {
  let best: { taskId: string; activeTurnId: string; activity: ProviderTurnActivitySnapshot; rank: number } | null = null;
  for (const task of args.tasks) {
    const activeTurnId = args.activeTurnIdsByTask[task.id];
    const activity = args.activityByTask[task.id];
    if (task.archivedAt || !activeTurnId || !activity || !isLiveRun(activity, activeTurnId)) {
      continue;
    }
    const rank = activity.pendingInteraction != null ? 2 : activity.stalledAt != null ? 0 : 1;
    if (
      !best ||
      rank < best.rank ||
      (rank === best.rank && activity.startedAt > best.activity.startedAt)
    ) {
      best = { taskId: task.id, activeTurnId, activity, rank };
    }
  }
  return best ? { taskId: best.taskId, activeTurnId: best.activeTurnId, activity: best.activity } : null;
}

export interface RunTodoProgress {
  done: number;
  total: number;
}

export interface RunProgress {
  kind: Extract<RunIndicatorKind, "stalled" | "waiting" | "working">;
  /** The latest reported step's short label, while working. */
  step: string | null;
  todo: RunTodoProgress | null;
  /** Quiet time when stalled, wait time when waiting, run time when working. */
  durationMs: number;
  helperCount: number;
}

/**
 * What a live turn is doing, from its activity snapshot and to-do list only.
 * Null when there is no live turn, when it waits on a person, or when it is
 * failing or retrying: those states have their own marks and words.
 */
export function buildRunProgress(args: {
  activity: ProviderTurnActivitySnapshot | null | undefined;
  activeTurnId: string | null | undefined;
  todo?: RunTodoProgress | null;
  now: number;
}): RunProgress | null {
  const { activity, now } = args;
  if (
    !activity ||
    !args.activeTurnId ||
    activity.turnId !== args.activeTurnId ||
    activity.completedAt != null ||
    activity.pendingInteraction != null ||
    activity.turnError
  ) {
    return null;
  }
  const todo = args.todo && args.todo.total > 0 ? args.todo : null;
  if (activity.stalledAt != null) {
    return {
      kind: "stalled",
      step: null,
      todo,
      durationMs: Math.max(0, now - activity.lastEventAt),
      helperCount: 0,
    };
  }
  const wait = resolveTurnWaitTarget(activity);
  if (wait) {
    return {
      kind: "waiting",
      step: null,
      todo,
      durationMs: Math.max(0, now - wait.since),
      helperCount: wait.helperCount,
    };
  }
  let latest: { title: string; updatedAt: number } | null = null;
  for (const id of activity.orderedWorkItemIds) {
    const item = activity.workItemsById[id];
    if (item && (!latest || item.updatedAt >= latest.updatedAt)) {
      latest = item;
    }
  }
  return {
    kind: "working",
    step: latest?.title.trim() || null,
    todo,
    durationMs: Math.max(0, now - activity.startedAt),
    helperCount: 0,
  };
}

/** "Waiting on 2 helpers": the run line's label while the main loop waits. */
export function describeRunWaitLabel(wait: TurnWaitTarget | null) {
  return wait && wait.helperCount > 0
    ? i18n.t("fleet:runProgress.waitingOnHelpersLabel", { count: wait.helperCount })
    : i18n.t("fleet:runProgress.waitingOnBackgroundLabel");
}

/**
 * "Edit file · 2/5 · 3m 10s", "Waiting on 2 helpers · 1m", "No output · 6m".
 * The to-do count rides only with work: a quiet or blocked turn says why first.
 */
export function formatRunProgressLabel(progress: RunProgress) {
  const duration = formatDuration(progress.durationMs);
  if (progress.kind === "stalled") {
    return i18n.t("fleet:runProgress.noOutput", { duration });
  }
  if (progress.kind === "waiting") {
    return progress.helperCount > 0
      ? i18n.t("fleet:runProgress.waitingOnHelpers", { count: progress.helperCount, duration })
      : i18n.t("fleet:runProgress.waitingOnBackground", { duration });
  }
  const step = progress.step ?? i18n.t("fleet:runProgress.working");
  return progress.todo
    ? i18n.t("fleet:runProgress.workingWithTodos", {
        step,
        done: progress.todo.done,
        total: progress.todo.total,
        duration,
      })
    : i18n.t("fleet:runProgress.workingStep", { step, duration });
}
