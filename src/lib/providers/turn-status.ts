import type {
  NormalizedProviderEvent,
  ProviderId,
} from "@/lib/providers/provider.types";
import {
  formatToolDisplayName,
  isSubagentToolName,
  parseToolInput,
  PROVIDER_TURN_WORK_TEXT_LIMIT,
  resolveSubagentBadge,
  resolveToolTitle,
  truncateWorkText,
} from "@/lib/providers/subagent-identity";
import {
  describeToolOperationLabel,
  isTodoToolName,
  TOOL_DELEGATION_LABEL,
} from "@/lib/providers/tool-activity";
import { formatWorkerExecutionMetadata, type WorkerExecutionMetadata } from "@/lib/providers/worker-mode";
import type { ChildTaskSummary } from "@/lib/runs/child-task";
import {
  createWorkGraph,
  mergeChildTasksIntoWorkGraph,
  reduceWorkGraphEvent,
  resolveWorkGraphInteractions,
} from "@/lib/work-graph/work-graph-reducer";
import type { WorkGraph } from "@/lib/work-graph/work-graph.types";

/**
 * How long a turn can be silent (no events) before it is marked stalled in the
 * UI. Stalled turns are not auto-aborted at this point; this is only a
 * visibility signal. 5 minutes covers typical long-running Claude and Codex
 * operations (deep reasoning, multi-file edits, large tool calls) without
 * prematurely interrupting legitimate work.
 */
export const PROVIDER_TURN_STALL_THRESHOLD_MS = 5 * 60 * 1000; // 5 min

/**
 * Extra silence allowed *after* a turn is marked "stalled" before it is
 * force-aborted (see `createStalledProviderTurnAborter` in
 * `src/store/provider-turn-stall-abort.ts`).
 * A turn that is still silent 20 minutes (5 min stall + 15 min grace) after
 * its last event is treated as dead — a hung provider stream, a crashed
 * subprocess the runtime never detected, or a dropped event — rather than a
 * legitimately slow operation. Without this, a turn that never emits `done`
 * leaves its task (and workspace) marked "active" forever, since the stall
 * marker alone only changes the display state and never clears the active
 * turn id. Turns waiting on an approval / user-input prompt are exempt (see
 * `markProviderTurnStalled`'s `pendingInteraction` guard below) — those have
 * their own dedicated timeout paths per provider. That exemption is verified
 * against the task's message parts rather than trusted outright, so a prompt
 * that was resolved without the store noticing cannot exempt the turn forever.
 */
export const PROVIDER_TURN_AUTO_ABORT_GRACE_MS = 15 * 60 * 1000; // 15 min

export function resolveProviderTurnStallThresholdMs(_args?: {
  providerId?: ProviderId | null;
}) {
  return PROVIDER_TURN_STALL_THRESHOLD_MS;
}

export type ProviderTurnPendingInteraction = "approval" | "user_input";

export type ProviderTurnWorkStatus =
  "running" | "waiting" | "completed" | "failed";

export interface ProviderTurnWorkItem {
  id: string;
  kind: "subagent" | "tool" | "hook";
  status: ProviderTurnWorkStatus;
  title: string;
  detail?: string;
  /** Short qualifier shown next to the title (e.g. a subagent type). */
  badge?: string;
  toolUseId?: string;
  progressMessages: string[];
  startedAt: number;
  updatedAt: number;
  elapsedSeconds?: number;
  workerExecution?: WorkerExecutionMetadata;
  /**
   * Hook rows only: the provider's own lifecycle identifiers, kept raw.
   *
   * The activity shelf normalizes `hookEvent` into a provider-agnostic row
   * title and renders these beside it as provider-specific detail, so they are
   * stored unmapped rather than pre-formatted into `title`/`badge`.
   */
  hookEvent?: string;
  hookSource?: string;
  /**
   * Tool rows only: the provider's own tool token, kept raw. The shelf titles
   * the row from the normalized operation and shows this beside it as
   * provider-specific detail.
   */
  toolName?: string;
}

/**
 * Bounded recent-activity tail for the flat shelf. Delegated agents remain
 * complete in the work graph even when their older flat rows fall out here.
 */
export const PROVIDER_TURN_WORK_ITEM_LIMIT = 12;
/**
 * Plain tool calls (reads, edits, commands) are tracked so the activity shelf
 * still says something useful during turns without subagents, but they are
 * capped tightly so they never crowd out subagent work.
 */
export const PROVIDER_TURN_GENERAL_TOOL_LIMIT = 3;
const PROVIDER_TURN_WORK_PROGRESS_LIMIT = 6;

export interface ProviderTurnActivitySnapshot {
  turnId: string;
  providerId: ProviderId;
  startedAt: number;
  lastEventAt: number;
  stalledAt: number | null;
  pendingInteraction: ProviderTurnPendingInteraction | null;
  turnError?: string;
  turnErrorRecoverable?: boolean;
  completedAt?: number;
  workItemsById: Record<string, ProviderTurnWorkItem>;
  orderedWorkItemIds: string[];
  /**
   * The same turn seen as a graph rather than a flat shelf.
   *
   * It rides the activity snapshot instead of a store slice of its own so the
   * two projections cannot drift: they are started, updated, and discarded by
   * the same three functions, from the same event array, and a turn that has
   * activity always has a graph. A separate slice would need its own lifecycle
   * wired into all five call sites that manage this one, and the first missed
   * `clear` would leave a dead graph on screen.
   */
  workGraph: WorkGraph;
}

