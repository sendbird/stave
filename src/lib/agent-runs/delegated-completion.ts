import type { AgentRunDetail } from "./api";
import { latestStageRecord } from "./domain";
import type { AgentRunReport } from "./report";

export interface DelegatedAgentRunIdentity {
  agentRunId: string;
  workspaceId: string;
  taskId: string;
}

export type DelegatedAgentCompletion =
  | { kind: "unknown"; reason: "unavailable" | "identity-mismatch" | "report-unavailable" | "report-mismatch" }
  | { kind: "running" }
  | { kind: "waiting"; reason: "paused" | "blocked" | "stuck" | "awaiting-sign-off" }
  | { kind: "completed"; report: AgentRunReport }
  | { kind: "cancelled" | "stopped"; report: AgentRunReport | null };

/**
 * Read-only completion contract for the supervised delegation adapter.
 * It does not dispatch, admit continuation, or settle ledger rows. The caller
 * must also fence its own delegation execution before applying this result.
 * Turn terminal receipts alone never establish assignment acceptance.
 */
export function readDelegatedAgentCompletion(args: {
  expected: DelegatedAgentRunIdentity;
  detail: AgentRunDetail | null;
}): DelegatedAgentCompletion {
  const { detail, expected } = args;
  if (!detail) return { kind: "unknown", reason: "unavailable" };
  const { agentRun, report } = detail;
  if (agentRun.id !== expected.agentRunId || agentRun.workspaceId !== expected.workspaceId ||
      agentRun.leadTaskId !== expected.taskId) {
    return { kind: "unknown", reason: "identity-mismatch" };
  }
  if (agentRun.state === "completed") {
    if (!report) return { kind: "unknown", reason: "report-unavailable" };
    if (report.agentRunId !== agentRun.id || report.outcome !== "completed") {
      return { kind: "unknown", reason: "report-mismatch" };
    }
    return { kind: "completed", report };
  }
  if (agentRun.state === "cancelled" || agentRun.state === "stopped") {
    return { kind: agentRun.state,
      report: report?.agentRunId === agentRun.id && report.outcome === agentRun.state ? report : null };
  }
  if (agentRun.state === "paused") return { kind: "waiting", reason: "paused" };
  const stageId = agentRun.workflow.stages[agentRun.currentStageIndex]?.id;
  const stage = stageId ? latestStageRecord(detail.stages.filter(record => record.agentRunId === agentRun.id), stageId) : undefined;
  if (stage?.status === "blocked" || stage?.status === "stuck" || stage?.status === "awaiting-sign-off") {
    return { kind: "waiting", reason: stage.status };
  }
  return { kind: "running" };
}
