import { agentRunClockRunning, agentRunElapsedMs, describeAgentRunChanges } from "@/lib/agent-runs/agent-run-status";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { latestStageRecord } from "@/lib/agent-runs/domain";
import type { TarsActivityNotice } from "./flow-model";
import { tarsRecordedChangeCount } from "./outputs-model";
import { projectTarsReport, projectTarsReview, type TarsReportCriterion, type TarsReportModel, type TarsReviewModel } from "./report-model";
import type { TarsResponsibility } from "./types";

/** How ended work reads in the conversation. `failed`: its run could not go on; `blocked`: it waits on something the user can change. */
export type TarsResultOutcome = "completed" | "blocked" | "failed";

/**
 * What backs one completion criterion, as the result card says it.
 * - `verifiedCheck`: met, and a Stave check for it passed on the revision the run ended on.
 * - `verifiedReview`: met, and the independent review passed on that revision.
 * - `reported`: met by the agent's report alone; nothing Stave ran or reviewed confirms it.
 * - `unmet`, `unverified`, `notReported`: the report's own status.
 */
export type TarsResultCriterionKind = "verifiedCheck" | "verifiedReview" | "reported" | "unmet" | "unverified" | "notReported";

export interface TarsResultCriterion {
  text: string;
  kind: TarsResultCriterionKind;
}

/** Only already classified, current check/review confirmations contribute; reports and unknowns never do. */
export function summarizeTarsResultCriteria(criteria: readonly TarsResultCriterion[]) {
  return {
    total: criteria.length,
    confirmed: criteria.filter(({ kind }) => kind === "verifiedCheck" || kind === "verifiedReview").length,
    reported: criteria.filter(({ kind }) => kind === "reported").length,
  };
}

export interface TarsResultChanges {
  /** Null when the run recorded changes without a usable count. */
  files: number | null;
  /** Lines added and removed, as Stave counted the work tree; null when it counted none. */
  lines: { insertions: number; deletions: number } | null;
}

export interface TarsResultReview {
  verdict: TarsReviewModel["verdict"];
  findings: number;
  /** The reviewer could not review. */
  blocked: boolean;
}

/** Everything the conversation's result card shows about one ended piece of work; each part is null or empty when the run recorded none. */
export interface TarsResultModel {
  outcome: TarsResultOutcome;
  /** How long the run worked; null without a run, or while its clock still counts. */
  durationMs: number | null;
  /** Whether a run was read and has ended: `frozen` has a report to open. */
  report: TarsReportModel["state"];
  /** The frozen report's criteria; empty until the run ended. */
  criteria: TarsResultCriterion[];
  /**
   * The checks Stave itself saw pass on the revision the run ended on, by
   * name, once each. They back the result as a whole: no single criterion
   * reads as verified because of them.
   */
  staveChecks: string[];
  changes: TarsResultChanges | null;
  review: TarsResultReview | null;
  /** The last stage's own summary in the frozen report. */
  summary: string | null;
}

/**
 * A block is a failure when the run itself could not go on: a turn that could
 * not start, or a run that stopped for a reason other than unmet criteria
 * (unmet criteria are a result to read, not a breakdown).
 */
export function tarsResultOutcome(notice: Pick<TarsActivityNotice, "kind"> & { activity: Pick<TarsActivityNotice["activity"], "detailCode" | "detailParams"> }): TarsResultOutcome | null {
  if (notice.kind === "cancelled") return null;
  if (notice.kind === "completed") return "completed";
  const { detailCode, detailParams } = notice.activity;
  if (detailCode === "turnStartFailed") return "failed";
  return detailCode === "runStopped" && detailParams?.reason !== "acceptance-unmet" ? "failed" : "blocked";
}

/**
 * Whether the independent review stands for the ended result, by the host's
 * own rule (`hasStaveVerifiedOutcome`): the reviewer's latest attempt passed,
 * on the revision the run ended on, and started after any hand-back.
 */
function reviewVerifies(row: Pick<TarsResponsibility, "reverifyAfter">, detail: AgentRunDetail, review: TarsReviewModel | null) {
  if (!review || review.verdict !== "passed" || review.freshness !== "current") return false;
  if (!row.reverifyAfter) return true;
  const startedAt = latestStageRecord(detail.stages, review.stageId)?.startedAt;
  return Boolean(startedAt && Date.parse(startedAt) >= Date.parse(row.reverifyAfter));
}

/**
 * A met criterion reads as verified only by its own Stave check passing on the
 * final revision, or by a standing review; otherwise it is the agent's report.
 * A criterion a Stave check decides is never lifted by the review: a check
 * that did not pass there leaves it unverified.
 */
function criterionKind(criterion: TarsReportCriterion, reviewed: boolean): TarsResultCriterionKind {
  if (criterion.status !== "met") return criterion.status;
  const { source } = criterion;
  if (source.kind === "check") return source.exitCode === 0 && source.freshness === "current" ? "verifiedCheck" : "unverified";
  return reviewed ? "verifiedReview" : "reported";
}

/**
 * Projects ended work for the conversation's result card from what the side
 * views and the tray already read: the frozen report (`projectTarsReport`),
 * the independent review (`projectTarsReview`), the recorded changes
 * (`tarsRecordedChangeCount`) and the run's own clock. Nothing is live: an
 * unended run has no criteria statuses and no summary here.
 */
export function projectTarsResult(args: {
  outcome: TarsResultOutcome;
  row: Pick<TarsResponsibility, "acceptanceCriteria" | "agentRunId" | "reverifyAfter">;
  run: AgentRunDetail | undefined;
  /** For the duration of a run whose host reports active time. */
  now?: number;
}): TarsResultModel {
  const { outcome, row, run } = args;
  const report = projectTarsReport(row, run);
  if (!run) return { outcome, durationMs: null, report: report.state, criteria: [], staveChecks: [], changes: null, review: null, summary: null };
  const review = projectTarsReview(run);
  const reviewed = reviewVerifies(row, run, review);
  const files = tarsRecordedChangeCount(run);
  const lines = describeAgentRunChanges(run);
  return {
    outcome,
    durationMs: agentRunClockRunning(run) ? null : agentRunElapsedMs(run, args.now ?? Date.now()),
    report: report.state,
    criteria: report.state === "frozen" ? report.criteria.map((criterion) => ({ text: criterion.text, kind: criterionKind(criterion, reviewed) })) : [],
    staveChecks: [...new Set(report.evidenceGroups.flatMap((group) => group.evidence)
      .filter((item) => item.verified && item.freshness === "current")
      .map((item) => (item.evidence.scriptId ?? item.evidence.command ?? item.evidence.label).trim()).filter(Boolean))],
    changes: files === 0 ? null : { files, lines: lines ? { insertions: lines.insertions, deletions: lines.deletions } : null },
    review: review && (review.verdict || review.findings.length || review.blocked)
      ? { verdict: review.verdict, findings: review.findings.length, blocked: Boolean(review.blocked) } : null,
    summary: [...(run.report?.stages ?? [])].reverse().find((stage) => stage.summary)?.summary ?? null,
  };
}
