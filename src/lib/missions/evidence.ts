/**
 * Evidence provenance. A report may cite a tool call or a command; the citation
 * counts as "Verified by Stave" only when Stave observed that call succeed in
 * this stage's turns. Everything else is "Agent reported".
 */
import type {
  ActionResult,
  CompleteStageReport,
  StageEvidence,
  StageFacts,
} from "./domain";

export type EvidenceSource = "stave" | "agent";

export interface ClassifiedEvidence extends StageEvidence {
  source: EvidenceSource;
}

export const EVIDENCE_SOURCE_LABELS: Record<EvidenceSource, string> = {
  stave: "Verified by Stave",
  agent: "Agent reported",
};

function normalizeCommand(command: string) {
  return command.trim().replace(/\s+/g, " ");
}

function isVerified(evidence: StageEvidence, facts: StageFacts | null): boolean {
  if (!facts) return false;
  if (evidence.toolCallId) {
    const id = evidence.toolCallId;
    if (facts.toolCalls.some((call) => call.toolCallId === id && call.ok)) return true;
    if (facts.commands.some((run) => run.toolCallId === id && run.exitCode === 0)) {
      return true;
    }
  }
  if (evidence.command) {
    const cited = normalizeCommand(evidence.command);
    return facts.commands.some(
      (run) => run.exitCode === 0 && normalizeCommand(run.command) === cited,
    );
  }
  return false;
}

export function classifyStageEvidence(
  report: CompleteStageReport,
  facts: StageFacts | null,
): ClassifiedEvidence[] {
  return report.evidence.map((evidence) => ({
    ...evidence,
    source: isVerified(evidence, facts) ? "stave" : "agent",
  }));
}

/** A Stave action's own result is always verified: Stave performed it. */
export function describeActionEvidence(result: ActionResult): ClassifiedEvidence {
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
      return result.url
        ? { label: `Ran “${result.scriptId}”`, kind: "link", ref: result.url, source: "stave" }
        : { label: `Ran “${result.scriptId}” (exit ${result.exitCode})`, kind: "check", source: "stave" };
  }
}
