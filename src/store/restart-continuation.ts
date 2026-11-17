import { z } from "zod";
import type { ChatMessage, Task } from "@/types/chat";
import type { ProviderId } from "@/lib/providers/provider.types";

export interface InterruptedTask {
  taskId: string;
  workspaceId: string;
  title: string;
  providerId: ProviderId;
  turnId: string;
}

const MAX_RECORDED_TURNS = 10_000;
/** An interruption older than this is no longer offered; its context has moved on. */
export const RESTART_CONTINUATION_MAX_AGE_MS = 24 * 60 * 60_000;
/** Recent messages read to decide whether a task waits on the user. */
export const RESTART_RECOVERY_MESSAGE_WINDOW = 20;

export const RestartRecoverySchema = z.object({
  /** Interruptions already decided: continued, dismissed or excluded. Never revisited. */
  consumedTurnIds: z.array(z.string().min(1)).max(MAX_RECORDED_TURNS),
  automaticTimesByTask: z.record(z.string(), z.array(z.number().finite().nonnegative()).max(3)),
  stoppedTurnIds: z.array(z.string().min(1)).max(MAX_RECORDED_TURNS),
  /** When recovery first ran on this install; turns started earlier are never offered. */
  since: z.number().finite().nonnegative(),
}).strict();
export type RestartRecovery = z.infer<typeof RestartRecoverySchema>;
export const emptyRestartRecovery = (since = Date.now()): RestartRecovery => ({ consumedTurnIds: [], automaticTimesByTask: {}, stoppedTurnIds: [], since });

const turnIds = (value: unknown) => (Array.isArray(value) ? value : [])
  .filter((item): item is string => typeof item === "string" && item.length > 0)
  .slice(-MAX_RECORDED_TURNS);
const times = (value: unknown) => (Array.isArray(value) ? value : [])
  .filter((item): item is number => typeof item === "number" && Number.isFinite(item) && item >= 0)
  .slice(-3);

/** Restore saved recovery records field by field; one malformed field keeps the others. */
export function normalizeRestartRecovery(value: unknown, now = Date.now()): RestartRecovery {
  const saved = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const automatic = saved.automaticTimesByTask && typeof saved.automaticTimesByTask === "object" && !Array.isArray(saved.automaticTimesByTask)
    ? Object.fromEntries(Object.entries(saved.automaticTimesByTask).flatMap(([taskId, list]) => Array.isArray(list) ? [[taskId, times(list)]] : []))
    : {};
  return {
    consumedTurnIds: turnIds(saved.consumedTurnIds),
    automaticTimesByTask: automatic,
    stoppedTurnIds: turnIds(saved.stoppedTurnIds),
    since: typeof saved.since === "number" && Number.isFinite(saved.since) && saved.since >= 0 ? saved.since : now,
  };
}

export function hasUnansweredInteraction(messages: readonly ChatMessage[]): boolean {
  return messages.some(message => message.parts.some(part =>
    (part.type === "approval" && (part.state === "approval-requested" || part.state === "approval-interrupted")) ||
    (part.type === "user_input" && (part.state === "input-requested" || part.state === "input-interrupted"))));
}

export function canRecoverOrdinaryTask(args: { task: Task; messages: readonly ChatMessage[]; stopped: boolean; owned: boolean }): boolean {
  return !args.stopped && !args.owned && !args.task.archivedAt && !args.task.parentTaskId &&
    args.task.controlMode !== "managed" && args.task.controlOwner !== "external" && !hasUnansweredInteraction(args.messages);
}

export function restartContinuationDecision(setting: "ask" | "automatically" | "never", times: readonly number[], now: number): "ask" | "continue" | "ignore" {
  if (setting === "never") return "ignore";
  if (setting === "automatically" && times.filter(time => time > now - 5 * 60_000 && time <= now).length < 3) return "continue";
  return "ask";
}

// Model-facing instruction, shared by every provider.
export function buildRestartContinuationPrompt(): string {
  return "The previous turn was cut short when the app closed. Commands it started may or may not have finished. Check the current state before repeating any actions, then continue the interrupted work. Before repeating an irreversible action (push, deploy, delete, send messages, run migrations), first check whether it already ran, and do not repeat it if it did.";
}

/** Last renderer-observed active turns, captured before shutdown settles runtimes. */
export const InterruptedTaskSchema = z.object({
  taskId: z.string().min(1), workspaceId: z.string().min(1), title: z.string(),
  providerId: z.enum(["claude-code", "codex", "cursor", "kiro", "opencode"]),
  turnId: z.string().min(1),
}).strict();

export function captureRestartPendingTasks(state: {
  activeWorkspaceId: string;
  tasks: Task[];
  activeTurnIdsByTask: Record<string, string | undefined>;
  workspaceRuntimeCacheById: Record<string, { tasks: Task[]; activeTurnIdsByTask: Record<string, string | undefined> }>;
  restartPendingTasks: InterruptedTask[];
  restartRecovery: RestartRecovery;
}): InterruptedTask[] {
  const pending = new Map((state.restartPendingTasks ?? []).map(item => [item.turnId, item]));
  const sessions = [[state.activeWorkspaceId, state], ...Object.entries(state.workspaceRuntimeCacheById ?? {})] as const;
  for (const [workspaceId, session] of sessions) {
    for (const task of session.tasks ?? []) {
      const turnId = session.activeTurnIdsByTask?.[task.id];
      if (turnId) pending.set(turnId, { taskId: task.id, title: task.title, workspaceId, providerId: task.provider, turnId });
    }
  }
  return [...pending.values()].filter(item => !state.restartRecovery?.consumedTurnIds.includes(item.turnId) && !state.restartRecovery?.stoppedTurnIds.includes(item.turnId));
}

/** Streaming updates must not turn a recovery snapshot into a persistence write. */
export function createRestartPendingTasksCapture() {
  let previous: InterruptedTask[] | undefined;
  return (state: Parameters<typeof captureRestartPendingTasks>[0]): InterruptedTask[] => {
    const next = captureRestartPendingTasks(state);
    if (previous && previous.length === next.length) {
      const priorByTurn = new Map(previous.map(item => [item.turnId, item]));
      const unchanged = next.every(item => {
        const prior = priorByTurn.get(item.turnId);
        return prior?.taskId === item.taskId && prior.workspaceId === item.workspaceId &&
          prior.title === item.title && prior.providerId === item.providerId;
      });
      if (unchanged) return previous;
    }
    previous = next;
    return next;
  };
}
