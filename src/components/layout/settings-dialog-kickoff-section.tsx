import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  buildModelSelectorOptions,
  buildModelSelectorValue,
  buildRecommendedModelSelectorOptions,
  ModelSelector,
} from "@/components/ai-elements/model-selector";
import {
  Badge,
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from "@/components/ui";
import { Button as AdsButton } from "@/components/ads/components/Button";
import { sx } from "@/components/ads/utils/stylex";
import { DEFAULT_PROMPT_WORKSPACE_KICKOFF } from "@/lib/providers/prompt-defaults";
import type { McpDiscoveryResponse } from "@/lib/providers/provider.types";
import {
  DEFAULT_KICKOFF_SOURCE_CONFIGS,
  KICKOFF_PANEL_TARGETS,
  normalizeKickoffSourceConfigs,
  type KickoffPanelTarget,
  type KickoffSourceConfig,
} from "@/lib/workspace-kickoff";
import { useAppStore } from "@/store/app.store";
import {
  DraftInput,
  LabeledField,
  SectionStack,
  SettingsCard,
} from "./settings-dialog.shared";
import { kickoffSectionStyles } from "./settings-dialog-kickoff-section.styles";

const KICKOFF_MODEL_PROVIDERS = ["claude-code", "codex"] as const;

const PANEL_TARGET_LABELS: Record<KickoffPanelTarget, string> = {
  jiraIssues: "Jira",
  confluencePages: "Confluence",
  figmaResources: "Figma",
  slackThreads: "Slack",
  linkedPullRequests: "GitHub",
  storybookResources: "Storybook",
  amplifyLinks: "Amplify",
};

function parseList(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function KickoffDraftTextarea(props: {
  value: string;
  xstyle?: Parameters<typeof sx>[0];
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  return (
    <Textarea
      value={draft}
      xstyle={props.xstyle}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        if (draft !== props.value) {
          props.onCommit(draft);
        }
      }}
    />
  );
}

function matchSummary(config: KickoffSourceConfig) {
  const parts = [
    config.match.hostSuffixes.join(", "),
    config.match.pathPattern,
    config.match.keyPattern,
  ].filter(Boolean);
  return parts.join(" · ") || i18n.t("settings:settingsDialogKickoffSection.noMatcherConfigured");
}

function KickoffModelField(props: {
  title: string;
  description: string;
  value: string;
  onSelect: (model: string) => void;
}) {
  const options = useMemo(
    () => buildModelSelectorOptions({ providerIds: KICKOFF_MODEL_PROVIDERS }),
    [],
  );
  const recommendedOptions = useMemo(
    () => buildRecommendedModelSelectorOptions({ options }),
    [options],
  );
  return (
    <LabeledField title={props.title} description={props.description}>
      <ModelSelector
        value={buildModelSelectorValue({ model: props.value })}
        options={options}
        recommendedOptions={recommendedOptions}
        className={sx(kickoffSectionStyles.modelSelector)}
        triggerClassName={sx(kickoffSectionStyles.modelSelectorTrigger)}
        onSelect={({ selection }) => props.onSelect(selection.model)}
      />
    </LabeledField>
  );
}

function KickoffPromptField(props: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  const isDefault = draft.trim() === DEFAULT_PROMPT_WORKSPACE_KICKOFF.trim();

  return (
    <LabeledField
      title={t("settings:settingsDialogKickoffSection.resolutionPrompt")}
      description={t("settings:settingsDialogKickoffSection.instructsTheOneShotResolverSource")}
    >
      <div className={sx(kickoffSectionStyles.promptField)}>
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== props.value) {
              props.onCommit(draft);
            }
          }}
          xstyle={kickoffSectionStyles.promptTextarea}
        />
        <div className={sx(kickoffSectionStyles.promptFooter)}>
          <span className={sx(kickoffSectionStyles.promptStatus)}>
            {isDefault ? t("settings:promptsSection.field.usingDefault") : t("settings:promptsSection.field.customised")}
          </span>
          {!isDefault ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              xstyle={kickoffSectionStyles.resetButton}
              onClick={() => {
                setDraft(DEFAULT_PROMPT_WORKSPACE_KICKOFF);
                props.onCommit(DEFAULT_PROMPT_WORKSPACE_KICKOFF);
              }}
            >
              <RefreshCcw className={sx(kickoffSectionStyles.actionIcon)} />
              {t("settings:reviewCards.tasks.followUp.resetToDefault")}</Button>
          ) : null}
        </div>
      </div>
    </LabeledField>
  );
}

