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

export interface ProviderTurnActivitySnapshot {
  turnId: string;
  providerId: ProviderId;
  startedAt: number;
  lastEventAt: number;
  stalledAt: number | null;
  pendingInteraction: ProviderTurnPendingInteraction | null;
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
  const startedAt = current?.turnId === args.turnId ? current.startedAt : now;
  return {
    ...args.activityByTask,
    [args.taskId]: {
      turnId: args.turnId,
      providerId: args.providerId,
      startedAt,
      lastEventAt: now,
      stalledAt: null,
      pendingInteraction: null,
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
): ProviderTurnPendingInteraction | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "approval") {
      return "approval" satisfies ProviderTurnPendingInteraction;
    }
    if (event?.type === "user_input") {
      return "user_input" satisfies ProviderTurnPendingInteraction;
    }
  }
  return null;
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

  if (args.events.some((event) => event.type === "done")) {
    return clearProviderTurnActivity({
      activityByTask: args.activityByTask,
      taskId: args.taskId,
    });
  }

  const now = args.now ?? Date.now();
  const current = args.activityByTask[args.taskId];
  const pendingInteraction = resolvePendingInteraction(args.events);
  const startedAt = current?.turnId === args.turnId ? current.startedAt : now;
  const providerId = resolveTurnProviderId({
    events: args.events,
    currentProviderId:
      current?.turnId === args.turnId ? current.providerId : undefined,
    fallbackProviderId: args.providerId,
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

export function formatProviderTurnIdleDuration(args: {
  activity?: Pick<ProviderTurnActivitySnapshot, "lastEventAt"> | null;
  now?: number;
}) {
  if (!args.activity) {
    return null;
  }

  const elapsedMs = Math.max(
    0,
    (args.now ?? Date.now()) - args.activity.lastEventAt,
  );
  const totalSeconds = Math.floor(elapsedMs / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
