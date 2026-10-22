import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { latestStageRecord, type AgentRunStageRecord } from "@/lib/agent-runs/domain";

export type StageIdentity = { agentRunId: string; stageId: string; attempt: number };

/**
 * The stage Review shows for a run without one named: the latest stage that
 * started, walking back from the current one. A stage waiting for sign-off
 * has not started, so from a sign-off this is the stage the sign-off is about.
 */
export function stageToReview(detail: AgentRunDetail | undefined): StageIdentity | undefined {
  if (!detail) return undefined;
  const { stages } = detail.agentRun.workflow;
  for (let index = Math.min(detail.agentRun.currentStageIndex, stages.length - 1); index >= 0; index -= 1) {
    const record = latestStageRecord(detail.stages, stages[index]!.id);
    if (record?.startHeadSha) return { agentRunId: detail.agentRun.id, stageId: record.stageId, attempt: record.attempt };
  }
  return undefined;
}

export function findStageRecord(detail: AgentRunDetail | undefined, scope: StageIdentity): AgentRunStageRecord | undefined {
  return detail?.stages.find((record) => record.agentRunId === scope.agentRunId && record.stageId === scope.stageId && record.attempt === scope.attempt);
}

/** Where the decision on a reviewed stage stands. */
export type StageDecision =
  /** The run waits for sign-off after this stage: Sign off or Ask for changes. */
  | { status: "waiting"; signOff: StageIdentity; canAskForChanges: boolean }
  | { status: "signed-off"; at: string }
  | { status: "changes-asked"; at: string }
  /** No sign-off was asked for after this stage. */
  | { status: "none" };

/**
 * The sign-off decision Review shows for a stage. A sign-off is asked for by
 * the stage after the reviewed one; it waits while the run's current record
 * is awaiting sign-off past the reviewed stage. Afterwards the latest sign-off
 * or request for changes made after the stage ended says how it was decided.
 */
export function describeStageDecision(detail: AgentRunDetail | undefined, reviewed: StageIdentity): StageDecision {
  if (!detail || detail.agentRun.id !== reviewed.agentRunId) return { status: "none" };
  const { workflow, currentStageIndex, state } = detail.agentRun;
  const reviewedIndex = workflow.stages.findIndex((stage) => stage.id === reviewed.stageId);
  const currentStage = workflow.stages[currentStageIndex];
  const current = currentStage ? latestStageRecord(detail.stages, currentStage.id) : undefined;
  if (state === "running" && current?.status === "awaiting-sign-off" && reviewedIndex >= 0 && reviewedIndex < currentStageIndex) {
    return {
      status: "waiting",
      signOff: { agentRunId: detail.agentRun.id, stageId: current.stageId, attempt: current.attempt },
      canAskForChanges: workflow.stages.slice(0, currentStageIndex).some((stage) => stage.kind === "ai"),
    };
  }
  const ended = findStageRecord(detail, reviewed)?.endedAt;
  if (!ended) return { status: "none" };
  const decision = [...detail.events]
    .filter((event) => (event.kind === "sign-off" || event.kind === "changes-requested") && event.createdAt >= ended)
    .sort((left, right) => left.sequence - right.sequence)
    .at(-1);
  if (!decision) return { status: "none" };
  return decision.kind === "sign-off" ? { status: "signed-off", at: decision.createdAt } : { status: "changes-asked", at: decision.createdAt };
}
