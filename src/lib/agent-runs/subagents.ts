import type { ChatMessage } from "@/types/chat";
import type { SelectDelegationExchangesArgs } from "@/lib/delegation/exchange";
import { selectTaskSubagents } from "@/lib/delegation/subagent-summary";
import type { AgentRunDetail } from "./api";
import { agentRunIncludesTime, agentRunMessages } from "./progress";

/** Task history stays available in Subagents; run surfaces show only this run. */
export function selectAgentRunSubagents(detail: AgentRunDetail, args: SelectDelegationExchangesArgs & { messages: readonly ChatMessage[] }) {
  const messages = agentRunMessages(detail, args.messages);
  const turnIds = new Set(messages.map((message) => message.turnId));
  return selectTaskSubagents({
    ...args,
    messages,
    workGraph: args.workGraph && turnIds.has(args.workGraph.turnId) ? args.workGraph : null,
    delegatedTasks: args.delegatedTasks?.filter((child) => agentRunIncludesTime(detail, child.createdAt)),
  });
}
