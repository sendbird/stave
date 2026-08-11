import { z } from "zod";
import {
  RunIdSchema,
  RunRecordSchema,
  RunStatusSchema,
  RunStepRecordSchema,
  type RunPolicy,
  type RunRecord,
  type RunStepRecord,
} from "./run-domain";

/**
 * Child tasks are the run ledger's second client. A delegation is one durable
 * Stave task created on the parent's behalf, possibly on the other provider,
 * with the ledger holding the bookkeeping the parent can trust: one run per
 * delegation, one step per child turn, receipts for every phase change.
 *
 * Everything in this module is pure so both the Electron main coordinator and
 * the renderer can share the vocabulary. Hashing and process access stay in
 * `electron/main/runs/child-task-coordinator.ts`.
 */

export const CHILD_TASK_RUN_KIND = "child-task" as const;
export const CHILD_TASK_STEP_KIND = "child-task-turn" as const;
export const CHILD_TASK_RUN_ID_PREFIX = "child-task";

export const CHILD_TASK_DEFAULT_CONCURRENCY_LIMIT = 3;
export const CHILD_TASK_MAX_CONCURRENCY_LIMIT = 16;
export const CHILD_TASK_LIST_LIMIT = 50;

/**
 * A child never inherits the parent's permissions, so the profile is required
 * and expressed in the vocabulary automations already use
 * (`AutomationPermissionMode`). No new synonym, no silent escalation.
 */
export const ChildTaskPermissionProfileSchema = z.enum([
  "auto",
  "guided",
  "manual",
]);
export type ChildTaskPermissionProfile = z.infer<
  typeof ChildTaskPermissionProfileSchema
>;

/**
 * `one-turn` closes the run when the child's first turn ends. `detached` parks
 * the run in `waiting` so the child task stays open for follow-up turns until
 * the parent stops it.
 */
export const ChildTaskLifecycleSchema = z.enum(["one-turn", "detached"]);
export type ChildTaskLifecycle = z.infer<typeof ChildTaskLifecycleSchema>;

export const ChildTaskWorkspaceStrategySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("same-workspace") }).strict(),
  z
    .object({
      mode: z.literal("new-worktree"),
      name: z.string().trim().min(1).max(120),
      fromBranch: z.string().trim().min(1).max(240).optional(),
    })
    .strict(),
]);
export type ChildTaskWorkspaceStrategy = z.infer<
  typeof ChildTaskWorkspaceStrategySchema
>;

export const ChildTaskDelegationKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(
    /^[A-Za-z0-9._-]+$/,
    "A delegation key may only contain letters, digits, dot, underscore and hyphen.",
  );

export const ChildTaskDelegateArgsSchema = z
  .object({
    projectPath: z.string().trim().min(1).max(4096),
    parentWorkspaceId: RunIdSchema,
    parentTaskId: z.string().trim().min(1).max(150),
    delegationKey: ChildTaskDelegationKeySchema,
    prompt: z.string().trim().min(1).max(100_000),
    title: z.string().trim().min(1).max(200).optional(),
    providerId: z.enum(["claude-code", "codex"]),
    model: z.string().trim().min(1).max(200).optional(),
    permissionProfile: ChildTaskPermissionProfileSchema,
    lifecycle: ChildTaskLifecycleSchema,
    workspace: ChildTaskWorkspaceStrategySchema,
    /**
     * Start a fresh attempt on a delegation that already ended without
     * succeeding. Without this a repeat call is a pure duplicate, which is what
     * makes the idempotency key safe to retry blindly.
     */
    retry: z.boolean().default(false),
  })
  .strict();
export type ChildTaskDelegateArgs = z.infer<typeof ChildTaskDelegateArgsSchema>;

export const ChildTaskListArgsSchema = z
  .object({
    parentTaskId: z.string().trim().min(1).max(150),
    includeFinished: z.boolean().default(true),
  })
  .strict();
export type ChildTaskListArgs = z.infer<typeof ChildTaskListArgsSchema>;

/**
 * The identity a control was rendered against. Every child-task control the
 * parent surface offers is prepared from a summary the user was looking at, so
 * the action carries that identity back and is refused when the delegation has
 * moved on in between — a stale click never lands on a child it did not mean.
 */
export const ChildTaskExpectedIdentitySchema = z
  .object({
    childTaskId: RunIdSchema,
    childWorkspaceId: RunIdSchema,
    attempt: z.number().int().min(0).max(10),
    phase: RunStatusSchema.optional(),
    childTurnId: RunIdSchema.nullable().optional(),
  })
  .strict();
