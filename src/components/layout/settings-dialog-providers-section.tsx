import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import {
  Badge,
  Button,
  Tabs,
  TabsContent,
} from "@/components/ui";
import {
  formatTrustedToolEntry,
  removeTrustedToolEntry,
} from "@/lib/providers/trusted-tools";
import type {
  ClaudeSettingSource,
  ProviderId,
  ProviderRuntimeOptions,
} from "@/lib/providers/provider.types";
import { sx } from "@/components/ads/utils/stylex";
import { useAppStore } from "@/store/app.store";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import {
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
import {
  buildGuideExamples,
  buildGuideItems,
  type ExplainedSelectOption,
} from "./settings-dialog-effort-help";
import { SettingsAdvancedDisclosure } from "./settings-dialog-advanced-disclosure";
import { ProviderDefaultsLink } from "./settings-dialog-provider-defaults-link";
import type { SectionId } from "./settings-dialog.schema";
import { SettingsProviderTabsList } from "./settings-provider-tabs";
import { DescribedSelect } from "./settings-dialog-described-select";
import {
  ClaudeModeBadge,
  ClaudePermissionPostureFields,
  CodexModeBadge,
  CodexPermissionPostureFields,
} from "./settings-dialog-permission-posture-fields";
import { ScopeLocked } from "./settings-scope";

/** Tab order for the per-provider runtime settings below the shared cards. */
const PROVIDER_SETTINGS_TAB_IDS = [
  "claude-code",
  "codex",
  "cursor",
  "kiro",
] as const satisfies readonly ProviderId[];

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

export function ProvidersSection(props: {
  onNavigateSection?: (id: SectionId) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [
    claudeSandboxCredentialFiles,
    claudeSandboxCredentialEnvVars,
    claudeTaskBudgetTokens,
    claudeSettingSources,
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
    codexWebSearch,
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
          state.settings.claudeSandboxCredentialFiles,
          state.settings.claudeSandboxCredentialEnvVars,
          state.settings.claudeTaskBudgetTokens,
          state.settings.claudeSettingSources,
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
          state.settings.codexWebSearch,
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
  const developerModeEnabled = useAppStore(
    (state) => state.settings.developerModeEnabled,
  );
  const blockTurnsWhenAccountLimitReached = useAppStore(
    (state) => state.settings.blockTurnsWhenAccountLimitReached,
  );
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
      <ScopeLocked>
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
      </ScopeLocked>
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
              titleAccessory={<ClaudeModeBadge />}
            >
              <ClaudePermissionPostureFields />
              <ScopeLocked>
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
              </ScopeLocked>
              <ProviderDefaultsLink onNavigateSection={props.onNavigateSection} />
              <ScopeLocked>
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
                title={t("settingsProviders:providersSection.claudeRuntime.fileCheckpointing.title")}
                description={t("settingsProviders:providersSection.claudeRuntime.fileCheckpointing.description")}
                checked={claudeEnableFileCheckpointing}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { claudeEnableFileCheckpointing: checked },
                  })
                }
              />
              <ClaudeInstalledPluginsField />
              <SettingsAdvancedDisclosure
                compact
                title={t("settingsProviders:providersSection.advanced.title")}
                description={t("settingsProviders:providersSection.advanced.description")}
              >
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
              </SettingsAdvancedDisclosure>
              </ScopeLocked>
            </SettingsCard>
            <ScopeLocked>
              <ClaudeBinaryPathCard />
              {developerModeEnabled ? <ClaudeRuntimeToolsCard /> : null}
            </ScopeLocked>
          </SectionStack>
        </TabsContent>

        <TabsContent value="codex">
          <SectionStack>
            <SettingsCard
              title={t("settingsProviders:providersSection.codexRuntime.title")}
              description={t("settingsProviders:providersSection.codexRuntime.description")}
              titleAccessory={<CodexModeBadge />}
            >
              <CodexPermissionPostureFields />
              <ProviderDefaultsLink onNavigateSection={props.onNavigateSection} />
              <ScopeLocked>
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
              <SettingsAdvancedDisclosure
                compact
                title={t("settingsProviders:providersSection.codexRuntime.advanced.title")}
                description={t("settingsProviders:providersSection.codexRuntime.advanced.description")}
              >
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
              </SettingsAdvancedDisclosure>
              </ScopeLocked>
            </SettingsCard>
            <ScopeLocked>
              <CodexPluginsCard />
              <CodexBinaryPathCard />
            </ScopeLocked>
          </SectionStack>
        </TabsContent>
        <TabsContent value="cursor">
          <SettingsCursorSection onNavigateSection={props.onNavigateSection} />
        </TabsContent>
        <TabsContent value="kiro">
          <SettingsKiroSection onNavigateSection={props.onNavigateSection} />
        </TabsContent>
      </Tabs>
    </>
  );
}
