import { z } from "zod";

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
  providerId: z.union([z.literal("claude-code"), z.literal("codex"), z.literal("stave")]),
  nativeSessionId: z.string(),
});

const UsageEventSchema = z.object({
  type: z.literal("usage"),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number().optional(),
  cacheCreationTokens: z.number().optional(),
  totalCostUsd: z.number().optional(),
  ttftMs: z.number().optional(),
});

const PromptSuggestionsEventSchema = z.object({
  type: z.literal("prompt_suggestions"),
  suggestions: z.array(z.string()),
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
});

const UserInputQuestionSchema = z.object({
  key: z.string().optional(),
  question: z.string(),
  header: z.string(),
  options: z.array(z.object({
    label: z.string(),
    description: z.string(),
  })),
  multiSelect: z.boolean().optional(),
  inputType: z.union([
    z.literal("text"),
    z.literal("number"),
    z.literal("integer"),
    z.literal("boolean"),
    z.literal("url_notice"),
  ]).optional(),
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
});

const PlanReadyEventSchema = z.object({
  type: z.literal("plan_ready"),
  planText: z.string(),
  sourceSegmentId: z.string().optional(),
});

const SystemEventSchema = z.object({
  type: z.literal("system"),
  content: z.string(),
  compactBoundary: z.object({
    trigger: z.string().optional(),
    gitRef: z.string().optional(),
  }).optional(),
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
  resolvedProviderId: z.union([z.literal("claude-code"), z.literal("codex"), z.literal("stave")]),
  resolvedModel: z.string(),
});

const StaveExecutionProcessingEventSchema = z.object({
  type: z.literal("stave:execution_processing"),
  strategy: z.union([z.literal("direct"), z.literal("orchestrate")]),
  model: z.string().optional(),
  supervisorModel: z.string().optional(),
  reason: z.string(),
  fastModeRequested: z.boolean().optional(),
  fastModeApplied: z.boolean().optional(),
});

const StaveOrchestrationProcessingEventSchema = z.object({
  type: z.literal("stave:orchestration_processing"),
  supervisorModel: z.string(),
  subtasks: z.array(z.object({
    id: z.string(),
    title: z.string(),
    model: z.string(),
    dependsOn: z.array(z.string()),
  })),
});

const StaveSubtaskStartedEventSchema = z.object({
  type: z.literal("stave:subtask_started"),
  subtaskId: z.string(),
  index: z.number(),
  total: z.number(),
  title: z.string(),
  model: z.string(),
});

const StaveSubtaskDoneEventSchema = z.object({
  type: z.literal("stave:subtask_done"),
  subtaskId: z.string(),
  success: z.boolean(),
});

const StaveSynthesisStartedEventSchema = z.object({
  type: z.literal("stave:synthesis_started"),
});

const SubagentProgressEventSchema = z.object({
  type: z.literal("subagent_progress"),
  toolUseId: z.string().optional(),
  content: z.string(),
});

export const NormalizedProviderEventSchema = z.discriminatedUnion("type", [
  ThinkingEventSchema,
  TextEventSchema,
  ProviderSessionEventSchema,
  UsageEventSchema,
  PromptSuggestionsEventSchema,
  ToolEventSchema,
  ToolProgressEventSchema,
  ToolResultEventSchema,
  DiffEventSchema,
  ApprovalEventSchema,
  UserInputEventSchema,
  PlanReadyEventSchema,
  SystemEventSchema,
  ErrorEventSchema,
  DoneEventSchema,
  ModelResolvedEventSchema,
  StaveExecutionProcessingEventSchema,
  StaveOrchestrationProcessingEventSchema,
  StaveSubtaskStartedEventSchema,
  StaveSubtaskDoneEventSchema,
  StaveSynthesisStartedEventSchema,
  SubagentProgressEventSchema,
]);

export type ParsedNormalizedProviderEvent = z.infer<typeof NormalizedProviderEventSchema>;