export type ChildTaskExpectedIdentity = z.infer<
  typeof ChildTaskExpectedIdentitySchema
>;

export const ChildTaskStopArgsSchema = z
  .object({
    parentTaskId: z.string().trim().min(1).max(150),
    delegationKey: ChildTaskDelegationKeySchema,
    reason: z.string().trim().min(1).max(500).optional(),
    expected: ChildTaskExpectedIdentitySchema.optional(),
  })
  .strict();
export type ChildTaskStopArgs = z.infer<typeof ChildTaskStopArgsSchema>;

/**
 * One more turn on a child that is still open. A follow-up never inherits the
 * parent's permissions, so the posture is chosen by whoever sends it rather
 * than carried over from the original delegation.
 */
export const ChildTaskFollowUpArgsSchema = z
  .object({
    parentTaskId: z.string().trim().min(1).max(150),
    delegationKey: ChildTaskDelegationKeySchema,
    prompt: z.string().trim().min(1).max(100_000),
    permissionProfile: ChildTaskPermissionProfileSchema.default("guided"),
    expected: ChildTaskExpectedIdentitySchema,
  })
  .strict();
export type ChildTaskFollowUpArgs = z.infer<typeof ChildTaskFollowUpArgsSchema>;

/**
 * Release the delegation while leaving the child task alive. Stopping ends the
 * child's work; detaching only ends the parent's claim on it, so the child
 * carries on as an ordinary task nobody is delegating to any more.
 */
export const ChildTaskDetachArgsSchema = z
  .object({
    parentTaskId: z.string().trim().min(1).max(150),
    delegationKey: ChildTaskDelegationKeySchema,
    expected: ChildTaskExpectedIdentitySchema,
  })
  .strict();
export type ChildTaskDetachArgs = z.infer<typeof ChildTaskDetachArgsSchema>;

/**
 * A fresh attempt on a delegation that ended without succeeding. Provider,
 * lifecycle and workspace are read back from the delegation itself, so a retry
 * cannot quietly become a different delegation wearing the same key.
 *
 * The permission profile is optional on purpose: omitted, the retry keeps the
 * profile the delegation was originally created with. Sending one is an
 * explicit override.
 */
export const ChildTaskRetryArgsSchema = z
  .object({
    projectPath: z.string().trim().min(1).max(4096),
    parentWorkspaceId: RunIdSchema,
    parentTaskId: z.string().trim().min(1).max(150),
    delegationKey: ChildTaskDelegationKeySchema,
    prompt: z.string().trim().min(1).max(100_000),
    permissionProfile: ChildTaskPermissionProfileSchema.optional(),
    expected: ChildTaskExpectedIdentitySchema,
  })
  .strict();
export type ChildTaskRetryArgs = z.infer<typeof ChildTaskRetryArgsSchema>;

export const ChildTaskLinkArgsSchema = z
  .object({ childTaskId: RunIdSchema })
  .strict();
export type ChildTaskLinkArgs = z.infer<typeof ChildTaskLinkArgsSchema>;

export const CHILD_TASK_DETACHED_REASON =
  "Detached from the parent task; the child task keeps running on its own.";
export const CHILD_TASK_STOPPED_REASON = "Stopped from the parent task.";

/**
 * What the parent is allowed to learn about a child: who it is, what phase it
 * is in, and why it ended. Never the child's transcript.
 */
export const ChildTaskSummarySchema = z
  .object({
    runId: RunIdSchema,
    stepId: RunIdSchema,
    parentTaskId: z.string().trim().min(1).max(150),
    delegationKey: ChildTaskDelegationKeySchema,
    childTaskId: RunIdSchema,
    childWorkspaceId: RunIdSchema,
    childTurnId: RunIdSchema.nullable(),
    providerId: z.enum(["claude-code", "codex"]),
    lifecycle: ChildTaskLifecycleSchema,
    phase: RunStatusSchema,
    reason: z.string().max(1_000).nullable(),
    attempt: z.number().int().min(0).max(10),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
  })
  .strict();
export type ChildTaskSummary = z.infer<typeof ChildTaskSummarySchema>;

export const ChildTaskRejectionReasonSchema = z.enum([
  "already-active",
  "already-completed",
  "attempt-limit-reached",
  "cancelled",
  "concurrency-limit-reached",
  "input-mismatch",
  "invalid-ownership",
  "invalid-request",
  "invalid-state",
  "not-found",
  "run-conflict",
  "stale-execution",
  "stale-identity",
  "step-conflict",
  "workspace-unavailable",
]);
export type ChildTaskRejectionReason = z.infer<
  typeof ChildTaskRejectionReasonSchema
