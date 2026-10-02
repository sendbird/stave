import {
  classifyTaskStatus,
  type FleetTaskStatus,
} from "@/lib/fleet/task-status";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import type { TaskAgent } from "@/store/agent-assignments-store";
import type { ChatMessage, Task } from "@/types/chat";

/** One agent that currently has work running or waiting for the user. */
export interface AgentWork {
  agentConfigId: string;
  agentName: string;
  /** The agent's colour, so its avatar matches the Agents surface. */
  agentAppearance?: TaskAgent["agentAppearance"];
  /** Tasks of this agent that are running or waiting for the user. */
  count: number;
  /** True when at least one of those tasks is waiting on the user. */
  needsYou: boolean;
}

type WorkTask = Pick<Task, "id" | "archivedAt" | "updatedAt">;

const EMPTY_MESSAGES: ChatMessage[] = [];

function isRunningOrWaiting(status: FleetTaskStatus): boolean {
  return (
    status === "running" ||
    status === "waiting-input" ||
    status === "waiting-approval"
  );
}

/**
 * The agents whose tasks are running or waiting on the user right now, newest
 * task first, grouped by agent. Pure so the sidebar can memoize it outside a
 * zustand selector. Only tasks with loaded runtime state count; cold workspace
 * summaries have no messages or turn state, so they are simply absent.
 */
export function collectAgentsWithWork(args: {
  byTaskId: Record<string, TaskAgent>;
  tasks: readonly WorkTask[];
  messagesByTask: Record<string, ChatMessage[]>;
  activeTurnIdsByTask: Record<string, string | undefined>;
  providerTurnActivityByTask: Record<
    string,
    ProviderTurnActivitySnapshot | undefined
  >;
  limit: number;
}): { agents: AgentWork[]; total: number } {
  const byAgent = new Map<string, AgentWork>();
  const order: string[] = [];

  for (const task of args.tasks) {
    const agent = args.byTaskId[task.id];
    if (!agent) {
      continue;
    }
    const status = classifyTaskStatus({
      task,
      messages: args.messagesByTask[task.id] ?? EMPTY_MESSAGES,
      activeTurnId: args.activeTurnIdsByTask[task.id] ?? null,
      activity: args.providerTurnActivityByTask[task.id] ?? null,
    });
    if (!isRunningOrWaiting(status)) {
      continue;
    }
    const needsYou =
      status === "waiting-input" || status === "waiting-approval";
    const existing = byAgent.get(agent.agentConfigId);
    if (existing) {
      existing.count += 1;
      existing.needsYou = existing.needsYou || needsYou;
    } else {
      byAgent.set(agent.agentConfigId, {
        agentConfigId: agent.agentConfigId,
        agentName: agent.agentName,
        ...(agent.agentAppearance ? { agentAppearance: agent.agentAppearance } : {}),
        count: 1,
        needsYou,
      });
      order.push(agent.agentConfigId);
    }
  }

  const all = order.map((id) => byAgent.get(id)!);
  return { agents: all.slice(0, args.limit), total: all.length };
}
