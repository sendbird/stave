import { McpAppViewReferenceSchema } from "@/lib/mcp-app/mcp-app-schemas";
import { AgentTurnProvenanceSchema } from "../agents/turn-provenance";
import { ModelExecutionSchema } from "./model-execution";
import { AutoRoutingModelResolutionSchema } from "./model-resolution";
import { z } from "zod";
import type { NormalizedProviderEvent } from "./provider.types";

const ThinkingEventSchema = z.object({
  type: z.literal("thinking"),
  text: z.string(),
  isStreaming: z.boolean().optional(),
});

const TextEventSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  segmentId: z.string().optional(),
});

const ProviderSessionEventSchema = z.object({
  accountProfileId: z.string().optional(),
  type: z.literal("provider_session"),
  providerId: z.union([
    z.literal("claude-code"),
    z.literal("codex"),
    z.literal("cursor"),
    z.literal("kiro"),
  ]),
  nativeSessionId: z.string(),
});

const ProviderTurnEventSchema = z.object({
  type: z.literal("provider_turn"),
  accountProfileId: z.string().optional(),
  providerId: z.union([
    z.literal("claude-code"),
    z.literal("codex"),
    z.literal("cursor"),
    z.literal("kiro"),
  ]),
  nativeSessionId: z.string(),
  nativeTurnId: z.string(),
});

const ProviderGoalStatusSchema = z.union([
  z.literal("active"),
  z.literal("paused"),
  z.literal("blocked"),
  z.literal("usageLimited"),
  z.literal("budgetLimited"),
  z.literal("complete"),
]);