export type ProviderTurnDisplayState = "idle" | "responding" | "stalled";

type ProviderTurnActivityByTask = Record<
  string,
  ProviderTurnActivitySnapshot | undefined
>;

export function startProviderTurnActivity(args: {
  activityByTask: ProviderTurnActivityByTask;
  taskId: string;
  turnId: string;
  providerId: ProviderId;
  pendingInteraction?: ProviderTurnPendingInteraction;
  now?: number;
}) {
  const now = args.now ?? Date.now();
  const current = args.activityByTask[args.taskId];
  const isSameTurn = current?.turnId === args.turnId;
  const startedAt = isSameTurn ? current.startedAt : now;
  return {
    ...args.activityByTask,
    [args.taskId]: {
      turnId: args.turnId,
      providerId: args.providerId,
      startedAt,
      lastEventAt: now,
      stalledAt: null,
      pendingInteraction:
        args.pendingInteraction ??
        (isSameTurn ? current.pendingInteraction : null),
      workItemsById: isSameTurn ? current.workItemsById : {},
      orderedWorkItemIds: isSameTurn ? current.orderedWorkItemIds : [],
      workGraph: isSameTurn
        ? current.workGraph
        : createWorkGraph({
            turnId: args.turnId,
            providerId: args.providerId,
            startedAt,
          }),
      ...(isSameTurn && current.turnError
        ? {
            turnError: current.turnError,
            turnErrorRecoverable: current.turnErrorRecoverable ?? false,
          }
        : {}),
    },
  };
}

export function clearProviderTurnActivity(args: {
  activityByTask: ProviderTurnActivityByTask;
  taskId: string;
}) {
  if (!(args.taskId in args.activityByTask)) {
    return args.activityByTask;
  }
  const next = { ...args.activityByTask };
  delete next[args.taskId];
  return next;
}

/** Why a retained turn stopped producing activity. */
export type RetainedTurnOutcome = "completed" | "failed" | "stopped";

/**
 * The last turn a task finished, kept so its activity can still be read after
 * the live snapshot is gone.
 *
 * This is a slice of its own rather than a flag on `providerTurnActivityByTask`
 * because *presence* in that map is what Fleet, the pane tab chips, and the
 * attention projection read as "this task is working". Leaving a finished turn
 * parked there would report every idle task as busy, which is a far worse bug
 * than the one replay fixes.
 */
export interface RetainedTurnActivity {
  /** Frozen: `completedAt` is always set and nothing is pending. */
  snapshot: ProviderTurnActivitySnapshot;
  outcome: RetainedTurnOutcome;
  retainedAt: number;
}

export type RetainedTurnActivityByTask = Record<
  string,
  RetainedTurnActivity | undefined
>;

/**
 * How many tasks keep a replayable turn at once.
 *
 * Live snapshots are transient — one per *running* turn — but a retained one
 * outlives its task's activity, and each carries a work graph that can reach
 * hundreds of KB. Replay answers "what did the turn I was just watching do",
 * so a small ring of the most recently finished turns covers it without
 * letting a long session accumulate a snapshot per task it ever ran.
 */
export const RETAINED_TURN_ACTIVITY_LIMIT = 8;

/**
 * A finished turn waits for nothing.
 *
 * The stop paths (`abortTaskTurn`, the stall aborter, a managed takeover) drop
 * the live snapshot without ever answering the prompt the turn was blocked on
 * and without a `done` reaching the graph, so both projections have to be
 * settled here: the shelf hint, or the replay would keep asking for an approval
 * that can no longer be given, and the graph's open interactions, or the
 * subagent that raised one stays badged "Needs you" for as long as the finished
 * turn is on screen. `reduceWorkGraphEvent`'s `done` case does the same for the
 * turns that end by completing.
 */
function freezeRetiredSnapshot(
  snapshot: ProviderTurnActivitySnapshot,
  now: number,
): ProviderTurnActivitySnapshot {
  return {
    ...snapshot,
    pendingInteraction: null,
    stalledAt: null,
    completedAt: snapshot.completedAt ?? now,
    workGraph: resolveWorkGraphInteractions(snapshot.workGraph, now),
  };
}

function pruneRetainedTurnActivity(
  retainedByTask: RetainedTurnActivityByTask,
): RetainedTurnActivityByTask {
  const entries = Object.entries(retainedByTask).filter(
    (entry): entry is [string, RetainedTurnActivity] => entry[1] != null,
  );
  if (entries.length <= RETAINED_TURN_ACTIVITY_LIMIT) {
    return retainedByTask;
  }
  entries.sort((left, right) => right[1].retainedAt - left[1].retainedAt);
  return Object.fromEntries(entries.slice(0, RETAINED_TURN_ACTIVITY_LIMIT));
}

