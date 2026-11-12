import { REVIEW_AGENT_ID } from "../agents/review-before-done";
import { tarsExecutionCriteria } from "./continuation";
import type { AgentRunUsage } from "@/lib/agent-runs/usage";
import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { latestStageRecord, type AgentRunStageRecord } from "@/lib/agent-runs/domain";
import { classifyStageEvidence, isVerifiedEvidence, type ClassifiedEvidence, type EvidenceSource } from "@/lib/agent-runs/evidence";
import type { AgentRunReport, AgentRunReportLink } from "@/lib/agent-runs/report";
import { revisionsMatch, type WorkspaceRevision } from "@/lib/agent-runs/verification-contract";
import type { AcceptanceCriterionStatus } from "@/lib/workflows/stage-prompt";
import type { TarsResponsibility } from "./types";

/**
 * Whether the revision a piece of evidence was checked on is the one the run
 * ended on: `current`, `superseded` (both known, different), `finalUnknown`
 * (the checked revision is known, the final one is not) or `unknown`.
 */
export type TarsRevisionFreshness = "current" | "superseded" | "finalUnknown" | "unknown";

export interface TarsReportEvidence {
  evidence: ClassifiedEvidence;
  source: EvidenceSource;
  /** Stave saw it pass on an unchanged workspace (`isVerifiedEvidence`). */
  verified: boolean;
  /** The stage that reported it. */
  stageTitle: string;
  /** The workspace revision it was checked on, shortened; null when the host did not know it. */
  revision: string | null;
  freshness: TarsRevisionFreshness;
}

/** `notReported`: a criterion Tars delegated that the run never reported on. */
export type TarsCriterionStatus = AcceptanceCriterionStatus | "notReported";

/**
 * What decided a criterion's status: the agent's report in a stage, or a
 * check Stave ran (a stave-check criterion, or an action stage's script) with
 * its result. Within a stage a Stave check overrides the report, as
 * `collectAcceptanceCriteria` merges them; a later stage overrides an earlier.
 */
export type TarsCriterionSource =
  | { kind: "agent"; stageTitle: string; revision: string | null; freshness: TarsRevisionFreshness }
  | { kind: "check"; stageTitle: string; name: string; /** Null when the check has not run. */ exitCode: number | null;
    revision: string | null; freshness: TarsRevisionFreshness }
  | { kind: "none" };

export interface TarsReportCriterion {
  text: string;
  required: boolean;
  status: TarsCriterionStatus;
  source: TarsCriterionSource;
}

/** The evidence one stage reported, kept with its stage: it is not tied to a single criterion. */
export interface TarsReportEvidenceGroup {
  stageId: string;
  stageTitle: string;
  evidence: TarsReportEvidence[];
}

/**
 * The result report of one responsibility. `frozen`: the run ended and the
 * host built its report; nothing in it moves afterwards. `pending`: the run
 * has not ended, so there is no report yet. `unavailable`: no run was read.
 */
export interface TarsReportModel {
  state: "frozen" | "pending" | "unavailable";
  /** When the run ended; the report shows what was true then. */
  frozenAt: string | null;
  outcome: AgentRunReport["outcome"] | null;
  /** The run's own words for a stop or cancel, as written. */
  reason: string | null;
  /** Final recorded stage summary, with full stage text available in the detail. */
  summary: string | null;
  summaries: Array<{ stageId: string; title: string; text: string }>;
  criteria: TarsReportCriterion[];
  unmet: TarsReportCriterion[];
  leftBehind: string[];
  links: AgentRunReportLink[];
  /** Each stage's reported evidence, in workflow order; stages without any are left out. */
  evidenceGroups: TarsReportEvidenceGroup[];
  /** The revision the run ended on, shortened. */
  finalRevision: string | null;
  /** What the run spent: the frozen report's usage, else the live run's; null when the host read none. */
  usage: AgentRunUsage | null;
}

const SHORT_REVISION = 8;

function shortRevision(revision: WorkspaceRevision | undefined) {
  return revision?.status === "known" ? revision.revision.slice(0, SHORT_REVISION) : null;
}

export function tarsRevisionFreshness(checked: WorkspaceRevision | undefined, final: WorkspaceRevision | undefined): TarsRevisionFreshness {
  if (revisionsMatch(checked, final)) return "current";
  if (checked?.status !== "known") return "unknown";
  return final?.status === "known" ? "superseded" : "finalUnknown";
}

function normalize(command: string) {
  return command.trim().replace(/\s+/g, " ");
}

/**
 * The revision a piece of evidence rests on: a host check's completed
 * revision, a cited command's source revision, otherwise the revision the
 * host captured when the stage reported.
 */
