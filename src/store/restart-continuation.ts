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

export const RestartRecoverySchema = z.object({
  consumedTurnIds: z.array(z.string().min(1)).max(10000),
  automaticTimesByTask: z.record(z.string(), z.array(z.number().finite().nonnegative()).max(3)),
  stoppedTurnIds: z.array(z.string().min(1)).max(10000),
}).strict();
export type RestartRecovery = z.infer<typeof RestartRecoverySchema>;
export const emptyRestartRecovery = (): RestartRecovery => ({ consumedTurnIds: [], automaticTimesByTask: {}, stoppedTurnIds: [] });

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
  return "The previous turn was cut short when the app closed. Commands it started may or may not have finished. Check the current state before repeating any actions, then continue the interrupted work.";
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
