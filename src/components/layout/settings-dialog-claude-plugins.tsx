import { I18N_NAMESPACES, useTranslation, i18n } from "@/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button, Switch } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { buildProviderRuntimeOptions } from "@/store/provider-runtime-options";
import type {
  ClaudeInstalledPluginSummary,
  ClaudePluginMode,
} from "@/lib/providers/provider.types";
import {
  ChoiceButtons,
  LabeledField,
  SettingsFieldGuide,
  StatusBadge,
} from "./settings-dialog.shared";
import { sx } from "@/components/ads/utils/stylex";
import { claudePluginsStyles as styles } from "./settings-dialog-claude-plugins.styles";

const CLAUDE_PLUGIN_MODE_HELP = [
  {
    value: "claude-config" as const,
    get label() { return i18n.t("settingsProviders:claudePlugins.modes.claudeConfig.label"); },
    get description() { return i18n.t("settingsProviders:claudePlugins.modes.claudeConfig.description"); },
  },
  {
    value: "all" as const,
    get label() { return i18n.t("settingsProviders:claudePlugins.modes.all.label"); },
    get description() { return i18n.t("settingsProviders:claudePlugins.modes.all.description"); },
  },
  {
    value: "off" as const,
    get label() { return i18n.t("common:status.off"); },
    get description() { return i18n.t("settingsProviders:claudePlugins.modes.off.description"); },
  },
] satisfies ReadonlyArray<{
  value: ClaudePluginMode;
  label: string;
  description: string;
}>;

function describePluginScope(plugin: ClaudeInstalledPluginSummary) {
  if (plugin.scopes.length === 0) {
    return i18n.t("settingsProviders:claudePlugins.scope.notInstalled");
  }
  return plugin.scopes.includes("project")
    ? plugin.scopes.includes("user")
      ? i18n.t("settingsProviders:claudePlugins.scope.userAndProject")
      : i18n.t("settingsProviders:claudePlugins.scope.project")
    : i18n.t("settingsProviders:claudePlugins.scope.user");
}

/**
 * Installed-plugin control for Claude.
 *
 * Stave narrows Claude's `settingSources` (default `project`), so the `user`
 * layer that `claude plugin install` writes to is not loaded and CLI-installed
 * plugins would never appear. The main process reads the CLI plugin inventory
 * directly and re-states the enable decision in the SDK's inline settings, so
 * this panel is the authoritative switchboard: plugins installed by any route
 * show up here and can be toggled per plugin, independent of Claude's own
 * enable state.
 */
