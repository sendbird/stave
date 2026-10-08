import { I18N_NAMESPACES, i18n, useTranslation } from "@/i18n";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button, toast } from "@/components/ui";
import { useAppStore } from "@/store/app.store";
import { useAccountRuntimeOptions } from "@/lib/providers/use-provider-accounts";
import type { CodexPluginSummarySnapshot } from "@/lib/providers/provider.types";
import { sx } from "@/components/ads/utils/stylex";
import { SettingsCard, StatusBadge } from "./settings-dialog.shared";
import { codexPluginsStyles as styles } from "./settings-dialog-codex-plugins-card.styles";

/**
 * Codex plugin install and remove control inside the Providers section.
 *
 * The App Server snapshot is the only bridge that lists marketplace plugins,
 * so the card reads its `plugins` section and ignores the rest. Install and
 * remove go through the same plugin bridge the Codex CLI uses, then the list
 * is reloaded so the badge and action reflect the new state.
 */
export function CodexPluginsCard() {
  const { t } = useTranslation(I18N_NAMESPACES);
  const [codexBinaryPath, activeWorkspaceId, repositoryPath, workspacePathById] =
    useAppStore(
      useShallow(
        (state) =>
          [
            state.settings.codexBinaryPath,
            state.activeWorkspaceId,
            state.repositoryPath,
            state.workspacePathById,
          ] as const,
      ),
    );
  const workspaceCwd =
    workspacePathById[activeWorkspaceId] ?? repositoryPath ?? undefined;
  const trimmedBinaryPath = codexBinaryPath.trim();
  const runtimeOptions = useAccountRuntimeOptions(
    useMemo(
      () => ({ codexBinaryPath: trimmedBinaryPath || undefined }),
      [trimmedBinaryPath],
    ),
  );

  const [plugins, setPlugins] = useState<CodexPluginSummarySnapshot[]>([]);
  const [detail, setDetail] = useState("");
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [busyPluginId, setBusyPluginId] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadPlugins = useCallback(async () => {
    const getCodexAppServerSnapshot =
      window.api?.provider?.getCodexAppServerSnapshot;
    if (!getCodexAppServerSnapshot) {
      setPlugins([]);
      setDetail(i18n.t("settingsProviders:codexPlugins.errors.unavailable"));
      setHasLoaded(true);
      return;
    }
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsLoading(true);
    try {
      const response = await getCodexAppServerSnapshot({
        cwd: workspaceCwd,
        runtimeOptions,
      });
      // A newer request already answered — drop this stale response.
      if (requestIdRef.current !== requestId) {
        return;
      }
      const pluginsError = response.sectionErrors?.plugins;
      if (!response.ok || !response.snapshot) {
        setPlugins([]);
        setDetail(
          pluginsError ||
            response.detail ||
            i18n.t("settingsProviders:codexPlugins.errors.loadFailed"),
        );
      } else {
        setPlugins(response.snapshot.plugins);
        setDetail(pluginsError ?? "");
      }
      setHasLoaded(true);
    } catch (error) {
      if (requestIdRef.current !== requestId) {
        return;
      }
      setPlugins([]);
      setDetail(
        error instanceof Error
          ? error.message
          : i18n.t("settingsProviders:codexPlugins.errors.loadFailed"),
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

  const runPluginMutation = useCallback(
    async (args: {
      plugin: CodexPluginSummarySnapshot;
      label: string;
      failureLabel: string;
      action: () => Promise<{ ok: boolean; detail: string }>;
    }) => {
      setBusyPluginId(args.plugin.id);
      try {
        const result = await args.action();
        if (!result.ok) {
          toast.error(args.failureLabel, { description: result.detail });
          return;
        }
        toast.success(args.label, { description: result.detail });
        await loadPlugins();
      } catch (error) {
        toast.error(args.failureLabel, {
          description: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setBusyPluginId((current) =>
          current === args.plugin.id ? null : current,
        );
      }
    },
    [loadPlugins],
  );

  const installPlugin = useCallback(
    (plugin: CodexPluginSummarySnapshot) => {
      const installCodexPlugin = window.api?.provider?.installCodexPlugin;
      if (!installCodexPlugin) {
        toast.error(i18n.t("settingsProviders:codexPlugins.toasts.installFailed"), {
          description: i18n.t("settingsProviders:codexPlugins.toasts.installUnavailable"),
        });
        return;
      }
      void runPluginMutation({
        plugin,
        label: i18n.t("settingsProviders:codexPlugins.toasts.installed", { name: plugin.name }),
        failureLabel: i18n.t("settingsProviders:codexPlugins.toasts.installFailed"),
        action: () =>
          installCodexPlugin({
            marketplacePath: plugin.marketplacePath,
            pluginName: plugin.name,
            runtimeOptions,
          }),
      });
    },
    [runPluginMutation, runtimeOptions],
  );

  const removePlugin = useCallback(
    (plugin: CodexPluginSummarySnapshot) => {
      const uninstallCodexPlugin = window.api?.provider?.uninstallCodexPlugin;
      if (!uninstallCodexPlugin) {
        toast.error(i18n.t("settingsProviders:codexPlugins.toasts.uninstallFailed"), {
          description: i18n.t("settingsProviders:codexPlugins.toasts.uninstallUnavailable"),
        });
        return;
      }
      void runPluginMutation({
        plugin,
        label: i18n.t("settingsProviders:codexPlugins.toasts.removed", { name: plugin.name }),
        failureLabel: i18n.t("settingsProviders:codexPlugins.toasts.uninstallFailed"),
        action: () =>
          uninstallCodexPlugin({ pluginId: plugin.id, runtimeOptions }),
      });
    },
    [runPluginMutation, runtimeOptions],
  );

  return (
    <SettingsCard
      title={t("settingsProviders:codexPlugins.card.title")}
      description={t("settingsProviders:codexPlugins.card.description")}
    >
      <div className={sx(styles.stack)}>
        <div className={sx(styles.actions)}>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isLoading}
            onClick={() => void loadPlugins()}
          >
            {isLoading
              ? t("common:status.loading")
              : t("common:actions.refresh")}
          </Button>
        </div>
        {plugins.length === 0 ? (
          <p className={sx(styles.empty)}>
            {hasLoaded
              ? detail || t("settingsProviders:codexPlugins.empty")
              : t("settingsProviders:codexPlugins.checking")}
          </p>
        ) : (
          <ul className={sx(styles.list)}>
            {plugins.map((plugin) => {
              const busy = busyPluginId === plugin.id;
              return (
                <li key={plugin.id} className={sx(styles.listItem)}>
                  <div className={sx(styles.itemBody)}>
                    <div className={sx(styles.itemHead)}>
                      <span className={sx(styles.itemName)}>{plugin.name}</span>
                      <span className={sx(styles.itemMeta)}>
                        {plugin.marketplaceDisplayName ?? plugin.marketplaceName}
                      </span>
                      {plugin.installed ? (
                        <StatusBadge
                          state="ready"
                          label={t("settingsProviders:codexPlugins.installed")}
                        />
                      ) : null}
                    </div>
                    <p className={sx(styles.itemSource)} title={plugin.source}>
                      {plugin.source}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant={plugin.installed ? "outline" : "secondary"}
                    disabled={busy || busyPluginId !== null}
                    className={sx(styles.itemAction)}
                    onClick={() =>
                      plugin.installed ? removePlugin(plugin) : installPlugin(plugin)
                    }
                  >
                    {busy
                      ? t("settingsProviders:codexPlugins.working")
                      : plugin.installed
                        ? t("common:actions.remove")
                        : t("settingsProviders:codexPlugins.install")}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {plugins.length > 0 && detail ? (
          <p className={sx(styles.empty)}>{detail}</p>
        ) : null}
      </div>
    </SettingsCard>
  );
}
