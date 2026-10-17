import { REVIEW_AGENT_ID } from "../agents/review-before-done";
import { unmetInheritedWorkspaceChecks } from "./acceptance";
import { collectAcceptanceCriteria } from "./briefing";
import { currentStageRecord, type AgentRunAggregate } from "./domain";
import { revisionsMatch } from "./verification-contract";

/** A successful review can finish only when the final repair stage has no work or checks left. */
export function canFinishAfterReview(aggregate: AgentRunAggregate): boolean {
  const { agentRun } = aggregate;
  const current = agentRun.workflow.stages[agentRun.currentStageIndex];
  const next = agentRun.workflow.stages[agentRun.currentStageIndex + 1];
  if (agentRun.currentStageIndex !== agentRun.workflow.stages.length - 2 ||
      current?.kind !== "ai" || current.agentConfigId !== REVIEW_AGENT_ID || !current.pinCommit ||
      next?.kind !== "ai" || !next.skipIfReviewPassed || next.agentConfigId ||
      next.acceptanceCriteria?.some((criterion) => criterion.required !== false)) return false;
  const record = currentStageRecord(aggregate);
  return record.report?.outcome === "complete" && record.report.reviewVerdict === "passed" &&
    revisionsMatch(record.report.workspaceRevision, record.facts?.workspaceRevision) &&
    unmetInheritedWorkspaceChecks(aggregate, record) === null &&
    collectAcceptanceCriteria(aggregate, true).every((criterion) => criterion.required === false || criterion.status === "met");
}
