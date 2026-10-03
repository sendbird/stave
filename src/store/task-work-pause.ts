import type { ProviderId } from "@/lib/providers/provider.types";
import type { PromptDraftQueuedTurn } from "@/types/chat";
import type { QueuedTurnAutoDispatchHold } from "@/store/queued-task-turn-dispatch";

/**
 * A task whose work stopped at a provider usage limit.
 *
 * Held in memory only. After a restart the task's queue is paused anyway
 * (see {@link isQueuedTurnRestoredAfterRestart}), so nothing runs on its own
 * until the user picks it up again.
 */
export interface TaskUsageLimitPause {
  workspaceId: string;
  providerId: ProviderId;
  model?: string;
  /**
   * The limit ended a running turn. Resuming first continues that turn's
   * work, then the queue drains as usual.
   */
  stoppedTurn: boolean;
  pausedAt: number;
  /** When the limit resets, in epoch ms; null until a usage read knows it. */
  resetsAt: number | null;
  /** The usage window that ran out, such as "Session" or "Weekly". */
  windowLabel?: string;
  /** Resume on its own at this time (epoch ms), chosen with "Resume at reset". */
  autoResumeAt?: number;
}

export type UsageLimitPauseByTask = Record<string, TaskUsageLimitPause | undefined>;

/**
 * Providers are given a minute past the advertised reset before Stave sends
 * again, so the first request does not race the window boundary.
 */
export const USAGE_LIMIT_RESUME_GRACE_MS = 60_000;

/**
 * When this renderer started. Queue items stamped earlier were written by a
 * previous run of the app and restored from disk.
 */
export const RENDERER_SESSION_STARTED_AT = Date.now();

export function isQueuedTurnRestoredAfterRestart(args: {
  item: Pick<PromptDraftQueuedTurn, "queuedAt">;
  sessionStartedAt: number;
}): boolean {
  const queuedAt = Date.parse(args.item.queuedAt);
  return Number.isFinite(queuedAt) && queuedAt < args.sessionStartedAt;
}

export type QueuePauseReason = "usage-limit" | "restart";

/**
 * Why a task's queue is not draining on its own, or null when it drains.
 *
 * A usage limit holds the whole queue. A restart holds the queue while any
 * item restored from the previous run is still in it: the user decides
 * whether that work still applies before it is sent.
 */
export function resolveQueuePause(args: {
  queuedTurns: readonly Pick<PromptDraftQueuedTurn, "queuedAt">[];
  usageLimitPause: TaskUsageLimitPause | undefined;
  restoredQueueReleased: boolean;
  sessionStartedAt?: number;
}): QueuePauseReason | null {
  if (args.queuedTurns.length === 0) {
    return null;
  }
  if (args.usageLimitPause) {
    return "usage-limit";
  }
  if (args.restoredQueueReleased) {
    return null;
  }
  const sessionStartedAt = args.sessionStartedAt ?? RENDERER_SESSION_STARTED_AT;
  return args.queuedTurns.some((item) =>
    isQueuedTurnRestoredAfterRestart({ item, sessionStartedAt }),
  )
    ? "restart"
    : null;
}

/**
 * The dispatcher hold for one queued item. Both pauses wait at the head, so
 * nothing behind a paused item jumps the line.
 */
export function resolveQueuedTurnPauseHold(args: {
  item: Pick<PromptDraftQueuedTurn, "queuedAt">;
  usageLimitPause: TaskUsageLimitPause | undefined;
  restoredQueueReleased: boolean;
  sessionStartedAt?: number;
}): QueuedTurnAutoDispatchHold | undefined {
  if (args.usageLimitPause) {
    return "wait";
  }
  if (
    !args.restoredQueueReleased &&
    isQueuedTurnRestoredAfterRestart({
      item: args.item,
      sessionStartedAt: args.sessionStartedAt ?? RENDERER_SESSION_STARTED_AT,
    })
  ) {
    return "wait";
  }
  return undefined;
}

/** Whether there is anything left for "Resume" to do. */
export function hasPausedUsageLimitWork(args: {
  pause: TaskUsageLimitPause | undefined;
  queuedTurnCount: number;
}): boolean {
  return Boolean(args.pause && (args.pause.stoppedTurn || args.queuedTurnCount > 0));
}

/** The earliest armed auto-resume among the paused tasks, or null. */
export function resolveNextUsageLimitAutoResume(
  pauses: UsageLimitPauseByTask,
): { taskId: string; at: number } | null {
  let next: { taskId: string; at: number } | null = null;
  for (const [taskId, pause] of Object.entries(pauses)) {
    const at = pause?.autoResumeAt;
    if (at == null || !Number.isFinite(at)) {
      continue;
    }
    if (!next || at < next.at) {
      next = { taskId, at };
    }
  }
  return next;
}

/** Tasks whose armed auto-resume time has come. */
export function listDueUsageLimitAutoResumes(args: {
  pauses: UsageLimitPauseByTask;
  now: number;
}): string[] {
  return Object.entries(args.pauses)
    .filter(([, pause]) => pause?.autoResumeAt != null && pause.autoResumeAt <= args.now)
    .map(([taskId]) => taskId);
}

/** The time to arm for "Resume at reset", or null when the reset is unknown. */
export function resolveUsageLimitAutoResumeAt(args: {
  resetsAt: number | null;
  now: number;
}): number | null {
  if (args.resetsAt == null || !Number.isFinite(args.resetsAt)) {
    return null;
  }
  return Math.max(args.resetsAt, args.now) + USAGE_LIMIT_RESUME_GRACE_MS;
}
