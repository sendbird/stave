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

/**
 * Work that changed no files finishes without its independent review and
 * final repair, when the review stage allows it (`skipIfWorkUnchanged`, set
 * by "Review before done" on behavior changes): an answer or research
 * reported in the run leaves no change for the Reviewer to check. Only when
 * Stave read the workspace after the report and found no path changed since
 * the stage began (no commit, no edit, no new file), and every required
 * criterion is met. Sign-offs are the caller's.
 */
export function canFinishUnchangedWork(aggregate: AgentRunAggregate): boolean {
  const { agentRun } = aggregate;
  const index = agentRun.currentStageIndex;
  const current = agentRun.workflow.stages[index];
  const review = agentRun.workflow.stages[index + 1];
  const repair = agentRun.workflow.stages[index + 2];
  if (index !== agentRun.workflow.stages.length - 3 || current?.kind !== "ai" ||
      review?.kind !== "ai" || review.agentConfigId !== REVIEW_AGENT_ID || !review.skipIfWorkUnchanged ||
      repair?.kind !== "ai" || !repair.skipIfReviewPassed || repair.agentConfigId ||
      [review, repair].some((stage) => stage.acceptanceCriteria?.some((criterion) => criterion.required !== false))) return false;
  const record = currentStageRecord(aggregate);
  const facts = record.facts;
  return record.report?.outcome === "complete" && Boolean(record.startHeadSha) &&
    facts?.changedPaths?.length === 0 && facts.changedPathsTruncated !== true &&
    // The facts read the workspace as the report left it.
    revisionsMatch(record.report.workspaceRevision, facts.workspaceRevision) &&
    unmetInheritedWorkspaceChecks(aggregate, record) === null &&
    collectAcceptanceCriteria(aggregate, true).every((criterion) => criterion.required === false || criterion.status === "met");
}
