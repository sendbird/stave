import { z } from "zod";
import {
  RunIdSchema,
  RunOriginSchema,
  RunOwnershipSchema,
  RunPolicySchema,
  RunProvenanceSchema,
  RunReceiptRecordSchema,
  RunRecordSchema,
  RunStepRecordSchema,
} from "./run-domain";

export const SecondaryRunRuntimeHintsSchema = z
  .object({
    claudeBinaryPath: z.string().trim().min(1).max(4096).optional(),
    claudeEffort: z.enum(["low", "medium", "high", "xhigh", "max"]).optional(),
    claudeThinkingMode: z.enum(["adaptive", "enabled", "disabled"]).optional(),
    claudeMaxBudgetUsd: z.number().min(0).max(10_000).optional(),
    claudeTaskBudgetTokens: z.number().int().min(1).max(1_000_000).optional(),
    claudeFastMode: z.boolean().optional(),
    codexBinaryPath: z.string().trim().min(1).max(4096).optional(),
    codexReasoningEffort: z
      .enum(["low", "medium", "high", "xhigh", "max", "ultra"])
      .optional(),
    codexReasoningSummary: z
      .enum(["auto", "concise", "detailed", "none"])
      .optional(),
    codexReasoningSummarySupport: z
      .enum(["auto", "enabled", "disabled"])
      .optional(),
    codexFastMode: z.boolean().optional(),
  })
  .strict();
export type SecondaryRunRuntimeHints = z.infer<
  typeof SecondaryRunRuntimeHintsSchema
>;

export const SecondaryRunProviderInputSchema = z
  .object({
    providerId: z.enum(["claude-code", "codex"]),
    model: z.string().trim().min(1).max(200),
    prompt: z.string().min(1).max(100_000),
    cwd: z.string().trim().min(1).max(4096),
    runtimeHints: SecondaryRunRuntimeHintsSchema.default({}),
  })
  .strict();
export type SecondaryRunProviderInput = z.infer<
  typeof SecondaryRunProviderInputSchema
>;

export const SecondaryRunDefinitionSchema = z
  .object({
    id: RunIdSchema,
    kind: z.literal("secondary-provider"),
    origin: RunOriginSchema,
    ownership: RunOwnershipSchema,
    policy: RunPolicySchema,
    provenance: RunProvenanceSchema,
  })
  .strict();
export type SecondaryRunDefinition = z.infer<
  typeof SecondaryRunDefinitionSchema
>;

export const SecondaryRunStepDefinitionSchema = z
  .object({
    id: RunIdSchema,
    kind: z.literal("secondary-provider-turn"),
    dependencyIds: z.array(RunIdSchema).max(64),
    idempotencyKey: z.string().trim().min(1).max(300),
  })
  .strict();
export type SecondaryRunStepDefinition = z.infer<
  typeof SecondaryRunStepDefinitionSchema
>;

export const SecondaryRunClaimArgsSchema = z
  .object({
    run: SecondaryRunDefinitionSchema,
    step: SecondaryRunStepDefinitionSchema,
    input: SecondaryRunProviderInputSchema,
  })
  .strict();
export type SecondaryRunClaimArgs = z.infer<typeof SecondaryRunClaimArgsSchema>;

export const SecondaryRunExecuteArgsSchema = z
  .object({
    runId: RunIdSchema,
    stepId: RunIdSchema,
    executionId: RunIdSchema,
    input: SecondaryRunProviderInputSchema,
  })
  .strict();
export type SecondaryRunExecuteArgs = z.infer<
  typeof SecondaryRunExecuteArgsSchema
>;

export const SecondaryRunCompleteArgsSchema = z
  .object({
    runId: RunIdSchema,
    stepId: RunIdSchema,
    executionId: RunIdSchema,
    idempotencyKey: z.string().trim().min(1).max(300),
    resultArtifactRef: z.string().trim().min(1).max(1_000),
  })
  .strict();
export type SecondaryRunCompleteArgs = z.infer<
  typeof SecondaryRunCompleteArgsSchema
>;

