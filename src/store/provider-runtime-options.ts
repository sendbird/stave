import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import {
  resolveEffectiveCodexApprovalPolicy,
  resolveEffectiveCodexFileAccessMode,
} from "@/lib/providers/codex-runtime-options";
import { resolveDefaultClaudeFallbackModel } from "@/lib/providers/model-catalog";
import { getProviderSessionId } from "@/lib/providers/provider-sessions";
import {
  normalizeTrustedToolEntries,
  toClaudeAllowedToolsFromTrustedEntries,
} from "@/lib/providers/trusted-tools";
import type {
  ClaudeSettingSource,
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import type { UtilityInferenceContext } from "@/lib/providers/utility-inference";
import {
  resolveAuxLaneRuntime,
  type AuxLane,
} from "@/lib/providers/auxiliary-inference-policy";
import type { AppSettings } from "@/store/app.store";
import { agentModeClaudeGuardrails } from "@/lib/providers/provider.types";

const DEFAULT_CODEX_APPROVAL_POLICY = "untrusted";
const MAX_CLAUDE_TASK_BUDGET_TOKENS = 1_000_000;
const CLAUDE_SETTING_SOURCE_ORDER = [
  "project",
  "local",
  "user",
] as const satisfies readonly ClaudeSettingSource[];

type RuntimeSettings = Pick<
  AppSettings,
  | "chatStreamingEnabled"
  | "providerDebugStream"
  | "providerTimeoutMs"
  | "claudeBinaryPath"
  | "claudeAccountProfileId"
  | "codexAccountProfileId"
  | "claudePermissionMode"
  | "claudeAllowDangerouslySkipPermissions"
  | "claudeSandboxEnabled"
  | "claudeAllowUnsandboxedCommands"
  | "claudeSandboxCredentialFiles"
  | "claudeSandboxCredentialEnvVars"
  | "claudeGuardrails"
  | "claudeTaskBudgetTokens"
  | "claudeSettingSources"
  | "claudeEffort"
  | "claudeThinkingMode"
  | "claudeAgentProgressSummaries"
  | "claudePromptSuggestions"
  | "claudeForwardSubagentText"
  | "claudeEnableFileCheckpointing"
  | "claudeForkSession"
  | "claudeStrictMcpConfig"
  | "providerBrowserAutoFallback"
  | "providerBrowserAutoFallbackDomains"
  | "claudeFastMode"
  | "trustedTools"
  | "claudeSkills"
  | "claudePluginPaths"
  | "claudePluginMode"
  | "claudePluginOverrides"
  | "claudeAgentName"
  | "claudeFallbackModel"
  | "claudeResumeSessionAt"
  | "codexFileAccess"
  | "codexNetworkAccess"
  | "codexApprovalPolicy"
  | "codexBinaryPath"
  | "codexReasoningEffort"
  | "codexWebSearch"
  | "codexAppToolApprovalMode"
  | "codexShowRawReasoning"
  | "codexReasoningSummary"
  | "codexReasoningSummarySupport"
  | "codexFastMode"
  | "cursorBinaryPath"
  | "cursorMode"
  | "cursorApprovalMode"
  | "cursorEffort"
  | "cursorFastMode"
  | "kiroBinaryPath"
  | "kiroEffort"
  | "kiroApprovalMode"
  | "promptResponseStyle"
  | "promptPrDescription"
  | "promptInlineCompletion"
>;

export function normalizeCodexApprovalPolicy(args: {
  value?: string;
}): NonNullable<ProviderRuntimeOptions["codexApprovalPolicy"]> {
  return resolveEffectiveCodexApprovalPolicy({
    approvalPolicy: args.value,
    fallback: DEFAULT_CODEX_APPROVAL_POLICY,
  });
}

function normalizeDelimitedSettingList(value?: string | null) {
  return (value ?? "")
    .split(/[\n,]+/g)
    .map((entry) => entry.trim())
    .filter(
      (entry, index, entries) =>
        entry.length > 0 && entries.indexOf(entry) === index,
    );
}

function normalizeClaudePluginMode(
  value?: string | null,
): NonNullable<ProviderRuntimeOptions["claudePluginMode"]> {
  return value === "off" || value === "all" || value === "claude-config"
    ? value
    : "claude-config";
}

/**
 * Per-plugin overrides are persisted as a plain map, so a corrupted or
 * hand-edited settings blob must not reach the runtime. Only string→boolean
 * entries survive.
 */
function normalizeClaudePluginOverrides(
  value?: Record<string, unknown> | null,
): Record<string, boolean> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const entries = Object.entries(value).flatMap(([id, enabled]) => {
    const normalizedId = id.trim();
    return normalizedId && typeof enabled === "boolean"
      ? [[normalizedId, enabled] as [string, boolean]]
      : [];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeClaudeSkillsSetting(
  value?: string | null,
): ProviderRuntimeOptions["claudeSkills"] {
  const entries = normalizeDelimitedSettingList(value);
  if (entries.length === 0) {
    return undefined;
  }
  if (entries.length === 1 && entries[0]?.toLowerCase() === "all") {
    return "all";
  }
  return entries;
}

export function normalizeClaudeTaskBudgetTokens(args: {
  value?: number | null;
}) {
  const candidate = typeof args.value === "number" ? args.value : 0;
  if (!Number.isFinite(candidate) || candidate <= 0) {
    return 0;
  }
  return Math.min(MAX_CLAUDE_TASK_BUDGET_TOKENS, Math.floor(candidate));
}

export function normalizeClaudeSettingSources(args: {
  value?: readonly string[] | null;
}): ClaudeSettingSource[] {
  const rawSources = Array.isArray(args.value) ? args.value : [];
  const normalizedSet = new Set<ClaudeSettingSource>();

  rawSources.forEach((source) => {
    if (source === "user" || source === "project" || source === "local") {
      normalizedSet.add(source);
    }
  });

  return CLAUDE_SETTING_SOURCE_ORDER.filter((source) =>
    normalizedSet.has(source),
  );
}

export function applyRepositoryBasePromptToRuntimeOptions(args: {
  runtimeOptions: ProviderRuntimeOptions;
  repositoryBasePrompt?: string | null;
}): ProviderRuntimeOptions {
  const repositoryBasePrompt = args.repositoryBasePrompt?.trim();
  if (!repositoryBasePrompt) {
    return args.runtimeOptions;
  }

  const currentSystemPrompt = args.runtimeOptions.claudeSystemPrompt?.trim();
  return {
    ...args.runtimeOptions,
    claudeSystemPrompt: currentSystemPrompt
      ? `${repositoryBasePrompt}\n\n${currentSystemPrompt}`
      : repositoryBasePrompt,
  };
}

export function buildProviderRuntimeOptions(args: {
  provider: ProviderId;
  model: string;
  settings: RuntimeSettings;
  providerSession?: TaskProviderSessionState | null;
  /**
   * Ids of vault secrets the user bound to this task. Carried through to the
   * runtime so the main process can resolve them to env vars. Ids only.
   */
  boundSecretIds?: string[];
}): ProviderRuntimeOptions {
  const { providerSession, settings } = args;
  const boundSecretIds =
    args.boundSecretIds && args.boundSecretIds.length > 0
      ? args.boundSecretIds
      : undefined;
  const claudeTaskBudgetTokens = normalizeClaudeTaskBudgetTokens({
    value: settings.claudeTaskBudgetTokens,
  });
  const trustedTools = normalizeTrustedToolEntries(settings.trustedTools);
  const claudeAllowedTools =
    toClaudeAllowedToolsFromTrustedEntries(trustedTools);
  const claudeResumeSessionId = getProviderSessionId({
    sessions: providerSession ?? undefined,
    providerId: "claude-code",
    accountProfileId: settings.claudeAccountProfileId,
  });
  const codexResumeThreadId = getProviderSessionId({
    sessions: providerSession ?? undefined,
    providerId: "codex",
    accountProfileId: settings.codexAccountProfileId,
  });
  const cursorResumeSessionId = getProviderSessionId({
    sessions: providerSession ?? undefined,
    providerId: "cursor",
  });
  const kiroResumeSessionId = getProviderSessionId({
    sessions: providerSession ?? undefined,
    providerId: "kiro",
  });
  const claudePluginOverrides = normalizeClaudePluginOverrides(
    settings.claudePluginOverrides,
  );
  const claudeFallbackModel =
    settings.claudeFallbackModel.trim() ||
    resolveDefaultClaudeFallbackModel({ model: args.model });
  const codexFileAccess = resolveEffectiveCodexFileAccessMode({
    fileAccessMode: settings.codexFileAccess,
    fallback: "workspace-write",
  });
  const codexApprovalPolicy = resolveEffectiveCodexApprovalPolicy({
    approvalPolicy: normalizeCodexApprovalPolicy({
      value: settings.codexApprovalPolicy,
    }),
    fallback: DEFAULT_CODEX_APPROVAL_POLICY,
  });

  return {
    model: args.model,
    chatStreamingEnabled: settings.chatStreamingEnabled,
    debug: settings.providerDebugStream,
    providerTimeoutMs: settings.providerTimeoutMs,
    claudeBinaryPath: settings.claudeBinaryPath || undefined,
    claudeAccountProfileId: settings.claudeAccountProfileId,
    codexAccountProfileId: settings.codexAccountProfileId,
    claudePermissionMode: settings.claudePermissionMode,
    claudeAllowDangerouslySkipPermissions:
      settings.claudeAllowDangerouslySkipPermissions,
    claudeSandboxEnabled: settings.claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands: settings.claudeAllowUnsandboxedCommands,
    ...(normalizeDelimitedSettingList(settings.claudeSandboxCredentialFiles)
      .length > 0
      ? {
          claudeSandboxCredentialFiles: normalizeDelimitedSettingList(
            settings.claudeSandboxCredentialFiles,
          ),
        }
      : {}),
    ...(normalizeDelimitedSettingList(settings.claudeSandboxCredentialEnvVars)
      .length > 0
      ? {
          claudeSandboxCredentialEnvVars: normalizeDelimitedSettingList(
            settings.claudeSandboxCredentialEnvVars,
          ),
        }
      : {}),
    // Explicit, even when empty: an absent list means the Agent-mode default (all three).
    claudeGuardrails: agentModeClaudeGuardrails(settings.claudeGuardrails),
    claudeSettingSources: normalizeClaudeSettingSources({
      value: settings.claudeSettingSources,
    }),
    ...(claudeTaskBudgetTokens > 0
      ? {
          claudeTaskBudgetTokens,
        }
      : {}),
    claudeEffort: settings.claudeEffort,
    claudeThinkingMode: settings.claudeThinkingMode,
    claudeAgentProgressSummaries: settings.claudeAgentProgressSummaries,
    claudePromptSuggestions: settings.claudePromptSuggestions,
    claudeForwardSubagentText: settings.claudeForwardSubagentText,
    claudeEnableFileCheckpointing: settings.claudeEnableFileCheckpointing,
    claudeForkSession: settings.claudeForkSession,
    claudeStrictMcpConfig: settings.claudeStrictMcpConfig,
    providerBrowserAutoFallback: settings.providerBrowserAutoFallback,
    providerBrowserAutoFallbackDomains:
      settings.providerBrowserAutoFallbackDomains,
    claudeFastMode: settings.claudeFastMode,
    trustedTools,
    ...(claudeAllowedTools.length > 0 ? { claudeAllowedTools } : {}),
    ...(normalizeClaudeSkillsSetting(settings.claudeSkills)
      ? { claudeSkills: normalizeClaudeSkillsSetting(settings.claudeSkills) }
      : {}),
    ...(normalizeDelimitedSettingList(settings.claudePluginPaths).length > 0
      ? {
          claudePluginPaths: normalizeDelimitedSettingList(
            settings.claudePluginPaths,
          ),
        }
      : {}),
    claudePluginMode: normalizeClaudePluginMode(settings.claudePluginMode),
    ...(claudePluginOverrides ? { claudePluginOverrides } : {}),
    ...(settings.claudeAgentName.trim()
      ? { claudeAgentName: settings.claudeAgentName.trim() }
      : {}),
    ...(claudeFallbackModel ? { claudeFallbackModel } : {}),
    ...(args.provider === "claude-code" && claudeResumeSessionId
      ? { claudeResumeSessionId }
      : {}),
    ...(settings.claudeResumeSessionAt.trim()
      ? { claudeResumeSessionAt: settings.claudeResumeSessionAt.trim() }
      : {}),
    codexFileAccess,
    codexNetworkAccess: settings.codexNetworkAccess,
    codexApprovalPolicy,
    ...(args.provider === "codex" &&
    codexFileAccess === "danger-full-access" &&
    codexApprovalPolicy === "never"
      ? { codexAutoApproveStaveLocalMcpTools: true }
      : {}),
    codexBinaryPath: settings.codexBinaryPath || undefined,
    codexReasoningEffort: settings.codexReasoningEffort,
    codexWebSearch: settings.codexWebSearch,
    codexAppToolApprovalMode: settings.codexAppToolApprovalMode,
    codexShowRawReasoning: settings.codexShowRawReasoning,
    codexReasoningSummary: settings.codexReasoningSummary,
    codexReasoningSummarySupport: settings.codexReasoningSummarySupport,
    codexFastMode: settings.codexFastMode,
    ...(args.provider === "codex" && codexResumeThreadId
      ? { codexResumeThreadId }
      : {}),
    cursorBinaryPath: settings.cursorBinaryPath || undefined,
    cursorMode: settings.cursorMode,
    cursorApprovalMode: settings.cursorApprovalMode,
    cursorEffort: settings.cursorEffort,
    cursorFastMode: settings.cursorFastMode,
    ...(args.provider === "cursor" && cursorResumeSessionId
      ? { cursorResumeSessionId }
      : {}),
    kiroBinaryPath: settings.kiroBinaryPath || undefined,
    kiroEffort: settings.kiroEffort,
    kiroApprovalMode: settings.kiroApprovalMode,
    ...(args.provider === "kiro" && kiroResumeSessionId
      ? { kiroResumeSessionId }
      : {}),
    responseStylePrompt: settings.promptResponseStyle || undefined,
    promptPrDescription: settings.promptPrDescription || undefined,
    promptInlineCompletion: settings.promptInlineCompletion || undefined,
    ...(boundSecretIds ? { boundSecretIds } : {}),
  };
}

export function buildUtilityInferenceContext(args: {
  cwd?: string;
  provider: ProviderId;
  model: string;
  settings: RuntimeSettings &
    Pick<AppSettings, "utilityInferenceProvider" | "auxiliaryInferencePolicy">;
  /** Which Background AI lane pays for this call. */
  lane?: Extract<AuxLane, "utility" | "taskName">;
}): UtilityInferenceContext {
  const lane = resolveAuxLaneRuntime({
    lane: args.lane ?? "utility",
    policy: args.settings.auxiliaryInferencePolicy,
    legacyProviderId: args.settings.utilityInferenceProvider,
    activeProviderId: args.provider,
  });
  return {
    cwd: args.cwd,
    utilityProviderId: args.settings.utilityInferenceProvider,
    activeProviderId: args.provider,
    ...(lane.model ? { utilityModel: lane.model } : {}),
    ...(lane.config.maxProviderAttempts
      ? { utilityMaxProviderAttempts: lane.config.maxProviderAttempts }
      : {}),
    runtimeOptions: buildProviderRuntimeOptions({
      provider: args.provider,
      model: args.model,
      settings: args.settings,
    }),
  };
}
