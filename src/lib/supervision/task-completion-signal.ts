/**
 * A delegated task's ledger row as the completion signal a supervisor reads.
 *
 * One mapping for both sides: the host's completion feed
 * (`electron/host-service/delegated-task-signals.ts`) builds its signals with
 * it, and a window that judges whether a wait should already have woken
 * (`src/lib/agent-runs/wait-liveness.ts`) builds the same signals, with the
 * same keys, from the rows it lists. Two copies would drift the first time
 * one learned a new phase.
 */
import { isActiveDelegatedTaskPhase, type DelegatedTaskSummary } from "@/lib/runs/delegated-task";
import { TaskCompletionStatusSchema, WAKE_UP_LIMITS, type TaskCompletionSignal } from "./wake-up-policy";

export function taskCompletionSignalOf(summary: DelegatedTaskSummary): TaskCompletionSignal | null {
  // `waiting` is an active phase, so a detached child that parked open
  // after its turn never appears here: only stopping or detaching the
  // delegation settles it into a terminal status. Documented in
  // docs/features/wake-ups.md — a completion wake-up observes
  // delegations that *end*, not detached children between turns.
  if (isActiveDelegatedTaskPhase(summary.phase)) return null;
  const status = TaskCompletionStatusSchema.safeParse(summary.phase);
  if (!status.success) return null;
  return {
    runId: summary.runId,
    stepId: summary.stepId,
    delegatedTaskId: summary.delegatedTaskId,
    providerId: summary.providerId,
    status: status.data,
    reason: summary.reason ? summary.reason.slice(0, WAKE_UP_LIMITS.maxReasonChars) : null,
    // A terminal step without a `completedAt` is a reconciled one; its
    // `updatedAt` is the instant it settled.
    completedAt: summary.completedAt ?? summary.updatedAt,
    // Part of the signal's identity: a retried attempt that settles
    // again must not be deduped against the first attempt's wake-up.
    attempt: summary.attempt,
  };
}
