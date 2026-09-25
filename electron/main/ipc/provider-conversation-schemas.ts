import { z } from "zod";
import { WORKER_PRESET_IDS } from "../../../src/lib/providers/worker-preset-ids";
import {
  ProviderIdSchema,
  RuntimeOptionsSchema,
} from "./provider-runtime-schemas";

const UserInputOptionSchema = z
  .object({
    label: z.string().max(500),
    description: z.string().max(5000),
    value: z.string().max(500).optional(),
    recommended: z.boolean().optional(),
  })
  .strict();

const UserInputQuestionSchema = z
  .object({
    key: z.string().max(200).optional(),
    question: z.string().max(5000),
    header: z.string().max(200),
    options: z.array(UserInputOptionSchema).max(20),
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
    placeholder: z.string().max(500).optional(),
    allowCustom: z.boolean().optional(),
    defaultValue: z.string().max(5000).optional(),
    linkUrl: z.string().max(5000).optional(),
  })
  .strict();

const WorkerExecutionMetadataSchema = z
  .object({
    providerId: ProviderIdSchema,
    primaryModel: z.string().max(200),
    presetId: z.enum(WORKER_PRESET_IDS),
    workerModel: z.string().max(200),
    requestedWorkerModel: z.string().max(200).optional(),
    resolvedWorkerModel: z.string().max(200).optional(),
    workerModelSource: z
      .union([
        z.literal("explicit"),
        z.literal("preset"),
        z.literal("provider-default"),
      ])
      .optional(),
    workerModelRationale: z.string().max(4_000).optional(),
    runtimeWorkerModel: z.string().max(200).optional(),
    workerEffort: z.union([
      z.literal("low"),
      z.literal("medium"),
      z.literal("high"),
      z.literal("xhigh"),
      z.literal("max"),
      z.literal("ultra"),
      z.null(),
    ]),
  })
  .strict();

const CanonicalMessagePartSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("text"),
      text: z.string().max(500_000),
      segmentId: z.string().max(200).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("thinking"),
      text: z.string().max(500_000),
      isStreaming: z.boolean(),
    })
    .strict(),
  z
    .object({
      type: z.literal("tool_use"),
      toolUseId: z.string().max(200).optional(),
      toolName: z.string().max(200),
      input: z.string().max(500_000),
      output: z.string().max(500_000).optional(),
      state: z.union([
        z.literal("input-streaming"),
        z.literal("input-available"),
        z.literal("output-available"),
        z.literal("output-error"),
      ]),
      workerExecution: WorkerExecutionMetadataSchema.optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("code_diff"),
      filePath: z.string().max(4096),
      oldContent: z.string().max(500_000),
      newContent: z.string().max(500_000),
      status: z.union([
        z.literal("pending"),
        z.literal("accepted"),
        z.literal("rejected"),
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("file_context"),
      filePath: z.string().max(4096),
      content: z.string().max(500_000),
      language: z.string().max(200),
      instruction: z.string().max(5000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("approval"),
      toolName: z.string().max(200),
      description: z.string().max(5000),
      input: z.string().max(500_000).optional(),
      workerExecution: WorkerExecutionMetadataSchema.optional(),
      requestId: z.string().max(200),
      state: z.union([
        z.literal("approval-requested"),
        z.literal("approval-responded"),
        z.literal("approval-interrupted"),
        z.literal("output-denied"),
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("user_input"),
      requestId: z.string().max(200),
      toolName: z.string().max(200),
      questions: z.array(UserInputQuestionSchema).max(20),
      answers: z.record(z.string(), z.string()).optional(),
      state: z.union([
        z.literal("input-requested"),
        z.literal("input-responded"),
        z.literal("input-interrupted"),
        z.literal("input-denied"),
      ]),
    })
    .strict(),
  z
    .object({
      type: z.literal("image_context"),
      dataUrl: z.string().max(10_000_000),
      label: z.string().max(500),
      mimeType: z.string().max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal("workspace_information_context"),
      reference: z
        .object({
          section: z.union([
            z.literal("turn-summary"),
            z.literal("notes"),
            z.literal("todo"),
            z.literal("pr"),
            z.literal("jira"),
            z.literal("confluence"),
            z.literal("storybook"),
            z.literal("slack"),
            z.literal("figma"),
            z.literal("custom"),
          ]),
          scope: z.union([z.literal("section"), z.literal("item")]),
          itemId: z.string().max(4096).optional(),
          label: z.string().max(500),
          token: z.string().max(500),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("system_event"),
      content: z.string().max(500_000),
      compactBoundary: z
        .object({
          trigger: z.string().max(200).optional(),
          gitRef: z.string().max(200).optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
]);

const CanonicalContextPartSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("file_context"),
      filePath: z.string().max(4096),
      content: z.string().max(500_000),
      language: z.string().max(200),
      instruction: z.string().max(5000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("image_context"),
      dataUrl: z.string().max(10_000_000),
      label: z.string().max(500),
      mimeType: z.string().max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal("skill_context"),
      skills: z
        .array(
          z
            .object({
              id: z.string().max(4096),
              slug: z.string().max(200),
              name: z.string().max(200),
              description: z.string().max(10_000),
              scope: z.union([
                z.literal("global"),
                z.literal("user"),
                z.literal("local"),
              ]),
              provider: z.union([
                z.literal("claude-code"),
                z.literal("codex"),
                z.literal("shared"),
              ]),
              path: z.string().max(4096),
              invocationToken: z.string().max(300),
              instructions: z.string().max(500_000),
            })
            .strict(),
        )
        .max(32),
    })
    .strict(),
  z
    .object({
      type: z.literal("retrieved_context"),
      sourceId: z.string().max(200),
      title: z.string().max(500).optional(),
      content: z.string().max(500_000),
    })
    .strict(),
]);

const CanonicalConversationMessageSchema = z
  .object({
    messageId: z.string().max(200).optional(),
    role: z.union([z.literal("user"), z.literal("assistant")]),
    providerId: z.union([ProviderIdSchema, z.literal("user")]).optional(),
    model: z.string().max(200).optional(),
    content: z.string().max(500_000),
    parts: z.array(CanonicalMessagePartSchema).max(500),
    isPlanResponse: z.boolean().optional(),
    planText: z.string().max(500_000).optional(),
  })
  .strict();

const CanonicalConversationRequestSchema = z
  .object({
    turnId: z.string().min(1).max(200).optional(),
    taskId: z.string().max(200).optional(),
    workspaceId: z.string().max(200).optional(),
    target: z
      .object({
        providerId: ProviderIdSchema,
        model: z.string().max(200).optional(),
      })
      .strict(),
    mode: z.union([z.literal("chat"), z.literal("review")]),
    history: z.array(CanonicalConversationMessageSchema).max(1000),
    input: CanonicalConversationMessageSchema.extend({
      role: z.literal("user"),
    }),
    contextParts: z.array(CanonicalContextPartSchema).max(200),
    resume: z
      .object({
        nativeSessionId: z.string().max(200).optional(),
        syncedThroughMessageId: z.string().max(200).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const StreamTurnArgsSchema = z
  .object({
    turnId: z.string().min(1).max(200).optional(),
    providerId: ProviderIdSchema,
    prompt: z.string().max(500_000),
    conversation: CanonicalConversationRequestSchema.optional(),
    taskId: z.string().max(200).optional(),
    workspaceId: z.string().max(200).optional(),
    cwd: z.string().max(4096).optional(),
    runtimeOptions: RuntimeOptionsSchema,
  })
  .strict();