export function KickoffSection() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [
    repositoryPath,
    sourceConfigs,
    primaryModel,
    fallbackModel,
    prompt,
    updateSettings,
  ] = useAppStore(
    useShallow((state) => [
      state.repositoryPath,
      state.settings.kickoffSourceConfigs,
      state.settings.kickoffPrimaryModel,
      state.settings.kickoffFallbackModel,
      state.settings.kickoffPrompt,
      state.updateSettings,
    ]),
  );
  const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);
  const [discovery, setDiscovery] = useState<McpDiscoveryResponse | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const discoveredServerNames = useMemo(
    () =>
      new Set(discovery?.servers.map((server) => server.name.toLowerCase())),
    [discovery],
  );

  const refreshMcpServers = useCallback(async () => {
    const discover = window.api?.provider?.discoverMcpServers;
    if (!discover) {
      return;
    }
    setDiscovering(true);
    try {
      setDiscovery(await discover({ cwd: repositoryPath ?? undefined }));
    } catch {
      setDiscovery(null);
    } finally {
      setDiscovering(false);
    }
  }, [repositoryPath]);

  useEffect(() => {
    void refreshMcpServers();
  }, [refreshMcpServers]);

  function commitConfigs(nextConfigs: KickoffSourceConfig[]) {
    updateSettings({
      patch: {
        kickoffSourceConfigs: normalizeKickoffSourceConfigs(nextConfigs),
      },
    });
  }

  function patchConfig(id: string, patch: Partial<KickoffSourceConfig>) {
    commitConfigs(
      sourceConfigs.map((config) =>
        config.id === id ? { ...config, ...patch } : config,
      ),
    );
  }

  function patchConfigMatch(
    id: string,
    patch: Partial<KickoffSourceConfig["match"]>,
  ) {
    commitConfigs(
      sourceConfigs.map((config) =>
        config.id === id
          ? { ...config, match: { ...config.match, ...patch } }
          : config,
      ),
    );
  }

  function moveConfig(index: number, offset: -1 | 1) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= sourceConfigs.length) {
      return;
    }
    const nextConfigs = [...sourceConfigs];
    const [config] = nextConfigs.splice(index, 1);
    if (!config) {
      return;
    }
    nextConfigs.splice(targetIndex, 0, config);
    commitConfigs(nextConfigs);
  }

  return (
    <>
      <SectionStack>
        <SettingsCard
          title={t("settings:settingsDialogKickoffSection.kickoffSources")}
          description={t("settings:settingsDialogKickoffSection.enabledMatchersClassifyPastedURLsOr")}
          titleAccessory={
            <div className={sx(kickoffSectionStyles.accessoryRow)}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={discovering}
                onClick={() => void refreshMcpServers()}
              >
                <RefreshCcw
                  className={sx(
                    discovering
                      ? kickoffSectionStyles.actionIconSpinning
                      : kickoffSectionStyles.actionIcon,
                  )}
                />
                {t("settings:settingsDialogKickoffSection.refreshMCP")}</Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const config: KickoffSourceConfig = {
                    id: `source-${crypto.randomUUID()}`,
                    label: i18n.t("settings:settingsDialogKickoffSection.customSource"),
                    enabled: true,
                    builtIn: false,
                    match: {
                      hostSuffixes: [],
                      pathPattern: "",
                      keyPattern: "",
                    },
                    mcpServers: [],
                    resolutionHint: "",
                    panelTarget: "jiraIssues",
                  };
                  commitConfigs([...sourceConfigs, config]);
                  setExpandedSourceId(config.id);
                }}
              >
                <Plus className={sx(kickoffSectionStyles.actionIcon)} />
                {t("settings:settingsDialogKickoffSection.addSource")}</Button>
            </div>
          }
        >
          <div className={sx(kickoffSectionStyles.sourceList)}>
            {sourceConfigs.map((config, index) => {
              const expanded = expandedSourceId === config.id;
              return (
                <div
                  key={config.id}
                  className={sx(kickoffSectionStyles.sourceItem)}
                >
                  <div className={sx(kickoffSectionStyles.sourceHeader)}>
                    <Switch
                      checked={config.enabled}
                      aria-label={t(config.enabled ? "settings:messages.disableConfig" : "settings:messages.enableConfig", { label: config.label })}
                      onCheckedChange={(enabled) =>
                        patchConfig(config.id, { enabled })
                      }
                    />
                    <AdsButton
                      type="button"
                      variant="quiet"
                      flushInline
                      layout="host"
                      xstyle={kickoffSectionStyles.sourceTrigger}
                      onClick={() =>
                        setExpandedSourceId(expanded ? null : config.id)
                      }
                    >
                      {expanded ? (
                        <ChevronDown
                          className={sx(kickoffSectionStyles.chevron)}
                        />
                      ) : (
                        <ChevronRight
                          className={sx(kickoffSectionStyles.chevron)}
                        />
                      )}
                      <span className={sx(kickoffSectionStyles.triggerBody)}>
                        <span
                          className={sx(kickoffSectionStyles.triggerLabelRow)}
                        >
                          {config.label}
                          {config.builtIn ? (
                            <Badge variant="secondary">{i18n.t("settings:settingsDialogKickoffSection.builtIn")}</Badge>
                          ) : null}
                        </span>
                        <span
                          className={sx(kickoffSectionStyles.triggerSummary)}
                        >
                          {matchSummary(config)}
                        </span>
                      </span>
                    </AdsButton>
                    <div className={sx(kickoffSectionStyles.moveButtons)}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === 0}
                        aria-label={i18n.t("settings:settingsDialogKickoffSection.moveEarlier", { value1: config.label })}
                        onClick={() => moveConfig(index, -1)}
                      >
                        <ArrowUp
                          className={sx(kickoffSectionStyles.moveIcon)}
                        />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === sourceConfigs.length - 1}
                        aria-label={i18n.t("settings:settingsDialogKickoffSection.moveLater", { value1: config.label })}
                        onClick={() => moveConfig(index, 1)}
                      >
                        <ArrowDown
                          className={sx(kickoffSectionStyles.moveIcon)}
                        />
                      </Button>
                    </div>
                    <div className={sx(kickoffSectionStyles.serverBadges)}>
                      {config.mcpServers.map((server) => {
                        const available = discoveredServerNames.has(
                          server.toLowerCase(),
                        );
                        return (
                          <Badge
                            key={server}
                            variant={available ? "secondary" : "outline"}
                          >
                            {server} · {available ? i18n.t("settings:settingsDialogKickoffSection.found") : i18n.t("settings:settingsDialogKickoffSection.missing")}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                  {expanded ? (
                    <div className={sx(kickoffSectionStyles.sourcePanel)}>
                      <div className={sx(kickoffSectionStyles.fieldGrid)}>
                        <label className={sx(kickoffSectionStyles.labelField)}>
                          {i18n.t("settings:macroEditor.label")}<DraftInput
                            value={config.label}
                            onCommit={(label) =>
                              patchConfig(config.id, {
                                label,
                              })
                            }
                          />
                        </label>
                        <label className={sx(kickoffSectionStyles.labelField)}>
                          {i18n.t("settings:settingsDialogKickoffSection.informationPanelTarget")}<Select
                            value={config.panelTarget}
                            onValueChange={(panelTarget) =>
                              patchConfig(config.id, {
                                panelTarget: panelTarget as KickoffPanelTarget,
                              })
                            }
                          >
                            <SelectTrigger
                              className={sx(kickoffSectionStyles.selectTrigger)}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {KICKOFF_PANEL_TARGETS.map((target) => (
                                <SelectItem key={target} value={target}>
                                  {PANEL_TARGET_LABELS[target]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </label>
                      </div>
                      <label
                        className={sx(
                          kickoffSectionStyles.labelField,
                          kickoffSectionStyles.labelFieldBlock,
                        )}
                      >
                        {i18n.t("settings:settingsDialogKickoffSection.hostSuffixes")}<DraftInput
                          value={config.match.hostSuffixes.join(", ")}
                          placeholder="example.com, internal.example.com"
                          onCommit={(value) =>
                            patchConfigMatch(config.id, {
                              hostSuffixes: parseList(value),
                            })
                          }
                        />
                      </label>
                      <div className={sx(kickoffSectionStyles.fieldGrid)}>
                        <label className={sx(kickoffSectionStyles.labelField)}>
                          {i18n.t("settings:settingsDialogKickoffSection.pathRegex")}<Input
                            value={config.match.pathPattern}
                            xstyle={kickoffSectionStyles.monoInput}
                            placeholder="^/issues/"
                            onChange={(event) =>
                              patchConfigMatch(config.id, {
                                pathPattern: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className={sx(kickoffSectionStyles.labelField)}>
                          {i18n.t("settings:settingsDialogKickoffSection.keyRegex")}<Input
                            value={config.match.keyPattern}
                            xstyle={kickoffSectionStyles.monoInput}
                            placeholder="\\bPROJ-\\d+\\b"
                            onChange={(event) =>
                              patchConfigMatch(config.id, {
                                keyPattern: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <label
                        className={sx(
                          kickoffSectionStyles.labelField,
                          kickoffSectionStyles.labelFieldBlock,
                        )}
                      >
                        {i18n.t("settings:settingsDialogKickoffSection.mcpServerNames")}<DraftInput
                          value={config.mcpServers.join(", ")}
                          // i18n-ignore: example MCP server identifiers
                          placeholder="jira, company-reports"
                          onCommit={(value) =>
                            patchConfig(config.id, {
                              mcpServers: parseList(value),
                            })
                          }
                        />
                      </label>
                      <label
                        className={sx(
                          kickoffSectionStyles.labelField,
                          kickoffSectionStyles.labelFieldBlock,
                        )}
                      >
                        {i18n.t("settings:settingsDialogKickoffSection.resolutionHint")}<KickoffDraftTextarea
                          value={config.resolutionHint}
                          xstyle={kickoffSectionStyles.resolutionHint}
                          onCommit={(resolutionHint) =>
                            patchConfig(config.id, {
                              resolutionHint,
                            })
                          }
                        />
                      </label>
                      <div className={sx(kickoffSectionStyles.removeRow)}>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          onClick={() => {
                            commitConfigs(
                              sourceConfigs.filter(
                                (item) => item.id !== config.id,
                              ),
                            );
                            setExpandedSourceId(null);
                          }}
                        >
                          <Trash2
                            className={sx(kickoffSectionStyles.actionIcon)}
                          />
                          {i18n.t("settings:settingsDialogKickoffSection.removeSource")}</Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {sourceConfigs.length === 0 ? (
            <p className={sx(kickoffSectionStyles.emptyNote)}>
              {t("settings:settingsDialogKickoffSection.noConfiguredSourcesFreeFormPrompts")}</p>
          ) : null}
          <div className={sx(kickoffSectionStyles.footer)}>
            <p className={sx(kickoffSectionStyles.footerNote)}>
              {t("settings:settingsDialogKickoffSection.sourceOrderControlsMatchPriorityConfluence")}</p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const defaultIds = new Set(
                  DEFAULT_KICKOFF_SOURCE_CONFIGS.map((config) => config.id),
                );
                const customConfigs = sourceConfigs.filter(
                  (config) => !defaultIds.has(config.id),
                );
                commitConfigs([
                  ...DEFAULT_KICKOFF_SOURCE_CONFIGS,
                  ...customConfigs,
                ]);
              }}
            >
              <RefreshCcw className={sx(kickoffSectionStyles.actionIcon)} />
              {t("settings:settingsDialogKickoffSection.restoreDefaultSources")}</Button>
          </div>
        </SettingsCard>

        <SettingsCard
          title={t("settings:settingsDialogKickoffSection.resolution")}
          description={t("settings:settingsDialogKickoffSection.thePrimaryAndFallbackModelsProduce")}
        >
          <KickoffModelField
            title={t("settings:settingsDialogKickoffSection.primaryModel")}
            description={t("settings:settingsDialogKickoffSection.preferredModelForSourceResolutionAnd")}
            value={primaryModel}
            onSelect={(kickoffPrimaryModel) =>
              updateSettings({ patch: { kickoffPrimaryModel } })
            }
          />
          <KickoffModelField
            title={t("settingsProviders:auxiliaryInference.fallbackModel.title")}
            description={t("settings:settingsDialogKickoffSection.usedWhenThePrimaryModelIs")}
            value={fallbackModel}
            onSelect={(kickoffFallbackModel) =>
              updateSettings({ patch: { kickoffFallbackModel } })
            }
          />
          <KickoffPromptField
            value={prompt}
            onCommit={(kickoffPrompt) =>
              updateSettings({ patch: { kickoffPrompt } })
            }
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}
