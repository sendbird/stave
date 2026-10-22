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

/** Same stage and attempt. */
function sameStage(left: StageIdentity | undefined, right: StageIdentity): boolean {
  return left !== undefined && left.agentRunId === right.agentRunId && left.stageId === right.stageId && left.attempt === right.attempt;
}

/**
 * The stage a decision at a gate is about: walking back from the gate's
 * stage, the latest attempt that had run (it has a start commit) and ended by
 * `at`. A sign-off at Fix after Cause ran is about Cause, never Reproduce.
 */
function gateSubject(detail: AgentRunDetail, gateStageId: string, at: number): StageIdentity | undefined {
  const { stages } = detail.agentRun.workflow;
  for (let index = stages.findIndex((stage) => stage.id === gateStageId) - 1; index >= 0; index -= 1) {
    const ran = detail.stages
      .filter((record) => record.stageId === stages[index]!.id && record.startHeadSha && record.endedAt && Date.parse(record.endedAt) <= at)
      .sort((left, right) => right.attempt - left.attempt)[0];
    if (ran) return { agentRunId: detail.agentRun.id, stageId: ran.stageId, attempt: ran.attempt };
  }
  return undefined;
}

/** The gate a sign-off or request for changes was made at. */
function decisionGate(event: AgentRunDetail["events"][number]): string | undefined {
  const gate = event.kind === "sign-off" ? event.detail.stageId : event.kind === "changes-requested" ? event.detail.atStageId : undefined;
  return typeof gate === "string" ? gate : undefined;
}

/**
 * The sign-off decision Review shows for a stage and attempt. A sign-off is
 * asked at the gate of the stage after the reviewed one and is about the
 * latest stage that ran before it, so Sign off and Ask for changes show only
 * while the run waits at a gate about exactly this stage and attempt.
 * Afterwards the latest decision made at a gate about it says how it was
 * decided; a later stage's decision never shows on an earlier one.
 */
export function describeStageDecision(detail: AgentRunDetail | undefined, reviewed: StageIdentity): StageDecision {
  if (!detail || detail.agentRun.id !== reviewed.agentRunId) return { status: "none" };
  const { workflow, currentStageIndex, state } = detail.agentRun;
  const currentStage = workflow.stages[currentStageIndex];
  const current = currentStage ? latestStageRecord(detail.stages, currentStage.id) : undefined;
  if (state === "running" && current?.status === "awaiting-sign-off" && sameStage(gateSubject(detail, current.stageId, Number.POSITIVE_INFINITY), reviewed)) {
    return {
      status: "waiting",
      signOff: { agentRunId: detail.agentRun.id, stageId: current.stageId, attempt: current.attempt },
      canAskForChanges: workflow.stages.slice(0, currentStageIndex).some((stage) => stage.kind === "ai"),
    };
  }
  const decision = [...detail.events]
    .filter((event) => {
      const gate = decisionGate(event);
      return gate !== undefined && sameStage(gateSubject(detail, gate, Date.parse(event.createdAt)), reviewed);
    })
    .sort((left, right) => left.sequence - right.sequence)
    .at(-1);
  if (!decision) return { status: "none" };
  return decision.kind === "sign-off" ? { status: "signed-off", at: decision.createdAt } : { status: "changes-asked", at: decision.createdAt };
}
