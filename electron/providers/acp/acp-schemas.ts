import { z } from "zod";

export const AcpJsonRpcIdSchema = z.union([z.string(), z.number()]);

export const AcpJsonRpcErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: z.unknown().optional(),
});

export const AcpInitializeResponseSchema = z.object({
  protocolVersion: z.number(),
  agentCapabilities: z
    .object({
      loadSession: z.boolean().optional(),
      promptCapabilities: z
        .object({
          image: z.boolean().optional(),
          audio: z.boolean().optional(),
          embeddedContext: z.boolean().optional(),
        })
        .passthrough()
        .optional(),
      mcpCapabilities: z
        .object({
          http: z.boolean().optional(),
          sse: z.boolean().optional(),
        })
        .passthrough()
        .optional(),
    })
    .passthrough(),
  authMethods: z
    .array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          description: z.string().optional(),
        })
        .passthrough(),
    )
    .optional(),
});

export const AcpSessionModeStateSchema = z.object({
  currentModeId: z.string(),
  availableModes: z.array(
    z
      .object({
        id: z.string(),
        name: z.string(),
        description: z.string().optional(),
      })
      .passthrough(),
  ),
});

const AcpConfigSelectOptionSchema = z
  .object({
    value: z.string(),
    name: z.string(),
    description: z.string().optional(),
  })
  .passthrough();

export const AcpConfigSelectGroupSchema = z
  .object({
    group: z.string(),
    name: z.string(),
    options: z.array(AcpConfigSelectOptionSchema),
  })
  .passthrough();

export const AcpSessionConfigOptionSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().optional(),
    category: z.string().optional(),
    type: z.string(),
    currentValue: z.union([z.string(), z.boolean()]),
    options: z
      .array(z.union([AcpConfigSelectOptionSchema, AcpConfigSelectGroupSchema]))
      .optional(),
  })
  .passthrough();

export const AcpNewSessionResponseSchema = z.object({
  sessionId: z.string().min(1),
  modes: AcpSessionModeStateSchema.nullish(),
  configOptions: z.array(AcpSessionConfigOptionSchema).nullish(),
});

export const AcpLoadSessionResponseSchema = z.object({
  modes: AcpSessionModeStateSchema.nullish(),
  configOptions: z.array(AcpSessionConfigOptionSchema).nullish(),
}).passthrough();

/**
 * Token counts on a `session/prompt` result. ACP does not standardise the
 * casing, so both the snake_case and camelCase spellings are accepted and
 * normalised by `normalizeAcpPromptUsage`. Agents that nest the same object
 * under `_meta` are handled there too.
 */
export const AcpPromptUsageSchema = z
  .object({
    total_tokens: z.number().nonnegative().optional(),
    input_tokens: z.number().nonnegative().optional(),
    output_tokens: z.number().nonnegative().optional(),
    thought_tokens: z.number().nonnegative().optional(),
    cached_read_tokens: z.number().nonnegative().optional(),
    cached_write_tokens: z.number().nonnegative().optional(),
    totalTokens: z.number().nonnegative().optional(),
    inputTokens: z.number().nonnegative().optional(),
    outputTokens: z.number().nonnegative().optional(),
    thoughtTokens: z.number().nonnegative().optional(),
    cacheReadTokens: z.number().nonnegative().optional(),
    cacheWriteTokens: z.number().nonnegative().optional(),
    cachedReadTokens: z.number().nonnegative().optional(),
    cachedWriteTokens: z.number().nonnegative().optional(),
  })
  .passthrough();

export interface AcpNormalizedPromptUsage {
  inputTokens: number;
  outputTokens: number;
  thoughtTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
}

/**
 * Collapses the accepted spellings into one shape. Returns `null` when the
 * agent sent a usage object with no recognisable token count, so callers can
 * tell "not reported" apart from "reported as zero".
 */
export function normalizeAcpPromptUsage(
  raw: z.infer<typeof AcpPromptUsageSchema> | null | undefined,
): AcpNormalizedPromptUsage | null {
  if (!raw) {
    return null;
  }
  const input = raw.input_tokens ?? raw.inputTokens;
  const output = raw.output_tokens ?? raw.outputTokens;
  const thought = raw.thought_tokens ?? raw.thoughtTokens;
  const cacheRead =
    raw.cached_read_tokens ?? raw.cacheReadTokens ?? raw.cachedReadTokens;
  const cacheWrite =
    raw.cached_write_tokens ?? raw.cacheWriteTokens ?? raw.cachedWriteTokens;
  const total = raw.total_tokens ?? raw.totalTokens;
  if (
    input === undefined &&
    output === undefined &&
    thought === undefined &&
    cacheRead === undefined &&
    cacheWrite === undefined &&
    total === undefined
  ) {
    return null;
  }
  return {
    inputTokens: input ?? 0,
    outputTokens: output ?? 0,
    ...(thought !== undefined ? { thoughtTokens: thought } : {}),
    ...(cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {}),
    ...(cacheWrite !== undefined ? { cacheCreationTokens: cacheWrite } : {}),
  };
}