/**
 * The snapshot a turn left behind, read off the live map on both sides of a
 * change.
 *
 * Used by the callers that only *remove* a turn — the stop paths and a host
 * sync that swapped turns — since for them the map still holds everything the
 * turn did. The flush path cannot use it (see `reduceProviderTurnActivityEvents`)
 * and passes its snapshot in directly instead.
 */
function resolveRetiredSnapshot(args: {
  previous: ProviderTurnActivityByTask;
  next: ProviderTurnActivityByTask;
  taskId: string;
}): ProviderTurnActivitySnapshot | null {
  const prior = args.previous[args.taskId];
  if (!prior) {
    return null;
  }
  const following = args.next[args.taskId];
  const settled =
    following && following.turnId === prior.turnId ? following : null;
  if (settled && (settled.completedAt == null || prior.completedAt != null)) {
    // Same turn, still running — or already retained when it first completed.
    return null;
  }
  return settled ?? prior;
}

/**
 * Move a turn into the replay slot as it leaves the live activity map.
 *
 * Callers hand over the map on both sides of whatever they just did rather than
 * a "did it end" flag, because the places a turn can leave the live map
 * disagree about how they say so: the reducer deletes the entry on a clean
 * `done` but *keeps* it with `completedAt` set on a failure, the stop paths
 * delete it outright, and a host sync can swap in a different turn entirely.
 * Comparing before to after recognises all of those without each caller having
 * to re-derive the terminal condition — and returns the map untouched for the
 * flushes that did not end anything, which is nearly all of them.
 */
export function retainRetiredTurnActivity(args: {
  retainedByTask: RetainedTurnActivityByTask;
  /** The live activity map before the caller's change. */
  previous: ProviderTurnActivityByTask;
  /** The same map after it. */
  next: ProviderTurnActivityByTask;
  taskId: string;
  /**
   * The turn's final snapshot, when the caller already holds one that the map
   * does not. Supplying it asserts the turn retired, so pass it only for a
   * batch that actually ended one.
   */
  snapshot?: ProviderTurnActivitySnapshot | null;
  /**
   * Outcome to record when the snapshot carries no error, e.g. `"stopped"` for
   * the abort paths. An errored turn always reads as `"failed"`.
   */
  outcome?: RetainedTurnOutcome;
  now?: number;
}): RetainedTurnActivityByTask {
  const retired = args.snapshot ?? resolveRetiredSnapshot(args);
  if (!retired) {
    return args.retainedByTask;
  }
  const now = args.now ?? Date.now();
  const snapshot = freezeRetiredSnapshot(retired, now);
  const outcome: RetainedTurnOutcome = snapshot.turnError
    ? "failed"
    : (args.outcome ?? "completed");
  const existing = args.retainedByTask[args.taskId];
  if (
    existing &&
    existing.outcome === outcome &&
    existing.snapshot.turnId === snapshot.turnId &&
    existing.snapshot.completedAt === snapshot.completedAt
  ) {
    return args.retainedByTask;
  }
  return pruneRetainedTurnActivity({
    ...args.retainedByTask,
    [args.taskId]: { snapshot, outcome, retainedAt: now },
  });
}

export function markProviderTurnInteractionResolved(args: {
  activityByTask: ProviderTurnActivityByTask;
  taskId: string;
  turnId: string;
  now?: number;
  /**
   * The graph's id for the prompt that was answered, from
   * `approvalInteractionId` / `userInputInteractionId`.
   *
   * The shelf's `pendingInteraction` is a single hint, but a turn can hold one
   * prompt per subagent at once, so the graph clears exactly the one answered.
   * Omitted, no graph block is lifted — the caller could not say which.
   */
  interactionId?: string;
}) {
  const current = args.activityByTask[args.taskId];
  if (!current || current.turnId !== args.turnId) {
    return args.activityByTask;
  }

  const now = args.now ?? Date.now();
  return {
    ...args.activityByTask,
    [args.taskId]: {
      ...current,
      lastEventAt: now,
      stalledAt: null,
      pendingInteraction: null,
      // The graph learns that a prompt was answered from the same place the
      // shelf does. No provider event reports it — the runtime just carries on
      // — so without this the node that raised it stays badged "Needs you"
      // while it is visibly working again.
      workGraph: args.interactionId
        ? resolveWorkGraphInteractions(
            current.workGraph,
            now,
            args.interactionId,
          )
        : current.workGraph,
    },
  };
}

/**
 * Fold the parent's child-task listing into the turn's graph.
 *
 * The listing is read by the surface, not streamed by the provider, so it
 * enters here rather than through `reduceWorkGraphEvent`. It lands on the same
 * snapshot every other view of the turn reads, which is the point: Fleet's
 * agent count and the Turn Activity tree derive from one graph, so a delegated
 * child cannot be counted by one and missing from the other.
 */
export function applyChildTasksToProviderTurnActivity(args: {
  activityByTask: ProviderTurnActivityByTask;
  taskId: string;
  children: readonly ChildTaskSummary[];
  now?: number;
}) {
  const current = args.activityByTask[args.taskId];
  if (!current) {
    return args.activityByTask;
  }
  const workGraph = mergeChildTasksIntoWorkGraph(
    current.workGraph,
    args.children,
    args.now ?? Date.now(),
  );
  // The merge is reference-stable when nothing changed, so a listing that
  // repeats itself — and it repeats on every child-task change event — does not
  // publish a new snapshot to every subscriber.
  if (workGraph === current.workGraph) {
    return args.activityByTask;
  }
  return {
    ...args.activityByTask,
    [args.taskId]: { ...current, workGraph },
  };
}

