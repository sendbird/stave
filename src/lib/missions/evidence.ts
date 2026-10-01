/**
 * Evidence provenance. A report may cite a tool call or a command; the citation
 * distinguishes a provider result from a successful check of the same workspace
 * revision. Missing process status and missing revision remain unknown.
 */
import type {
  ActionResult,
  CompleteStageReport,
  StageEvidence,
  StageFacts,
} from "./domain";
import { revisionsMatch } from "./verification-contract";

export type EvidenceSource = "stave" | "provider" | "agent";

export interface ClassifiedEvidence extends StageEvidence {
  source: EvidenceSource;
  outcome?: "succeeded" | "failed" | "unknown";
  freshness?: "current" | "stale" | "unknown";
  exitCode?: number | null;
}

export const EVIDENCE_SOURCE_LABELS: Record<EvidenceSource, string> = {
  stave: "Verified by Stave",
  provider: "Provider result",
  agent: "Agent reported",
};

/** Observing an action does not verify a failed or no-longer-current check. */
export function isVerifiedEvidence(evidence: ClassifiedEvidence): boolean {
  return evidence.source === "stave" && evidence.outcome !== "failed" && evidence.freshness !== "unknown" && evidence.freshness !== "stale";
}

export function evidenceSourceLabel(evidence: ClassifiedEvidence): string {
  return evidence.source === "stave" && !isVerifiedEvidence(evidence) ? "Stave result" : EVIDENCE_SOURCE_LABELS[evidence.source];
}

function normalizeCommand(command: string) {
  return command.trim().replace(/\s+/g, " ");
}

function classify(evidence: StageEvidence, report: CompleteStageReport, facts: StageFacts | null): Pick<ClassifiedEvidence, "source" | "outcome" | "freshness" | "exitCode"> {
  if (!facts || !report.turnId || facts.currentTurnId !== report.turnId)
    return { source: "agent", freshness: "unknown" };
  if (evidence.kind === "check") {
    const run = facts.commands.find((candidate) => candidate.turnId === report.turnId && (
      evidence.toolCallId ? candidate.toolCallId === evidence.toolCallId : evidence.command && normalizeCommand(candidate.command) === normalizeCommand(evidence.command)
    ));
    if (!run) return { source: "agent", freshness: "unknown" };
    const freshness = revisionsMatch(run.sourceRevision, facts.workspaceRevision) ? "current" : run.sourceRevision?.status === "known" && facts.workspaceRevision?.status === "known" ? "stale" : "unknown";
    const succeeded = run.provenance && run.outcome === "succeeded" && run.exitCode === 0;
    return {
      source: succeeded && freshness === "current" ? "stave" : run.provenance || run.outcome === "failed" ? "provider" : "agent",
      outcome: run.outcome ?? "unknown", freshness, exitCode: run.provenance ? run.exitCode : null,
    };
  }
  const call = facts.toolCalls.find((candidate) => candidate.toolCallId === evidence.toolCallId && candidate.turnId === report.turnId);
  return call ? { source: "provider", outcome: call.ok ? "succeeded" : "failed", freshness: "unknown" } : { source: "agent", freshness: "unknown" };
}

export function classifyStageEvidence(
  report: CompleteStageReport,
  facts: StageFacts | null,
): ClassifiedEvidence[] {
  return report.evidence.map((evidence) => ({
    ...evidence,
    ...classify(evidence, report, facts),
  }));
}

/** Host actions record their origin; script checks also expose outcome and freshness. */
export function describeActionEvidence(result: ActionResult, facts?: StageFacts | null): ClassifiedEvidence {
  switch (result.type) {
    case "open-draft-pr":
      return {
        label: result.created
          ? `Opened draft PR #${result.prNumber}`
          : `Reused existing PR #${result.prNumber}`,
        kind: "link",
        ref: result.prUrl,
        source: "stave",
      };
    case "watch-checks":
      return {
        label:
          result.outcome === "no-checks"
            ? "No checks configured"
            : `${result.checks.length} ${result.checks.length === 1 ? "check" : "checks"} passed`,
        kind: "check",
        source: "stave",
      };
    case "mark-pr-ready":
      return {
        label: "Marked the pull request ready for review",
        kind: "link",
        ref: result.prUrl,
        source: "stave",
      };
    case "run-script":
      return {
        ...(result.url ? { label: `Ran “${result.scriptId}”`, kind: "link" as const, ref: result.url } : { label: `Ran “${result.scriptId}” (exit ${result.exitCode})`, kind: "check" as const }),
        source: "stave", exitCode: result.exitCode,
        outcome: result.exitCode === 0 ? "succeeded" : "failed",
        freshness: revisionsMatch(result.verification?.sourceRevision, result.verification?.completedRevision) && revisionsMatch(result.verification?.sourceRevision, facts?.workspaceRevision) ? "current" : result.verification?.sourceRevision.status === "known" && result.verification.completedRevision.status === "known" && facts?.workspaceRevision?.status === "known" ? "stale" : "unknown",
      };
  }
}
