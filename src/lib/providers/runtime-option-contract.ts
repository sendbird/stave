import type { ClaudeSettingSource, NormalizedProviderEvent, ProviderRuntimeOptions } from "@/lib/providers/provider.types";

type SelectOption<T extends string> = {
  value: T;
  label: string;
};

type Assert<T extends true> = T;
type IsNever<T> = [T] extends [never] ? true : false;

export const PROVIDER_TIMEOUT_OPTIONS = [1800000, 3600000, 7200000, 10800000] as const;
export const DEFAULT_PROVIDER_TIMEOUT_MS = 10800000;

export const BOOLEAN_TOGGLE_OPTIONS = [
  { value: "on", label: "On" },
  { value: "off", label: "Off" },
] as const satisfies readonly SelectOption<"on" | "off">[];

export const CLAUDE_PERMISSION_MODE_OPTIONS = [
  { value: "default", label: "default" },
  { value: "acceptEdits", label: "acceptEdits" },
  { value: "bypassPermissions", label: "bypassPermissions" },
  { value: "plan", label: "plan" },
  { value: "dontAsk", label: "dontAsk" },
  { value: "auto", label: "auto" },
] as const satisfies readonly SelectOption<NonNullable<ProviderRuntimeOptions["claudePermissionMode"]>>[];

export const CLAUDE_THINKING_OPTIONS = [
  { value: "adaptive", label: "Adaptive" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
] as const satisfies readonly SelectOption<NonNullable<ProviderRuntimeOptions["claudeThinkingMode"]>>[];

export const CLAUDE_EFFORT_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "X-High" },
  { value: "max", label: "Max" },
] as const satisfies readonly SelectOption<NonNullable<ProviderRuntimeOptions["claudeEffort"]>>[];

export const CLAUDE_SETTING_SOURCE_OPTIONS = [
  { value: "project", label: "Project" },
  { value: "local", label: "Local" },
  { value: "user", label: "User" },
] as const satisfies readonly SelectOption<ClaudeSettingSource>[];

export const CODEX_APPROVAL_POLICY_OPTIONS = [
  { value: "untrusted", label: "untrusted" },
  { value: "on-request", label: "on-request" },
  { value: "never", label: "never" },
] as const satisfies readonly SelectOption<NonNullable<ProviderRuntimeOptions["codexApprovalPolicy"]>>[];

export const CODEX_SANDBOX_MODE_OPTIONS = [
  { value: "read-only", label: "read-only" },
  { value: "workspace-write", label: "workspace-write" },
  { value: "danger-full-access", label: "danger-full-access" },
] as const satisfies readonly SelectOption<NonNullable<ProviderRuntimeOptions["codexFileAccess"]>>[];

export const CODEX_EFFORT_OPTIONS = [
  { value: "minimal", label: "Minimal" },
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "xhigh", label: "X-High" },
] as const satisfies readonly SelectOption<NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]>>[];

export const CODEX_WEB_SEARCH_OPTIONS = [
  { value: "cached", label: "Cached" },
  { value: "disabled", label: "Disabled" },
  { value: "live", label: "Live" },
] as const satisfies readonly SelectOption<NonNullable<ProviderRuntimeOptions["codexWebSearch"]>>[];

export const CODEX_REASONING_SUMMARY_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "concise", label: "Concise" },
  { value: "detailed", label: "Detailed" },
  { value: "none", label: "None" },
] as const satisfies readonly SelectOption<NonNullable<ProviderRuntimeOptions["codexReasoningSummary"]>>[];

export const CODEX_REASONING_SUPPORT_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
] as const satisfies readonly SelectOption<NonNullable<ProviderRuntimeOptions["codexReasoningSummarySupport"]>>[];

export const STAVE_AUTO_ORCHESTRATION_OPTIONS = [
  { value: "off", label: "Off" },
  { value: "auto", label: "Auto" },
  { value: "aggressive", label: "Aggressive" },
] as const;

export const STAVE_AUTO_MAX_SUBTASK_OPTIONS = Array.from({ length: 8 }, (_, index) => {
  const value = String(index + 1);
  return { value, label: value };
});