export function markProviderTurnStalled(args: {
  activityByTask: ProviderTurnActivityByTask;
  taskId: string;
  turnId: string;
  now?: number;
  /**
   * Whether the task *still* has an unanswered approval / user-input prompt in
   * its message history.
   *
   * `pendingInteraction` on the snapshot is only a cached hint: it is set from
   * the provider event and cleared when the user answers through the store. Any
   * other resolution path — the managed host answering on the agent's behalf, an
   * auto-decline in the runtime, a replay that rewrites the message parts — can
   * resolve the prompt without that clear ever running. The hint then sticks
   * forever and silently exempts the turn from the stall net, which is how a
   * task ends up pinned to "active" with nothing left to reclaim it.
   *
   * The message parts are the source of truth, so callers pass what they can
   * actually see: `false` drops a stale hint and lets the turn be marked
   * stalled. Omitting it (or `true`) keeps the exemption, since a caller that
   * cannot check must not guess a prompt away.
   */
  hasPendingPrompt?: boolean;
}) {
  const current = args.activityByTask[args.taskId];
  if (
    !current ||
    current.turnId !== args.turnId ||
    current.stalledAt != null
  ) {
    return args.activityByTask;
  }
  const hasStalePendingInteraction =
    current.pendingInteraction != null && args.hasPendingPrompt === false;
  if (current.pendingInteraction != null && !hasStalePendingInteraction) {
    return args.activityByTask;
  }

  return {
    ...args.activityByTask,
    [args.taskId]: {
      ...current,
      stalledAt: args.now ?? Date.now(),
      ...(hasStalePendingInteraction ? { pendingInteraction: null } : {}),
    },
  };
}

function resolvePendingInteraction(
  events: NormalizedProviderEvent[],
): ProviderTurnPendingInteraction | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "approval") {
      return "approval" satisfies ProviderTurnPendingInteraction;
    }
    if (event?.type === "user_input") {
      return "user_input" satisfies ProviderTurnPendingInteraction;
    }
  }
  return undefined;
}

function resolveTurnProviderId(args: {
  events: NormalizedProviderEvent[];
  currentProviderId?: ProviderId;
  fallbackProviderId: ProviderId;
}) {
  for (let index = args.events.length - 1; index >= 0; index -= 1) {
    const event = args.events[index];
    if (event?.type === "model_resolved") {
      return event.resolvedProviderId;
    }
    if (event?.type === "provider_session") {
      return event.providerId;
    }
  }
  return args.currentProviderId ?? args.fallbackProviderId;
}

type ProviderTurnErrorState = {
  message: string;
  recoverable: boolean;
};

const PROVIDER_TURN_FAILURE_STOP_REASONS = new Set([
  "aborted",
  "error",
  "failed",
  "max_tokens",
  "output_overflow",
  "runtime_failure",
]);

const PROVIDER_TURN_CANCEL_STOP_REASONS = new Set([
  "canceled",
  "cancelled",
  "interrupted",
  "user_abort",
]);

/** Shared interpretation for outcome records and visible completion state. */
export function classifyProviderTurnStopReason(reason?: string) {
  const normalized = reason?.trim().toLowerCase();
  if (normalized && PROVIDER_TURN_CANCEL_STOP_REASONS.has(normalized)) return "cancelled";
  if (normalized && PROVIDER_TURN_FAILURE_STOP_REASONS.has(normalized)) return "failed";
  return "completed";
}

function isProviderTurnRecoveryEvent(event: NormalizedProviderEvent) {
  if (event.type === "tool") {
    return event.state !== "output-error";
  }
  if (event.type === "tool_result") {
    return !event.isError;
  }
  if (event.type === "hook_activity") {
    return event.status === "running" || event.status === "completed";
  }
  return (
    event.type === "text" ||
    event.type === "thinking" ||
    event.type === "tool_progress" ||
    event.type === "subagent_progress" ||
    event.type === "diff" ||
    event.type === "plan_ready" ||
    event.type === "approval" ||
    event.type === "user_input"
  );
}

function resolveTurnErrorState(args: {
  events: NormalizedProviderEvent[];
  current?: ProviderTurnErrorState;
}) {
  let errorState = args.current;
  for (const event of args.events) {
    if (event.type === "error") {
      const message =
        truncateWorkText(event.message) ?? "The provider run failed.";
      if (!errorState || errorState.recoverable || !event.recoverable) {
        errorState = {
          message,
          recoverable: event.recoverable,
        };
      }
      continue;
    }
    if (errorState?.recoverable && isProviderTurnRecoveryEvent(event)) {
      errorState = undefined;
    }
  }
  return errorState;
}

