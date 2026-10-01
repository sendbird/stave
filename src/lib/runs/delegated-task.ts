import { z } from "zod";
import {
  RunIdSchema,
  RunRecordSchema,
  RunStatusSchema,
  RunStepRecordSchema,
  type RunPolicy,
  type RunReceiptRecord,
  type RunRecord,
  type RunStepRecord,
} from "./run-domain";
import { DelegationAccessSchema, type DelegationAccess } from "./delegation-policy";

/**
 * Delegated tasks are the run ledger's second client. A delegation is one durable
 * Stave task created on the parent's behalf, possibly on the other provider,
 * with the ledger holding the bookkeeping the parent can trust: one run per
 * delegation, one step per child turn, receipts for every phase change.
 *
 * Everything in this module is pure so both the Electron main coordinator and
 * the renderer can share the vocabulary. Hashing and process access stay in
 * `electron/main/runs/delegated-task-coordinator.ts`.
 */

export const DELEGATED_TASK_RUN_KIND = "delegated-task" as const;
export const DELEGATED_TASK_STEP_KIND = "delegated-task-turn" as const;
export const DELEGATED_TASK_RUN_ID_PREFIX = "child-task";

export const DELEGATED_TASK_DEFAULT_CONCURRENCY_LIMIT = 3;
export const DELEGATED_TASK_MAX_CONCURRENCY_LIMIT = 16;
export const DELEGATED_TASK_LIST_LIMIT = 50;

/**
 * Omission inherits host-resolved user permissions. Explicit profiles only
 * restrict that policy; they cannot grant authority beyond the user settings.
 */
export const DelegatedTaskPermissionProfileSchema = z.enum([
  "inherit",
  "auto",
  "guided",
  "manual",
]);
export type DelegatedTaskPermissionProfile = z.infer<
  typeof DelegatedTaskPermissionProfileSchema
>;

/**
 * The access a delegation asks for. `inherit` is the parent's own policy for
 * the same provider (otherwise the target provider's user settings);
 * `read-only` never writes and never asks, so it may run beside other work in
 * the same workspace. Resolved per provider in `delegation-policy.ts`.
 */
export const DelegatedTaskAccessSchema = DelegationAccessSchema;
export type DelegatedTaskAccess = DelegationAccess;

/**
 * `one-turn` closes the run when the child's first turn ends. `detached` parks
 * the run in `waiting` so the delegated task stays open for follow-up turns until
 * the parent stops it.
 */
export const DelegatedTaskLifecycleSchema = z.enum(["one-turn", "detached"]);
export type DelegatedTaskLifecycle = z.infer<typeof DelegatedTaskLifecycleSchema>;

export const DelegatedTaskWorkspaceStrategySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("same-workspace") }).strict(),
  z
    .object({
      mode: z.literal("new-worktree"),
      name: z.string().trim().min(1).max(120),
      fromBranch: z.string().trim().min(1).max(240).optional(),
    })
    .strict(),
]);
export type DelegatedTaskWorkspaceStrategy = z.infer<
  typeof DelegatedTaskWorkspaceStrategySchema
>;

/**
 * The reasoning-effort tier a delegation may ask its child to run at. The
 * vocabulary is the shared provider union — `ultra` is Codex-only and Claude
 * has no such tier — and `buildDelegatedTaskRuntimeOptions` clamps a requested
 * tier to what the child's provider and model actually accept, stepping down
 * rather than rejecting, exactly as the Advisor's `resolveAdvisorEffort` does.
 */
export const DelegatedTaskEffortSchema = z.enum([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
]);
export type DelegatedTaskEffort = z.infer<typeof DelegatedTaskEffortSchema>;

export const DelegatedTaskDelegationKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(
    /^[A-Za-z0-9._-]+$/,
    "A delegation key may only contain letters, digits, dot, underscore and hyphen.",
  );