>;

/**
 * Every child-task action answers in the same shape, and a refusal always
 * carries a sentence the surface can show as-is. A control that fails silently
 * is indistinguishable from one that worked.
 */
export const ChildTaskActionResponseSchema = z
  .object({
    accepted: z.boolean(),
    duplicate: z.boolean(),
    reason: ChildTaskRejectionReasonSchema.nullable(),
    message: z.string().max(500).nullable().default(null),
    child: ChildTaskSummarySchema.nullable(),
  })
  .strict();
export type ChildTaskActionResponse = z.infer<
  typeof ChildTaskActionResponseSchema
>;

export const ChildTaskDelegateResponseSchema = ChildTaskActionResponseSchema;
export type ChildTaskDelegateResponse = ChildTaskActionResponse;

export const ChildTaskStopResponseSchema = ChildTaskActionResponseSchema;
export type ChildTaskStopResponse = ChildTaskActionResponse;

export const ChildTaskListSchema = z.array(ChildTaskSummarySchema);
export type ChildTaskList = z.infer<typeof ChildTaskListSchema>;

const ACTIVE_CHILD_PHASES = new Set(["pending", "running", "waiting"]);

export function isActiveChildTaskPhase(phase: ChildTaskSummary["phase"]) {
  return ACTIVE_CHILD_PHASES.has(phase);
}

/**
 * Delegation identity is derived, not allocated: the same
 * `(parentTaskId, delegationKey)` always names the same ledger row, so a
 * duplicate delegate call collides on the ledger's primary key instead of
 * racing to create a second child.
 *
 * The parent task id is known by every caller that reads these rows, so the
 * delegation key is recovered by stripping the prefix rather than by parsing.
 */
export function buildChildTaskRunId(args: {
  parentTaskId: string;
  delegationKey: string;
}) {
  return `${CHILD_TASK_RUN_ID_PREFIX}:${args.parentTaskId}:${args.delegationKey}`;
}

export function buildChildTaskStepId(runId: string) {
  return `${runId}:turn`;
}

export function extractChildTaskDelegationKey(args: {
  runId: string;
  parentTaskId: string;
}) {
  const prefix = `${CHILD_TASK_RUN_ID_PREFIX}:${args.parentTaskId}:`;
  return args.runId.startsWith(prefix) ? args.runId.slice(prefix.length) : null;
}

/**
 * A completed child step points at the child task, never at its output. The
 * parent follows the reference through the normal task surfaces if it wants the
 * conversation.
 */
export function buildChildTaskArtifactRef(args: {
  workspaceId: string;
  taskId: string;
  turnId: string | null;
}) {
  const base = `stave://workspace/${args.workspaceId}/task/${args.taskId}`;
  return args.turnId ? `${base}/turn/${args.turnId}` : base;
}

export function buildChildTaskPolicy(lifecycle: ChildTaskLifecycle): RunPolicy {
  return {
    maxAttempts: 3,
    timeoutMs: 86_400_000,
    maxTurns: lifecycle === "detached" ? 200 : 1,
    maxOutputBytes: 1_048_576,
    maxEvents: 4_096,
  };
}

export function resolveChildTaskLifecycle(
  policy: RunPolicy,
): ChildTaskLifecycle {
  return policy.maxTurns > 1 ? "detached" : "one-turn";
}

export function resolveChildTaskConcurrencyLimit(
  raw: string | number | undefined | null,
): number {
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
  if (
    typeof parsed !== "number" ||
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > CHILD_TASK_MAX_CONCURRENCY_LIMIT
  ) {
    return CHILD_TASK_DEFAULT_CONCURRENCY_LIMIT;
  }
  return parsed;
}

/**
 * Everything the ledger knows about one delegation, projected down to what the
 * parent may see. Returns null for rows that are not child-task rows so a
 * widened ledger can never leak a Compare Judge run into a child listing.
 */
