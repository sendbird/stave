import type {
  NormalizedProviderEvent,
  ProviderId,
} from "@/lib/providers/provider.types";

/**
 * How long a turn can be silent (no events) before it is marked stalled in the
 * UI. Stalled turns are not auto-aborted; this is only a visibility signal.
 * 5 minutes covers typical long-running Claude and Codex operations (deep
 * reasoning, multi-file edits, large tool calls) without prematurely
 * interrupting legitimate work.
 */
export const PROVIDER_TURN_STALL_THRESHOLD_MS = 5 * 60 * 1000; // 5 min

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
  kind: "subagent" | "tool";
  status: ProviderTurnWorkStatus;
  title: string;
  detail?: string;
  toolUseId?: string;
  progressMessages: string[];
  startedAt: number;
  updatedAt: number;
  elapsedSeconds?: number;
}

export const PROVIDER_TURN_WORK_ITEM_LIMIT = 12;
const PROVIDER_TURN_WORK_PROGRESS_LIMIT = 6;
const PROVIDER_TURN_WORK_TEXT_LIMIT = 240;

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
      pendingInteraction: null,
      workItemsById: isSameTurn ? current.workItemsById : {},
      orderedWorkItemIds: isSameTurn ? current.orderedWorkItemIds : [],
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

export function markProviderTurnInteractionResolved(args: {
  activityByTask: ProviderTurnActivityByTask;
  taskId: string;
  turnId: string;
  now?: number;
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
    },
  };
}