export const SecondaryRunFailArgsSchema = z
  .object({
    runId: RunIdSchema,
    stepId: RunIdSchema,
    executionId: RunIdSchema,
    idempotencyKey: z.string().trim().min(1).max(300),
    error: z.string().trim().min(1).max(10_000),
    code: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
export type SecondaryRunFailArgs = z.infer<typeof SecondaryRunFailArgsSchema>;

export const SecondaryRunCancelArgsSchema = z
  .object({
    runId: RunIdSchema,
    stepId: RunIdSchema,
    idempotencyKey: z.string().trim().min(1).max(300),
    expectedExecutionId: RunIdSchema.optional(),
  })
  .strict();
export type SecondaryRunCancelArgs = z.infer<
  typeof SecondaryRunCancelArgsSchema
>;

export const SecondaryRunLookupArgsSchema = z
  .object({
    runId: RunIdSchema,
    stepId: RunIdSchema,
  })
  .strict();
export type SecondaryRunLookupArgs = z.infer<
  typeof SecondaryRunLookupArgsSchema
>;

export const SecondaryRunReceiptListArgsSchema = z
  .object({
    runId: RunIdSchema,
  })
  .strict();
export type SecondaryRunReceiptListArgs = z.infer<
  typeof SecondaryRunReceiptListArgsSchema
>;

export const SecondaryProviderExecutionRequestSchema = z
  .object({
    runId: RunIdSchema,
    stepId: RunIdSchema,
    executionId: RunIdSchema,
    input: SecondaryRunProviderInputSchema,
    policy: RunPolicySchema,
  })
  .strict();
export type SecondaryProviderExecutionRequest = z.infer<
  typeof SecondaryProviderExecutionRequestSchema
>;

export const SecondaryProviderExecutionResultSchema = z
  .object({
    executionId: RunIdSchema,
    providerId: z.enum(["claude-code", "codex"]),
    model: z.string().trim().min(1).max(200),
    status: z.enum(["completed", "failed", "cancelled"]),
    text: z.string().max(1_048_576),
    eventCount: z.number().int().min(0),
    collectedEventCount: z.number().int().min(0).max(4_096),
    outputBytes: z.number().int().min(0).max(1_048_576),
    truncated: z.boolean(),
    stopReason: z.string().max(200).nullable(),
    error: z.string().max(1_000).nullable(),
  })
  .strict();
export type SecondaryProviderExecutionResult = z.infer<
  typeof SecondaryProviderExecutionResultSchema
>;

export const SecondaryProviderCancelRequestSchema = z
  .object({
    executionId: RunIdSchema,
  })
  .strict();
export type SecondaryProviderCancelRequest = z.infer<
  typeof SecondaryProviderCancelRequestSchema
>;

export const SecondaryRunAggregateSchema = z
  .object({
    run: RunRecordSchema,
    step: RunStepRecordSchema,
  })
  .strict();
export type SecondaryRunAggregate = z.infer<typeof SecondaryRunAggregateSchema>;

export const SecondaryRunRejectionReasonSchema = z.enum([
  "already-active",
  "already-completed",
  "attempt-limit-reached",
  "cancelled",
  "execution-mismatch",
  "input-mismatch",
  "invalid-ownership",
  "invalid-request",
  "invalid-state",
  "not-found",
  "run-conflict",
  "stale-execution",
  "step-conflict",
]);
export type SecondaryRunRejectionReason = z.infer<
  typeof SecondaryRunRejectionReasonSchema
>;

export const SecondaryRunTransitionResponseSchema = z
  .object({
    accepted: z.boolean(),
    started: z.boolean(),
    duplicate: z.boolean(),
    reason: SecondaryRunRejectionReasonSchema.nullable(),
    aggregate: SecondaryRunAggregateSchema.nullable(),
  })
  .strict();
export type SecondaryRunTransitionResponse = z.infer<
  typeof SecondaryRunTransitionResponseSchema
>;

export const SecondaryRunExecuteResponseSchema = z
  .object({
    accepted: z.boolean(),
    reason: SecondaryRunRejectionReasonSchema.nullable(),
    execution: SecondaryProviderExecutionResultSchema.nullable(),
    aggregate: SecondaryRunAggregateSchema.nullable(),
  })
  .strict();
export type SecondaryRunExecuteResponse = z.infer<
  typeof SecondaryRunExecuteResponseSchema
>;

export const SecondaryRunReceiptListSchema = z.array(RunReceiptRecordSchema);
export type SecondaryRunReceiptList = z.infer<
  typeof SecondaryRunReceiptListSchema
>;

export function serializeSecondaryRunInput(value: SecondaryRunProviderInput) {
  const input = SecondaryRunProviderInputSchema.parse(value);
  return JSON.stringify({
    providerId: input.providerId,
    model: input.model,
    prompt: input.prompt,
    cwd: input.cwd,
    runtimeHints: input.runtimeHints,
  });
}