function resolveTurnCompletionError(args: {
  events: NormalizedProviderEvent[];
  errorState?: ProviderTurnErrorState;
}) {
  let doneEvent: Extract<NormalizedProviderEvent, { type: "done" }> | undefined;
  for (let index = args.events.length - 1; index >= 0; index -= 1) {
    const event = args.events[index];
    if (event?.type === "done") {
      doneEvent = event;
      break;
    }
  }
  const stopReason = doneEvent?.stop_reason?.trim().toLowerCase();
  if (args.errorState && !args.errorState.recoverable) {
    return args.errorState;
  }
  if (stopReason && PROVIDER_TURN_CANCEL_STOP_REASONS.has(stopReason)) {
    return undefined;
  }
  if (args.errorState) {
    return args.errorState;
  }
  if (!stopReason || !PROVIDER_TURN_FAILURE_STOP_REASONS.has(stopReason)) {
    return undefined;
  }

  return {
    message:
      stopReason === "aborted"
        ? "The provider stream ended unexpectedly."
        : `The provider stopped before completing (${stopReason}).`,
    recoverable: false,
  } satisfies ProviderTurnErrorState;
}

/** Keep the tail of a path so the row shows `session/ChatInput.tsx`. */
function formatPathPreview(value: string) {
  const segments = value.split("/").filter(Boolean);
  return segments.length > 2 ? segments.slice(-2).join("/") : value;
}

function resolveToolDetail(input: string) {
  const parsed = parseToolInput(input);
  return (
    truncateWorkText(parsed?.prompt) ??
    truncateWorkText(parsed?.message) ??
    (parsed ? undefined : truncateWorkText(input))
  );
}

/**
 * What a plain tool call is acting on: the command, the file, or the query.
 * Keeps the shelf informative for edit/run turns that never spawn a subagent.
 */
/**
 * `src/foo.ts` for one file, `src/foo.ts +2 more` for a batch.
 *
 * A single edit touching several files is one operation, not several: Codex
 * reports a whole patch as one item and Claude's `MultiEdit` does the same. The
 * row names the first file and counts the rest rather than growing a row per
 * path or naming only one of them.
 */
function formatPathListPreview(values: unknown) {
  const paths = Array.isArray(values)
    ? values.filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    : [];
  const [first] = paths;
  if (!first) {
    return undefined;
  }
  const preview = formatPathPreview(first);
  return paths.length > 1 ? `${preview} +${paths.length - 1} more` : preview;
}

function resolveGeneralToolDetail(input: string) {
  const parsed = parseToolInput(input);
  if (!parsed) {
    return truncateWorkText(input);
  }
  const pathList = formatPathListPreview(parsed.paths);
  if (pathList) {
    return truncateWorkText(pathList);
  }
  const path =
    typeof parsed.file_path === "string"
      ? parsed.file_path
      : typeof parsed.path === "string"
        ? parsed.path
        : typeof parsed.notebook_path === "string"
          ? parsed.notebook_path
          : null;
  return (
    truncateWorkText(parsed.command) ??
    (path ? truncateWorkText(formatPathPreview(path)) : undefined) ??
    truncateWorkText(parsed.pattern) ??
    truncateWorkText(parsed.query) ??
    truncateWorkText(parsed.url) ??
    truncateWorkText(parsed.description)
  );
}

/**
 * Mark a delegation that ran as a configured Worker, without saying it twice.
 *
 * The prefix exists because a Worker run is not an ordinary subagent — it has a
 * preset, a model and an effort of its own, shown in the badge. But it only
 * earns its place when the title names the delegated work. ACP agents name the
 * delegation tool `Worker`, and a provider that names nothing leaves the
 * generic delegation label, so both used to produce a row that said the same
 * word twice (`Worker · Worker`, `Worker · Delegate work`).
 */
function formatWorkerTitle(args: {
  title: string;
  workerExecution?: WorkerExecutionMetadata;
}) {
  if (!args.workerExecution) {
    return args.title;
  }
  const title = args.title.trim();
  if (/^worker\b/i.test(title) || title === TOOL_DELEGATION_LABEL) {
    return "Worker";
  }
  return `Worker · ${title}`;
}

function resolveToolResultDetail(output: string) {
  const parsed = parseToolInput(output);
  const content = Array.isArray(parsed?.content) ? parsed.content : [];
  const contentText = content
    .flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return [];
      }
      const text = (item as Record<string, unknown>).text;
      return typeof text === "string" ? [text] : [];
    })
    .join(" ");
  return (
    truncateWorkText(contentText) ??
    truncateWorkText(parsed?.message) ??
    // A parsed object that matched no known text field is a provider's internal
    // result payload (Codex returns thread ids and agent state). Showing it raw
    // put a JSON blob in the detail line, so the row keeps its input-derived
    // detail instead.
    (parsed ? undefined : truncateWorkText(output))
  );
}

function appendProgressMessage(messages: string[], content: string) {
  const nextMessage = truncateWorkText(content);
  if (!nextMessage || messages.at(-1) === nextMessage) {
    return messages;
  }
  return [...messages, nextMessage].slice(-PROVIDER_TURN_WORK_PROGRESS_LIMIT);
}

function resolveToolStatus(
  state: Extract<NormalizedProviderEvent, { type: "tool" }>["state"],
): ProviderTurnWorkStatus {
  if (state === "output-error") {
    return "failed";
  }
  if (state === "output-available") {
    return "completed";
  }
  return "running";
}