function evidenceRevision(evidence: ClassifiedEvidence, record: AgentRunStageRecord | undefined): WorkspaceRevision | undefined {
  const facts = record?.facts;
  if (evidence.scriptId) {
    const check = [...(facts?.workspaceScripts ?? [])].reverse().find((candidate) => candidate.scriptId === evidence.scriptId);
    if (check) return check.verification.completedRevision;
  }
  if (evidence.kind === "check" && facts) {
    const run = facts.commands.find((candidate) => evidence.toolCallId ? candidate.toolCallId === evidence.toolCallId
      : evidence.command !== undefined && normalize(candidate.command) === normalize(evidence.command));
    if (run?.sourceRevision) return run.sourceRevision;
  }
  return record?.report?.outcome === "complete" ? record.report.workspaceRevision : undefined;
}

/** The revision the run ended on: the furthest stage it reached that the host read. */
function finalRevisionOf(detail: AgentRunDetail): WorkspaceRevision | undefined {
  const stages = detail.agentRun.workflow.stages;
  for (let index = stages.length - 1; index >= 0; index -= 1) {
    const record = latestStageRecord(detail.stages, stages[index]!.id);
    const revision = record?.facts?.workspaceRevision ?? (record?.report?.outcome === "complete" ? record.report.workspaceRevision : undefined);
    if (revision) return revision;
  }
  return undefined;
}

const same = (a: string, b: string) => a.trim() === b.trim();

/** What decided a criterion's status, scanning back from the furthest stage as the report's merge resolved it. */
function criterionSource(detail: AgentRunDetail, text: string, final: WorkspaceRevision | undefined): TarsCriterionSource {
  const stages = detail.agentRun.workflow.stages;
  const at = (revision: WorkspaceRevision | undefined) => ({ revision: shortRevision(revision), freshness: tarsRevisionFreshness(revision, final) });
  for (let index = stages.length - 1; index >= 0; index -= 1) {
    const stage = stages[index]!;
    const record = latestStageRecord(detail.stages, stage.id);
    if (!record) continue;
    const declared = (stage.acceptanceCriteria ?? []).find((criterion) => same(criterion.text, text));
    if (stage.kind === "ai" && declared && "verification" in declared && declared.verification === "stave-check") {
      const ids = new Set(declared.scriptIds ?? []);
      const check = [...(record.facts?.workspaceScripts ?? [])].reverse().find((candidate) => !ids.size || ids.has(candidate.scriptId));
      return { kind: "check", stageTitle: stage.title, name: [...ids].join(", ") || check?.scriptId || stage.title, exitCode: check?.exitCode ?? null,
        ...at(check?.verification.completedRevision) };
    }
    const action = record.facts?.action;
    if (stage.kind === "action" && declared && action?.type === "run-script")
      return { kind: "check", stageTitle: stage.title, name: action.scriptId, exitCode: action.exitCode, ...at(action.verification?.completedRevision) };
    const report = record.report?.outcome === "complete" ? record.report : null;
    if (report?.acceptanceCriteria?.some((criterion) => same(criterion.text, text)))
      return { kind: "agent", stageTitle: stage.title, ...at(report.workspaceRevision) };
  }
  return { kind: "none" };
}

/**
 * The result's headline: the last summary of a stage that did the work. A
 * review that passed is often the last stage that ran (its fix stage is
 * skipped), but its words describe the review, which the report shows as its
 * own verdict; only a run with nothing else falls back to it.
 */
function resultSummary(detail: AgentRunDetail, stages: readonly { stageId: string; summary?: string | null }[]): string | null {
  const reviewer = new Set(detail.agentRun.workflow.stages.flatMap((stage) => stage.kind === "ai" && stage.agentConfigId === REVIEW_AGENT_ID ? [stage.id] : []));
  const written = [...stages].reverse().filter((stage) => stage.summary?.trim());
  return (written.find((stage) => !reviewer.has(stage.stageId)) ?? written[0])?.summary ?? null;
}

/**
 * Projects the run's frozen report for the result report screen. Each
 * criterion carries its status and what decided it (the agent's report in a
 * stage, or a Stave check with its result and revision); the stages' evidence
 * stays grouped by the stage that reported it. The report never mixes in live
 * data: an unended run has no report, only its delegated criteria.
 */
