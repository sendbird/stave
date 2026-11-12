import type { TarsResponsibility } from "./types";

/** Original delegation stays immutable; each continued run owns only its new scope. */
export function tarsExecutionCriteria(row: Pick<TarsResponsibility, "acceptanceCriteria" | "agentRunId" | "continuation">): string[] {
  if (!row.continuation) return row.acceptanceCriteria;
  return row.agentRunId === row.continuation.previousRunId ? row.continuation.previousCriteria
    // i18n-ignore: model-facing criterion; exact request is the run assignment
    : ["Implement and verify the complete follow-up request in this task, preserving existing work."];
}

export function tarsExecutionScope(row: TarsResponsibility, pending = false): TarsResponsibility {
  if (!row.continuation) return row;
  if (!pending && row.agentRunId === row.continuation.previousRunId)
    return { ...row, instruction: row.continuation.previousInstruction, acceptanceCriteria: row.continuation.previousCriteria };
  return { ...row, instruction: row.continuation.text,
    // i18n-ignore: model-facing criterion; the exact request is the run assignment
    acceptanceCriteria: ["Implement and verify the complete follow-up request in this task, preserving existing work."],
  };
}

/** An execution can end while the user's delegated goal remains open. */
export function hasEndedTarsExecution(row: Pick<TarsResponsibility, "state">): boolean {
  return row.state === "completed" || row.state === "resultReady";
}

/** Stable run identities for reports and artifact navigation, newest first. */
export function tarsRunIds(row: Pick<TarsResponsibility, "agentRunId" | "previousRunIds">): string[] {
  return [...new Set([...(row.agentRunId ? [row.agentRunId] : []), ...[...(row.previousRunIds ?? [])].reverse()])];
}
