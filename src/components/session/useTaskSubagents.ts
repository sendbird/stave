import { useMemo } from "react";
import { selectAgentRunSubagents } from "@/lib/agent-runs/subagents";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { useDelegatedTasks } from "./useDelegatedTasks";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import type { DelegationExchange } from "@/lib/delegation/exchange";
import { listAgents } from "@/lib/agents/library";

const EMPTY_MESSAGES: ChatMessage[] = [];

const EMPTY_ROWS: DelegationExchange[] = [];

export function useTaskSubagents(taskId: string, run: AgentRunDetail | null | undefined) {
  const enabled = Boolean(run);
  const workspaceId = run?.agentRun.workspaceId ?? "";
  const messages = useAppStore((state) => enabled ? state.messagesByTask[taskId] ?? state.workspaceRuntimeCacheById[workspaceId]?.messagesByTask[taskId] ?? EMPTY_MESSAGES : EMPTY_MESSAGES);
  const graph = useAppStore((state) => enabled ? state.providerTurnActivityByTask[taskId]?.workGraph ?? state.retainedTurnActivityByTask[taskId]?.snapshot.workGraph ?? null : null);
  const listing = useDelegatedTasks({ parentTaskId: taskId, enabled });
  const customAgents = useAppStore((state) => enabled ? state.settings.customAgents : undefined);
  return useMemo(() => {
    if (!run) return EMPTY_ROWS;
    const names = new Map(listAgents({ custom: customAgents ?? [] }).map((agent) => [agent.id, agent.name]));
    return selectAgentRunSubagents(run, { messages, workGraph: graph, delegatedTasks: listing.children }).map((row) => {
      const child = listing.children.find((child) => child.delegationKey === row.ref.delegationKey);
      const name = child?.agentConfigId ? names.get(child.agentConfigId) : null;
      return name ? { ...row, title: name } : row;
    });
  }, [run, messages, graph, listing.children, customAgents]);
}