type WorkItemCollection = {
  workItemsById: Record<string, ProviderTurnWorkItem>;
  orderedWorkItemIds: string[];
};

/**
 * Drop the least interesting ids first: finished work before failures, and
 * live work only as a last resort. Insertion order breaks ties, so the oldest
 * entry in each bucket goes first.
 */
function collectRemovableWorkItemIds(args: {
  candidateIds: string[];
  workItemsById: Record<string, ProviderTurnWorkItem>;
  overflowCount: number;
}) {
  const removedIds = new Set<string>();
  const buckets = [
    args.candidateIds.filter(
      (id) => args.workItemsById[id]?.status === "completed",
    ),
    args.candidateIds.filter(
      (id) => args.workItemsById[id]?.status === "failed",
    ),
    args.candidateIds,
  ];
  for (const bucket of buckets) {
    for (const id of bucket) {
      if (removedIds.size >= args.overflowCount) {
        return removedIds;
      }
      removedIds.add(id);
    }
  }
  return removedIds;
}

function removeWorkItems(args: WorkItemCollection, removedIds: Set<string>) {
  if (removedIds.size === 0) {
    return args;
  }
  const orderedWorkItemIds = args.orderedWorkItemIds.filter(
    (id) => !removedIds.has(id),
  );
  const workItemsById = Object.fromEntries(
    orderedWorkItemIds.flatMap((id) => {
      const item = args.workItemsById[id];
      return item ? [[id, item] as const] : [];
    }),
  );
  return { workItemsById, orderedWorkItemIds };
}

/** Keep plain tool calls to a short "recent activity" tail. */
function pruneGeneralToolItems(args: WorkItemCollection) {
  const generalToolIds = args.orderedWorkItemIds.filter(
    (id) => args.workItemsById[id]?.kind === "tool",
  );
  const overflowCount =
    generalToolIds.length - PROVIDER_TURN_GENERAL_TOOL_LIMIT;
  if (overflowCount <= 0) {
    return args;
  }
  return removeWorkItems(
    args,
    collectRemovableWorkItemIds({
      candidateIds: generalToolIds,
      workItemsById: args.workItemsById,
      overflowCount,
    }),
  );
}

function pruneWorkItems(args: WorkItemCollection) {
  const trimmed = pruneGeneralToolItems(args);
  const overflowCount =
    trimmed.orderedWorkItemIds.length - PROVIDER_TURN_WORK_ITEM_LIMIT;
  if (overflowCount <= 0) {
    return trimmed;
  }

  return removeWorkItems(
    trimmed,
    collectRemovableWorkItemIds({
      candidateIds: trimmed.orderedWorkItemIds,
      workItemsById: trimmed.workItemsById,
      overflowCount,
    }),
  );
}

/**
 * Fold this batch of events into the turn's graph.
 *
 * The graph is rebuilt from scratch whenever the turn id changes, and also
 * whenever the resolved provider changes under an empty graph: node keys are
 * namespaced by provider id, so carrying keys across a provider switch would
 * put two runtimes' agents in one namespace. `model_resolved` arrives at the
 * head of a turn, before any agent exists, which is why "empty" is a sufficient
 * guard rather than a hopeful one.
 */
function applyTurnWorkGraphEvents(args: {
  current?: ProviderTurnActivitySnapshot;
  turnId: string;
  providerId: ProviderId;
  events: NormalizedProviderEvent[];
  startedAt: number;
  now: number;
}) {
  const carried =
    args.current?.turnId === args.turnId ? args.current.workGraph : undefined;
  const reusable =
    carried &&
    (carried.providerId === args.providerId ||
      carried.orderedNodeKeys.length > 1);
  let graph =
    reusable && carried
      ? carried
      : createWorkGraph({
          turnId: args.turnId,
          providerId: args.providerId,
          startedAt: args.startedAt,
        });
  for (const event of args.events) {
    graph = reduceWorkGraphEvent(graph, event, args.now);
  }
  return graph;
}

