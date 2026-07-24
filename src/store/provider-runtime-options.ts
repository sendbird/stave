import type { TaskProviderSessionState } from "@/lib/db/workspaces.db";
import {
  resolveEffectiveCodexApprovalPolicy,
  resolveEffectiveCodexFileAccessMode,
} from "@/lib/providers/codex-runtime-options";
import {
  DEFAULT_CLAUDE_OPUS_MODEL,
  DEFAULT_CLAUDE_SONNET_MODEL,
} from "@/lib/providers/model-catalog";
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
import type { AppSettings } from "@/store/app.store";

const DEFAULT_CODEX_APPROVAL_POLICY = "untrusted";
const MAX_CLAUDE_TASK_BUDGET_TOKENS = 1_000_000;
const CLAUDE_ADVISOR_SOURCE_SONNET_MODEL = DEFAULT_CLAUDE_SONNET_MODEL;
const CLAUDE_ADVISOR_SOURCE_OPUS_MODEL = DEFAULT_CLAUDE_OPUS_MODEL;
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
  | "claudeTaskBudgetTokens"
  | "claudeAdvisorModel"
  | "claudeSettingSources"
  | "claudeEffort"
  | "claudeThinkingMode"
  | "claudeAgentProgressSummaries"
  | "claudePromptSuggestions"
  | "claudeForwardSubagentText"
  | "claudeEnableFileCheckpointing"
  | "claudeForkSession"
  | "claudeStrictMcpConfig"
  | "claudeFastMode"
  | "trustedTools"
  | "claudeSkills"
  | "claudePluginPaths"
  | "claudeAgentName"
  | "claudeFallbackModel"
  | "claudeResumeSessionAt"
  | "codexFileAccess"
  | "codexNetworkAccess"
  | "codexApprovalPolicy"
  | "codexBinaryPath"
  | "codexReasoningEffort"
  | "codexWebSearch"
  | "codexShowRawReasoning"
  | "codexReasoningSummary"
  | "codexReasoningSummarySupport"
  | "codexFastMode"
  | "codexPlanMode"
  | "codexFastModeVisible"
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
    .filter((entry, index, entries) => entry.length > 0 && entries.indexOf(entry) === index);
}

function normalizeClaudeSkillsSetting(value?: string | null): ProviderRuntimeOptions["claudeSkills"] {
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

function resolveClaudeAdvisorSourceFamily(args: {
  sourceModel: string;
}): "haiku" | "sonnet" | "opus" {
  const normalized = args.sourceModel.trim().toLowerCase();
  if (normalized.includes("haiku")) {
    return "haiku";
  }
  if (normalized.includes("sonnet")) {
    return "sonnet";
  }
  if (normalized.includes("opus")) {
    return "opus";
  }
  return "sonnet";
}

function mapClaudeAdvisorModelFromSource(args: {
  sourceModel: string;
}): string {
  const sourceFamily = resolveClaudeAdvisorSourceFamily({
    sourceModel: args.sourceModel,
  });
  if (sourceFamily === "haiku") {
    return CLAUDE_ADVISOR_SOURCE_SONNET_MODEL;
  }
  if (sourceFamily === "sonnet") {
    return CLAUDE_ADVISOR_SOURCE_OPUS_MODEL;
  }
  return CLAUDE_ADVISOR_SOURCE_OPUS_MODEL;
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
}): ProviderRuntimeOptions {
  const { providerSession, settings } = args;
  const claudeTaskBudgetTokens = normalizeClaudeTaskBudgetTokens({
    value: settings.claudeTaskBudgetTokens,
  });
  const claudeAdvisorModelSetting = settings.claudeAdvisorModel.trim();
  const claudeAdvisorModel = claudeAdvisorModelSetting
    ? mapClaudeAdvisorModelFromSource({
        sourceModel: claudeAdvisorModelSetting,
      })
    : undefined;
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
    claudeSettingSources: normalizeClaudeSettingSources({
      value: settings.claudeSettingSources,
    }),
    ...(claudeTaskBudgetTokens > 0
      ? {
          claudeTaskBudgetTokens,
        }
      : {}),
    ...(claudeAdvisorModel ? { claudeAdvisorModel } : {}),
    claudeEffort: settings.claudeEffort,
    claudeThinkingMode: settings.claudeThinkingMode,
    claudeAgentProgressSummaries: settings.claudeAgentProgressSummaries,
    claudePromptSuggestions: settings.claudePromptSuggestions,
    claudeForwardSubagentText: settings.claudeForwardSubagentText,
    claudeEnableFileCheckpointing: settings.claudeEnableFileCheckpointing,
    claudeForkSession: settings.claudeForkSession,
    claudeStrictMcpConfig: settings.claudeStrictMcpConfig,
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
    ...(settings.claudeAgentName.trim()
      ? { claudeAgentName: settings.claudeAgentName.trim() }
      : {}),
    ...(settings.claudeFallbackModel.trim()
      ? { claudeFallbackModel: settings.claudeFallbackModel.trim() }
      : {}),
    ...(args.provider === "claude-code" && claudeResumeSessionId
      ? { claudeResumeSessionId }
      : {}),
    ...(settings.claudeResumeSessionAt.trim()
      ? { claudeResumeSessionAt: settings.claudeResumeSessionAt.trim() }
      : {}),
    codexFileAccess: resolveEffectiveCodexFileAccessMode({
      fileAccessMode: settings.codexFileAccess,
      planMode: settings.codexPlanMode,
      fallback: "workspace-write",
    }),
    codexNetworkAccess: settings.codexNetworkAccess,
    codexApprovalPolicy: resolveEffectiveCodexApprovalPolicy({
      approvalPolicy: normalizeCodexApprovalPolicy({
        value: settings.codexApprovalPolicy,
      }),
      planMode: settings.codexPlanMode,
      fallback: DEFAULT_CODEX_APPROVAL_POLICY,
    }),
    codexBinaryPath: settings.codexBinaryPath || undefined,
    codexReasoningEffort: settings.codexReasoningEffort,
    codexWebSearch: settings.codexWebSearch,
    codexShowRawReasoning: settings.codexShowRawReasoning,
    codexReasoningSummary: settings.codexReasoningSummary,
    codexReasoningSummarySupport: settings.codexReasoningSummarySupport,
    codexFastMode: settings.codexFastMode,
    codexPlanMode: settings.codexPlanMode,
    ...(args.provider === "codex" && codexResumeThreadId
      ? { codexResumeThreadId }
      : {}),
    responseStylePrompt: settings.promptResponseStyle || undefined,
    promptPrDescription: settings.promptPrDescription || undefined,
    promptInlineCompletion: settings.promptInlineCompletion || undefined,
  };
}