export function markProviderTurnStalled(args: {
  activityByTask: ProviderTurnActivityByTask;
  taskId: string;
  turnId: string;
  now?: number;
}) {
  const current = args.activityByTask[args.taskId];
  if (
    !current ||
    current.turnId !== args.turnId ||
    current.stalledAt != null ||
    current.pendingInteraction != null
  ) {
    return args.activityByTask;
  }

  return {
    ...args.activityByTask,
    [args.taskId]: {
      ...current,
      stalledAt: args.now ?? Date.now(),
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

function isProviderTurnRecoveryEvent(event: NormalizedProviderEvent) {
  if (event.type === "tool") {
    return event.state !== "output-error";
  }
  if (event.type === "tool_result") {
    return !event.isError;
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

function truncateWorkText(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return undefined;
  }
  if (normalized.length <= PROVIDER_TURN_WORK_TEXT_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, PROVIDER_TURN_WORK_TEXT_LIMIT - 1).trimEnd()}…`;
}

function parseToolInput(input: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(input);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function isSubagentToolName(toolName: string) {
  const normalized = toolName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return (
    normalized === "agent" ||
    normalized === "task" ||
    normalized.endsWith("spawnagent")
  );
}

function resolveToolTitle(
  toolName: string,
  input: string,
  currentTitle?: string,
) {
  const parsed = parseToolInput(input);
  const title =
    truncateWorkText(parsed?.description) ??
    truncateWorkText(parsed?.task_name) ??
    truncateWorkText(parsed?.name);
  return (
    title ?? currentTitle ?? truncateWorkText(toolName) ?? "Background work"
  );
}

function resolveToolDetail(input: string) {
  const parsed = parseToolInput(input);
  return (
    truncateWorkText(parsed?.prompt) ??
    truncateWorkText(parsed?.message) ??
    (parsed ? undefined : truncateWorkText(input))
  );
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
    truncateWorkText(output)
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

function pruneWorkItems(args: {
  workItemsById: Record<string, ProviderTurnWorkItem>;
  orderedWorkItemIds: string[];
}) {
  if (args.orderedWorkItemIds.length <= PROVIDER_TURN_WORK_ITEM_LIMIT) {
    return args;
  }

  const removableIds = args.orderedWorkItemIds.filter((id) => {
    const status = args.workItemsById[id]?.status;
    return status === "completed" || status === "failed";
  });
  const overflowCount =
    args.orderedWorkItemIds.length - PROVIDER_TURN_WORK_ITEM_LIMIT;
  const removedIds = new Set(removableIds.slice(0, overflowCount));
  if (removedIds.size < overflowCount) {
    for (const id of args.orderedWorkItemIds) {
      if (removedIds.size >= overflowCount) {
        break;
      }
      removedIds.add(id);
    }
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
    if (event.type === "subagent_progress" && event.toolUseId) {
      const currentItem = workItemsById[event.toolUseId];
      const progressMessages = appendProgressMessage(
        currentItem?.progressMessages ?? [],
        event.content,
      );
      upsertItem({
        id: event.toolUseId,
        kind: currentItem?.kind ?? "tool",
        status: "running",
        title: currentItem?.title ?? "Background work",
        detail:
          progressMessages.at(-1) ??
          currentItem?.detail ??
          truncateWorkText(event.content),
        toolUseId: event.toolUseId,
        progressMessages,
        startedAt: currentItem?.startedAt ?? args.now,
        updatedAt: args.now,
        elapsedSeconds: currentItem?.elapsedSeconds,
      });
      continue;
    }

    if (event.type === "tool" && event.toolUseId) {
      const currentItem = workItemsById[event.toolUseId];
      const isSubagent = isSubagentToolName(event.toolName);
      if (!isSubagent && !currentItem) {
        continue;
      }
      const eventDetail =
        resolveToolDetail(event.input) ?? truncateWorkText(event.output);
      upsertItem({
        id: event.toolUseId,
        kind: isSubagent ? "subagent" : (currentItem?.kind ?? "tool"),
        status: resolveToolStatus(event.state),
        title: resolveToolTitle(
          event.toolName,
          event.input,
          currentItem?.title,
        ),
        detail: eventDetail ?? currentItem?.detail,
        toolUseId: event.toolUseId,
        progressMessages: currentItem?.progressMessages ?? [],
        startedAt: currentItem?.startedAt ?? args.now,
        updatedAt: args.now,
        elapsedSeconds: currentItem?.elapsedSeconds,
      });
      continue;
    }

    if (event.type === "tool_progress") {
      const currentItem = workItemsById[event.toolUseId];
      const isSubagent = isSubagentToolName(event.toolName);
      if (!isSubagent && !currentItem) {
        continue;
      }
      upsertItem({
        id: event.toolUseId,
        kind: isSubagent ? "subagent" : (currentItem?.kind ?? "tool"),
        status: "running",
        title:
          currentItem?.title ??
          truncateWorkText(event.toolName) ??
          "Background work",
        detail: currentItem?.detail,
        toolUseId: event.toolUseId,
        progressMessages: currentItem?.progressMessages ?? [],
        startedAt: currentItem?.startedAt ?? args.now,
        updatedAt: args.now,
        elapsedSeconds: event.elapsedSeconds,
      });
      continue;
    }

    if (event.type === "tool_result") {
      const currentItem = workItemsById[event.tool_use_id];
      if (!currentItem) {
        continue;
      }
      upsertItem({
        ...currentItem,
        status: event.isPartial
          ? "running"
          : event.isError
            ? "failed"
            : "completed",
        detail: resolveToolResultDetail(event.output) ?? currentItem.detail,
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
  if (args.events.length === 0) {
    return args.activityByTask;
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

  if (turnCompleted && !turnErrorState) {
    return clearProviderTurnActivity({
      activityByTask: args.activityByTask,
      taskId: args.taskId,
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

  return {
    ...args.activityByTask,
    [args.taskId]: {
      turnId: args.turnId,
      providerId,
      startedAt,
      lastEventAt: now,
      stalledAt: null,
      pendingInteraction,
      workItemsById: work.workItemsById,
      orderedWorkItemIds: work.orderedWorkItemIds,
      ...(turnErrorState
        ? {
            turnError: turnErrorState.message,
            turnErrorRecoverable: turnErrorState.recoverable,
          }
        : {}),
      ...(turnCompleted ? { completedAt: now } : {}),
    },
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