const ProviderGoalSnapshotSchema = z.object({
  providerId: z.literal("codex"),
  nativeSessionId: z.string(),
  objective: z.string(),
  status: ProviderGoalStatusSchema,
  tokenBudget: z.number().nullable(),
  tokensUsed: z.number(),
  timeUsedSeconds: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const GoalStatusEventSchema = z.object({
  type: z.literal("goal_status"),
  providerId: z.literal("codex"),
  goal: ProviderGoalSnapshotSchema.nullable(),
});

const UsageEventSchema = z.object({
  type: z.literal("usage"),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number().optional(),
  cacheCreationTokens: z.number().optional(),
  thoughtTokens: z.number().optional(),
  totalCostUsd: z.number().optional(),
  ttftMs: z.number().optional(),
});

const ContextUsageEventSchema = z.object({
  type: z.literal("context_usage"),
  usedTokens: z.number().nonnegative().optional(),
  sizeTokens: z.number().positive().optional(),
  usedPercent: z.number().min(0).max(100).optional(),
  costAmount: z.number().nonnegative().optional(),
  costCurrency: z.string().min(1).optional(),
});

const PromptSuggestionsEventSchema = z.object({
  type: z.literal("prompt_suggestions"),
  suggestions: z.array(z.string()),
});

const ProviderIdSchema = z.union([
  z.literal("claude-code"),
  z.literal("codex"),
  z.literal("cursor"),
  z.literal("kiro"),
]);

const DelegatedUsageEventSchema = z.object({
  type: z.literal("delegated_usage"),
  executionId: z.string().min(1),
  role: z.union([z.literal("advisor"), z.literal("worker")]),
  providerId: ProviderIdSchema,
  model: z.string(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  cacheReadTokens: z.number().optional(),
  cacheCreationTokens: z.number().optional(),
  thoughtTokens: z.number().optional(),
  contextUsedTokens: z.number().optional(),
  contextWindowTokens: z.number().optional(),
  contextUsedPercent: z.number().optional(),
  contextCostAmount: z.number().optional(),
  contextCostCurrency: z.string().optional(),
  totalCostUsd: z.number().optional(),
  sessionReused: z.boolean().optional(),
});


const HistoryBoundaryEventSchema = z.object({
  type: z.literal("history_boundary"),
  accountProfileId: z.string().optional(),
  providerId: ProviderIdSchema,
  boundaryKind: z.union([
    z.literal("thread"),
    z.literal("turn"),
    z.literal("message"),
  ]),
  nativeId: z.string(),
  targetRole: z.union([z.literal("user"), z.literal("assistant")]),
});

const PermissionDenialEventSchema = z.object({
  type: z.literal("permission_denial"),
  toolName: z.string(),
  message: z.string(),
  reasonType: z.string().optional(),
  reason: z.string().optional(),
});

const HookActivityEventSchema = z.object({
  type: z.literal("hook_activity"),
  hookId: z.string(),
  hookName: z.string(),
  hookEvent: z.string(),
  hookSource: z.string().optional(),
  status: z.union([
    z.literal("running"),
    z.literal("completed"),
    z.literal("failed"),
    z.literal("cancelled"),
    z.literal("blocked"),
  ]),
});

const ToolStateSchema = z.union([
  z.literal("input-streaming"),
  z.literal("input-available"),
  z.literal("output-available"),
  z.literal("output-error"),
]);

const ToolEventSchema = z.object({
  type: z.literal("tool"),
  toolUseId: z.string().optional(),
  toolName: z.string(),
  input: z.string(),
  output: z.string().optional(),
  state: ToolStateSchema,
  agentId: z.string().optional(),
  ownerAgentId: z.string().optional(),
  parentToolUseId: z.string().optional(),
});

const ToolResultEventSchema = z.object({
  type: z.literal("tool_result"),
  tool_use_id: z.string(),
  output: z.string(),
  isError: z.boolean().optional(),
  isPartial: z.boolean().optional(),
  exitCode: z.number().int().nullable().optional(),
  mcpAppView: McpAppViewReferenceSchema.optional(),
});

const ToolProgressEventSchema = z.object({
  type: z.literal("tool_progress"),
  toolUseId: z.string(),
  toolName: z.string(),
  elapsedSeconds: z.number(),
});

const DiffStatusSchema = z.union([
  z.literal("pending"),
  z.literal("accepted"),
  z.literal("rejected"),
]);

const DiffEventSchema = z.object({
  type: z.literal("diff"),
  filePath: z.string(),
  oldContent: z.string(),
  newContent: z.string(),
  status: DiffStatusSchema.optional(),
});

const ApprovalEventSchema = z.object({
  type: z.literal("approval"),
  toolName: z.string(),
  requestId: z.string(),
  description: z.string(),
  input: z.string().optional(),
  supportsAllowAlways: z.boolean().optional(),
  ownerAgentId: z.string().optional(),
});

const UserInputQuestionSchema = z.object({
  key: z.string().optional(),
  question: z.string(),
  header: z.string(),
  options: z.array(
    z
      .object({
        label: z.string(),
        description: z.string().optional(),
        value: z.string().optional(),
        recommended: z.boolean().optional(),
      })
      // `description` is optional on the wire; backfill it from the label so a
      // valid question is never dropped in validation just for missing it.
      .transform((option) => ({
        label: option.label,
        description: option.description?.trim()
          ? option.description
          : option.label,
        ...(option.value ? { value: option.value } : {}),
        ...(option.recommended ? { recommended: true } : {}),
      })),
  ),
  multiSelect: z.boolean().optional(),
  inputType: z
    .union([
      z.literal("text"),
      z.literal("number"),
      z.literal("integer"),
      z.literal("boolean"),
      z.literal("url_notice"),
    ])
    .optional(),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  allowCustom: z.boolean().optional(),
  defaultValue: z.string().optional(),
  linkUrl: z.string().optional(),
});

const UserInputEventSchema = z.object({
  type: z.literal("user_input"),
  delivery: z.literal("async").optional(),
  toolName: z.string(),
  requestId: z.string(),
  questions: z.array(UserInputQuestionSchema),
  ownerAgentId: z.string().optional(),
});

const SystemEventSchema = z.object({
  type: z.literal("system"),
  content: z.string(),
  compactBoundary: z
    .object({
      trigger: z.string().optional(),
      gitRef: z.string().optional(),
    })
    .optional(),
});

const ErrorEventSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
  recoverable: z.boolean(),
});

const DoneEventSchema = z.object({
  type: z.literal("done"),
  accountProfileId: z.string().optional(),
  stop_reason: z.string().optional(),
});

const ModelResolvedEventSchema = z.object({
  type: z.literal("model_resolved"),
  resolvedProviderId: ProviderIdSchema,
  resolvedModel: z.string(),
  modelResolution: AutoRoutingModelResolutionSchema.optional(),
  modelExecution: ModelExecutionSchema.optional(),
});

const SubagentProgressEventSchema = z.object({
  type: z.literal("subagent_progress"),
  toolUseId: z.string().optional(),
  content: z.string(),
  agentId: z.string().optional(),
  ownerAgentId: z.string().optional(),
  binding: z.enum(["authoritative", "guess"]).optional(),
});

export const NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE = {
  thinking: ThinkingEventSchema,
  text: TextEventSchema,
  agent_provenance: z.object({ type: z.literal("agent_provenance"), provenance: AgentTurnProvenanceSchema }).strict(),
  provider_session: ProviderSessionEventSchema,
  provider_turn: ProviderTurnEventSchema,
  goal_status: GoalStatusEventSchema,
  usage: UsageEventSchema,
  context_usage: ContextUsageEventSchema,
  delegated_usage: DelegatedUsageEventSchema,
  prompt_suggestions: PromptSuggestionsEventSchema,
  history_boundary: HistoryBoundaryEventSchema,
  permission_denial: PermissionDenialEventSchema,
  hook_activity: HookActivityEventSchema,
  tool: ToolEventSchema,
  tool_progress: ToolProgressEventSchema,
  tool_result: ToolResultEventSchema,
  diff: DiffEventSchema,
  approval: ApprovalEventSchema,
  user_input: UserInputEventSchema,
  system: SystemEventSchema,
  error: ErrorEventSchema,
  done: DoneEventSchema,
  model_resolved: ModelResolvedEventSchema,
  subagent_progress: SubagentProgressEventSchema,
} as const satisfies Record<NormalizedProviderEvent["type"], z.ZodTypeAny>;

export const NormalizedProviderEventSchema = z.discriminatedUnion("type", [
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.thinking,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.text,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.agent_provenance,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.provider_session,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.provider_turn,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.goal_status,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.usage,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.context_usage,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.delegated_usage,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.prompt_suggestions,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.history_boundary,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.permission_denial,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.hook_activity,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.tool,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.tool_progress,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.tool_result,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.diff,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.approval,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.user_input,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.system,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.error,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.done,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.model_resolved,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.subagent_progress,
]);

export type ParsedNormalizedProviderEvent = z.infer<
  typeof NormalizedProviderEventSchema
>;

type IsExactType<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? (<Value>() => Value extends Right ? 1 : 2) extends <
        Value,
      >() => Value extends Left ? 1 : 2
      ? true
      : false
    : false;
type AssertExactType<Value extends true> = Value;

/**
 * Compile-time half of the event contract gate. The runtime test covers
 * discriminants; this assertion also fails typecheck when a required field or
 * field type drifts between the TypeScript union and its Zod output.
 */
export type NormalizedProviderEventSchemaContract = AssertExactType<
  IsExactType<NormalizedProviderEvent, ParsedNormalizedProviderEvent>
>;
