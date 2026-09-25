import { z } from "zod";
import { WORKER_PRESET_IDS } from "../../../src/lib/providers/worker-preset-ids";
import { MAX_BOUND_SECRETS } from "../../../src/lib/secrets/secrets";

export const MAX_PROVIDER_TIMEOUT_MS = 86_400_000;

export const ProviderIdSchema = z.union([
  z.literal("claude-code"),
  z.literal("codex"),
  z.literal("cursor"),
  z.literal("kiro"),
]);

export const ManagedExecutionProviderIdSchema = z.union([
  z.literal("claude-code"),
  z.literal("codex"),
]);

export const RuntimeOptionsObjectSchema = z
  .object({
    model: z.string().max(200).optional(),
    chatStreamingEnabled: z.boolean().optional(),
    debug: z.boolean().optional(),
    providerTimeoutMs: z
      .number()
      .int()
      .min(1)
      .max(MAX_PROVIDER_TIMEOUT_MS)
      .optional(),
    claudeBinaryPath: z.string().max(4096).optional(),
    claudePermissionMode: z
      .union([
        z.literal("default"),
        z.literal("acceptEdits"),
        z.literal("bypassPermissions"),
        z.literal("plan"),
        z.literal("dontAsk"),
        z.literal("auto"),
      ])
      .optional(),
    claudePlanModeApprovalScope: z
      .union([
        z.literal("strict"),
        z.literal("bash"),
        z.literal("bashAndTask"),
        z.literal("bashTaskAndMcp"),
      ])
      .optional(),
    claudeAllowDangerouslySkipPermissions: z.boolean().optional(),
    claudeSandboxEnabled: z.boolean().optional(),
    claudeAllowUnsandboxedCommands: z.boolean().optional(),
    claudeSandboxCredentialFiles: z
      .array(z.string().trim().min(1).max(4096))
      .max(100)
      .optional(),
    claudeSandboxCredentialEnvVars: z
      .array(z.string().trim().min(1).max(200))
      .max(100)
      .optional(),
    claudeSystemPrompt: z.string().max(20_000).optional(),
    claudeMaxTurns: z.number().int().min(1).max(200).optional(),
    claudeMaxBudgetUsd: z.number().min(0).max(10_000).optional(),
    claudeTaskBudgetTokens: z.number().int().min(1).max(1_000_000).optional(),
    claudeSettingSources: z
      .array(
        z.union([z.literal("user"), z.literal("project"), z.literal("local")]),
      )
      .max(3)
      .optional(),
    claudeEffort: z
      .union([
        z.literal("low"),
        z.literal("medium"),
        z.literal("high"),
        z.literal("xhigh"),
        z.literal("max"),
      ])
      .optional(),
    claudeThinkingMode: z
      .union([
        z.literal("adaptive"),
        z.literal("enabled"),
        z.literal("disabled"),
      ])
      .optional(),
    claudeAgentProgressSummaries: z.boolean().optional(),
    claudePromptSuggestions: z.boolean().optional(),
    claudeForwardSubagentText: z.boolean().optional(),
    claudeEnableFileCheckpointing: z.boolean().optional(),
    claudeForkSession: z.boolean().optional(),
    claudeStrictMcpConfig: z.boolean().optional(),
    providerBrowserAutoFallback: z.boolean().optional(),
    providerBrowserAutoFallbackDomains: z.string().optional(),
    claudeFastMode: z.boolean().optional(),
    claudeAllowedTools: z.array(z.string().max(200)).max(200).optional(),
    claudeDisallowedTools: z.array(z.string().max(200)).max(200).optional(),
    trustedTools: z.array(z.string().max(500)).max(200).optional(),
    claudeSkills: z
      .union([z.literal("all"), z.array(z.string().max(200)).max(200)])
      .optional(),
    claudePluginPaths: z.array(z.string().max(4096)).max(50).optional(),
    claudePluginMode: z
      .union([z.literal("off"), z.literal("claude-config"), z.literal("all")])
      .optional(),
    claudePluginOverrides: z
      .record(z.string().min(1).max(200), z.boolean())
      .optional(),
    claudeAgentName: z.string().max(200).optional(),
    claudeFallbackModel: z.string().max(500).optional(),
    claudeResumeSessionId: z.string().max(200).optional(),
    claudeResumeSessionAt: z.string().max(200).optional(),
    codexFileAccess: z
      .union([
        z.literal("read-only"),
        z.literal("workspace-write"),
        z.literal("danger-full-access"),
      ])
      .optional(),
    codexNetworkAccess: z.boolean().optional(),
    codexApprovalPolicy: z
      .union([
        z.literal("never"),
        z.literal("on-request"),
        z.literal("on-failure"),
        z.literal("untrusted"),
      ])
      .optional(),
    codexAutoApproveStaveLocalMcpTools: z.boolean().optional(),
    codexBinaryPath: z.string().max(4096).optional(),
    codexReasoningEffort: z
      .union([
        z.literal("minimal"),
        z.literal("low"),
        z.literal("medium"),
        z.literal("high"),
        z.literal("xhigh"),
        z.literal("max"),
        z.literal("ultra"),
      ])
      .optional(),
    codexWebSearch: z
      .union([
        z.literal("disabled"),
        z.literal("cached"),
        z.literal("live"),
        z.literal("indexed"),
      ])
      .optional(),
    codexAppToolApprovalMode: z
      .union([
        z.literal("inherit"),
        z.literal("auto"),
        z.literal("prompt"),
        z.literal("writes"),
        z.literal("approve"),
      ])
      .optional(),
    codexShowRawReasoning: z.boolean().optional(),
    codexReasoningSummary: z
      .union([
        z.literal("auto"),
        z.literal("concise"),
        z.literal("detailed"),
        z.literal("none"),
      ])
      .optional(),
    codexReasoningSummarySupport: z
      .union([z.literal("auto"), z.literal("enabled"), z.literal("disabled")])
      .optional(),
    codexFastMode: z.boolean().optional(),
    codexPlanMode: z.boolean().optional(),
    codexResumeThreadId: z.string().max(200).optional(),
    cursorBinaryPath: z.string().max(4096).optional(),
    cursorMode: z
      .union([z.literal("agent"), z.literal("plan"), z.literal("ask")])
      .optional(),
    cursorApprovalMode: z
      .union([z.literal("manual"), z.literal("guided"), z.literal("auto")])
      .optional(),
    cursorEffort: z
      .union([
        z.literal("low"),
        z.literal("medium"),
        z.literal("high"),
        z.literal("xhigh"),
        z.literal("max"),
      ])
      .optional(),
    cursorFastMode: z.boolean().optional(),
    cursorResumeSessionId: z.string().max(500).optional(),
    kiroBinaryPath: z.string().max(4096).optional(),
    kiroEffort: z
      .union([
        z.literal("low"),
        z.literal("medium"),
        z.literal("high"),
        z.literal("xhigh"),
        z.literal("max"),
      ])
      .optional(),
    kiroApprovalMode: z
      .union([z.literal("manual"), z.literal("auto")])
      .optional(),
    kiroResumeSessionId: z.string().max(500).optional(),
    advisorTarget: z
      .object({
        providerId: ManagedExecutionProviderIdSchema,
        model: z.string().trim().min(1).max(200),
        // Optional: absent means the Advisor follows the model's provider
        // default. Codex's legacy "minimal" is not accepted here because it is
        // not selectable, and `resolveAdvisorEffort` would collapse it anyway.
        effort: z
          .union([
            z.literal("low"),
            z.literal("medium"),
            z.literal("high"),
            z.literal("xhigh"),
            z.literal("max"),
            z.literal("ultra"),
          ])
          .optional(),
      })
      .strict()
      .optional(),
    // Per-turn on-demand Advisor consult budget. Bounds mirror
    // `normalizeAdvisorConsultLimit`; the main process re-normalizes anyway.
    advisorConsultLimit: z.number().int().min(1).max(20).optional(),
    // Worker mode intent, already narrowed to the active provider. Shape only:
    // whether this model may actually run as a worker on this primary is
    // semantic and is re-proved by `resolveWorkerProfile` in the main process.
    workerIntent: z
      .object({
        mode: z.literal("task-executor"),
        presetId: z.string().trim().pipe(z.enum(WORKER_PRESET_IDS)),
        // "auto" defers to the preset's per-provider recommendation.
        workerModel: z.string().trim().min(1).max(200),
        workerEffort: z.union([
          z.literal("auto"),
          z.literal("low"),
          z.literal("medium"),
          z.literal("high"),
          z.literal("xhigh"),
          z.literal("max"),
          z.literal("ultra"),
        ]),
        description: z.string().trim().max(600).optional(),
        instructions: z.string().trim().max(8_000).optional(),
        tools: z.array(z.string().trim().min(1).max(120)).max(40).optional(),
        maxTurns: z.number().int().min(1).max(200).optional(),
      })
      .strict()
      .optional(),
    responseStylePrompt: z.string().max(10_000).optional(),
    promptPrDescription: z.string().max(10_000).optional(),
    promptInlineCompletion: z.string().max(10_000).optional(),
    // Ids of vault secrets the user bound to this task. Values are NEVER carried
    // here — the main process resolves ids to an env map at spawn/thread-start.
    boundSecretIds: z
      .array(z.string().uuid())
      .max(MAX_BOUND_SECRETS)
      .optional(),
  })
  .strict();

export const RuntimeOptionsSchema = RuntimeOptionsObjectSchema.optional();