export const DelegateTaskArgsSchema = z
  .object({
    repositoryPath: z.string().trim().min(1).max(4096),
    parentWorkspaceId: RunIdSchema,
    parentTaskId: z.string().trim().min(1).max(150),
    delegationKey: DelegatedTaskDelegationKeySchema,
    prompt: z.string().trim().min(1).max(100_000),
    title: z.string().trim().min(1).max(200).optional(),
    providerId: z.enum(["claude-code", "codex"]),
    model: z.string().trim().min(1).max(200).optional(),
    effort: DelegatedTaskEffortSchema.optional(),
    permissionProfile: DelegatedTaskPermissionProfileSchema.optional(),
    /** Omitted means `inherit`. */
    access: DelegatedTaskAccessSchema.optional(),
    /**
     * Provenance only: a profile an older caller named that is no longer
     * applied. Recorded on the resolved policy; it never restricts or grants.
     */
    requestedPermissionProfile: DelegatedTaskPermissionProfileSchema.optional(),
    lifecycle: DelegatedTaskLifecycleSchema,
    workspace: DelegatedTaskWorkspaceStrategySchema,
    /**
     * Run the child as this saved agent: its instructions go ahead of the
     * prompt and the narrower permission of the request and the agent wins.
     * Refused when the agent is not a delegated task, not on the project's
     * Agents, or would run wider than the delegating task's own agent.
     */
    agentConfigId: z.string().trim().min(1).max(80).optional(),
    /**
     * The commit the child must find checked out, for work that is only
     * meaningful against one commit (a review). Same-workspace only; the child
     * does not start when the workspace HEAD is anything else.
     */
    expectedHead: z
      .string()
      .trim()
      .regex(/^[0-9a-f]{7,64}$/i, "expectedHead must be a hex commit id")
      .optional(),
    /**
     * Start a fresh attempt on a delegation that already ended without
     * succeeding. Without this a repeat call is a pure duplicate, which is what
     * makes the idempotency key safe to retry blindly.
     */
    retry: z.boolean().default(false),
  })
  .strict();
export type DelegateTaskArgs = z.infer<typeof DelegateTaskArgsSchema>;

/**
 * What `stave_delegate_task` accepts from a model. Everything a delegation can
 * infer is optional and filled by the coordinator's `delegateFromTool`: the
 * provider and effort from the parent's turn, a one-turn child in the same
 * workspace, and a key derived from the request. The permission choice is
 * `access` alone, so a model cannot pick a posture that prompts on every tool.
 * The coordinator validates the result again as `DelegateTaskArgs`.
 */
