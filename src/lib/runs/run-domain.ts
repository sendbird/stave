import { z } from "zod";

export const RunIdSchema = z.string().trim().min(1).max(300);
const TimestampSchema = z.string().datetime();
const NullableTimestampSchema = TimestampSchema.nullable();

export const RunStatusSchema = z.enum([
  "pending",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunStepStatusSchema = RunStatusSchema;
export type RunStepStatus = z.infer<typeof RunStepStatusSchema>;

export const RunReceiptTypeSchema = z.enum([
  "accepted",
  "started",
  "waiting",
  "completed",
  "failed",
  "cancelled",
  "interrupted",
]);
export type RunReceiptType = z.infer<typeof RunReceiptTypeSchema>;

/**
 * `task` origins carry a parent task id: the ledger row exists because an
 * existing task delegated work, not because a surface kicked a run off.
 */
export const RunOriginSchema = z
  .object({
    kind: z.enum([
      "compare-run",
      "fleet",
      "advisor",
      "crane",
      "manual",
      "task",
    ]),
    id: RunIdSchema,
  })
  .strict();
export type RunOrigin = z.infer<typeof RunOriginSchema>;

export const RunKindSchema = z.enum(["secondary-provider", "child-task"]);
export type RunKind = z.infer<typeof RunKindSchema>;

export const RunStepKindSchema = z.enum([
  "secondary-provider-turn",
  "child-task-turn",
]);
export type RunStepKind = z.infer<typeof RunStepKindSchema>;

export const RunOwnershipSchema = z
  .object({
    projectPath: z.string().trim().min(1).max(4096),
    workspaceId: RunIdSchema,
    taskId: RunIdSchema.nullable(),
  })
  .strict();
export type RunOwnership = z.infer<typeof RunOwnershipSchema>;

export const RunPolicySchema = z
  .object({
    maxAttempts: z.number().int().min(1).max(10),
    timeoutMs: z.number().int().min(1_000).max(86_400_000),
    maxTurns: z.number().int().min(1).max(200),
    maxOutputBytes: z.number().int().min(1_024).max(1_048_576),
    maxEvents: z.number().int().min(1).max(4_096),
  })
  .strict();
export type RunPolicy = z.infer<typeof RunPolicySchema>;

/**
 * Version 1 rows were written when `secondary-provider` was the only run kind
 * and steps had no delegation target. Version 2 adds the child-task kinds and
 * `RunStepRecord.target`. Both versions stay readable: a v1 row is a valid
 * ledger row with `target: null`, so existing Compare Judge history is never
 * rewritten.
 */
export const RUN_LEDGER_SCHEMA_VERSION = 2;

export const RunProvenanceSchema = z
  .object({
    createdBy: z.string().trim().min(1).max(120),
    schemaVersion: z.union([z.literal(1), z.literal(2)]),
    sourceVersion: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
export type RunProvenance = z.infer<typeof RunProvenanceSchema>;

export const RunRecordSchema = z
  .object({
    id: RunIdSchema,
    kind: RunKindSchema,
    origin: RunOriginSchema,
    ownership: RunOwnershipSchema,
    status: RunStatusSchema,
    policy: RunPolicySchema,
    provenance: RunProvenanceSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    completedAt: NullableTimestampSchema,
    error: z.string().max(1_000).nullable(),
  })
  .strict();
export type RunRecord = z.infer<typeof RunRecordSchema>;

/**
 * The execution a step delegates to, when that execution has a durable identity
 * of its own. A `child-task-turn` step points at the real Stave task it created;
 * `turnId` stays null until the child's turn identity is known. Identity only —
 * never transcript text.
 */
export const RunStepTargetSchema = z
  .object({
    taskId: RunIdSchema,
    workspaceId: RunIdSchema,
    turnId: RunIdSchema.nullable(),
    providerId: z.enum(["claude-code", "codex"]),
  })
  .strict();
export type RunStepTarget = z.infer<typeof RunStepTargetSchema>;

export const RunStepRecordSchema = z
  .object({
    id: RunIdSchema,
    runId: RunIdSchema,
    kind: RunStepKindSchema,
    target: RunStepTargetSchema.nullable(),
    dependencyIds: z.array(RunIdSchema).max(64),
    status: RunStepStatusSchema,
    attempt: z.number().int().min(0).max(10),
    executionId: RunIdSchema.nullable(),
    claimIdempotencyKey: RunIdSchema.nullable(),
    inputHash: z.string().regex(/^[a-f0-9]{64}$/),
    resultArtifactRef: z.string().trim().min(1).max(1_000).nullable(),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    startedAt: NullableTimestampSchema,
    completedAt: NullableTimestampSchema,
    error: z.string().max(1_000).nullable(),
  })
  .strict();
export type RunStepRecord = z.infer<typeof RunStepRecordSchema>;

export const RunReceiptDetailSchema = z
  .object({
    code: z.string().max(120).optional(),
    message: z.string().max(1_000).optional(),
    providerId: z.enum(["claude-code", "codex"]).optional(),
    model: z.string().max(200).optional(),
    attempt: z.number().int().min(0).max(10).optional(),
  })
  .strict();
export type RunReceiptDetail = z.infer<typeof RunReceiptDetailSchema>;

export const RunReceiptRecordSchema = z
  .object({
    runId: RunIdSchema,
    stepId: RunIdSchema,
    sequence: z.number().int().min(1),
    type: RunReceiptTypeSchema,
    executionId: RunIdSchema.nullable(),
    idempotencyKey: z.string().trim().min(1).max(500),
    timestamp: TimestampSchema,
    detail: RunReceiptDetailSchema.nullable(),
  })
  .strict();
export type RunReceiptRecord = z.infer<typeof RunReceiptRecordSchema>;
export type RunReceiptDraft = Omit<RunReceiptRecord, "sequence">;

export type RunTransitionRejectionReason =
  | "already-active"
  | "already-completed"
  | "attempt-limit-reached"
  | "cancelled"
  | "invalid-state"
  | "stale-execution";

export type RunStepTransition =
  | {
      accepted: true;
      started: boolean;
      duplicate: boolean;
      run: RunRecord;
      step: RunStepRecord;
      receipts: RunReceiptDraft[];
    }
  | {
      accepted: false;
      reason: RunTransitionRejectionReason;
      run: RunRecord;
      step: RunStepRecord;
      receipts: [];
    };

function normalizeDiagnosticText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value
    .replace(
      /(\b(?:authorization|token|secret|password|api[_ -]?key)\b\s*[:=]\s*)(?:"[^"]*"|'[^']*'|bearer\s+\S+|\S+)/gi,
      "$1[redacted]",
    )
    .replace(/\bbearer\s+\S+/gi, "Bearer [redacted]")
    .trim();
  return normalized.length > 0 ? normalized.slice(0, maxLength) : undefined;
}

export function sanitizeRunReceiptDetail(
  value: unknown,
): RunReceiptDetail | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const code = normalizeDiagnosticText(candidate.code, 120);
  const message = normalizeDiagnosticText(candidate.message, 1_000);
  const model = normalizeDiagnosticText(candidate.model, 200);
  const providerId =
    candidate.providerId === "claude-code" || candidate.providerId === "codex"
      ? candidate.providerId
      : undefined;
  const attempt =
    typeof candidate.attempt === "number" &&
    Number.isInteger(candidate.attempt) &&
    candidate.attempt >= 0 &&
    candidate.attempt <= 10
      ? candidate.attempt
      : undefined;
  const detail = {
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
    ...(providerId ? { providerId } : {}),
    ...(model ? { model } : {}),
    ...(attempt !== undefined ? { attempt } : {}),
  };
  return Object.keys(detail).length > 0
    ? RunReceiptDetailSchema.parse(detail)
    : null;
}

const RUN_ERROR_FALLBACK: Record<RunKind, string> = {
  "secondary-provider": "Secondary run failed.",
  "child-task": "The child task run failed.",
};

function normalizeRunError(value: string, kind: RunKind) {
  return normalizeDiagnosticText(value, 1_000) || RUN_ERROR_FALLBACK[kind];
}

function buildReceipt(args: {
  runId: string;
  stepId: string;
  type: RunReceiptType;
  executionId: string | null;
  idempotencyKey: string;
  timestamp: string;
  detail?: unknown;
}): RunReceiptDraft {
  return {
    runId: args.runId,
    stepId: args.stepId,
    type: args.type,
    executionId: args.executionId,
    idempotencyKey: `${args.idempotencyKey}:${args.type}`.slice(0, 500),
    timestamp: args.timestamp,
    detail: sanitizeRunReceiptDetail(args.detail),
  };
}

function rejectTransition(args: {
  reason: RunTransitionRejectionReason;
  run: RunRecord;
  step: RunStepRecord;
}): RunStepTransition {
  return {
    accepted: false,
    reason: args.reason,
    run: args.run,
    step: args.step,
    receipts: [],
  };
}

function duplicateTransition(args: {
  run: RunRecord;
  step: RunStepRecord;
}): RunStepTransition {
  return {
    accepted: true,
    started: false,
    duplicate: true,
    run: args.run,
    step: args.step,
    receipts: [],
  };
}

function acceptedTransition(args: {
  run: RunRecord;
  step: RunStepRecord;
  receipts: RunReceiptDraft[];
  started?: boolean;
}): RunStepTransition {
  return {
    accepted: true,
    started: args.started ?? false,
    duplicate: false,
    run: RunRecordSchema.parse(args.run),
    step: RunStepRecordSchema.parse(args.step),
    receipts: args.receipts,
  };
}

export function createPendingRun(args: {
  id: string;
  kind: RunKind;
  origin: RunOrigin;
  ownership: RunOwnership;
  policy: RunPolicy;
  provenance: RunProvenance;
  now: string;
}): RunRecord {
  return RunRecordSchema.parse({
    id: args.id,
    kind: args.kind,
    origin: args.origin,
    ownership: args.ownership,
    status: "pending",
    policy: args.policy,
    provenance: args.provenance,
    createdAt: args.now,
    updatedAt: args.now,
    completedAt: null,
    error: null,
  });
}

export function createPendingRunStep(args: {
  id: string;
  runId: string;
  kind: RunStepKind;
  target?: RunStepTarget | null;
  dependencyIds: string[];
  inputHash: string;
  now: string;
}): RunStepRecord {
  return RunStepRecordSchema.parse({
    id: args.id,
    runId: args.runId,
    kind: args.kind,
    target: args.target ?? null,
    dependencyIds: args.dependencyIds,
    status: "pending",
    attempt: 0,
    executionId: null,
    claimIdempotencyKey: null,
    inputHash: args.inputHash,
    resultArtifactRef: null,
    createdAt: args.now,
    updatedAt: args.now,
    startedAt: null,
    completedAt: null,
    error: null,
  });
}

/**
 * Refine a step's delegation target in place. The target's task identity is the
 * step's idempotent anchor, so it can be filled in once and then only
 * elaborated (turn id, provider) — never repointed at a different task.
 */
export function refineRunStepTarget(args: {
  step: RunStepRecord;
  target: RunStepTarget;
}): { changed: boolean; step: RunStepRecord } {
  const step = RunStepRecordSchema.parse(args.step);
  const target = RunStepTargetSchema.parse(args.target);
  if (
    step.target &&
    (step.target.taskId !== target.taskId ||
      step.target.workspaceId !== target.workspaceId)
  ) {
    return { changed: false, step };
  }
  const next: RunStepTarget = {
    ...target,
    turnId: target.turnId ?? step.target?.turnId ?? null,
  };
  if (step.target && sameRunStepTarget(step.target, next)) {
    return { changed: false, step };
  }
  return {
    changed: true,
    step: RunStepRecordSchema.parse({ ...step, target: next }),
  };
}

function sameRunStepTarget(left: RunStepTarget, right: RunStepTarget) {
  return (
    left.taskId === right.taskId &&
    left.workspaceId === right.workspaceId &&
    left.turnId === right.turnId &&
    left.providerId === right.providerId
  );
}

export function claimRunStep(args: {
  run: RunRecord;
  step: RunStepRecord;
  executionId: string;
  idempotencyKey: string;
  now: string;
}): RunStepTransition {
  const run = RunRecordSchema.parse(args.run);
  const step = RunStepRecordSchema.parse(args.step);
  if (step.runId !== run.id) {
    return rejectTransition({ reason: "invalid-state", run, step });
  }
  if (step.claimIdempotencyKey === args.idempotencyKey) {
    return duplicateTransition({ run, step });
  }
  if (run.status === "cancelled" || step.status === "cancelled") {
    return rejectTransition({ reason: "cancelled", run, step });
  }
  if (run.status === "completed" || step.status === "completed") {
    return rejectTransition({ reason: "already-completed", run, step });
  }
  if (step.status === "running" || step.status === "waiting") {
    return rejectTransition({ reason: "already-active", run, step });
  }
  if (step.attempt >= run.policy.maxAttempts) {
    return rejectTransition({
      reason: "attempt-limit-reached",
      run,
      step,
    });
  }

  const attempt = step.attempt + 1;
  const nextRun: RunRecord = {
    ...run,
    status: "running",
    updatedAt: args.now,
    completedAt: null,
    error: null,
  };
  const nextStep: RunStepRecord = {
    ...step,
    status: "running",
    attempt,
    executionId: args.executionId,
    claimIdempotencyKey: args.idempotencyKey,
    resultArtifactRef: null,
    updatedAt: args.now,
    startedAt: args.now,
    completedAt: null,
    error: null,
  };
  const detail = { attempt };
  return acceptedTransition({
    run: nextRun,
    step: nextStep,
    started: true,
    receipts: [
      buildReceipt({
        runId: run.id,
        stepId: step.id,
        type: "accepted",
        executionId: args.executionId,
        idempotencyKey: args.idempotencyKey,
        timestamp: args.now,
        detail,
      }),
      buildReceipt({
        runId: run.id,
        stepId: step.id,
        type: "started",
        executionId: args.executionId,
        idempotencyKey: args.idempotencyKey,
        timestamp: args.now,
        detail,
      }),
    ],
  });
}

function validateActiveExecution(args: {
  run: RunRecord;
  step: RunStepRecord;
  executionId: string;
  allowedStatuses: RunStepStatus[];
}): RunStepTransition | null {
  if (args.step.executionId !== args.executionId) {
    return rejectTransition({
      reason: "stale-execution",
      run: args.run,
      step: args.step,
    });
  }
  if (!args.allowedStatuses.includes(args.step.status)) {
    return rejectTransition({
      reason: "invalid-state",
      run: args.run,
      step: args.step,
    });
  }
  return null;
}

export function markRunStepWaiting(args: {
  run: RunRecord;
  step: RunStepRecord;
  executionId: string;
  idempotencyKey: string;
  detail?: unknown;
  now: string;
}): RunStepTransition {
  const run = RunRecordSchema.parse(args.run);
  const step = RunStepRecordSchema.parse(args.step);
  if (step.status === "waiting" && step.executionId === args.executionId) {
    return duplicateTransition({ run, step });
  }
  const rejection = validateActiveExecution({
    run,
    step,
    executionId: args.executionId,
    allowedStatuses: ["running"],
  });
  if (rejection) {
    return rejection;
  }
  return acceptedTransition({
    run: { ...run, status: "waiting", updatedAt: args.now },
    step: { ...step, status: "waiting", updatedAt: args.now },
    receipts: [
      buildReceipt({
        runId: run.id,
        stepId: step.id,
        type: "waiting",
        executionId: args.executionId,
        idempotencyKey: args.idempotencyKey,
        timestamp: args.now,
        detail: args.detail,
      }),
    ],
  });
}

export function completeRunStep(args: {
  run: RunRecord;
  step: RunStepRecord;
  executionId: string;
  idempotencyKey: string;
  resultArtifactRef: string;
  now: string;
}): RunStepTransition {
  const run = RunRecordSchema.parse(args.run);
  const step = RunStepRecordSchema.parse(args.step);
  if (step.status === "completed" && step.executionId === args.executionId) {
    return duplicateTransition({ run, step });
  }
  const rejection = validateActiveExecution({
    run,
    step,
    executionId: args.executionId,
    allowedStatuses: ["running", "waiting"],
  });
  if (rejection) {
    return rejection;
  }
  return acceptedTransition({
    run: {
      ...run,
      status: "completed",
      updatedAt: args.now,
      completedAt: args.now,
      error: null,
    },
    step: {
      ...step,
      status: "completed",
      resultArtifactRef: args.resultArtifactRef,
      updatedAt: args.now,
      completedAt: args.now,
      error: null,
    },
    receipts: [
      buildReceipt({
        runId: run.id,
        stepId: step.id,
        type: "completed",
        executionId: args.executionId,
        idempotencyKey: args.idempotencyKey,
        timestamp: args.now,
        detail: { attempt: step.attempt },
      }),
    ],
  });
}

export function failRunStep(args: {
  run: RunRecord;
  step: RunStepRecord;
  executionId: string;
  idempotencyKey: string;
  error: string;
  detail?: unknown;
  now: string;
}): RunStepTransition {
  const run = RunRecordSchema.parse(args.run);
  const step = RunStepRecordSchema.parse(args.step);
  if (step.status === "failed" && step.executionId === args.executionId) {
    return duplicateTransition({ run, step });
  }
  const rejection = validateActiveExecution({
    run,
    step,
    executionId: args.executionId,
    allowedStatuses: ["running", "waiting"],
  });
  if (rejection) {
    return rejection;
  }
  const error = normalizeRunError(args.error, run.kind);
  return acceptedTransition({
    run: {
      ...run,
      status: "failed",
      updatedAt: args.now,
      completedAt: args.now,
      error,
    },
    step: {
      ...step,
      status: "failed",
      updatedAt: args.now,
      completedAt: args.now,
      error,
    },
    receipts: [
      buildReceipt({
        runId: run.id,
        stepId: step.id,
        type: "failed",
        executionId: args.executionId,
        idempotencyKey: args.idempotencyKey,
        timestamp: args.now,
        detail: {
          ...(sanitizeRunReceiptDetail(args.detail) ?? {}),
          message: error,
          attempt: step.attempt,
        },
      }),
    ],
  });
}

export function cancelRunStep(args: {
  run: RunRecord;
  step: RunStepRecord;
  idempotencyKey: string;
  expectedExecutionId?: string;
  detail?: unknown;
  /**
   * Why the run was cancelled, in words a person can read. Cancellation is the
   * one terminal transition a human can trigger for several different reasons,
   * so the caller may record which one instead of leaving the row silent.
   */
  error?: string;
  now: string;
}): RunStepTransition {
  const run = RunRecordSchema.parse(args.run);
  const step = RunStepRecordSchema.parse(args.step);
  if (run.status === "cancelled" && step.status === "cancelled") {
    return duplicateTransition({ run, step });
  }
  if (
    args.expectedExecutionId &&
    step.executionId !== args.expectedExecutionId
  ) {
    return rejectTransition({
      reason: "stale-execution",
      run,
      step,
    });
  }
  if (run.status === "completed" || step.status === "completed") {
    return rejectTransition({ reason: "already-completed", run, step });
  }
  if (
    !["pending", "running", "waiting"].includes(step.status) ||
    !["pending", "running", "waiting"].includes(run.status)
  ) {
    return rejectTransition({ reason: "invalid-state", run, step });
  }
  const cancelError = args.error
    ? normalizeRunError(args.error, run.kind)
    : null;
  return acceptedTransition({
    run: {
      ...run,
      status: "cancelled",
      updatedAt: args.now,
      completedAt: args.now,
      error: cancelError,
    },
    step: {
      ...step,
      status: "cancelled",
      updatedAt: args.now,
      completedAt: args.now,
      error: cancelError,
    },
    receipts: [
      buildReceipt({
        runId: run.id,
        stepId: step.id,
        type: "cancelled",
        executionId: step.executionId,
        idempotencyKey: args.idempotencyKey,
        timestamp: args.now,
        detail: args.detail,
      }),
    ],
  });
}

export function interruptRunStep(args: {
  run: RunRecord;
  step: RunStepRecord;
  idempotencyKey: string;
  error: string;
  now: string;
}): RunStepTransition {
  const run = RunRecordSchema.parse(args.run);
  const step = RunStepRecordSchema.parse(args.step);
  if (run.status === "interrupted" && step.status === "interrupted") {
    return duplicateTransition({ run, step });
  }
  if (
    !["running", "waiting"].includes(step.status) ||
    !["running", "waiting"].includes(run.status)
  ) {
    return rejectTransition({ reason: "invalid-state", run, step });
  }
  const error = normalizeRunError(args.error, run.kind);
  return acceptedTransition({
    run: {
      ...run,
      status: "interrupted",
      updatedAt: args.now,
      completedAt: args.now,
      error,
    },
    step: {
      ...step,
      status: "interrupted",
      updatedAt: args.now,
      completedAt: args.now,
      error,
    },
    receipts: [
      buildReceipt({
        runId: run.id,
        stepId: step.id,
        type: "interrupted",
        executionId: step.executionId,
        idempotencyKey: args.idempotencyKey,
        timestamp: args.now,
        detail: { message: error, attempt: step.attempt },
      }),
    ],
  });
}
