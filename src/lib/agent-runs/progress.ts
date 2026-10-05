import type { ChatMessage } from "@/types/chat";
import type { AgentRunDetail } from "./api";
import type { StagePlan } from "./domain";
import { agentRunStoredPlan } from "./agent-run-status";
import { extractLatestPlan } from "./facts";
import { isActiveAgentRunState } from "./domain";
export { describeRunPlan } from "./plan-progress";

/** Run events include user replies; prompt marks cover a turn before its link arrives. */
export function agentRunMessages(detail: AgentRunDetail, messages: readonly ChatMessage[]): ChatMessage[] {
  const turnIds = new Set(detail.events.flatMap((event) =>
    (event.kind === "turn-linked" || event.kind === "user-turn") && typeof event.detail.turnId === "string"
      ? [event.detail.turnId] : []));
  let belongs = false;
  for (const message of messages) {
    if (message.role === "user" && !message.steeredIntoTurnId) {
      belongs = message.agentRunPrompt?.agentRunId === detail.agentRun.id;
    }
    // A live user reply has no supervisor prompt or event yet. Its persisted
    // start time ties it to the run, including after restart, without pulling
    // in ordinary chat after the run ended.
    if (message.turnId && (belongs || agentRunIncludesTime(detail, message.startedAt))) turnIds.add(message.turnId);
  }
  return messages.filter((message) => Boolean(message.turnId && turnIds.has(message.turnId)));
}

/** Durable delegations have creation times but no parent turn id. */
export function agentRunIncludesTime(detail: AgentRunDetail, timestamp: string | undefined): boolean {
  if (!timestamp) return false;
  const time = Date.parse(timestamp);
  return time >= Date.parse(detail.agentRun.createdAt) &&
    (isActiveAgentRunState(detail.agentRun.state) || time <= Date.parse(
      detail.report?.endedAt ?? detail.events.reduce((endedAt, event) => event.kind === "agent-run-ended" ? event.createdAt : endedAt, detail.agentRun.updatedAt)));
}

export function resolveAgentRunPlan(detail: AgentRunDetail, messages: readonly ChatMessage[]): StagePlan | null {
  if (detail.agentRun.workflow.stages.length !== 1) return null;
  const scoped = agentRunMessages(detail, messages);
  const plan = extractLatestPlan({ messages: scoped, turnIds: new Set(scoped.flatMap((m) => m.turnId ? [m.turnId] : [])) });
  return plan ?? agentRunStoredPlan(detail);
}
