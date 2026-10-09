import {
  classifyTaskStatus,
  type FleetTaskStatus,
} from "@/lib/fleet/task-status";
import {
  compareWorkAttention,
  rankWorkAttention,
  type WorkAttentionRank,
} from "@/lib/fleet/work-attention-order";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import type { TaskAgent } from "@/store/agent-assignments-store";
import type { ChatMessage, Task } from "@/types/chat";

/** One agent that currently has work running or waiting for the user. */
export interface AgentWork {
  agentConfigId: string;
  agentName: string;
  /** The agent's colour, so its avatar matches the Agents surface. */
  agentAppearance?: TaskAgent["agentAppearance"];
  /** Tasks of this agent that are running, waiting for the user, or failed. */
  count: number;
  /** True when at least one of those tasks needs the user (waiting or failed). */
  needsYou: boolean;
}

type WorkTask = Pick<Task, "id" | "archivedAt" | "updatedAt">;

const EMPTY_MESSAGES: ChatMessage[] = [];

/**
 * The agents whose tasks are at work or need the user right now, grouped by
 * agent and ordered by each agent's most urgent task under the shared Work
 * queue rule (`work-attention-order.ts`): an agent with a task in
 * `action-required` (waiting on you, or failed) comes before one that is only
 * running, and ties go to the most recently updated task. Pure so the sidebar
 * can memoize it outside a zustand selector. Only tasks with loaded runtime
 * state count; cold workspace summaries have no messages or turn state, so they
 * are simply absent.
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
  const byAgent = new Map<string, { work: AgentWork; rank: WorkAttentionRank }>();

  for (const task of args.tasks) {
    const agent = args.byTaskId[task.id];
    if (!agent) {
      continue;
    }
    const status: FleetTaskStatus = classifyTaskStatus({
      task,
      messages: args.messagesByTask[task.id] ?? EMPTY_MESSAGES,
      activeTurnId: args.activeTurnIdsByTask[task.id] ?? null,
      activity: args.providerTurnActivityByTask[task.id] ?? null,
    });
    const rank = rankWorkAttention({ status, activityAt: task.updatedAt });
    // Idle and in-review work is nothing to do right now.
    if (rank.lane !== "action-required" && rank.lane !== "in-progress") {
      continue;
    }
    const needsYou = rank.lane === "action-required";
    const existing = byAgent.get(agent.agentConfigId);
    if (existing) {
      existing.work.count += 1;
      existing.work.needsYou = existing.work.needsYou || needsYou;
      if (compareWorkAttention(rank, existing.rank) < 0) existing.rank = rank;
    } else {
      byAgent.set(agent.agentConfigId, {
        work: {
          agentConfigId: agent.agentConfigId,
          agentName: agent.agentName,
          ...(agent.agentAppearance ? { agentAppearance: agent.agentAppearance } : {}),
          count: 1,
          needsYou,
        },
        rank,
      });
    }
  }

  const all = [...byAgent.values()]
    .sort((left, right) => compareWorkAttention(left.rank, right.rank))
    .map((entry) => entry.work);
  return { agents: all.slice(0, args.limit), total: all.length };
}
