import type { AgentRunDetail } from "@/lib/agent-runs/api";
import { latestStageRecord } from "@/lib/agent-runs/domain";
import { projectTarsReview } from "./report-model";
import { tarsRunIds } from "./continuation";
import type { TarsResponsibility } from "./types";

/**
 * One artifact a responsibility produced, for the tray's Outputs section:
 * its result report once the run ended, its changes when the run recorded
 * changed files, its independent review once one reported, and the links the
 * run's report records (such as a pull request).
 */
export type TarsOutput = { agentRunId?: string } & (
  | { kind: "report"; responsibilityId: string; title: string; outcome: NonNullable<AgentRunDetail["report"]>["outcome"]; frozenAt: string }
  | { kind: "changes"; responsibilityId: string; title: string; /** Null when the run recorded changes without a usable count. */ files: number | null }
  | { kind: "review"; responsibilityId: string; title: string; verdict: "passed" | "changes-requested" | null }
  | { kind: "link"; responsibilityId: string; title: string; label: string; url: string }
  /** The draft pull request the host opened after the user confirmed it. */
  | { kind: "pullRequest"; responsibilityId: string; title: string; url: string; number: number | null });

/**
 * The files the run recorded as changed, by the latest attempt of each stage:
 * the union of their changed paths, or a diff count when no stage listed paths.
 * Zero only when every stage Stave read recorded no change; null (a change of
 * unknown size) when a list was truncated, or when a stage Stave read left its
 * change unknown, so an unknown diff never hides the changes.
 */
export function tarsRecordedChangeCount(detail: AgentRunDetail): number | null {
  const records = detail.agentRun.workflow.stages.flatMap((stage) => {
    const record = latestStageRecord(detail.stages, stage.id);
    return record?.facts ? [record.facts] : [];
  });
  const paths = new Set(records.flatMap((facts) => facts.changedPaths ?? []));
  if (paths.size) return records.some((facts) => facts.changedPathsTruncated) ? null : paths.size;
  const counted = Math.max(0, ...records.map((facts) => facts.diff?.filesChanged ?? 0));
  if (counted > 0) return counted;
  const unknown = records.some((facts) => facts.changedPathsTruncated || (facts.changedPaths === undefined && facts.diff === null));
  return unknown ? null : 0;
}

/** Newest work first; within one responsibility, report, changes, review, its draft pull request, then links. */
export function buildTarsOutputs(args: {
  responsibilities: readonly TarsResponsibility[];
  runs: Readonly<Record<string, AgentRunDetail>>;
  /** Ended work whose outputs were cleared or passed retention (`TarsSnapshot.cleared.outputs`); its outputs leave the list. */
  cleared?: readonly string[];
}): TarsOutput[] {
  const cleared = new Set(args.cleared ?? []);
  const rows = args.responsibilities.filter((row) => !cleared.has(row.id)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  return rows.flatMap((row): TarsOutput[] => {
    // Older publications may predate a saved Run identity; their link is still a result.
    if (!row.agentRunId && !(row.previousRunIds?.length) && row.publication?.state === "opened" && row.publication.url)
      return [{ kind: "pullRequest", responsibilityId: row.id, title: row.title, url: row.publication.url, number: row.publication.number }];
    return tarsRunIds(row).flatMap((agentRunId): TarsOutput[] => {
      const run = args.runs[agentRunId];
      const base = { responsibilityId: row.id, title: row.title, agentRunId };
      const publications = [row.publication, ...(row.publicationHistory ?? [])];
      const pullRequest: TarsOutput[] = publications.flatMap((publication) => publication?.state === "opened" && publication.url &&
        (publication.agentRunId === agentRunId || !publication.agentRunId && agentRunId === row.agentRunId)
        ? [{ kind: "pullRequest" as const, ...base, url: publication.url, number: publication.number }] : []);
      if (!run) return pullRequest;
      const outputs: TarsOutput[] = [];
      if (run.report) outputs.push({ kind: "report", ...base, outcome: run.report.outcome, frozenAt: run.report.endedAt });
      const files = tarsRecordedChangeCount(run);
      if (files !== 0) outputs.push({ kind: "changes", ...base, files });
      const review = projectTarsReview(run);
      if (review && (review.verdict || review.findings.length || review.blocked)) outputs.push({ kind: "review", ...base, verdict: review.verdict });
      outputs.push(...pullRequest);
      for (const link of run.report?.links ?? []) if (!pullRequest.some((entry) => entry.kind === "pullRequest" && entry.url === link.url))
        outputs.push({ kind: "link", ...base, label: link.label, url: link.url });
      return outputs;
    });
  });
}