function applyTurnWorkEvents(args: {
  current?: ProviderTurnActivitySnapshot;
  turnId: string;
  events: NormalizedProviderEvent[];
  now: number;
}) {
  let workItemsById =
    args.current?.turnId === args.turnId
      ? { ...args.current.workItemsById }
      : {};
  let orderedWorkItemIds =
    args.current?.turnId === args.turnId
      ? [...args.current.orderedWorkItemIds]
      : [];

  const upsertItem = (item: ProviderTurnWorkItem) => {
    if (!workItemsById[item.id]) {
      orderedWorkItemIds.push(item.id);
    }
    workItemsById[item.id] = item;
  };

  for (const event of args.events) {
    if (event.type === "hook_activity") {
      const id = `hook:${event.hookId}`;
      const currentItem = workItemsById[id];
      const hookEvent = truncateWorkText(event.hookEvent);
      const hookSource = truncateWorkText(event.hookSource ?? "");
      upsertItem({
        id,
        kind: "hook",
        status:
          event.status === "running"
            ? "running"
            : event.status === "completed" || event.status === "cancelled"
              ? "completed"
              : "failed",
        title: truncateWorkText(event.hookName) ?? "Provider hook",
        progressMessages: [],
        startedAt: currentItem?.startedAt ?? args.now,
        updatedAt: args.now,
        ...(hookEvent ? { hookEvent } : {}),
        ...(hookSource ? { hookSource } : {}),
      });
      continue;
    }

    if (event.type === "subagent_progress" && event.toolUseId) {
      const currentItem = workItemsById[event.toolUseId];
      // The work graph owns the complete agent roster. If this flat-tail row
      // was pruned (or never existed), recreating it from progress alone loses
      // the agent's label, badge, and original start time.
      if (!currentItem) {
        continue;
      }
      const progressMessages = appendProgressMessage(
        currentItem.progressMessages,
        event.content,
      );
      upsertItem({
        id: event.toolUseId,
        kind: currentItem.kind,
        status: "running",
        title: currentItem.title,
        detail:
          progressMessages.at(-1) ??
          currentItem.detail ??
          truncateWorkText(event.content),
        toolUseId: event.toolUseId,
        progressMessages,
        startedAt: currentItem.startedAt,
        updatedAt: args.now,
        elapsedSeconds: currentItem.elapsedSeconds,
        ...(currentItem.badge ? { badge: currentItem.badge } : {}),
        ...(currentItem.workerExecution
          ? { workerExecution: currentItem.workerExecution }
          : {}),
      });
      continue;
    }

    if (event.type === "tool" && event.toolUseId) {
      // Todos already have their own rows in the shelf, built from the todo
      // list itself. A `TodoWrite` row would say the same thing a second time
      // while consuming one of the three plain-tool slots.
      if (isTodoToolName(event.toolName)) {
        continue;
      }
      const currentItem = workItemsById[event.toolUseId];
      const isSubagent = isSubagentToolName(event.toolName);
      const kind = isSubagent ? "subagent" : (currentItem?.kind ?? "tool");
      const eventDetail =
        (kind === "subagent"
          ? resolveToolDetail(event.input)
          : resolveGeneralToolDetail(event.input)) ??
        truncateWorkText(event.output);
      const workerExecution = event.workerExecution ?? currentItem?.workerExecution;
      const badge = workerExecution
        ? formatWorkerExecutionMetadata(workerExecution)
        : resolveSubagentBadge(event.input) ?? currentItem?.badge;
      const resolvedTitle = resolveToolTitle(
        event.toolName,
        event.input,
        currentItem?.title,
        { isSubagent: kind === "subagent" },
      );
      const toolName = truncateWorkText(event.toolName);
      upsertItem({
        id: event.toolUseId,
        kind,
        status: resolveToolStatus(event.state),
        title: formatWorkerTitle({ title: resolvedTitle, workerExecution }),
        detail: eventDetail ?? currentItem?.detail,
        ...(badge ? { badge } : {}),
        toolUseId: event.toolUseId,
        progressMessages: currentItem?.progressMessages ?? [],
        startedAt: currentItem?.startedAt ?? args.now,
        updatedAt: args.now,
        elapsedSeconds: currentItem?.elapsedSeconds,
        ...(workerExecution ? { workerExecution } : {}),
        ...(toolName ? { toolName } : {}),
      });
      continue;
    }

    if (event.type === "tool_progress") {
      const currentItem = workItemsById[event.toolUseId];
      const isSubagent = isSubagentToolName(event.toolName);
      // A pruned agent stays represented by the work graph. Do not fabricate
      // an incomplete flat row from a progress event that carries no spawn
      // description or badge. Unknown plain tools retain the legacy fallback.
      if (!currentItem && isSubagent) {
        continue;
      }
      upsertItem({
        id: event.toolUseId,
        kind: isSubagent ? "subagent" : (currentItem?.kind ?? "tool"),
        status: "running",
        title:
          currentItem?.title ??
          describeToolOperationLabel(event.toolName) ??
          formatToolDisplayName(event.toolName) ??
          "Background work",
        detail: currentItem?.detail,
        ...(currentItem?.badge ? { badge: currentItem.badge } : {}),
        toolUseId: event.toolUseId,
        progressMessages: currentItem?.progressMessages ?? [],
        startedAt: currentItem?.startedAt ?? args.now,
        updatedAt: args.now,
        elapsedSeconds: event.elapsedSeconds,
        ...(currentItem?.workerExecution
          ? { workerExecution: currentItem.workerExecution }
          : {}),
      });
      continue;
    }

    if (event.type === "tool_result") {
      const currentItem = workItemsById[event.tool_use_id];
      if (!currentItem) {
        continue;
      }
      // Subagent results summarize the whole run, so they read better than the
      // spawn prompt. A plain tool's output is usually file/command noise —
      // keep the input-derived detail there unless the call actually failed.
      const shouldUseResultDetail =
        currentItem.kind === "subagent" || event.isError;
      upsertItem({
        ...currentItem,
        status: event.isPartial
          ? "running"
          : event.isError
            ? "failed"
            : "completed",
        detail: shouldUseResultDetail
          ? (resolveToolResultDetail(event.output) ?? currentItem.detail)
          : currentItem.detail,
        updatedAt: args.now,
      });
    }
  }

  return pruneWorkItems({ workItemsById, orderedWorkItemIds });
}