export const AcpPromptResponseSchema = z
  .object({
    stopReason: z.string(),
    usage: AcpPromptUsageSchema.nullish(),
    _meta: z
      .object({ usage: AcpPromptUsageSchema.nullish() })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export const AcpSessionNotificationSchema = z.object({
  sessionId: z.string(),
  update: z
    .object({
      sessionUpdate: z.string(),
    })
    .passthrough(),
});

/**
 * `usage_update` carries a context-window reading. `used`/`size` are optional
 * because some agents only report one of them (or only a cost), and dropping
 * the whole update in that case loses the reading entirely.
 */
export const AcpUsageUpdateSchema = z
  .object({
    sessionUpdate: z.literal("usage_update"),
    used: z.number().nonnegative().optional(),
    size: z.number().positive().optional(),
    usedPercent: z.number().min(0).max(100).optional(),
    cost: z
      .object({
        amount: z.number().nonnegative(),
        currency: z.string().trim().min(1),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .refine(
    (value) =>
      value.used !== undefined ||
      value.usedPercent !== undefined ||
      value.cost !== undefined,
    { message: "usage_update reported no usage reading." },
  );

const AcpTextContentSchema = z
  .object({
    type: z.literal("text"),
    text: z.string(),
  })
  .passthrough();

const AcpToolCallContentSchema = z
  .object({
    type: z.string(),
  })
  .passthrough();

export const AcpContentChunkUpdateSchema = z
  .object({
    sessionUpdate: z.union([
      z.literal("user_message_chunk"),
      z.literal("agent_message_chunk"),
      z.literal("agent_thought_chunk"),
    ]),
    content: AcpTextContentSchema,
    messageId: z.string().nullish(),
  })
  .passthrough();

export const AcpToolCallUpdateSchema = z
  .object({
    sessionUpdate: z.literal("tool_call"),
    toolCallId: z.string().min(1),
    title: z.string(),
    kind: z.string().nullish(),
    status: z
      .enum(["pending", "in_progress", "completed", "failed"])
      .nullish(),
    content: z.array(AcpToolCallContentSchema).nullish(),
    rawInput: z.unknown().optional(),
    rawOutput: z.unknown().optional(),
  })
  .passthrough();

export const AcpToolCallDeltaUpdateSchema = z
  .object({
    sessionUpdate: z.literal("tool_call_update"),
    toolCallId: z.string().min(1),
    title: z.string().nullish(),
    kind: z.string().nullish(),
    status: z
      .enum(["pending", "in_progress", "completed", "failed"])
      .nullish(),
    content: z.array(AcpToolCallContentSchema).nullish(),
    rawInput: z.unknown().optional(),
    rawOutput: z.unknown().optional(),
  })
  .passthrough();

export const AcpPlanUpdateSchema = z
  .object({
    sessionUpdate: z.literal("plan"),
    entries: z.array(
      z
        .object({
          content: z.string(),
          priority: z.string(),
          status: z.string(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const AcpCurrentModeUpdateSchema = z
  .object({
    sessionUpdate: z.literal("current_mode_update"),
    currentModeId: z.string(),
  })
  .passthrough();

export const AcpConfigOptionUpdateSchema = z
  .object({
    sessionUpdate: z.literal("config_option_update"),
    configOptions: z.array(AcpSessionConfigOptionSchema),
  })
  .passthrough();

export const AcpRequestPermissionSchema = z
  .object({
    sessionId: z.string().min(1),
    toolCall: z
      .object({
        toolCallId: z.string().min(1),
        title: z.string().nullish(),
        kind: z.string().nullish(),
        status: z.string().nullish(),
        rawInput: z.unknown().optional(),
      })
      .passthrough(),
    options: z.array(
      z
        .object({
          optionId: z.string().min(1),
          name: z.string(),
          kind: z.enum([
            "allow_once",
            "allow_always",
            "reject_once",
            "reject_always",
          ]),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type AcpInitializeResponse = z.infer<
  typeof AcpInitializeResponseSchema
>;
export type AcpSessionConfigOption = z.infer<
  typeof AcpSessionConfigOptionSchema
>;
export type AcpSessionModeState = z.infer<typeof AcpSessionModeStateSchema>;
export type AcpSessionNotification = z.infer<
  typeof AcpSessionNotificationSchema
>;
export type AcpRequestPermission = z.infer<
  typeof AcpRequestPermissionSchema
>;
