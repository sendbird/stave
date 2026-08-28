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

const CLAUDE_PLUGIN_MODE_HELP = [
  {
    value: "claude-config" as const,
    label: "Claude config",
    description:
      "Load exactly the plugins Claude's own settings enable (what `claude plugin install` / `claude plugin enable` wrote).",
  },
  {
    value: "all" as const,
    label: "All installed",
    description:
      "Load every plugin installed through the Claude CLI, even ones disabled in Claude settings.",
  },
  {
    value: "off" as const,
    label: "Off",
    description: "Load no CLI-installed plugins. Plugin Paths still apply.",
  },
] satisfies ReadonlyArray<{
  value: ClaudePluginMode;
  label: string;
  description: string;
}>;

function describePluginScope(plugin: ClaudeInstalledPluginSummary) {
  if (plugin.scopes.length === 0) {
    return "not installed locally";
  }
  return plugin.scopes.includes("project")
    ? plugin.scopes.includes("user")
      ? "user + project install"
      : "project install"
    : "user install";
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
  const [
    settings,
    activeTaskId,
    activeWorkspaceId,
    workspacePathById,
    projectPath,
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
          state.projectPath,
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
    workspacePathById[activeWorkspaceId] ?? projectPath ?? undefined;
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
      setDetail("Claude plugin discovery is unavailable in this build.");
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
          : "Failed to load installed Claude plugins.",
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
        title="Installed Plugins"
        description="Plugins installed with `claude plugin install`. Stave loads them itself, so they work without turning on the `user` setting source."
        guide={
          <SettingsFieldGuide
            title="Claude Installed Plugins"
            summary="Stave re-states Claude's plugin decision through the SDK, so CLI-installed plugins load under the narrowed setting sources."
            items={CLAUDE_PLUGIN_MODE_HELP.map((option) => ({
              label: option.label,
              description: option.description,
            }))}
            tooltip="How installed Claude plugins are loaded"
          />
        }
      >
        <div className="space-y-3">
          <ChoiceButtons
            columns={3}
            options={CLAUDE_PLUGIN_MODE_HELP}
            value={mode}
            onChange={(value) =>
              updateSettings({ patch: { claudePluginMode: value } })
            }
          />
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isLoading}
              onClick={() => void loadPlugins()}
            >
              {isLoading ? "Loading..." : "Refresh"}
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
                Clear overrides
              </Button>
            ) : null}
          </div>
          {plugins.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {hasLoaded
                ? detail ||
                  "No Claude CLI plugins found. Install one with `claude plugin install <plugin>@<marketplace>`."
                : "Checking installed Claude plugins..."}
            </p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-md border border-border/80">
              {plugins.map((plugin) => (
                <li
                  key={plugin.id}
                  className="flex items-start justify-between gap-3 px-3 py-2"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {plugin.name}
                      </span>
                      {plugin.marketplace ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {plugin.marketplace}
                        </span>
                      ) : null}
                      {plugin.version ? (
                        <span className="truncate text-xs text-muted-foreground">
                          v{plugin.version}
                        </span>
                      ) : null}
                      {overrides[plugin.id] !== undefined ? (
                        <StatusBadge state="warning" label="Stave override" />
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {describePluginScope(plugin)}
                      {plugin.enabledInClaudeConfig
                        ? ` · enabled in ${plugin.enabledSource ?? "claude"} settings`
                        : " · not enabled in Claude settings"}
                    </p>
                    {plugin.description ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground">
                        {plugin.description}
                      </p>
                    ) : null}
                  </div>
                  <Switch
                    checked={plugin.enabled}
                    onCheckedChange={(enabled) =>
                      setPluginEnabled({ plugin, enabled })
                    }
                    aria-label={`Enable ${plugin.id}`}
                    className="mt-0.5 shrink-0"
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