export function applyProviderTurnActivityEvents(args: {
  activityByTask: ProviderTurnActivityByTask;
  taskId: string;
  turnId: string;
  providerId: ProviderId;
  events: NormalizedProviderEvent[];
  now?: number;
}) {
  return reduceProviderTurnActivityEvents(args).activityByTask;
}

/**
 * The same fold as `applyProviderTurnActivityEvents`, plus the snapshot the
 * turn ended on.
 *
 * The two have to come from one pass. `done` arrives in the same batch as the
 * work that preceded it — the runtime cancels the pending animation-frame flush
 * and drains everything queued, which after a spell of a hidden window can be
 * the entire turn — and a cleanly completed turn is deleted from the map. So
 * neither side of the map comparison holds what the turn actually did: the
 * "before" is one flush stale and the "after" is empty. Anything that wants to
 * keep the finished turn has to be handed the snapshot from in here.
 */
export function reduceProviderTurnActivityEvents(args: {
  activityByTask: ProviderTurnActivityByTask;
  taskId: string;
  turnId: string;
  providerId: ProviderId;
  events: NormalizedProviderEvent[];
  now?: number;
}): {
  activityByTask: ProviderTurnActivityByTask;
  /** The turn's final snapshot when this batch ended it, else null. */
  retiredSnapshot: ProviderTurnActivitySnapshot | null;
} {
  if (args.events.length === 0) {
    return { activityByTask: args.activityByTask, retiredSnapshot: null };
  }

  const current = args.activityByTask[args.taskId];
  const currentTurnError =
    current?.turnId === args.turnId && current.turnError
      ? {
          message: current.turnError,
          recoverable: current.turnErrorRecoverable ?? false,
        }
      : undefined;
  let turnErrorState = resolveTurnErrorState({
    events: args.events,
    current: currentTurnError,
  });
  const turnCompleted = args.events.some((event) => event.type === "done");
  if (turnCompleted) {
    turnErrorState = resolveTurnCompletionError({
      events: args.events,
      errorState: turnErrorState,
    });
  }

  const now = args.now ?? Date.now();
  const pendingInteraction = turnCompleted
    ? null
    : (resolvePendingInteraction(args.events) ??
      (current?.turnId === args.turnId ? current.pendingInteraction : null));
  const startedAt = current?.turnId === args.turnId ? current.startedAt : now;
  const providerId = resolveTurnProviderId({
    events: args.events,
    currentProviderId:
      current?.turnId === args.turnId ? current.providerId : undefined,
    fallbackProviderId: args.providerId,
  });
  const work = applyTurnWorkEvents({
    current,
    turnId: args.turnId,
    events: args.events,
    now,
  });

  const snapshot: ProviderTurnActivitySnapshot = {
    turnId: args.turnId,
    providerId,
    startedAt,
    lastEventAt: now,
    stalledAt: null,
    pendingInteraction,
    workItemsById: work.workItemsById,
    orderedWorkItemIds: work.orderedWorkItemIds,
    workGraph: applyTurnWorkGraphEvents({
      current,
      turnId: args.turnId,
      providerId,
      events: args.events,
      startedAt,
      now,
    }),
    ...(turnErrorState
      ? {
          turnError: turnErrorState.message,
          turnErrorRecoverable: turnErrorState.recoverable,
        }
      : {}),
    ...(turnCompleted ? { completedAt: now } : {}),
  };

  return {
    // A cleanly completed turn still leaves the live map entirely: presence
    // there is what Fleet, the pane tab chips, and the attention projection
    // read as "this task is working".
    activityByTask:
      turnCompleted && !turnErrorState
        ? clearProviderTurnActivity({
            activityByTask: args.activityByTask,
            taskId: args.taskId,
          })
        : { ...args.activityByTask, [args.taskId]: snapshot },
    retiredSnapshot: turnCompleted ? snapshot : null,
  };
}

export function resolveProviderTurnDisplayState(args: {
  activeTurnId?: string | null;
  activity?: ProviderTurnActivitySnapshot | null;
}): ProviderTurnDisplayState {
  if (!args.activeTurnId) {
    return "idle";
  }
  if (
    args.activity?.turnId === args.activeTurnId &&
    args.activity.stalledAt != null &&
    args.activity.pendingInteraction == null
  ) {
    return "stalled";
  }
  return "responding";
}

function formatDurationLabel(elapsedMs: number) {
  const totalSeconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function formatProviderTurnIdleDuration(args: {
  activity?: Pick<ProviderTurnActivitySnapshot, "lastEventAt"> | null;
  now?: number;
}) {
  if (!args.activity) {
    return null;
  }

  return formatDurationLabel(
    (args.now ?? Date.now()) - args.activity.lastEventAt,
  );
}

/** Elapsed wall-clock time since the active turn started (for a live label). */
export function formatProviderTurnElapsedDuration(args: {
  activity?: Pick<ProviderTurnActivitySnapshot, "startedAt"> | null;
  now?: number;
}) {
  if (!args.activity) {
    return null;
  }

  return formatDurationLabel(
    (args.now ?? Date.now()) - args.activity.startedAt,
  );
}
