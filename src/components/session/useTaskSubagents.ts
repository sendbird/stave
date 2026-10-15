import { getAgentDisplayName } from "@/lib/agents/display";
import { useMemo } from "react";
import { selectAgentRunSubagents } from "@/lib/agent-runs/subagents";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { useDelegatedTasks } from "./useDelegatedTasks";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { DelegationExchange } from "@/lib/delegation/exchange";
import { listAgents } from "@/lib/agents/library";
import { selectDelegatedTaskBlockedKinds } from "@/lib/runs/delegated-task-view";

const EMPTY_MESSAGES: ChatMessage[] = [];

const EMPTY_ROWS: DelegationExchange[] = [];

export function useTaskSubagents(taskId: string, run: AgentRunDetail | null | undefined) {
  const enabled = Boolean(run);
  const workspaceId = run?.agentRun.workspaceId ?? "";
  const messages = useAppStore((state) => enabled ? state.messagesByTask[taskId] ?? state.workspaceRuntimeCacheById[workspaceId]?.messagesByTask[taskId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES);
  const graph = useAppStore((state) => enabled ? state.providerTurnActivityByTask[taskId]?.workGraph ?? state.retainedTurnActivityByTask[taskId]?.snapshot.workGraph ?? null : null);
  const listing = useDelegatedTasks({ parentTaskId: taskId, enabled });
  const customAgents = useAppStore((state) => enabled ? state.settings.customAgents : undefined);
  // The stable store array; the blocked kinds are derived below, never in the selector.
  const notifications = useAppStore((state) => state.notifications);
  return useMemo(() => {
    if (!run) return EMPTY_ROWS;
    const names = new Map(listAgents({ custom: customAgents ?? [] }).map((agent) => [agent.id, getAgentDisplayName(agent)]));
    const childBlockedByDelegationKey = selectDelegatedTaskBlockedKinds({ children: listing.children, notifications });
    return selectAgentRunSubagents(run, { messages, workGraph: graph, delegatedTasks: listing.children, childBlockedByDelegationKey }).map((row) => {
      const child = listing.children.find((child) => child.delegationKey === row.ref.delegationKey);
      const name = child?.agentConfigId ? names.get(child.agentConfigId) : null;
      return name ? { ...row, title: name } : row;
    });
  }, [run, messages, graph, listing.children, customAgents, notifications]);
}
