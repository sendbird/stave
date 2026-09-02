import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import {
  resolveEffectiveCodexApprovalPolicy,
  resolveEffectiveCodexFileAccessMode,
} from "@/lib/providers/codex-runtime-options";
import {
  isManagedExecutionProviderId,
  resolveDefaultClaudeFallbackModel,
} from "@/lib/providers/model-catalog";
import {
  type AdvisorArmOverrides,
  normalizeAdvisorConsultLimit,
  resolveAdvisorArmState,
} from "@/lib/providers/advisor";
import {
  type WorkerArmOverrides,
  buildWorkerRuntimeIntent,
  resolveWorkerArmState,
} from "@/lib/providers/worker-mode";
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
  | "claudePermissionMode"
  | "claudePlanModeApprovalScope"
  | "claudeAllowDangerouslySkipPermissions"
  | "claudeSandboxEnabled"
  | "claudeAllowUnsandboxedCommands"
  | "claudeSandboxCredentialFiles"
  | "claudeSandboxCredentialEnvVars"
  | "claudeTaskBudgetTokens"
  | "advisorEnabled"
  | "advisorTarget"
  | "advisorTargetByProvider"
  | "advisorConsultLimit"
  | "workerEnabled"
  | "workerConfigByProvider"
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
  | "codexPlanMode"
  | "cursorBinaryPath"
  | "cursorMode"
  | "cursorApprovalMode"
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

export function applyProjectBasePromptToRuntimeOptions(args: {
  runtimeOptions: ProviderRuntimeOptions;
  projectBasePrompt?: string | null;
}): ProviderRuntimeOptions {
  const projectBasePrompt = args.projectBasePrompt?.trim();
  if (!projectBasePrompt) {
    return args.runtimeOptions;
  }

  const currentSystemPrompt = args.runtimeOptions.claudeSystemPrompt?.trim();
  return {
    ...args.runtimeOptions,
    claudeSystemPrompt: currentSystemPrompt
      ? `${projectBasePrompt}\n\n${currentSystemPrompt}`
      : projectBasePrompt,
  };
}

export function buildProviderRuntimeOptions(args: {
  provider: ProviderId;
  model: string;
  settings: RuntimeSettings;
  providerSession?: TaskProviderSessionState | null;
  includeAdvisor?: boolean;
  /**
   * The task's per-turn Advisor arming, when the caller has a prompt draft.
   * Omitted for utility turns, which never opt into the Advisor anyway.
   */
  advisorRuntimeOverrides?: AdvisorArmOverrides | null;
  /**
   * The task's per-turn Worker mode arming. Same shape/scope rules as the
   * Advisor overrides above.
   */
  workerRuntimeOverrides?: WorkerArmOverrides | null;
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
  const managedProvider = isManagedExecutionProviderId(args.provider)
    ? args.provider
    : null;
  const advisorTarget = args.includeAdvisor && managedProvider
    ? resolveAdvisorArmState({
        overrides: args.advisorRuntimeOverrides,
        settingsTarget: settings.advisorTarget,
        settingsEnabled: settings.advisorEnabled,
        settingsTargetByProvider: settings.advisorTargetByProvider,
      }).effectiveTarget
    : null;
  // Gated on the same `includeAdvisor` flag: it marks a real conversation turn,
  // and utility/secondary turns must never spend a worker either.
  const workerIntent = args.includeAdvisor
    ? buildWorkerRuntimeIntent(
        resolveWorkerArmState({
          providerId: args.provider,
          overrides: args.workerRuntimeOverrides,
          settingsConfig: settings.workerConfigByProvider?.[args.provider],
          settingsEnabled: settings.workerEnabled,
        }),
      )
    : null;
  const trustedTools = normalizeTrustedToolEntries(settings.trustedTools);
  const claudeAllowedTools =
    toClaudeAllowedToolsFromTrustedEntries(trustedTools);
  const claudeResumeSessionId = getProviderSessionId({
    sessions: providerSession ?? undefined,
    providerId: "claude-code",
  });
  const codexResumeThreadId = getProviderSessionId({
    sessions: providerSession ?? undefined,
    providerId: "codex",
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
    planMode: settings.codexPlanMode,
    fallback: "workspace-write",
  });
  const codexApprovalPolicy = resolveEffectiveCodexApprovalPolicy({
    approvalPolicy: normalizeCodexApprovalPolicy({
      value: settings.codexApprovalPolicy,
    }),
    planMode: settings.codexPlanMode,
    fallback: DEFAULT_CODEX_APPROVAL_POLICY,
  });

  return {
    model: args.model,
    chatStreamingEnabled: settings.chatStreamingEnabled,
    debug: settings.providerDebugStream,
    providerTimeoutMs: settings.providerTimeoutMs,
    claudeBinaryPath: settings.claudeBinaryPath || undefined,
    claudePermissionMode: settings.claudePermissionMode,
    claudePlanModeApprovalScope: settings.claudePlanModeApprovalScope,
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
    claudeSettingSources: normalizeClaudeSettingSources({
      value: settings.claudeSettingSources,
    }),
    ...(claudeTaskBudgetTokens > 0
      ? {
          claudeTaskBudgetTokens,
        }
      : {}),
    ...(advisorTarget
      ? {
          advisorTarget,
          advisorConsultLimit: normalizeAdvisorConsultLimit(
            settings.advisorConsultLimit,
          ),
        }
      : {}),
    ...(workerIntent ? { workerIntent } : {}),
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
    codexPlanMode: settings.codexPlanMode,
    ...(args.provider === "codex" && codexResumeThreadId
      ? { codexResumeThreadId }
      : {}),
    cursorBinaryPath: settings.cursorBinaryPath || undefined,
    cursorMode: settings.cursorMode,
    cursorApprovalMode: settings.cursorApprovalMode,
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
