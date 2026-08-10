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

export const ChildTaskStopArgsSchema = z
  .object({
    parentTaskId: z.string().trim().min(1).max(150),
    delegationKey: ChildTaskDelegationKeySchema,
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();
export type ChildTaskStopArgs = z.infer<typeof ChildTaskStopArgsSchema>;

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
  "step-conflict",
  "workspace-unavailable",
]);
export type ChildTaskRejectionReason = z.infer<
  typeof ChildTaskRejectionReasonSchema
>;

export const ChildTaskDelegateResponseSchema = z
  .object({
    accepted: z.boolean(),
    duplicate: z.boolean(),
    reason: ChildTaskRejectionReasonSchema.nullable(),
    child: ChildTaskSummarySchema.nullable(),
  })
  .strict();
export type ChildTaskDelegateResponse = z.infer<
  typeof ChildTaskDelegateResponseSchema
>;

export const ChildTaskStopResponseSchema = z
  .object({
    accepted: z.boolean(),
    duplicate: z.boolean(),
    reason: ChildTaskRejectionReasonSchema.nullable(),
    child: ChildTaskSummarySchema.nullable(),
  })
  .strict();
export type ChildTaskStopResponse = z.infer<typeof ChildTaskStopResponseSchema>;

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

export function buildChildTaskPolicy(
  lifecycle: ChildTaskLifecycle,
): RunPolicy {
  return {
    maxAttempts: 3,
    timeoutMs: 86_400_000,
    maxTurns: lifecycle === "detached" ? 200 : 1,
    maxOutputBytes: 1_048_576,
    maxEvents: 4_096,
  };
}

export function resolveChildTaskLifecycle(policy: RunPolicy): ChildTaskLifecycle {
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