export function projectTarsReport(row: Pick<TarsResponsibility, "acceptanceCriteria" | "agentRunId" | "continuation">, detail: AgentRunDetail | undefined): TarsReportModel {
  const executionCriteria = detail && row.agentRunId !== detail.agentRun.id
    ? [...new Set(detail.agentRun.workflow.stages.flatMap((stage) => stage.kind === "ai" ? (stage.acceptanceCriteria ?? []).map((item) => item.text) : []))]
    : tarsExecutionCriteria(row);
  const delegated = executionCriteria.map((text): TarsReportCriterion => ({ text, required: true, status: "notReported", source: { kind: "none" } }));
  const report = detail?.report ?? null;
  if (!detail || !report) {
    return { state: detail ? "pending" : "unavailable", frozenAt: null, outcome: null, reason: null, summary: null, summaries: [], criteria: delegated,
      unmet: delegated, leftBehind: [], links: [], evidenceGroups: [], finalRevision: detail ? shortRevision(finalRevisionOf(detail)) : null,
      usage: detail?.usage ?? null };
  }
  const final = finalRevisionOf(detail);
  const reported = report.acceptanceCriteria.map((criterion): TarsReportCriterion => ({
    text: criterion.text, required: criterion.required !== false, status: criterion.status, source: criterionSource(detail, criterion.text, final),
  }));
  // A delegated criterion the report left out is still owed: it reads as not reported, never as met.
  const missing = delegated.filter((criterion) => !reported.some((item) => same(item.text, criterion.text)));
  const criteria = [...reported, ...missing];
  const evidenceGroups = report.stages.flatMap((stage): TarsReportEvidenceGroup[] => {
    if (!stage.evidence.length) return [];
    const record = latestStageRecord(detail.stages, stage.stageId);
    return [{ stageId: stage.stageId, stageTitle: stage.title, evidence: stage.evidence.map((evidence) => {
      const revision = evidenceRevision(evidence, record);
      return { evidence, source: evidence.source, verified: isVerifiedEvidence(evidence), stageTitle: stage.title,
        revision: shortRevision(revision), freshness: tarsRevisionFreshness(revision, final) };
    }) }];
  });
  return {
    state: "frozen", frozenAt: report.endedAt, outcome: report.outcome, reason: report.reason,
    summary: resultSummary(detail, report.stages),
    summaries: report.stages.flatMap((stage) => stage.summary?.trim() ? [{ stageId: stage.stageId, title: stage.title, text: stage.summary }] : []),
    criteria, unmet: criteria.filter((criterion) => criterion.status !== "met"),
    leftBehind: report.leftBehind, links: report.links, evidenceGroups, finalRevision: shortRevision(final),
    usage: report.usage ?? detail.usage ?? null,
  };
}

/** The independent review of a responsibility's run: the reviewer stage's latest attempt. */
export interface TarsReviewModel {
  stageId: string;
  title: string;
  attempts: number;
  status: AgentRunStageRecord["status"];
  /** Null until the reviewer reported a verdict. */
  verdict: "passed" | "changes-requested" | null;
  summary: string | null;
  /** What the reviewer found, with its reason; the reviewer's own words. */
  findings: Array<{ decision: string; reason: string }>;
  /** Why the reviewer could not review, when it blocked. */
  blocked: string | null;
  evidence: TarsReportEvidence[];
  revision: string | null;
  /** Whether the reviewed revision is the one the run ended (or now stands) on. */
  freshness: TarsRevisionFreshness;
}

/** The workflow stage the reviewer agent runs, by its agent, as the host verifies it (`hasStaveVerifiedOutcome`). */
export function tarsReviewStageId(detail: Pick<AgentRunDetail, "agentRun">) {
  return detail.agentRun.workflow.stages.find((stage) => stage.kind === "ai" && stage.agentConfigId === "reviewer")?.id ?? null;
}

/** Null when the run has no reviewer stage or the reviewer has not started. */
export function projectTarsReview(detail: AgentRunDetail | undefined): TarsReviewModel | null {
  if (!detail) return null;
  const stageId = tarsReviewStageId(detail);
  const record = stageId ? latestStageRecord(detail.stages, stageId) : undefined;
  if (!stageId || !record) return null;
  const stage = detail.agentRun.workflow.stages.find((candidate) => candidate.id === stageId)!;
  const complete = record.report?.outcome === "complete" ? record.report : null;
  const final = finalRevisionOf(detail);
  // An ended run's report froze the evidence; before that the review stands as the host recorded it.
  const frozen = detail.report ? detail.report.stages.find((candidate) => candidate.stageId === stageId)?.evidence ?? []
    : classifyStageEvidence(complete, record.facts ?? null);
  return {
    stageId, title: stage.title, attempts: detail.stages.filter((candidate) => candidate.stageId === stageId).length, status: record.status,
    verdict: complete?.reviewVerdict ?? null, summary: complete?.summary ?? null, findings: complete?.decisions ?? [],
    blocked: record.report?.outcome === "blocked" ? record.report.missing : null,
    evidence: frozen.map((evidence) => {
      const revision = evidenceRevision(evidence, record);
      return { evidence, source: evidence.source, verified: isVerifiedEvidence(evidence), stageTitle: stage.title,
        revision: shortRevision(revision), freshness: tarsRevisionFreshness(revision, final) };
    }),
    revision: shortRevision(complete?.workspaceRevision), freshness: tarsRevisionFreshness(complete?.workspaceRevision, final),
  };
}