export function ClaudeInstalledPluginsField() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [
    settings,
    activeTaskId,
    activeWorkspaceId,
    workspacePathById,
    repositoryPath,
    providerSessionByTask,
    updateSettings,
    refreshProviderCommandCatalog,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings,
          state.activeTaskId,
          state.activeWorkspaceId,
          state.workspacePathById,
          state.repositoryPath,
          state.providerSessionByTask,
          state.updateSettings,
          state.refreshProviderCommandCatalog,
        ] as const,
    ),
  );
  const [plugins, setPlugins] = useState<ClaudeInstalledPluginSummary[]>([]);
  const [detail, setDetail] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const requestIdRef = useRef(0);

  const mode = settings.claudePluginMode;
  // Persisted settings can predate this field or carry a hand-edited value, so
  // never assume the stored override map is an object.
  const overrides =
    settings.claudePluginOverrides &&
    typeof settings.claudePluginOverrides === "object"
      ? settings.claudePluginOverrides
      : {};
  const workspaceCwd =
    workspacePathById[activeWorkspaceId] ?? repositoryPath ?? undefined;
  const runtimeOptions = useMemo(
    () =>
      buildProviderRuntimeOptions({
        provider: "claude-code",
        model: settings.modelClaude,
        settings,
        providerSession: activeTaskId
          ? (providerSessionByTask[activeTaskId] ?? null)
          : null,
      }),
    [settings, activeTaskId, providerSessionByTask],
  );

  const loadPlugins = useCallback(async () => {
    const listClaudeInstalledPlugins =
      window.api?.provider?.listClaudeInstalledPlugins;
    if (!listClaudeInstalledPlugins) {
      setPlugins([]);
      setDetail(i18n.t("settingsProviders:claudePlugins.errors.unavailable"));
      setHasLoaded(true);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    try {
      const result = await listClaudeInstalledPlugins({
        cwd: workspaceCwd,
        runtimeOptions,
      });
      // A newer request already answered — drop this stale response.
      if (requestIdRef.current !== requestId) {
        return;
      }
      setPlugins(result.plugins);
      setDetail(result.detail);
      setHasLoaded(true);
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      setPlugins([]);
      setDetail(
        error instanceof Error
          ? error.message
          : i18n.t("settingsProviders:claudePlugins.errors.loadFailed"),
      );
      setHasLoaded(true);
    } finally {
      if (requestIdRef.current === requestId) {
        setIsLoading(false);
      }
    }
  }, [runtimeOptions, workspaceCwd]);

  useEffect(() => {
    void loadPlugins();
  }, [loadPlugins]);

  const setPluginEnabled = (args: {
    plugin: ClaudeInstalledPluginSummary;
    enabled: boolean;
  }) => {
    const base =
      mode === "off"
        ? false
        : mode === "all"
          ? true
          : args.plugin.enabledInClaudeConfig;
    const nextOverrides = { ...overrides };
    if (args.enabled === base) {
      // Matching the mode's own decision: drop the override so the plugin keeps
      // following Claude config (or the selected mode) as it changes.
      delete nextOverrides[args.plugin.id];
    } else {
      nextOverrides[args.plugin.id] = args.enabled;
    }
    updateSettings({ patch: { claudePluginOverrides: nextOverrides } });
    // Newly enabled plugins contribute slash commands, so refresh the catalog.
    refreshProviderCommandCatalog();
    void loadPlugins();
  };

  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <>
      <LabeledField
        title={t("settingsProviders:claudePlugins.field.title")}
        description={t("settingsProviders:claudePlugins.field.description")}
        guide={
          <SettingsFieldGuide
            title={t("settingsProviders:claudePlugins.guide.title")}
            summary={t("settingsProviders:claudePlugins.guide.summary")}
            items={CLAUDE_PLUGIN_MODE_HELP.map((option) => ({
              label: option.label,
              description: option.description,
            }))}
            tooltip={t("settingsProviders:claudePlugins.guide.tooltip")}
          />
        }
      >
        <div className={sx(styles.stack)}>
          <ChoiceButtons
            columns={3}
            options={CLAUDE_PLUGIN_MODE_HELP}
            value={mode}
            onChange={(value) =>
              updateSettings({ patch: { claudePluginMode: value } })
            }
          />
          <div className={sx(styles.actions)}>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isLoading}
              onClick={() => void loadPlugins()}
            >
              {isLoading ? t("settingsProviders:settingsDialogClaudePlugins.loading") : t("common:actions.refresh")}
            </Button>
            {hasOverrides ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  updateSettings({ patch: { claudePluginOverrides: {} } });
                  refreshProviderCommandCatalog();
                  void loadPlugins();
                }}
              >
                {t("settingsProviders:claudePlugins.clearOverrides")}</Button>
            ) : null}
          </div>
          {plugins.length === 0 ? (
            <p className={sx(styles.empty)}>
              {hasLoaded
                ? detail ||
                  t("settingsProviders:settingsDialogClaudePlugins.noClaudeCLIPluginsFoundInstall")
                : t("settingsProviders:claudePlugins.checking")}
            </p>
          ) : (
            <ul className={sx(styles.list)}>
              {plugins.map((plugin) => (
                <li key={plugin.id} className={sx(styles.listItem)}>
                  <div className={sx(styles.itemBody)}>
                    <div className={sx(styles.itemHead)}>
                      <span className={sx(styles.itemName)}>{plugin.name}</span>
                      {plugin.marketplace ? (
                        <span className={sx(styles.itemMeta)}>
                          {plugin.marketplace}
                        </span>
                      ) : null}
                      {plugin.version ? (
                        <span className={sx(styles.itemMeta)}>
                          v{plugin.version}
                        </span>
                      ) : null}
                      {overrides[plugin.id] !== undefined ? (
                        <StatusBadge state="warning" label={i18n.t("settingsProviders:claudePlugins.overrideBadge")} />
                      ) : null}
                    </div>
                    <p className={sx(styles.itemScope)}>
                      {describePluginScope(plugin)}
                      {plugin.enabledInClaudeConfig
                        ? i18n.t("settingsProviders:settingsDialogClaudePlugins.enabledInSettings", { value1: plugin.enabledSource ?? "claude" })
                        : i18n.t("settingsProviders:settingsDialogClaudePlugins.notEnabledInClaudeSettings")}
                    </p>
                    {plugin.description ? (
                      <p className={sx(styles.itemDescription)}>
                        {plugin.description}
                      </p>
                    ) : null}
                  </div>
                  <Switch
                    checked={plugin.enabled}
                    onCheckedChange={(enabled) =>
                      setPluginEnabled({ plugin, enabled })
                    }
                    aria-label={i18n.t("settingsProviders:settingsDialogClaudePlugins.enable", { value1: plugin.id })}
                    className={sx(styles.itemSwitch)}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </LabeledField>
    </>
  );
}