export const DelegateTaskToolInputSchema = z.object({
  repositoryPath: z
    .string()
    .min(1)
    .optional()
    .describe("Omit inside a Stave turn. Project root path that owns the parent workspace."),
  parentWorkspaceId: z
    .string()
    .min(1)
    .optional()
    .describe("Omit inside a Stave turn. Workspace id of the calling task."),
  parentTaskId: z
    .string()
    .min(1)
    .optional()
    .describe("Omit inside a Stave turn: the calling task is used, and any other id is refused."),
  prompt: z.string().min(1).describe("Prompt to run in the delegated task."),
  access: DelegatedTaskAccessSchema.optional().describe(
    "Use `read-only` for second opinions, reviews and research: the child cannot change files, runs in parallel with other work in this workspace, and needs no approvals. `inherit` (default) runs with this task's own permissions for the same provider, otherwise the target provider's user settings.",
  ),
  provider: z
    .enum(["claude-code", "codex"])
    .optional()
    .describe("Provider the child runs on. Defaults to this task's provider."),
  model: z.string().optional().describe("Optional model override for the child."),
  effort: DelegatedTaskEffortSchema.optional().describe(
    "Optional reasoning-effort tier. Defaults to this task's effort when the child runs on the same provider, otherwise the automation default (`medium`). Clamped to what the child's provider and model accept (`ultra` is Codex-only; Claude steps it down to `max`).",
  ),
  lifecycle: DelegatedTaskLifecycleSchema.optional().describe(
    "`one-turn` (default) finishes the delegation when the child's first turn ends. `detached` keeps the child open for follow-ups until it is stopped.",
  ),
  workspace: z
    .union([
      z.object({ mode: z.literal("same-workspace") }),
      z.object({
        mode: z.literal("new-worktree"),
        name: z.string().min(1).describe("Workspace name for the new worktree."),
        fromBranch: z.string().optional().describe("Base branch."),
      }),
    ])
    .optional()
    .describe(
      "Where the child runs. Defaults to the same workspace; use `new-worktree` for edits that must stay isolated.",
    ),
  title: z.string().optional().describe("Optional delegated task title."),
  delegationKey: z
    .string()
    .min(1)
    .optional()
    .describe(
      "Optional idempotency key, unique within the parent task (letters, digits, dot, underscore and hyphen). Omitted, one is derived from the provider, model and prompt, so sending the same call again returns the same child instead of starting a second one.",
    ),
  expectedHead: z
    .string()
    .optional()
    .describe(
      "Commit the child must find checked out (same-workspace only), for work that is about one commit such as a review. Not started when the workspace HEAD differs.",
    ),
  agentConfigId: z
    .string()
    .optional()
    .describe(
      "Run the child as this saved agent. Its instructions go ahead of the prompt and the narrower permission of this request and the agent wins. Refused when the agent is not usable as a delegated task, is not one of the project's agents, or would run wider than this task's own agent.",
    ),
  retry: z
    .boolean()
    .optional()
    .describe(
      "Start a new attempt when this delegation already ended without succeeding. Ignored while it is still running.",
    ),
  permissionProfile: DelegatedTaskPermissionProfileSchema.optional().describe(
    "Deprecated and ignored; use `access`.",
  ),
});
export type DelegateTaskToolInput = z.infer<typeof DelegateTaskToolInputSchema>;

export const DelegatedTaskListArgsSchema = z
  .object({
    parentTaskId: z.string().trim().min(1).max(150),
    includeFinished: z.boolean().default(true),
  })
  .strict();
export type DelegatedTaskListArgs = z.infer<typeof DelegatedTaskListArgsSchema>;

/**
 * The identity a control was rendered against. Every delegated-task control the
 * parent surface offers is prepared from a summary the user was looking at, so
 * the action carries that identity back and is refused when the delegation has
 * moved on in between — a stale click never lands on a child it did not mean.
 */
export const DelegatedTaskExpectedIdentitySchema = z
  .object({
    delegatedTaskId: RunIdSchema,
    delegatedWorkspaceId: RunIdSchema,
    attempt: z.number().int().min(0).max(10),
    phase: RunStatusSchema.optional(),
    delegatedTurnId: RunIdSchema.nullable().optional(),
  })
  .strict();
export type DelegatedTaskExpectedIdentity = z.infer<
  typeof DelegatedTaskExpectedIdentitySchema
>;

export const DelegatedTaskStopArgsSchema = z
  .object({
    parentTaskId: z.string().trim().min(1).max(150),
    delegationKey: DelegatedTaskDelegationKeySchema,
    reason: z.string().trim().min(1).max(500).optional(),
    expected: DelegatedTaskExpectedIdentitySchema.optional(),
  })
  .strict();
export type DelegatedTaskStopArgs = z.infer<typeof DelegatedTaskStopArgsSchema>;

/**
 * One more turn on a child that is still open. Omission reuses its recorded
 * policy; an explicit profile may narrow it.
 */
export const DelegatedTaskFollowUpArgsSchema = z
  .object({
    parentTaskId: z.string().trim().min(1).max(150),
    delegationKey: DelegatedTaskDelegationKeySchema,
    prompt: z.string().trim().min(1).max(100_000),
    permissionProfile: DelegatedTaskPermissionProfileSchema.optional(),
    expected: DelegatedTaskExpectedIdentitySchema,
  })
  .strict();
export type DelegatedTaskFollowUpArgs = z.infer<typeof DelegatedTaskFollowUpArgsSchema>;

/**
 * Release the delegation while leaving the delegated task alive. Stopping ends the
 * child's work; detaching only ends the parent's claim on it, so the child
 * carries on as an ordinary task nobody is delegating to any more.
 */
