import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import {
  Badge,
  Button,
  Tabs,
  TabsContent,
} from "@/components/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CLAUDE_EFFORT_OPTIONS,
  CLAUDE_PERMISSION_MODE_OPTIONS,
  CLAUDE_THINKING_OPTIONS,
  CODEX_APPROVAL_POLICY_OPTIONS,
  CODEX_EFFORT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";
import {
  formatTrustedToolEntry,
  removeTrustedToolEntry,
} from "@/lib/providers/trusted-tools";
import {
  buildClaudeProviderModeSettingsPatch,
  buildCodexProviderModeSettingsPatch,
  CLAUDE_PROVIDER_MODE_PRESETS,
  CODEX_PROVIDER_MODE_PRESETS,
  detectClaudeProviderModePreset,
  detectCodexProviderModePreset,
  type ProviderModePresetDefinition,
  type ProviderModePresetId,
} from "@/lib/providers/provider-mode-presets";
import type {
  ClaudeSettingSource,
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import { listCodexReasoningEffortsForModel } from "@/lib/providers/model-catalog";
import { UI_LAYER_CLASS } from "@/lib/ui-layers";
import { cx, sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  readInt,
  SectionStack,
  SettingsFieldGuide,
  SettingsCard,
  SwitchField,
  ToggleChipGroup,
} from "./settings-dialog.shared";
import {
  ClaudeBinaryPathCard,
  ClaudeRuntimeToolsCard,
  CodexBinaryPathCard,
} from "./settings-dialog-developer-section";
import { ClaudeInstalledPluginsField } from "./settings-dialog-claude-plugins";
import { CodexPluginsCard } from "./settings-dialog-codex-plugins-card";
import { ClaudeGuardrailFields } from "./settings-dialog-claude-guardrails";
import { ProviderBrowserAccessSettingsCard } from "./ProviderBrowserAccessSettingsCard";
import { SettingsDelegationSection } from "./settings-dialog-delegation-section";
import { SettingsCursorSection } from "./settings-dialog-cursor-section";
import { SettingsKiroSection } from "./settings-dialog-kiro-section";
import { providersStyles } from "./settings-dialog-providers-section.styles";
import { SettingsProviderTabsList } from "./settings-provider-tabs";
type ExplainedSelectOption<T extends string> = {
  value: T;
  label: string;
  description: string;
  example?: string;
};

/** Tab order for the per-provider runtime settings below the shared cards. */
const PROVIDER_SETTINGS_TAB_IDS = [
  "claude-code",
  "codex",
  "cursor",
  "kiro",
] as const satisfies readonly ProviderId[];

const CLAUDE_PERMISSION_MODE_HELP = [
  {
    value: "default",
    label: "default",
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.default.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.default.example"); },
  },
  {
    value: "acceptEdits",
    label: "acceptEdits",
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.acceptEdits.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.acceptEdits.example"); },
  },
  {
    value: "bypassPermissions",
    label: "bypassPermissions",
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.bypassPermissions.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.bypassPermissions.example"); },
  },
  {
    value: "dontAsk",
    label: "dontAsk",
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.dontAsk.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.dontAsk.example"); },
  },
  {
    value: "auto",
    label: "auto",
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.auto.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.permissionMode.options.auto.example"); },
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["claudePermissionMode"]>
>[];

const CLAUDE_THINKING_MODE_HELP = [
  {
    value: "adaptive",
    get label() { return i18n.t("settingsProviders:providersSection.claudeRuntime.thinkingMode.options.adaptive.label"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.thinkingMode.options.adaptive.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.thinkingMode.options.adaptive.example"); },
  },
  {
    value: "enabled",
    get label() { return i18n.t("common:status.enabled"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.thinkingMode.options.enabled.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.thinkingMode.options.enabled.example"); },
  },
  {
    value: "disabled",
    get label() { return i18n.t("common:status.disabled"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.thinkingMode.options.disabled.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.thinkingMode.options.disabled.example"); },
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["claudeThinkingMode"]>
>[];

const CLAUDE_EFFORT_HELP = [
  {
    value: "low",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.low"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.low.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.low.example"); },
  },
  {
    value: "medium",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.medium"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.medium.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.medium.example"); },
  },
  {
    value: "high",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.high"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.high.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.high.example"); },
  },
  {
    value: "xhigh",
    label: "X-High",
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.xhigh.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.xhigh.example"); },
  },
  {
    value: "max",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.max"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.max.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.claudeRuntime.effort.options.max.example"); },
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["claudeEffort"]>
>[];

const CLAUDE_SETTING_SOURCE_HELP = [
  {
    value: "project",
    get label() { return i18n.t("settingsProviders:mcpConfigEditor.editor.scopes.project"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.settingSources.options.project.description"); },
  },
  {
    value: "local",
    get label() { return i18n.t("settingsProviders:providersSection.claudeRuntime.settingSources.options.local.label"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.settingSources.options.local.description"); },
  },
  {
    value: "user",
    get label() { return i18n.t("settingsProviders:mcpConfigEditor.editor.scopes.user"); },
    get description() { return i18n.t("settingsProviders:providersSection.claudeRuntime.settingSources.options.user.description"); },
  },
] as const satisfies ReadonlyArray<{
  value: ClaudeSettingSource;
  label: string;
  description: string;
}>;

const CODEX_FILE_ACCESS_HELP = [
  {
    value: "read-only",
    label: "read-only",
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.fileAccess.options.readOnly.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.fileAccess.options.readOnly.example"); },
  },
  {
    value: "workspace-write",
    label: "workspace-write",
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.fileAccess.options.workspaceWrite.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.fileAccess.options.workspaceWrite.example"); },
  },
  {
    value: "danger-full-access",
    label: "danger-full-access",
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.fileAccess.options.dangerFullAccess.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.fileAccess.options.dangerFullAccess.example"); },
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexFileAccess"]>
>[];

const CODEX_APPROVAL_POLICY_HELP = [
  {
    value: "untrusted",
    label: "untrusted",
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.approvals.options.untrusted.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.approvals.options.untrusted.example"); },
  },
  {
    value: "never",
    label: "never",
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.approvals.options.never.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.approvals.options.never.example"); },
  },
  {
    value: "on-request",
    label: "on-request",
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.approvals.options.onRequest.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.approvals.options.onRequest.example"); },
  },
  {
    value: "on-failure",
    label: "on-failure",
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.approvals.options.onFailure.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.approvals.options.onFailure.example"); },
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexApprovalPolicy"]>
>[];

const CODEX_REASONING_EFFORT_HELP = [
  {
    value: "minimal",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.minimal"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.minimal.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.minimal.example"); },
  },
  {
    value: "low",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.low"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.low.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.low.example"); },
  },
  {
    value: "medium",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.medium"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.medium.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.medium.example"); },
  },
  {
    value: "high",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.high"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.high.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.high.example"); },
  },
  {
    value: "xhigh",
    label: "X-High",
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.xhigh.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.xhigh.example"); },
  },
  {
    value: "max",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.max"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.max.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.max.example"); },
  },
  {
    value: "ultra",
    get label() { return i18n.t("settingsProviders:providersSection.effortLevels.ultra"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.ultra.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoning.options.ultra.example"); },
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexReasoningEffort"]>
>[];

const CODEX_REASONING_SUMMARY_HELP = [
  {
    value: "auto",
    get label() { return i18n.t("common:labels.auto"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoningSummary.options.auto.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoningSummary.options.auto.example"); },
  },
  {
    value: "concise",
    get label() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoningSummary.options.concise.label"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoningSummary.options.concise.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoningSummary.options.concise.example"); },
  },
  {
    value: "detailed",
    get label() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoningSummary.options.detailed.label"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoningSummary.options.detailed.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoningSummary.options.detailed.example"); },
  },
  {
    value: "none",
    get label() { return i18n.t("common:status.none"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoningSummary.options.none.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.reasoningSummary.options.none.example"); },
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexReasoningSummary"]>
>[];

const CODEX_REASONING_SUPPORT_HELP = [
  {
    value: "auto",
    get label() { return i18n.t("common:labels.auto"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.summarySupport.options.auto.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.summarySupport.options.auto.example"); },
  },
  {
    value: "enabled",
    get label() { return i18n.t("common:status.enabled"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.summarySupport.options.enabled.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.summarySupport.options.enabled.example"); },
  },
  {
    value: "disabled",
    get label() { return i18n.t("common:status.disabled"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.summarySupport.options.disabled.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.summarySupport.options.disabled.example"); },
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexReasoningSummarySupport"]>
>[];

const CODEX_WEB_SEARCH_HELP = [
  {
    value: "cached",
    get label() { return i18n.t("settingsProviders:providersSection.codexRuntime.webSearch.options.cached.label"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.webSearch.options.cached.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.webSearch.options.cached.example"); },
  },
  {
    value: "disabled",
    get label() { return i18n.t("common:status.disabled"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.webSearch.options.disabled.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.webSearch.options.disabled.example"); },
  },
  {
    value: "indexed",
    get label() { return i18n.t("settingsProviders:providersSection.codexRuntime.webSearch.options.indexed.label"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.webSearch.options.indexed.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.webSearch.options.indexed.example"); },
  },
  {
    value: "live",
    get label() { return i18n.t("settingsProviders:providersSection.codexRuntime.webSearch.options.live.label"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.webSearch.options.live.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.webSearch.options.live.example"); },
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexWebSearch"]>
>[];

const CODEX_APP_TOOL_APPROVAL_HELP = [
  {
    value: "inherit",
    get label() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.inherit.label"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.inherit.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.inherit.example"); },
  },
  {
    value: "auto",
    get label() { return i18n.t("common:labels.auto"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.auto.description"); },
  },
  {
    value: "prompt",
    get label() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.prompt.label"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.prompt.description"); },
  },
  {
    value: "writes",
    get label() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.writes.label"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.writes.description"); },
    get example() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.writes.example"); },
  },
  {
    value: "approve",
    get label() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.approve.label"); },
    get description() { return i18n.t("settingsProviders:providersSection.codexRuntime.appToolApprovals.options.approve.description"); },
  },
] as const satisfies readonly ExplainedSelectOption<
  NonNullable<ProviderRuntimeOptions["codexAppToolApprovalMode"]>
>[];

function buildGuideItems<T extends string>(
  options: readonly ExplainedSelectOption<T>[],
) {
  return options.map((option) => ({
    label: option.label,
    description: option.description,
  }));
}

function buildGuideExamples<T extends string>(
  options: readonly ExplainedSelectOption<T>[],
) {
  return options
    .filter((option) => option.example)
    .map((option) => ({
      label: option.label,
      description: option.example ?? "",
    }));
}

function findExplainedOption<T extends string>(
  options: readonly ExplainedSelectOption<T>[],
  value: T,
) {
  return options.find((option) => option.value === value) ?? null;
}

function DescribedSelect<T extends string>(args: {
  value: T;
  options: readonly ExplainedSelectOption<T>[];
  onValueChange: (value: T) => void;
  triggerClassName?: string;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const selected = findExplainedOption(args.options, args.value);
  const fallbackValue = args.options[0]?.value;
  const selectValue = selected?.value ?? fallbackValue;
  const triggerLabel = selected?.label ?? fallbackValue ?? args.value;

  return (
    <div className={sx(providersStyles.describedSelectRoot)}>
      <Select
        value={selectValue}
        onValueChange={(value) => args.onValueChange(value as T)}
      >
        <SelectTrigger
          className={
            args.triggerClassName ??
            sx(providersStyles.describedSelectTrigger)
          }
        >
          <SelectValue placeholder={triggerLabel} />
        </SelectTrigger>
        <SelectContent
          alignItemWithTrigger={false}
          align="start"
          sideOffset={6}
          className={cx(
            UI_LAYER_CLASS.popover,
            sx(providersStyles.describedSelectContent),
          )}
        >
          {args.options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              label={option.label}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected ? (
        <p className={sx(providersStyles.describedSelectHint)}>
          <span className={sx(providersStyles.describedSelectHintTerm)}>
            {selected.label}:
          </span>{" "}
          {selected.description}
          {selected.example ? t("settingsProviders:settingsDialogProvidersSection.example", { value1: selected.example }) : ""}
        </p>
      ) : null}
    </div>
  );
}

function ProviderModePresetButtons(args: {
  presets: readonly ProviderModePresetDefinition[];
  activePresetId: ProviderModePresetId | null;
  onSelect: (presetId: ProviderModePresetId) => void;
}) {
  return (
    <ChoiceButtons
      columns={3}
      value={args.activePresetId ?? ""}
      onChange={(value) => args.onSelect(value as ProviderModePresetId)}
      options={args.presets.map((preset) => ({
        value: preset.id,
        label: preset.label,
        description: preset.description,
      }))}
    />
  );
}

export function ProvidersSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [
    claudePermissionMode,
    claudeAllowDangerouslySkipPermissions,
    claudeSandboxEnabled,
    claudeAllowUnsandboxedCommands,
    claudeSandboxCredentialFiles,
    claudeSandboxCredentialEnvVars,
    claudeTaskBudgetTokens,
    claudeSettingSources,
    claudeEffort,
    claudeThinkingMode,
    claudeAgentProgressSummaries,
    claudePromptSuggestions,
    claudeForwardSubagentText,
    claudeEnableFileCheckpointing,
    claudeForkSession,
    claudeStrictMcpConfig,
    claudeSkills,
    claudePluginPaths,
    claudeAgentName,
    claudeFallbackModel,
    claudeResumeSessionAt,
    codexFileAccess,
    codexNetworkAccess,
    codexApprovalPolicy,
    codexReasoningEffort,
    modelCodex,
    codexWebSearch,
    codexAppToolApprovalMode,
    codexShowRawReasoning,
    codexReasoningSummary,
    codexReasoningSummarySupport,
    codexFastMode,
    trustedTools,
    providerBrowserAutoFallback,
    providerBrowserAutoFallbackDomains,
    claudeRuntimeCapabilities,
    codexRuntimeCapabilities,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.claudePermissionMode,
          state.settings.claudeAllowDangerouslySkipPermissions,
          state.settings.claudeSandboxEnabled,
          state.settings.claudeAllowUnsandboxedCommands,
          state.settings.claudeSandboxCredentialFiles,
          state.settings.claudeSandboxCredentialEnvVars,
          state.settings.claudeTaskBudgetTokens,
          state.settings.claudeSettingSources,
          state.settings.claudeEffort,
          state.settings.claudeThinkingMode,
          state.settings.claudeAgentProgressSummaries,
          state.settings.claudePromptSuggestions,
          state.settings.claudeForwardSubagentText,
          state.settings.claudeEnableFileCheckpointing,
          state.settings.claudeForkSession,
          state.settings.claudeStrictMcpConfig,
          state.settings.claudeSkills,
          state.settings.claudePluginPaths,
          state.settings.claudeAgentName,
          state.settings.claudeFallbackModel,
          state.settings.claudeResumeSessionAt,
          state.settings.codexFileAccess,
          state.settings.codexNetworkAccess,
          state.settings.codexApprovalPolicy,
          state.settings.codexReasoningEffort,
          state.settings.modelCodex,
          state.settings.codexWebSearch,
          state.settings.codexAppToolApprovalMode,
          state.settings.codexShowRawReasoning,
          state.settings.codexReasoningSummary,
          state.settings.codexReasoningSummarySupport,
          state.settings.codexFastMode,
          state.settings.trustedTools,
          state.settings.providerBrowserAutoFallback,
          state.settings.providerBrowserAutoFallbackDomains,
          state.providerRuntimeCapabilities["claude-code"],
          state.providerRuntimeCapabilities.codex,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const blockTurnsWhenAccountLimitReached = useAppStore(
    (state) => state.settings.blockTurnsWhenAccountLimitReached,
  );
  const currentClaudeModePresetId = detectClaudeProviderModePreset({
    settings: {
      claudePermissionMode,
      claudeAllowDangerouslySkipPermissions,
      claudeSandboxEnabled,
      claudeAllowUnsandboxedCommands,
    },
  });
  const currentCodexModePresetId = detectCodexProviderModePreset({
    settings: {
      codexFileAccess,
      codexApprovalPolicy,
      codexNetworkAccess,
      codexWebSearch,
    },
  });
  const currentClaudeModeLabel = currentClaudeModePresetId
    ? (CLAUDE_PROVIDER_MODE_PRESETS.find(
        (preset) => preset.id === currentClaudeModePresetId,
      )?.label ?? t("common:labels.custom"))
    : t("common:labels.custom");
  const currentCodexModeLabel = currentCodexModePresetId
    ? (CODEX_PROVIDER_MODE_PRESETS.find(
        (preset) => preset.id === currentCodexModePresetId,
      )?.label ?? t("common:labels.custom"))
    : t("common:labels.custom");
  // Scoped to the default Codex model so, e.g., GPT-5.6 Luna never offers
  // "Ultra" here — a value only Sol/Terra accept. "Minimal" is always kept
  // available since it's a legacy value Stave still maps to "low" at
  // runtime, not part of the current model-reported effort scale.
  const codexReasoningEffortOptions = useMemo(() => {
    const supported = listCodexReasoningEffortsForModel({ model: modelCodex });
    return CODEX_REASONING_EFFORT_HELP.filter(
      (option) =>
        option.value === "minimal" ||
        (supported as readonly string[]).includes(option.value),
    );
  }, [modelCodex]);
  const codexWebSearchOptions = useMemo(
    () =>
      CODEX_WEB_SEARCH_HELP.filter(
        (option) =>
          option.value !== "indexed" ||
          codexRuntimeCapabilities.webSearchModes.includes("indexed"),
      ),
    [codexRuntimeCapabilities.webSearchModes],
  );
  const effectiveCodexWebSearch =
    codexWebSearch === "indexed" &&
    !codexRuntimeCapabilities.webSearchModes.includes("indexed")
      ? "cached"
      : codexWebSearch;
  const toggleClaudeSettingSource = (source: "user" | "project" | "local") => {
    updateSettings({
      patch: {
        claudeSettingSources: claudeSettingSources.includes(source)
          ? claudeSettingSources.filter((item) => item !== source)
          : [...claudeSettingSources, source],
      },
    });
  };

  return (
    <>
      <SettingsCard
        id="settings-field-account-usage-limit"
        title={t("settingsProviders:providersSection.accountUsageLimit.title")}
        description={t("settingsProviders:providersSection.accountUsageLimit.description")}
      >
        <SwitchField
          title={t("settingsProviders:providersSection.accountUsageLimit.stopTurns.title")}
          description={t("settingsProviders:providersSection.accountUsageLimit.stopTurns.description")}
          checked={blockTurnsWhenAccountLimitReached}
          onCheckedChange={(checked) =>
            updateSettings({
              patch: { blockTurnsWhenAccountLimitReached: checked },
            })
          }
        />
      </SettingsCard>
      <ProviderBrowserAccessSettingsCard
        autoFallback={providerBrowserAutoFallback}
        onAutoFallbackChange={(checked) =>
          updateSettings({ patch: { providerBrowserAutoFallback: checked } })
        }
        autoFallbackDomains={providerBrowserAutoFallbackDomains}
        onAutoFallbackDomainsChange={(value) =>
          updateSettings({
            patch: { providerBrowserAutoFallbackDomains: value },
          })
        }
      />
      <SettingsDelegationSection />
      <SettingsCard
        title={t("settingsProviders:providersSection.trustedApprovals.title")}
        description={t("settingsProviders:providersSection.trustedApprovals.description")}
        titleAccessory={
          <Badge variant={trustedTools.length > 0 ? "secondary" : "outline"}>
            {trustedTools.length}
          </Badge>
        }
      >
        {trustedTools.length > 0 ? (
          <div className={sx(providersStyles.trustedList)}>
            {trustedTools.map((entry) => (
              <div
                key={entry}
                className={sx(providersStyles.trustedRow)}
              >
                <span className={sx(providersStyles.trustedRowLabel)}>
                  {formatTrustedToolEntry(entry)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  xstyle={providersStyles.trustedRemove}
                  onClick={() =>
                    updateSettings({
                      patch: {
                        trustedTools: removeTrustedToolEntry({
                          entries: trustedTools,
                          entry,
                        }),
                      },
                    })
                  }
                >
                  {i18n.t("common:actions.remove")}</Button>
              </div>
            ))}
          </div>
        ) : (
          <p className={sx(providersStyles.emptyCopy)}>
            {t("settingsProviders:providersSection.trustedApprovals.empty")}</p>
        )}
      </SettingsCard>
      <Tabs defaultValue="claude-code" xstyle={providersStyles.tabs}>
        <SettingsProviderTabsList
          providerIds={PROVIDER_SETTINGS_TAB_IDS}
          aria-label={t("settingsProviders:providersSection.tabsAriaLabel")}
        />

        <TabsContent value="claude-code">
          <SectionStack>
            <SettingsCard
              title={t("settingsProviders:providersSection.claudeRuntime.title")}
              description={t("settingsProviders:providersSection.claudeRuntime.description")}
              titleAccessory={
                <Badge
                  variant={currentClaudeModePresetId ? "secondary" : "outline"}
                >
                  {currentClaudeModeLabel}
                </Badge>
              }
            >
              <LabeledField
                title={t("settingsProviders:providersSection.modePresetTitle")}
                description={t("settingsProviders:providersSection.claudeRuntime.modePreset.description")}
              >
                <ProviderModePresetButtons
                  presets={CLAUDE_PROVIDER_MODE_PRESETS}
                  activePresetId={currentClaudeModePresetId}
                  onSelect={(presetId) =>
                    updateSettings({
                      patch: buildClaudeProviderModeSettingsPatch({ presetId }),
                    })
                  }
                />
                <p className={sx(providersStyles.presetHint)}>
                  {currentClaudeModePresetId
                    ? t("settingsProviders:settingsDialogProvidersSection.isActiveReapplyAPresetAny", { value1: currentClaudeModeLabel })
                    : t("settingsProviders:providersSection.claudeRuntime.modePreset.custom")}
                </p>
              </LabeledField>
              <LabeledField
                title={t("settingsProviders:providersSection.claudeRuntime.permissionMode.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.permissionMode.description")}
                guide={
                  <SettingsFieldGuide
                    title={t("settingsProviders:providersSection.claudeRuntime.permissionMode.guide.title")}
                    summary={t("settingsProviders:providersSection.claudeRuntime.permissionMode.guide.summary")}
                    items={buildGuideItems(CLAUDE_PERMISSION_MODE_HELP)}
                    examples={buildGuideExamples(CLAUDE_PERMISSION_MODE_HELP)}
                    tooltip={t("settingsProviders:providersSection.claudeRuntime.permissionMode.guide.tooltip")}
                  />
                }
              >
                <DescribedSelect
                  value={claudePermissionMode}
                  options={CLAUDE_PERMISSION_MODE_HELP}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        claudePermissionMode: value,
                      },
                    })
                  }
                />
              </LabeledField>
              <SwitchField
                title={t("settingsProviders:providersSection.claudeRuntime.dangerousSkip.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.dangerousSkip.description")}
                checked={claudeAllowDangerouslySkipPermissions}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { claudeAllowDangerouslySkipPermissions: checked },
                  })
                }
              />
              <SwitchField
                title={t("settingsProviders:providersSection.claudeRuntime.sandbox.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.sandbox.description")}
                checked={claudeSandboxEnabled}
                onCheckedChange={(checked) =>
                  updateSettings({ patch: { claudeSandboxEnabled: checked } })
                }
              />
              <SwitchField
                title={t("settingsProviders:providersSection.claudeRuntime.unsandboxedCommands.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.unsandboxedCommands.description")}
                checked={claudeAllowUnsandboxedCommands}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { claudeAllowUnsandboxedCommands: checked },
                  })
                }
              />
              <ClaudeGuardrailFields />
              {claudeRuntimeCapabilities.sandbox.credentialGuards ? (
                <>
                  <LabeledField
                    title={t("settingsProviders:providersSection.claudeRuntime.credentialFiles.title")}
                    description={t("settingsProviders:providersSection.claudeRuntime.credentialFiles.description")}
                  >
                    <DraftInput
                      xstyle={providersStyles.fieldMono}
                      value={claudeSandboxCredentialFiles}
                      placeholder="~/.config/example/credentials.json"
                      onCommit={(value) =>
                        updateSettings({
                          patch: { claudeSandboxCredentialFiles: value },
                        })
                      }
                    />
                  </LabeledField>
                  <LabeledField
                    title={t("settingsProviders:providersSection.claudeRuntime.credentialVariables.title")}
                    description={t("settingsProviders:providersSection.claudeRuntime.credentialVariables.description")}
                  >
                    <DraftInput
                      xstyle={providersStyles.fieldMono}
                      value={claudeSandboxCredentialEnvVars}
                      placeholder="EXAMPLE_TOKEN, SERVICE_PASSWORD"
                      onCommit={(value) =>
                        updateSettings({
                          patch: { claudeSandboxCredentialEnvVars: value },
                        })
                      }
                    />
                  </LabeledField>
                </>
              ) : null}
              <LabeledField
                title={t("settingsProviders:providersSection.claudeRuntime.settingSources.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.settingSources.description")}
                guide={
                  <SettingsFieldGuide
                    title={t("settingsProviders:providersSection.claudeRuntime.settingSources.guide.title")}
                    summary={t("settingsProviders:providersSection.claudeRuntime.settingSources.guide.summary")}
                    items={CLAUDE_SETTING_SOURCE_HELP.map((option) => ({
                      label: option.label,
                      description: option.description,
                    }))}
                    tooltip={t("settingsProviders:providersSection.claudeRuntime.settingSources.guide.tooltip")}
                  />
                }
              >
                <ToggleChipGroup
                  options={CLAUDE_SETTING_SOURCE_HELP}
                  selected={claudeSettingSources}
                  onToggle={toggleClaudeSettingSource}
                />
                <p className={sx(providersStyles.presetHint)}>
                  {t("settingsProviders:settingsDialogProvidersSection.active")}{" "}
                  {claudeSettingSources.length > 0
                    ? claudeSettingSources.join(" + ")
                    : t("settingsProviders:settingsDialogProvidersSection.none")}
                </p>
              </LabeledField>
              <LabeledField
                title={t("settingsProviders:providersSection.claudeRuntime.taskBudget.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.taskBudget.description")}
              >
                <DraftInput
                  xstyle={providersStyles.field}
                  value={String(claudeTaskBudgetTokens)}
                  onCommit={(value) =>
                    updateSettings({
                      patch: {
                        claudeTaskBudgetTokens: Math.min(
                          1_000_000,
                          Math.max(0, readInt(value, claudeTaskBudgetTokens)),
                        ),
                      },
                    })
                  }
                />
              </LabeledField>
              <LabeledField
                title={t("settingsProviders:providersSection.claudeRuntime.thinkingMode.title")}
                guide={
                  <SettingsFieldGuide
                    title={t("settingsProviders:providersSection.claudeRuntime.thinkingMode.guide.title")}
                    summary={t("settingsProviders:providersSection.claudeRuntime.thinkingMode.guide.summary")}
                    items={buildGuideItems(CLAUDE_THINKING_MODE_HELP)}
                    examples={buildGuideExamples(CLAUDE_THINKING_MODE_HELP)}
                    tooltip={t("settingsProviders:providersSection.claudeRuntime.thinkingMode.guide.tooltip")}
                  />
                }
              >
                <DescribedSelect
                  value={claudeThinkingMode}
                  options={CLAUDE_THINKING_MODE_HELP}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        claudeThinkingMode: value,
                      },
                    })
                  }
                />
              </LabeledField>
              <LabeledField
                title={t("settingsProviders:providersSection.claudeRuntime.effort.title")}
                guide={
                  <SettingsFieldGuide
                    title={t("settingsProviders:providersSection.claudeRuntime.effort.guide.title")}
                    summary={t("settingsProviders:providersSection.claudeRuntime.effort.guide.summary")}
                    items={buildGuideItems(CLAUDE_EFFORT_HELP)}
                    examples={buildGuideExamples(CLAUDE_EFFORT_HELP)}
                    tooltip={t("settingsProviders:providersSection.claudeRuntime.effort.guide.tooltip")}
                  />
                }
              >
                <DescribedSelect
                  value={claudeEffort}
                  options={CLAUDE_EFFORT_HELP}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        claudeEffort: value,
                      },
                    })
                  }
                />
              </LabeledField>
              <SwitchField
                title={t("settingsProviders:providersSection.claudeRuntime.agentProgressSummaries.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.agentProgressSummaries.description")}
                checked={claudeAgentProgressSummaries}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { claudeAgentProgressSummaries: checked },
                  })
                }
              />
              <SwitchField
                title={t("settingsProviders:providersSection.claudeRuntime.promptSuggestions.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.promptSuggestions.description")}
                checked={claudePromptSuggestions}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { claudePromptSuggestions: checked },
                  })
                }
              />
              <SwitchField
                title={t("settingsProviders:providersSection.claudeRuntime.forwardSubagentText.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.forwardSubagentText.description")}
                checked={claudeForwardSubagentText}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { claudeForwardSubagentText: checked },
                  })
                }
              />
              <SwitchField
                title={t("settingsProviders:providersSection.claudeRuntime.fileCheckpointing.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.fileCheckpointing.description")}
                checked={claudeEnableFileCheckpointing}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { claudeEnableFileCheckpointing: checked },
                  })
                }
              />
              <SwitchField
                title={t("settingsProviders:providersSection.claudeRuntime.forkSession.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.forkSession.description")}
                checked={claudeForkSession}
                onCheckedChange={(checked) =>
                  updateSettings({ patch: { claudeForkSession: checked } })
                }
              />
              <SwitchField
                title={t("settingsProviders:providersSection.claudeRuntime.strictMcpConfig.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.strictMcpConfig.description")}
                checked={claudeStrictMcpConfig}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { claudeStrictMcpConfig: checked },
                  })
                }
              />
              <LabeledField
                title={t("settingsProviders:codexExtensionsTab.skills")}
                description={t("settingsProviders:providersSection.claudeRuntime.skills.description")}
              >
                <DraftInput
                  xstyle={providersStyles.field}
                  value={claudeSkills}
                  placeholder={t("settingsProviders:settingsDialogProvidersSection.all")}
                  onCommit={(value) =>
                    updateSettings({ patch: { claudeSkills: value } })
                  }
                />
              </LabeledField>
              <LabeledField
                title={t("settingsProviders:providersSection.claudeRuntime.pluginPaths.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.pluginPaths.description")}
              >
                <DraftInput
                  xstyle={providersStyles.field}
                  value={claudePluginPaths}
                  placeholder="<workspace>/plugin"
                  onCommit={(value) =>
                    updateSettings({ patch: { claudePluginPaths: value } })
                  }
                />
              </LabeledField>
              <ClaudeInstalledPluginsField />
              <LabeledField
                title={t("settingsProviders:providersSection.claudeRuntime.mainAgent.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.mainAgent.description")}
              >
                <DraftInput
                  xstyle={providersStyles.field}
                  value={claudeAgentName}
                  placeholder="code-reviewer"
                  onCommit={(value) =>
                    updateSettings({ patch: { claudeAgentName: value } })
                  }
                />
              </LabeledField>
              <LabeledField
                title={t("settingsProviders:providersSection.claudeRuntime.fallbackModels.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.fallbackModels.description")}
              >
                <DraftInput
                  xstyle={providersStyles.field}
                  value={claudeFallbackModel}
                  placeholder="claude-opus-4-8"
                  onCommit={(value) =>
                    updateSettings({ patch: { claudeFallbackModel: value } })
                  }
                />
              </LabeledField>
              <LabeledField
                title={t("settingsProviders:providersSection.claudeRuntime.resumeAt.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.resumeAt.description")}
              >
                <DraftInput
                  xstyle={providersStyles.field}
                  value={claudeResumeSessionAt}
                  placeholder={t("settingsProviders:providersSection.claudeRuntime.resumeAt.placeholder")}
                  onCommit={(value) =>
                    updateSettings({
                      patch: { claudeResumeSessionAt: value },
                    })
                  }
                />
              </LabeledField>
            </SettingsCard>
            <ClaudeBinaryPathCard />
            <ClaudeRuntimeToolsCard />
          </SectionStack>
        </TabsContent>

        <TabsContent value="codex">
          <SectionStack>
            <SettingsCard
              title={t("settingsProviders:providersSection.codexRuntime.title")}
              description={t("settingsProviders:providersSection.codexRuntime.description")}
              titleAccessory={
                <Badge
                  variant={currentCodexModePresetId ? "secondary" : "outline"}
                >
                  {currentCodexModeLabel}
                </Badge>
              }
            >
              <LabeledField
                title={t("settingsProviders:providersSection.modePresetTitle")}
                description={t("settingsProviders:providersSection.codexRuntime.modePreset.description")}
              >
                <ProviderModePresetButtons
                  presets={CODEX_PROVIDER_MODE_PRESETS}
                  activePresetId={currentCodexModePresetId}
                  onSelect={(presetId) =>
                    updateSettings({
                      patch: buildCodexProviderModeSettingsPatch({ presetId }),
                    })
                  }
                />
                <p className={sx(providersStyles.presetHint)}>
                  {currentCodexModePresetId
                    ? t("settingsProviders:settingsDialogProvidersSection.isActiveReapplyAPresetAnyVariantcdc4723b", { value1: currentCodexModeLabel })
                    : t("settingsProviders:providersSection.codexRuntime.modePreset.custom")}
                </p>
              </LabeledField>
              <SwitchField
                title={t("settingsProviders:providersSection.codexRuntime.networkAccess.title")}
                description={t("settingsProviders:providersSection.codexRuntime.networkAccess.description")}
                checked={codexNetworkAccess}
                onCheckedChange={(checked) =>
                  updateSettings({ patch: { codexNetworkAccess: checked } })
                }
              />
              <LabeledField
                title={t("settingsProviders:providersSection.codexRuntime.fileAccess.title")}
                guide={
                  <SettingsFieldGuide
                    title={t("settingsProviders:providersSection.codexRuntime.fileAccess.guide.title")}
                    summary={t("settingsProviders:providersSection.codexRuntime.fileAccess.guide.summary")}
                    items={buildGuideItems(CODEX_FILE_ACCESS_HELP)}
                    examples={buildGuideExamples(CODEX_FILE_ACCESS_HELP)}
                    tooltip={t("settingsProviders:providersSection.codexRuntime.fileAccess.guide.tooltip")}
                  />
                }
              >
                <DescribedSelect
                  value={codexFileAccess}
                  options={CODEX_FILE_ACCESS_HELP}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        codexFileAccess: value,
                      },
                    })
                  }
                />
              </LabeledField>
              <LabeledField
                title={t("settingsProviders:providersSection.codexRuntime.approvals.title")}
                guide={
                  <SettingsFieldGuide
                    title={t("settingsProviders:providersSection.codexRuntime.approvals.guide.title")}
                    summary={t("settingsProviders:providersSection.codexRuntime.approvals.guide.summary")}
                    items={buildGuideItems(CODEX_APPROVAL_POLICY_HELP)}
                    examples={buildGuideExamples(CODEX_APPROVAL_POLICY_HELP)}
                    tooltip={t("settingsProviders:providersSection.codexRuntime.approvals.guide.tooltip")}
                  />
                }
              >
                <DescribedSelect
                  value={codexApprovalPolicy}
                  options={CODEX_APPROVAL_POLICY_HELP}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        codexApprovalPolicy: value,
                      },
                    })
                  }
                />
              </LabeledField>
              {codexRuntimeCapabilities.approval.appToolModes.length > 0 ? (
                <LabeledField
                  title={t("settingsProviders:providersSection.codexRuntime.appToolApprovals.title")}
                  description={t("settingsProviders:providersSection.codexRuntime.appToolApprovals.description")}
                  guide={
                    <SettingsFieldGuide
                      title={t("settingsProviders:providersSection.codexRuntime.appToolApprovals.guide.title")}
                      summary={t("settingsProviders:providersSection.codexRuntime.appToolApprovals.guide.summary")}
                      items={buildGuideItems(CODEX_APP_TOOL_APPROVAL_HELP)}
                      examples={buildGuideExamples(
                        CODEX_APP_TOOL_APPROVAL_HELP,
                      )}
                      note={t("settingsProviders:messages.writesTrustNote")}
                      tooltip={t("settingsProviders:providersSection.codexRuntime.appToolApprovals.guide.tooltip")}
                    />
                  }
                >
                  <DescribedSelect
                    value={codexAppToolApprovalMode}
                    options={CODEX_APP_TOOL_APPROVAL_HELP}
                    onValueChange={(value) =>
                      updateSettings({
                        patch: { codexAppToolApprovalMode: value },
                      })
                    }
                  />
                </LabeledField>
              ) : null}
              <LabeledField
                title={t("settingsProviders:providersSection.codexRuntime.reasoning.title")}
                guide={
                  <SettingsFieldGuide
                    title={t("settingsProviders:providersSection.codexRuntime.reasoning.guide.title")}
                    summary={t("settingsProviders:providersSection.codexRuntime.reasoning.guide.summary")}
                    items={buildGuideItems(codexReasoningEffortOptions)}
                    examples={buildGuideExamples(codexReasoningEffortOptions)}
                    tooltip={t("settingsProviders:providersSection.codexRuntime.reasoning.guide.tooltip")}
                  />
                }
              >
                <DescribedSelect
                  value={codexReasoningEffort}
                  options={codexReasoningEffortOptions}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        codexReasoningEffort: value,
                      },
                    })
                  }
                />
              </LabeledField>
              <LabeledField
                title={t("settingsProviders:providersSection.codexRuntime.reasoningSummary.title")}
                description={t("settingsProviders:providersSection.codexRuntime.reasoningSummary.description")}
                guide={
                  <SettingsFieldGuide
                    title={t("settingsProviders:providersSection.codexRuntime.reasoningSummary.guide.title")}
                    summary={t("settingsProviders:providersSection.codexRuntime.reasoningSummary.guide.summary")}
                    items={buildGuideItems(CODEX_REASONING_SUMMARY_HELP)}
                    examples={buildGuideExamples(CODEX_REASONING_SUMMARY_HELP)}
                    tooltip={t("settingsProviders:providersSection.codexRuntime.reasoningSummary.guide.tooltip")}
                  />
                }
              >
                <DescribedSelect
                  value={codexReasoningSummary}
                  options={CODEX_REASONING_SUMMARY_HELP}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        codexReasoningSummary: value,
                      },
                    })
                  }
                />
              </LabeledField>
              <LabeledField
                title={t("settingsProviders:providersSection.codexRuntime.summarySupport.title")}
                description={t("settingsProviders:providersSection.codexRuntime.summarySupport.description")}
                guide={
                  <SettingsFieldGuide
                    title={t("settingsProviders:providersSection.codexRuntime.summarySupport.guide.title")}
                    summary={t("settingsProviders:providersSection.codexRuntime.summarySupport.guide.summary")}
                    items={buildGuideItems(CODEX_REASONING_SUPPORT_HELP)}
                    examples={buildGuideExamples(CODEX_REASONING_SUPPORT_HELP)}
                    tooltip={t("settingsProviders:providersSection.codexRuntime.summarySupport.guide.tooltip")}
                  />
                }
              >
                <DescribedSelect
                  value={codexReasoningSummarySupport}
                  options={CODEX_REASONING_SUPPORT_HELP}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        codexReasoningSummarySupport: value,
                      },
                    })
                  }
                />
              </LabeledField>
              <SwitchField
                title={t("settingsProviders:providersSection.codexRuntime.rawReasoning.title")}
                description={t("settingsProviders:providersSection.codexRuntime.rawReasoning.description")}
                checked={codexShowRawReasoning}
                onCheckedChange={(checked) =>
                  updateSettings({ patch: { codexShowRawReasoning: checked } })
                }
              />
              <LabeledField
                title={t("settingsProviders:providersSection.codexRuntime.webSearch.title")}
                description={t("settingsProviders:providersSection.codexRuntime.webSearch.description")}
                guide={
                  <SettingsFieldGuide
                    title={t("settingsProviders:providersSection.codexRuntime.webSearch.guide.title")}
                    summary={t("settingsProviders:providersSection.codexRuntime.webSearch.guide.summary")}
                    items={buildGuideItems(CODEX_WEB_SEARCH_HELP)}
                    examples={buildGuideExamples(CODEX_WEB_SEARCH_HELP)}
                    tooltip={t("settingsProviders:providersSection.codexRuntime.webSearch.guide.tooltip")}
                  />
                }
              >
                <DescribedSelect
                  value={effectiveCodexWebSearch}
                  options={codexWebSearchOptions}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: {
                        codexWebSearch: value,
                      },
                    })
                  }
                />
                {codexWebSearch === "indexed" &&
                effectiveCodexWebSearch !== "indexed" ? (
                  <p className={sx(providersStyles.webSearchHint)}>
                    {t("settingsProviders:providersSection.codexRuntime.webSearch.indexedUnavailable")}</p>
                ) : null}
              </LabeledField>
              <SwitchField
                title={t("settingsProviders:cursorSection.fastMode.title")}
                description={t("settingsProviders:providersSection.codexRuntime.fastMode.description")}
                checked={codexFastMode}
                onCheckedChange={(checked) =>
                  updateSettings({ patch: { codexFastMode: checked } })
                }
              />
            </SettingsCard>
            <CodexPluginsCard />
            <CodexBinaryPathCard />
          </SectionStack>
        </TabsContent>
        <TabsContent value="cursor">
          <SettingsCursorSection />
        </TabsContent>
        <TabsContent value="kiro">
          <SettingsKiroSection />
        </TabsContent>
      </Tabs>
    </>
  );
}
