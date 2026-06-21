// ---------------------------------------------------------------------------
// Turn-level verification – derive a pass/warn/fail status from a hook run
// ---------------------------------------------------------------------------
//
// S1 Phase 1: after a `turn.completed` hook runs the project's verify actions
// (lint/format/test), we collapse the run summary into a single turn-level
// status surfaced as a badge in the Changes panel. No new backend is required
// beyond tagging each failure with whether its hook entry was `blocking`.

import type { WorkspaceScriptHookRunSummary } from "./types";

export type TurnVerificationStatus = "pass" | "warn" | "fail";

export interface TurnVerificationResult {
  workspaceId: string;
  taskId?: string;
  turnId?: string;
  status: TurnVerificationStatus;
  totalEntries: number;
  executedEntries: number;
  failures: Array<{ scriptId: string; message: string; blocking: boolean }>;
  /** Epoch-ms the verifying turn completed. */
  completedAt: number;
}

/**
 * Collapse a hook run summary into a single turn-level status.
 * - `pass` — every hook entry ran without failure.
 * - `fail` — at least one *blocking* hook entry failed (a hard stop).
 * - `warn` — only non-blocking entries failed (noise, not a hard stop).
 */
export function deriveTurnVerificationStatus(
  summary: WorkspaceScriptHookRunSummary,
): TurnVerificationStatus {
  if (summary.failures.length === 0) {
    return "pass";
  }
  if (summary.failures.some((failure) => failure.blocking)) {
    return "fail";
  }
  return "warn";
}

export function buildTurnVerificationResult(args: {
  workspaceId: string;
  taskId?: string;
  turnId?: string;
  summary: WorkspaceScriptHookRunSummary;
  completedAt: number;
}): TurnVerificationResult {
  return {
    workspaceId: args.workspaceId,
    taskId: args.taskId,
    turnId: args.turnId,
    status: deriveTurnVerificationStatus(args.summary),
    totalEntries: args.summary.totalEntries,
    executedEntries: args.summary.executedEntries,
    failures: args.summary.failures,
    completedAt: args.completedAt,
  };
}

export interface VerificationStatusVisual {
  label: string;
  /** Tailwind text-color class using existing semantic theme tokens. */
  iconClassName: string;
}

/**
 * Reuses the existing `success` / `warning` / `destructive` semantic tokens so
 * no new theme colors are introduced (light/dark + every built-in theme keep
 * working without edits).
 */
export const VERIFICATION_STATUS_VISUAL: Record<
  TurnVerificationStatus,
  VerificationStatusVisual
> = {
  pass: { label: "Verification passed", iconClassName: "text-success" },
  warn: { label: "Verification warnings", iconClassName: "text-warning" },
  fail: { label: "Verification failed", iconClassName: "text-destructive" },
};

/** Human-readable tooltip describing a turn verification result. */
export function describeTurnVerification(result: TurnVerificationResult): string {
  if (result.status === "pass") {
    return `Verification passed — ${result.executedEntries}/${result.totalEntries} checks`;
  }
  const names = result.failures.map((failure) => failure.scriptId).join(", ");
  const verb = result.status === "fail" ? "failed" : "reported warnings";
  return `Verification ${verb}: ${names}`;
}