export const DelegatedTaskDetachArgsSchema = z
  .object({
    parentTaskId: z.string().trim().min(1).max(150),
    delegationKey: DelegatedTaskDelegationKeySchema,
    expected: DelegatedTaskExpectedIdentitySchema,
  })
  .strict();
export type DelegatedTaskDetachArgs = z.infer<typeof DelegatedTaskDetachArgsSchema>;

/**
 * A fresh attempt on a delegation that ended without succeeding. Provider,
 * lifecycle and workspace are read back from the delegation itself, so a retry
 * cannot quietly become a different delegation wearing the same key.
 *
 * The permission profile is optional on purpose: omitted, the retry keeps the
 * profile the delegation was originally created with. Sending one is an
 * explicit override.
 */
export const DelegatedTaskRetryArgsSchema = z
  .object({
    repositoryPath: z.string().trim().min(1).max(4096),
    parentWorkspaceId: RunIdSchema,
    parentTaskId: z.string().trim().min(1).max(150),
    delegationKey: DelegatedTaskDelegationKeySchema,
    prompt: z.string().trim().min(1).max(100_000),
    permissionProfile: DelegatedTaskPermissionProfileSchema.optional(),
    expected: DelegatedTaskExpectedIdentitySchema,
  })
  .strict();
export type DelegatedTaskRetryArgs = z.infer<typeof DelegatedTaskRetryArgsSchema>;

export const DelegatedTaskLinkArgsSchema = z
  .object({ delegatedTaskId: RunIdSchema })
  .strict();
export type DelegatedTaskLinkArgs = z.infer<typeof DelegatedTaskLinkArgsSchema>;

export const DELEGATED_TASK_DETACHED_REASON =
  "Detached from the parent task; the delegated task keeps running on its own.";
export const DELEGATED_TASK_STOPPED_REASON = "Stopped from the parent task.";

/**
 * What the parent is allowed to learn about a child: who it is, what phase it
 * is in, and why it ended. Never the child's transcript.
 */
export const DelegatedTaskSummarySchema = z
  .object({
    runId: RunIdSchema,
    stepId: RunIdSchema,
    parentTaskId: z.string().trim().min(1).max(150),
    delegationKey: DelegatedTaskDelegationKeySchema,
    delegatedTaskId: RunIdSchema,
    delegatedWorkspaceId: RunIdSchema,
    delegatedTurnId: RunIdSchema.nullable(),
    providerId: z.enum(["claude-code", "codex"]),
    /** The model and effort the delegation asked for at admission time. */
    requestedModel: z.string().trim().min(1).max(200).optional(),
    requestedEffort: DelegatedTaskEffortSchema.optional(),
    lifecycle: DelegatedTaskLifecycleSchema,
    phase: RunStatusSchema,
    reason: z.string().max(1_000).nullable(),
    attempt: z.number().int().min(0).max(10),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
  })
  .strict();
export type DelegatedTaskSummary = z.infer<typeof DelegatedTaskSummarySchema>;

export const DelegatedTaskRejectionReasonSchema = z.enum([
  "already-active",
  "already-completed",
  "attempt-limit-reached",
  "cancelled",
  "concurrency-limit-reached",
  "input-mismatch",
  "invalid-ownership",
  "invalid-request",
  "invalid-state",
  "agent-refused",
  "head-mismatch",
  "not-found",
  "run-conflict",
  "stale-execution",
  "stale-identity",
  "step-conflict",
  "workspace-unavailable",
  "workspace-writer-busy",
]);
export type DelegatedTaskRejectionReason = z.infer<
  typeof DelegatedTaskRejectionReasonSchema
>;

/**
 * Every delegated-task action answers in the same shape, and a refusal always
 * carries a sentence the surface can show as-is. A control that fails silently
 * is indistinguishable from one that worked.
 */
