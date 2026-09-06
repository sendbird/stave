import type { WorkerExchange } from "./worker-exchanges";
import type { AdvisorTranscriptExchange } from "./advisor-transcript";
import type { AdvisorConsultLogEntry } from "@/lib/providers/advisor-consult-log";
import type { ChildTaskSummary } from "@/lib/runs/child-task";
import type {
  CollaborationHistoryExport,
  CollaborationHistoryPage,
} from "./history";

/** A user-exported snapshot, not a promise that transient logs are durable. */
export function buildCollaborationReport(args: {
  taskId: string;
  children: readonly ChildTaskSummary[];
  consults: readonly AdvisorConsultLogEntry[];
  now: string;
  workers?: readonly WorkerExchange[];
  recoveredAdvice?: readonly AdvisorTranscriptExchange[];
  historyPage?: CollaborationHistoryPage | null;
  historyExport?: CollaborationHistoryExport | null;
}): string {
  const exportCoverage = args.historyExport?.coverage;
  const coverage = args.historyPage?.coverage;
  const coverageDescription = exportCoverage
    ? exportCoverage.complete
      ? `Saved transcript export coverage: all ${exportCoverage.scannedMessageCount} saved messages.`
      : `Saved transcript export coverage: ${exportCoverage.scannedMessageCount} of ${exportCoverage.totalMessageCount} saved messages; incomplete because ${exportCoverage.incompleteReasons.join(", ")}.`
    : coverage
      ? coverage.scannedMessageCount
        ? `Saved transcript coverage: messages ${coverage.firstMessageNumber}–${coverage.lastMessageNumber} of ${coverage.totalMessageCount}.`
        : "Saved transcript coverage: this task has no saved messages."
      : "Saved transcript coverage: unavailable; saved history was not loaded.";
  const historyContentsDescription = exportCoverage
    ? `Saved-history export scope: ${exportCoverage.includedAdvisorExchangeCount} of ${exportCoverage.advisorExchangeCount} advisor exchange(s) and ${exportCoverage.includedWorkerExchangeCount} of ${exportCoverage.workerExchangeCount} worker exchange(s) from the scanned messages.`
    : args.historyPage
      ? `Selected saved slice contains ${args.historyPage.advisorExchangeCount} advisor exchange(s) and ${args.historyPage.workerExchangeCount} worker exchange(s); this report includes ${args.historyPage.advisors.length} and ${args.historyPage.workers.length}, respectively.`
      : "Selected saved slice contents: unavailable.";
  const lines = [
    "# Collaboration report",
    `Task: ${args.taskId}`,
    `Captured: ${args.now}`,
    "",
    "This snapshot contains the retained advisor exchanges, worker excerpts, and delegation ledger summaries available in the selected view. It is not a full transcript or a verification of completed work.",
    coverageDescription,
    historyContentsDescription,
    "",
    "## Delegated tasks",
  ];
  for (const child of args.children)
    lines.push(
      "",
      `### ${child.delegationKey}`,
      `- Task: ${child.childTaskId ?? "Not created"}`,
      `- Provider: ${child.providerId}`,
      `- Phase: ${child.phase}`,
      `- Detail: ${child.reason ?? "No additional detail"}`,
    );
  if (!args.children.length) lines.push("No delegated tasks recorded.");
  lines.push("", "## Advisor exchanges");
  for (const { snapshot: s } of args.consults)
    lines.push(
      "",
      `### ${s.advisorProviderId ?? "Advisor"} / ${s.advisorModel ?? "Default model"}`,
      `Outcome: ${s.outcome}`,
      "",
      "Question:",
      s.question ?? "No question captured.",
      "",
      "Answer:",
      s.advice ?? s.detail ?? "No answer captured.",
    );
  if (!args.consults.length) lines.push("No retained advisor exchanges.");
  for (const row of args.recoveredAdvice ?? [])
    lines.push(
      "",
      "### Saved advisor exchange",
      "Question:",
      row.question,
      "",
      "Answer:",
      row.answer,
    );
  lines.push(
    "",
    "## Worker exchanges",
    "Bounded excerpts from the current conversation and selected saved transcript slice; open the task for complete tool output.",
  );
  for (const row of args.workers ?? [])
    lines.push(
      "",
      `### ${row.model} · ${row.state}`,
      ...(row.requestedModel ? [`Requested model: ${row.requestedModel}`] : []),
      ...(row.resolvedModel ? [`Resolved model: ${row.resolvedModel}`] : []),
      ...(row.runtimeModel
        ? [`Runtime-reported model: ${row.runtimeModel}`]
        : []),
      ...(row.modelSource ? [`Resolution source: ${row.modelSource}`] : []),
      ...(row.modelRationale
        ? [`Recorded selection rationale: ${row.modelRationale}`]
        : []),
      "Assignment:",
      row.assignment,
      "",
      "Reported progress:",
      ...row.progress,
      "",
      "Returned result:",
      row.result || "No result returned.",
    );
  if (!args.workers?.length) {
    lines.push(
      "No worker exchanges in the current conversation or selected saved slice.",
    );
  }
  return lines.join("\n");
}
