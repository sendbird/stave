import { REVIEW_AGENT_ID } from "../agents/review-before-done";
import { unmetInheritedWorkspaceChecks } from "./acceptance";
import { collectAcceptanceCriteria } from "./briefing";
import { currentStageRecord, type AgentRun, type AgentRunAggregate } from "./domain";
import { admittedWorkspaceScripts, latestWorkspaceScriptResults } from "./workspace-check";
import { revisionsMatch } from "./verification-contract";

/** Completed reviews a "Review before done" run gets: the first one and one re-review of its fix. */
export const MAX_REVIEW_ROUNDS = 2;

/**
 * The review stage to return to after the final repair stage changed the work
 * its Reviewer asked changes to: the Reviewer checks the fix once, so the run
 * ends on a revision an agent that did not write it reviewed. A fix the agent
 * reviewed itself is still its own claim. Null when the repair changed nothing
 * or the run already used its review rounds; then the run finishes as before.
 */
export function reReviewStageIndex(aggregate: AgentRunAggregate): number | null {
  const { agentRun } = aggregate;
  const index = agentRun.currentStageIndex;
  const repair = agentRun.workflow.stages[index];
  const review = agentRun.workflow.stages[index - 1];
  if (index !== agentRun.workflow.stages.length - 1 ||
      repair?.kind !== "ai" || !repair.skipIfReviewPassed || repair.agentConfigId ||
      review?.kind !== "ai" || review.agentConfigId !== REVIEW_AGENT_ID || !review.pinCommit) return null;
  const reviews = aggregate.stages.filter((record) => record.stageId === review.id && record.report?.outcome === "complete");
  const latest = reviews.at(-1);
  if (reviews.length >= MAX_REVIEW_ROUNDS || latest?.report?.outcome !== "complete" || latest.report.reviewVerdict !== "changes-requested") return null;
  const facts = currentStageRecord(aggregate).facts;
  const changed = facts?.changedPathsTruncated === true || (facts?.changedPaths?.length ?? 0) > 0 ||
    (facts?.workspaceRevision?.status === "known" && latest.report.workspaceRevision?.status === "known" &&
      !revisionsMatch(latest.report.workspaceRevision, facts.workspaceRevision));
  return changed ? index - 1 : null;
}

/** Facts available when the report is recorded, before end-of-turn policy runs. */
export function describeStageReportReceipt(aggregate: AgentRunAggregate): string {
  const { agentRun, stages } = aggregate;
  const current = currentStageRecord(aggregate);
  const revision = current.report?.outcome === "complete" ? current.report.workspaceRevision : undefined;
  const definitions = admittedWorkspaceScripts(agentRun.workflow);
  const passed = latestWorkspaceScriptResults(current).filter((check) =>
    check.exitCode === 0 && revisionsMatch(check.verification.sourceRevision, revision) &&
    revisionsMatch(check.verification.completedRevision, revision) &&
    definitions.some((entry) => entry.scriptId === check.scriptId && entry.definitionHash === check.definitionHash));
  const stage = agentRun.workflow.stages[agentRun.currentStageIndex];
  const reviewStage = stage?.kind === "ai" && stage.skipIfReviewPassed
    ? agentRun.workflow.stages[agentRun.currentStageIndex - 1] : stage;
  const reviews = reviewStage?.kind === "ai" && reviewStage.agentConfigId === REVIEW_AGENT_ID && reviewStage.pinCommit
    ? stages.filter((record) => record.stageId === reviewStage.id && record.report?.outcome === "complete" && record.report.reviewVerdict)
    : [];
  const review = reviews.at(-1);
  const lines = ["Recorded. The host checks the cited evidence and chooses the next step after this turn ends. No transition is scheduled by this receipt."];
  if (passed.length && revision?.status === "known") {
    lines.push(`Host checks passed on ${revision.cleanCommit ? "commit " + revision.cleanCommit : "workspace revision " + revision.revision}: ${JSON.stringify(passed.map((check) => check.scriptId))}.`);
  } else {
    lines.push("No matching host script pass for this stage's report revision. Cite direct checks separately.");
  }
  if (review?.report?.outcome === "complete") {
    lines.push(`Latest independent review report: ${review.report.reviewVerdict}; pinned commit: ${review.startHeadSha ?? "unknown"}.`);
    if (stage?.kind === "ai" && stage.skipIfReviewPassed && reviews.length >= MAX_REVIEW_ROUNDS) {
      lines.push("The automatic review limit has been reached. No further independent review is scheduled.");
    }
  }
  return lines.join(" ");
}

/** What the re-review checks: the fix since the reviewed commit, against the earlier findings. */
export function reReviewFeedback(aggregate: AgentRunAggregate): string {
  const reviewIndex = aggregate.agentRun.currentStageIndex - 1;
  const reviewId = aggregate.agentRun.workflow.stages[reviewIndex]?.id;
  const latest = aggregate.stages.filter((record) => record.stageId === reviewId).at(-1);
  const findings = latest?.report?.outcome === "complete" ? latest.report.summary : "";
  // i18n-ignore: model-facing stage feedback
  return [
    `Re-review of the fix only. Review the commits made after ${latest?.startHeadSha ?? "the commit you reviewed before"} up to the pinned commit:`,
    "confirm each earlier finding is resolved at its cause and the fix adds no defect. Do not re-review unchanged work.",
    findings ? `Earlier review: ${findings.slice(0, 1_500)}` : "",
  ].filter(Boolean).join(" ");
}

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
  if (!mayFinishUnchangedWork(aggregate.agentRun)) return false;
  const record = currentStageRecord(aggregate);
  const facts = record.facts;
  return record.report?.outcome === "complete" && Boolean(record.startHeadSha) &&
    facts?.changedPaths?.length === 0 && facts.changedPathsTruncated !== true &&
    // The facts read the workspace as the report left it.
    revisionsMatch(record.report.workspaceRevision, facts.workspaceRevision) &&
    unmetInheritedWorkspaceChecks(aggregate, record) === null &&
    collectAcceptanceCriteria(aggregate, true).every((criterion) => criterion.required === false || criterion.status === "met");
}

/**
 * Whether the current stage is one whose unchanged work may finish the run
 * (`canFinishUnchangedWork`), from the workflow alone: an AI stage followed by
 * an independent review that allows it and the final repair. The host reads
 * the workspace revision at such a stage's report, which the check compares.
 */
export function mayFinishUnchangedWork(agentRun: Pick<AgentRun, "workflow" | "currentStageIndex">): boolean {
  const index = agentRun.currentStageIndex;
  const current = agentRun.workflow.stages[index];
  const review = agentRun.workflow.stages[index + 1];
  const repair = agentRun.workflow.stages[index + 2];
  return index === agentRun.workflow.stages.length - 3 && current?.kind === "ai" &&
    review?.kind === "ai" && review.agentConfigId === REVIEW_AGENT_ID && review.skipIfWorkUnchanged === true &&
    repair?.kind === "ai" && repair.skipIfReviewPassed === true && !repair.agentConfigId &&
    ![review, repair].some((stage) => stage.acceptanceCriteria?.some((criterion) => criterion.required !== false));
}
