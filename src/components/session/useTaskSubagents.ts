import { useMemo } from "react";
import { selectTaskSubagents } from "@/lib/delegation/subagent-summary";
import { useAppStore } from "@/store/app.store";
import type { ChatMessage } from "@/types/chat";
import { useDelegatedTasks } from "./useDelegatedTasks";
import { listAgents } from "@/lib/agents/library";

const EMPTY_MESSAGES: ChatMessage[] = [];

export function useTaskSubagents(taskId: string, enabled = true) {
  const messages = useAppStore((state) => state.messagesByTask[taskId] ?? EMPTY_MESSAGES);
  const graph = useAppStore((state) => state.providerTurnActivityByTask[taskId]?.workGraph ?? state.retainedTurnActivityByTask[taskId]?.snapshot.workGraph ?? null);
  const listing = useDelegatedTasks({ parentTaskId: taskId, enabled });
  const customAgents = useAppStore((state) => state.settings.customAgents);
  return useMemo(() => {
    const names = new Map(listAgents({ custom: customAgents }).map((agent) => [agent.id, agent.name]));
    return selectTaskSubagents({ messages, workGraph: graph, delegatedTasks: listing.children }).map((row) => {
      const child = listing.children.find((child) => child.delegationKey === row.ref.delegationKey);
      const name = child?.agentConfigId ? names.get(child.agentConfigId) : null;
      return name ? { ...row, title: name } : row;
    });
  }, [messages, graph, listing.children, customAgents]);
}