export const PROVIDER_RUNTIME_OPTION_KEYS = [
  "model",
  "chatStreamingEnabled",
  "debug",
  "providerTimeoutMs",
  "claudeBinaryPath",
  "claudePermissionMode",
  "claudeAllowDangerouslySkipPermissions",
  "claudeSandboxEnabled",
  "claudeAllowUnsandboxedCommands",
  "claudeSystemPrompt",
  "claudeMaxTurns",
  "claudeMaxBudgetUsd",
  "claudeTaskBudgetTokens",
  "claudeSettingSources",
  "claudeEffort",
  "claudeThinkingMode",
  "claudeAgentProgressSummaries",
  "claudeFastMode",
  "claudeAllowedTools",
  "claudeDisallowedTools",
  "claudeAdvisorModel",
  "claudeResumeSessionId",
  "codexFileAccess",
  "codexNetworkAccess",
  "codexApprovalPolicy",
  "codexBinaryPath",
  "codexReasoningEffort",
  "codexWebSearch",
  "codexShowRawReasoning",
  "codexReasoningSummary",
  "codexReasoningSummarySupport",
  "codexFastMode",
  "codexPlanMode",
  "codexResumeThreadId",
  "staveAuto",
  "responseStylePrompt",
  "promptPrDescription",
  "promptInlineCompletion",
] as const satisfies readonly (keyof ProviderRuntimeOptions)[];

export type ProviderRuntimeOptionKey = (typeof PROVIDER_RUNTIME_OPTION_KEYS)[number];
export type ProviderRuntimeOptionKeyContractIsExhaustive = Assert<
  IsNever<Exclude<keyof ProviderRuntimeOptions, ProviderRuntimeOptionKey>>
>;
export type ProviderRuntimeOptionKeyContractIsValid = Assert<
  IsNever<Exclude<ProviderRuntimeOptionKey, keyof ProviderRuntimeOptions>>
>;

export const NORMALIZED_PROVIDER_EVENT_TYPES = [
  "thinking",
  "text",
  "provider_session",
  "usage",
  "prompt_suggestions",
  "tool",
  "tool_progress",
  "tool_result",
  "diff",
  "approval",
  "user_input",
  "plan_ready",
  "system",
  "subagent_progress",
  "model_resolved",
  "stave:execution_processing",
  "stave:orchestration_processing",
  "stave:subtask_started",
  "stave:subtask_done",
  "stave:synthesis_started",
  "error",
  "done",
] as const satisfies readonly NormalizedProviderEvent["type"][];

export type NormalizedProviderEventType = (typeof NORMALIZED_PROVIDER_EVENT_TYPES)[number];
export type NormalizedProviderEventTypeContractIsExhaustive = Assert<
  IsNever<Exclude<NormalizedProviderEvent["type"], NormalizedProviderEventType>>
>;
export type NormalizedProviderEventTypeContractIsValid = Assert<
  IsNever<Exclude<NormalizedProviderEventType, NormalizedProviderEvent["type"]>>
>;

export function findOptionLabel(
  options: ReadonlyArray<{ value: string; label: string }>,
  value: string,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function formatProviderTimeoutLabel(value: number) {
  const minutes = Math.round(value / 60000);
  if (minutes >= 60) {
    const hours = minutes / 60;
    return hours === 1 ? `${hours} hour` : `${hours} hours`;
  }
  return `${minutes} min`;
}

export function formatTitleCaseRuntimeValue(value: string) {
  return value
    .split(/[-_]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function formatShortRuntimePath(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }
  const parts = normalized.split(/[\\/]+/).filter(Boolean);
  if (parts.length <= 2) {
    return normalized;
  }
  return `.../${parts.slice(-2).join("/")}`;
}

export function formatClaudeSettingSources(value: ClaudeSettingSource[]) {
  if (value.length === 0) {
    return "None";
  }
  return value
    .map((source) => findOptionLabel(CLAUDE_SETTING_SOURCE_OPTIONS, source))
    .join(" + ");
}

export function formatTokenBudget(value: number) {
  if (value <= 0) {
    return "Off";
  }
  if (value >= 1000) {
    const compact = value % 1000 === 0
      ? String(value / 1000)
      : (value / 1000).toFixed(1).replace(/\.0$/, "");
    return `${compact}k`;
  }
  return String(value);
}