export const DelegatedTaskActionResponseSchema = z
  .object({
    accepted: z.boolean(),
    duplicate: z.boolean(),
    reason: DelegatedTaskRejectionReasonSchema.nullable(),
    message: z.string().max(500).nullable().default(null),
    child: DelegatedTaskSummarySchema.nullable(),
  })
  .strict();
export type DelegatedTaskActionResponse = z.infer<
  typeof DelegatedTaskActionResponseSchema
>;

export const DelegatedTaskDelegateResponseSchema = DelegatedTaskActionResponseSchema;
export type DelegatedTaskDelegateResponse = DelegatedTaskActionResponse;

export const DelegatedTaskStopResponseSchema = DelegatedTaskActionResponseSchema;
export type DelegatedTaskStopResponse = DelegatedTaskActionResponse;

export const DelegatedTaskListSchema = z.array(DelegatedTaskSummarySchema);
export type DelegatedTaskList = z.infer<typeof DelegatedTaskListSchema>;

const ACTIVE_CHILD_PHASES = new Set(["pending", "running", "waiting"]);

export function isActiveDelegatedTaskPhase(phase: DelegatedTaskSummary["phase"]) {
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
export function buildDelegatedTaskRunId(args: {
  parentTaskId: string;
  delegationKey: string;
}) {
  return `${DELEGATED_TASK_RUN_ID_PREFIX}:${args.parentTaskId}:${args.delegationKey}`;
}

export function buildDelegatedTaskStepId(runId: string) {
  return `${runId}:turn`;
}

export function extractDelegatedTaskDelegationKey(args: {
  runId: string;
  parentTaskId: string;
}) {
  const prefix = `${DELEGATED_TASK_RUN_ID_PREFIX}:${args.parentTaskId}:`;
  return args.runId.startsWith(prefix) ? args.runId.slice(prefix.length) : null;
}

/**
 * A completed child step points at the delegated task, never at its output. The
 * parent follows the reference through the normal task surfaces if it wants the
 * conversation.
 */
export function buildDelegatedTaskArtifactRef(args: {
  workspaceId: string;
  taskId: string;
  turnId: string | null;
}) {
  const base = `stave://workspace/${args.workspaceId}/task/${args.taskId}`;
  return args.turnId ? `${base}/turn/${args.turnId}` : base;
}

export function buildDelegatedTaskPolicy(lifecycle: DelegatedTaskLifecycle): RunPolicy {
  return {
    maxAttempts: 3,
    timeoutMs: 86_400_000,
    maxTurns: lifecycle === "detached" ? 200 : 1,
    maxOutputBytes: 1_048_576,
    maxEvents: 4_096,
  };
}

export function resolveDelegatedTaskLifecycle(
  policy: RunPolicy,
): DelegatedTaskLifecycle {
  return policy.maxTurns > 1 ? "detached" : "one-turn";
}

export function resolveDelegatedTaskConcurrencyLimit(
  raw: string | number | undefined | null,
): number {
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
  if (
    typeof parsed !== "number" ||
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > DELEGATED_TASK_MAX_CONCURRENCY_LIMIT
  ) {
    return DELEGATED_TASK_DEFAULT_CONCURRENCY_LIMIT;
  }
  return parsed;
}

/**
 * Everything the ledger knows about one delegation, projected down to what the
 * parent may see. Returns null for rows that are not delegated-task rows so a
 * widened ledger can never leak a Compare Judge run into a child listing.
 */
export function toDelegatedTaskSummary(args: {
  run: RunRecord;
  step: RunStepRecord;
  acceptedReceipt?: Pick<RunReceiptRecord, "type" | "detail"> | null;
}): DelegatedTaskSummary | null {
  const run = RunRecordSchema.parse(args.run);
  const step = RunStepRecordSchema.parse(args.step);
  if (run.kind !== DELEGATED_TASK_RUN_KIND || step.kind !== DELEGATED_TASK_STEP_KIND) {
    return null;
  }
  if (run.origin.kind !== "task" || !step.target) {
    return null;
  }
  const delegationKey = extractDelegatedTaskDelegationKey({
    runId: run.id,
    parentTaskId: run.origin.id,
  });
  if (!delegationKey) {
    return null;
  }
  const acceptedDetail =
    args.acceptedReceipt?.type === "accepted" &&
    args.acceptedReceipt.detail?.attempt === step.attempt
      ? args.acceptedReceipt.detail
      : null;
  const requestedModel = DelegatedTaskSummarySchema.shape.requestedModel.safeParse(
    acceptedDetail?.model,
  );
  const requestedEffort =
    DelegatedTaskSummarySchema.shape.requestedEffort.safeParse(
      acceptedDetail?.effort,
    );
  const requested = {
    ...(requestedModel.success && requestedModel.data !== undefined
      ? { requestedModel: requestedModel.data }
      : {}),
    ...(requestedEffort.success && requestedEffort.data !== undefined
      ? { requestedEffort: requestedEffort.data }
      : {}),
  };
  const parsed = DelegatedTaskSummarySchema.safeParse({
    runId: run.id,
    stepId: step.id,
    parentTaskId: run.origin.id,
    delegationKey,
    delegatedTaskId: step.target.taskId,
    delegatedWorkspaceId: step.target.workspaceId,
    delegatedTurnId: step.target.turnId,
    providerId: step.target.providerId,
    ...requested,
    lifecycle: resolveDelegatedTaskLifecycle(run.policy),
    phase: step.status,
    reason: step.error ?? run.error,
    attempt: step.attempt,
    createdAt: run.createdAt,
    updatedAt: step.updatedAt,
    completedAt: step.completedAt,
  });
  return parsed.success ? parsed.data : null;
}

export type DelegatedTaskIdentityValidation =
  | { ok: true }
  | { ok: false; reason: DelegatedTaskRejectionReason; message: string };

/**
 * Compare the identity a control was rendered against with the delegation as it
 * stands now. This is the same contract the Fleet control plane applies to
 * remote task actions: an action prepared against an identity that has since
 * moved is refused with a reason, never applied to whatever is there instead.
 */
export function validateDelegatedTaskIdentity(args: {
  expected: DelegatedTaskExpectedIdentity;
  child: DelegatedTaskSummary | null;
}): DelegatedTaskIdentityValidation {
  if (!args.child) {
    return {
      ok: false,
      reason: "not-found",
      message:
        "This delegation is no longer on the run ledger. Refresh the parent task.",
    };
  }
  if (
    args.child.delegatedTaskId !== args.expected.delegatedTaskId ||
    args.child.delegatedWorkspaceId !== args.expected.delegatedWorkspaceId
  ) {
    return {
      ok: false,
      reason: "stale-identity",
      message:
        "This delegation now points at a different delegated task. Refresh the parent task.",
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
    args.expected.delegatedTurnId !== undefined &&
    args.child.delegatedTurnId !== args.expected.delegatedTurnId
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

const DELEGATED_TASK_REJECTION_MESSAGES: Record<DelegatedTaskRejectionReason, string> =
  {
    "agent-refused": "That agent cannot take this delegation.",
    "head-mismatch": "The workspace is no longer at the commit this work is for.",
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
    "workspace-writer-busy":
      "Another managed child is writing in this workspace. Wait for it to finish or choose a new worktree.",
  };

export function describeDelegatedTaskRejection(reason: DelegatedTaskRejectionReason) {
  return DELEGATED_TASK_REJECTION_MESSAGES[reason];
}

/**
 * Which controls a child row may offer, derived from the delegation alone so
 * the parent surface and the coordinator never disagree about what is possible.
 */
export function resolveDelegatedTaskControls(child: DelegatedTaskSummary) {
  const active = isActiveDelegatedTaskPhase(child.phase);
  return {
    canFollowUp: child.lifecycle === "detached" && child.phase === "waiting",
    canStop: active,
    canDetach: active,
    canRetry:
      !active &&
      child.phase !== "completed" &&
      child.phase !== "cancelled" &&
      child.attempt < buildDelegatedTaskPolicy(child.lifecycle).maxAttempts,
  };
}
