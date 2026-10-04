import type { ChatMessage } from "@/types/chat";
import type { AgentRunDetail } from "./api";
import type { StagePlan } from "./domain";
import { agentRunStoredPlan } from "./agent-run-status";
import { extractLatestPlan } from "./facts";

/** Scope by persisted run prompts, not today's selected agent or a clock. */
export function agentRunMessages(detail: AgentRunDetail, messages: readonly ChatMessage[]): ChatMessage[] {
  const turnIds = new Set<string>();
  let belongs = false;
  for (const message of messages) {
    if (message.role === "user" && !message.steeredIntoTurnId) {
      belongs = message.agentRunPrompt?.agentRunId === detail.agentRun.id;
    }
    if (belongs && message.turnId) turnIds.add(message.turnId);
  }
  return messages.filter((message) => message.turnId && turnIds.has(message.turnId));
}

export function resolveAgentRunPlan(detail: AgentRunDetail, messages: readonly ChatMessage[]): StagePlan | null {
  if (detail.agentRun.workflow.stages.length !== 1) return null;
  const scoped = agentRunMessages(detail, messages);
  const plan = extractLatestPlan({ messages: scoped, turnIds: new Set(scoped.flatMap((m) => m.turnId ? [m.turnId] : [])) });
  return plan ?? agentRunStoredPlan(detail);
}

export function describeRunPlan(plan: StagePlan | null): string {
  if (!plan?.items.length) return "Planning…";
  const done = plan.items.filter((item) => item.status === "completed").length;
  const current = plan.items.find((item) => item.status === "in_progress");
  return `Plan ${done}/${plan.items.length}${current ? ` · Now: ${current.content}` : ""}`;
}
