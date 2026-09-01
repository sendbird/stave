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
  providerId: z.union([
    z.literal("claude-code"),
    z.literal("codex"),
    z.literal("cursor"),
    z.literal("kiro"),
  ]),
  nativeSessionId: z.string(),
  nativeTurnId: z.string(),
});

const BrowserConnectionEventSchema = z.object({
  type: z.literal("browser_connection"),
  providerId: z.union([
    z.literal("claude-code"),
    z.literal("codex"),
  ]),
  status: z.union([
    z.literal("connecting"),
    z.literal("connected"),
    z.literal("failed"),
  ]),
  at: z.number(),
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
const ManagedExecutionProviderIdSchema = z.union([
  z.literal("claude-code"),
  z.literal("codex"),
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

/**
 * Both providers' effort scales. Codex's legacy `"minimal"` is deliberately
 * absent: `resolveAdvisorEffort` collapses it to `"low"` before the call, so an
 * event carrying it would name a tier the Advisor never ran at.
 */
const AdvisorEffortSchema = z.union([
  z.literal("low"),
  z.literal("medium"),
  z.literal("high"),
  z.literal("xhigh"),
  z.literal("max"),
  z.literal("ultra"),
]);

const AdvisorActivityEventSchema = z.object({
  type: z.literal("advisor_activity"),
  phase: z.union([
    z.literal("armed"),
    z.literal("started"),
    z.literal("progress"),
    z.literal("completed"),
    z.literal("failed"),
    z.literal("timeout"),
    z.literal("aborted"),
    z.literal("skipped"),
  ]),
  exchangeId: z.string().optional(),
  consultIndex: z.number().optional(),
  consultLimit: z.number().optional(),
  question: z.string().optional(),
  primaryProviderId: ManagedExecutionProviderIdSchema,
  primaryModel: z.string().optional(),
  advisorProviderId: ManagedExecutionProviderIdSchema.optional(),
  advisorModel: z.string().optional(),
  advisorEffort: AdvisorEffortSchema.optional(),
  isolation: z
    .union([
      z.literal("claude-tools-disabled"),
      z.literal("codex-ephemeral-read-only"),
      z.literal("codex-role-session-read-only"),
    ])
    .optional(),
  at: z.number(),
  timeoutMs: z.number().optional(),
  durationMs: z.number().optional(),
  advice: z.string().optional(),
  adviceChars: z.number().optional(),
  detail: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  cacheReadTokens: z.number().optional(),
  cacheCreationTokens: z.number().optional(),
  totalCostUsd: z.number().optional(),
  sessionReused: z.boolean().optional(),
});

const HistoryBoundaryEventSchema = z.object({
  type: z.literal("history_boundary"),
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

const WorkerExecutionMetadataSchema = z.object({
  providerId: ProviderIdSchema,
  primaryModel: z.string(),
  presetId: z.union([
    z.literal("patch-hand"), z.literal("verified-patch"), z.literal("sweep"),
    z.literal("scout"), z.literal("deep-packet"), z.literal("second-pair"),
  ]),
  workerModel: z.string(),
  workerEffort: z.union([
    z.literal("low"), z.literal("medium"), z.literal("high"),
    z.literal("xhigh"), z.literal("max"), z.literal("ultra"), z.null(),
  ]),
});

const ToolEventSchema = z.object({
  type: z.literal("tool"),
  toolUseId: z.string().optional(),
  toolName: z.string(),
  input: z.string(),
  output: z.string().optional(),
  state: ToolStateSchema,
  workerExecution: WorkerExecutionMetadataSchema.optional(),
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
  workerExecution: WorkerExecutionMetadataSchema.optional(),
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
      })
      // `description` is optional on the wire; backfill it from the label so a
      // valid question is never dropped in validation just for missing it.
      .transform((option) => ({
        label: option.label,
        description: option.description?.trim()
          ? option.description
          : option.label,
        ...(option.value ? { value: option.value } : {}),
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
  toolName: z.string(),
  requestId: z.string(),
  questions: z.array(UserInputQuestionSchema),
  ownerAgentId: z.string().optional(),
});

const PlanReadyEventSchema = z.object({
  type: z.literal("plan_ready"),
  planText: z.string(),
  sourceSegmentId: z.string().optional(),
  review: z
    .object({
      requestId: z.string(),
      responseMode: z.literal("blocking"),
    })
    .optional(),
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
  stop_reason: z.string().optional(),
});

const ModelResolvedEventSchema = z.object({
  type: z.literal("model_resolved"),
  resolvedProviderId: ProviderIdSchema,
  resolvedModel: z.string(),
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
  provider_session: ProviderSessionEventSchema,
  provider_turn: ProviderTurnEventSchema,
  browser_connection: BrowserConnectionEventSchema,
  goal_status: GoalStatusEventSchema,
  usage: UsageEventSchema,
  context_usage: ContextUsageEventSchema,
  delegated_usage: DelegatedUsageEventSchema,
  prompt_suggestions: PromptSuggestionsEventSchema,
  advisor_activity: AdvisorActivityEventSchema,
  history_boundary: HistoryBoundaryEventSchema,
  permission_denial: PermissionDenialEventSchema,
  hook_activity: HookActivityEventSchema,
  tool: ToolEventSchema,
  tool_progress: ToolProgressEventSchema,
  tool_result: ToolResultEventSchema,
  diff: DiffEventSchema,
  approval: ApprovalEventSchema,
  user_input: UserInputEventSchema,
  plan_ready: PlanReadyEventSchema,
  system: SystemEventSchema,
  error: ErrorEventSchema,
  done: DoneEventSchema,
  model_resolved: ModelResolvedEventSchema,
  subagent_progress: SubagentProgressEventSchema,
} as const satisfies Record<NormalizedProviderEvent["type"], z.ZodTypeAny>;

export const NormalizedProviderEventSchema = z.discriminatedUnion("type", [
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.thinking,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.text,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.provider_session,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.provider_turn,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.browser_connection,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.goal_status,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.usage,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.context_usage,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.delegated_usage,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.prompt_suggestions,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.advisor_activity,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.history_boundary,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.permission_denial,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.hook_activity,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.tool,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.tool_progress,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.tool_result,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.diff,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.approval,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.user_input,
  NORMALIZED_PROVIDER_EVENT_SCHEMA_BY_TYPE.plan_ready,
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