export function toChildTaskSummary(args: {
  run: RunRecord;
  step: RunStepRecord;
}): ChildTaskSummary | null {
  const run = RunRecordSchema.parse(args.run);
  const step = RunStepRecordSchema.parse(args.step);
  if (run.kind !== CHILD_TASK_RUN_KIND || step.kind !== CHILD_TASK_STEP_KIND) {
    return null;
  }
  if (run.origin.kind !== "task" || !step.target) {
    return null;
  }
  const delegationKey = extractChildTaskDelegationKey({
    runId: run.id,
    parentTaskId: run.origin.id,
  });
  if (!delegationKey) {
    return null;
  }
  const parsed = ChildTaskSummarySchema.safeParse({
    runId: run.id,
    stepId: step.id,
    parentTaskId: run.origin.id,
    delegationKey,
    childTaskId: step.target.taskId,
    childWorkspaceId: step.target.workspaceId,
    childTurnId: step.target.turnId,
    providerId: step.target.providerId,
    lifecycle: resolveChildTaskLifecycle(run.policy),
    phase: step.status,
    reason: step.error ?? run.error,
    attempt: step.attempt,
    createdAt: run.createdAt,
    updatedAt: step.updatedAt,
    completedAt: step.completedAt,
  });
  return parsed.success ? parsed.data : null;
}

export type ChildTaskIdentityValidation =
  | { ok: true }
  | { ok: false; reason: ChildTaskRejectionReason; message: string };

/**
 * Compare the identity a control was rendered against with the delegation as it
 * stands now. This is the same contract the Fleet control plane applies to
 * remote task actions: an action prepared against an identity that has since
 * moved is refused with a reason, never applied to whatever is there instead.
 */
export function validateChildTaskIdentity(args: {
  expected: ChildTaskExpectedIdentity;
  child: ChildTaskSummary | null;
}): ChildTaskIdentityValidation {
  if (!args.child) {
    return {
      ok: false,
      reason: "not-found",
      message:
        "This delegation is no longer on the run ledger. Refresh the parent task.",
    };
  }
  if (
    args.child.childTaskId !== args.expected.childTaskId ||
    args.child.childWorkspaceId !== args.expected.childWorkspaceId
  ) {
    return {
      ok: false,
      reason: "stale-identity",
      message:
        "This delegation now points at a different child task. Refresh the parent task.",
    };
  }
  if (args.child.attempt !== args.expected.attempt) {
    return {
      ok: false,
      reason: "stale-identity",
      message:
        "The child was retried after this control was shown. Review the latest attempt.",
    };
  }
  if (args.expected.phase && args.child.phase !== args.expected.phase) {
    return {
      ok: false,
      reason: "stale-identity",
      message:
        "The child changed state before this action was sent. Review the latest child state.",
    };
  }
  if (
    args.expected.childTurnId !== undefined &&
    args.child.childTurnId !== args.expected.childTurnId
  ) {
    return {
      ok: false,
      reason: "stale-identity",
      message:
        "The child's turn changed before this action was sent. Review the latest child state.",
    };
  }
  return { ok: true };
}

const CHILD_TASK_REJECTION_MESSAGES: Record<ChildTaskRejectionReason, string> =
  {
    "already-active": "This child is already running.",
    "already-completed": "This delegation already finished.",
    "attempt-limit-reached":
      "This delegation has used every attempt it is allowed.",
    cancelled: "A stopped delegation cannot be started again.",
    "concurrency-limit-reached":
      "This task already has as many live children as it may run.",
    "input-mismatch":
      "This delegation key already names a child started from different instructions.",
    "invalid-ownership":
      "This task does not own the delegation it tried to act on.",
    "invalid-request": "This action was not understood.",
    "invalid-state": "The child is not in a state where this action applies.",
    "not-found":
      "This delegation is no longer on the run ledger. Refresh the parent task.",
    "run-conflict":
      "The delegation changed while this action was being applied.",
    "stale-execution":
      "The child moved on to another execution before this action was sent. Review the latest child state.",
    "stale-identity":
      "The child's identity changed before this action was sent. Review the latest child state.",
    "step-conflict":
      "The delegation changed while this action was being applied.",
    "workspace-unavailable":
      "The child's workspace could not be reached. Try again once it is available.",
  };

export function describeChildTaskRejection(reason: ChildTaskRejectionReason) {
  return CHILD_TASK_REJECTION_MESSAGES[reason];
}

/**
 * Which controls a child row may offer, derived from the delegation alone so
 * the parent surface and the coordinator never disagree about what is possible.
 */
export function resolveChildTaskControls(child: ChildTaskSummary) {
  const active = isActiveChildTaskPhase(child.phase);
  return {
    canFollowUp: child.lifecycle === "detached" && child.phase === "waiting",
    canStop: active,
    canDetach: active,
    canRetry:
      !active &&
      child.phase !== "completed" &&
      child.phase !== "cancelled" &&
      child.attempt < buildChildTaskPolicy(child.lifecycle).maxAttempts,
  };
}
