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
  failures: Array<{
    scriptId: string;
    message: string;
    blocking: boolean;
    output?: string;
  }>;
  /** Epoch-ms the verifying turn completed. */
  completedAt: number;
}

/** Per-file verification status derived from failure output (Phase 2). */
export type FileVerificationStatus = "warn" | "fail";

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

/**
 * Map verification failures back to the changed files they reference.
 *
 * Generic + tool-agnostic: every common reporter (ESLint, tsc, vitest, bun
 * test, prettier) prints the offending path somewhere in its output, so an
 * absolute or relative path that *contains* the git-relative changed path is a
 * reliable match without per-tool parsers. A blocking failure marks a file
 * `fail`; a non-blocking failure marks it `warn` (unless already `fail`).
 * Files never referenced get no status and render no icon.
 */
export function deriveFileVerificationStatuses(args: {
  failures: Array<{ blocking: boolean; output?: string }>;
  changedPaths: string[];
}): Record<string, FileVerificationStatus> {
  const statuses: Record<string, FileVerificationStatus> = {};
  for (const failure of args.failures) {
    const output = failure.output;
    if (!output) {
      continue;
    }
    for (const path of args.changedPaths) {
      if (!path || !output.includes(path)) {
        continue;
      }
      if (failure.blocking) {
        statuses[path] = "fail";
      } else if (statuses[path] !== "fail") {
        statuses[path] = "warn";
      }
    }
  }
  return statuses;
}

/**
 * Max characters of a single failure's captured output included in a fix
 * prompt. Bounds the prompt size so a noisy reporter (e.g. a full test run)
 * can't blow past the model's context.
 */
export const VERIFICATION_FIX_OUTPUT_LIMIT = 4000;

/**
 * Truncate captured output to a bounded size, keeping the head (which usually
 * names the failing check/file) and the tail (which usually summarizes the
 * failures) and marking where the middle was cut.
 */
function boundFailureOutput(output: string, limit: number): string {
  if (output.length <= limit) {
    return output;
  }
  const head = Math.floor(limit * 0.4);
  const tail = limit - head;
  const removed = output.length - limit;
  return `${output.slice(0, head)}\n…[truncated ${removed} chars]…\n${output.slice(output.length - tail)}`;
}

export interface VerificationFixPromptOptions {
  /** Limit to a single failing check by `scriptId`; omit to include every failure. */
  scriptId?: string;
  /** Max characters of captured output per failure (defaults to {@link VERIFICATION_FIX_OUTPUT_LIMIT}). */
  outputLimit?: number;
}

/**
 * Build a follow-up turn prompt that asks the agent to fix verification
 * failures. Provider-agnostic plain text (works for Claude + Codex). Pure and
 * deterministic so it is unit-testable; it never submits anything — callers
 * submit it explicitly as the next turn. Returns an empty string when there is
 * nothing actionable to fix (no matching failure).
 */
export function buildVerificationFixPrompt(
  result: TurnVerificationResult,
  options: VerificationFixPromptOptions = {},
): string {
  const limit = options.outputLimit ?? VERIFICATION_FIX_OUTPUT_LIMIT;
  const failures = options.scriptId
    ? result.failures.filter((failure) => failure.scriptId === options.scriptId)
    : result.failures;
  if (failures.length === 0) {
    return "";
  }
  const intro =
    failures.length === 1
      ? `The \`${failures[0]?.scriptId}\` verification check failed after the last turn. Please fix it.`
      : `${failures.length} verification checks failed after the last turn. Please fix them.`;
  const blocks = failures.map((failure) => {
    const label = failure.blocking ? "blocking" : "warning";
    const header = `### ${failure.scriptId} (${label})`;
    const message = failure.message?.trim() ? `\n${failure.message.trim()}` : "";
    const output = failure.output?.trim()
      ? `\n\n\`\`\`\n${boundFailureOutput(failure.output.trim(), limit)}\n\`\`\``
      : "";
    return `${header}${message}${output}`;
  });
  const outro =
    "Make the smallest change that makes the check pass without weakening or skipping the check itself. The verification re-runs automatically after this turn.";
  return `${intro}\n\n${blocks.join("\n\n")}\n\n${outro}`;
}

/** Human-readable tooltip describing a turn verification result. */
export function describeTurnVerification(result: TurnVerificationResult): string {
  if (result.status === "pass") {
    return `Verification passed — ${result.executedEntries}/${result.totalEntries} checks`;
  }
  const names = result.failures.map((failure) => failure.scriptId).join(", ");
  const verb = result.status === "fail" ? "failed" : "reported warnings";
  return `Verification ${verb}: ${names}`;
}
