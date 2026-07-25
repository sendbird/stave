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
  className?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  return (
    <Textarea
      value={draft}
      className={props.className}
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
  return parts.join(" · ") || "No matcher configured";
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
        className="w-full"
        triggerClassName="h-10 w-full max-w-none rounded-md border border-border/80 bg-background px-3 hover:bg-muted/40"
        onSelect={({ selection }) => props.onSelect(selection.model)}
      />
    </LabeledField>
  );
}

function KickoffPromptField(props: {
  value: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(props.value);
  useEffect(() => setDraft(props.value), [props.value]);
  const isDefault = draft.trim() === DEFAULT_PROMPT_WORKSPACE_KICKOFF.trim();

  return (
    <LabeledField
      title="Resolution prompt"
      description="Instructs the one-shot resolver. Source metadata, project instructions, and branch naming rules are appended automatically. Empty skips AI resolution."
    >
      <div className="space-y-2">
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => {
            if (draft !== props.value) {
              props.onCommit(draft);
            }
          }}
          className="min-h-56 bg-background font-mono text-xs leading-5"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {isDefault ? "Using default" : "Customised"}
          </span>
          {!isDefault ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setDraft(DEFAULT_PROMPT_WORKSPACE_KICKOFF);
                props.onCommit(DEFAULT_PROMPT_WORKSPACE_KICKOFF);
              }}
            >
              <RefreshCcw className="size-3" />
              Reset to default
            </Button>
          ) : null}
        </div>
      </div>
    </LabeledField>
  );
}

export function KickoffSection() {
  const [
    projectPath,
    sourceConfigs,
    primaryModel,
    fallbackModel,
    prompt,
    updateSettings,
  ] = useAppStore(
    useShallow((state) => [
      state.projectPath,
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
      setDiscovery(await discover({ cwd: projectPath ?? undefined }));
    } catch {
      setDiscovery(null);
    } finally {
      setDiscovering(false);
    }
  }, [projectPath]);

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
          title="Kickoff Sources"
          description="Enabled matchers classify pasted URLs or keys. MCP dependencies improve resolution but never block workspace creation."
          titleAccessory={
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={discovering}
                onClick={() => void refreshMcpServers()}
              >
                <RefreshCcw
                  className={discovering ? "size-3.5 animate-spin" : "size-3.5"}
                />
                Refresh MCP
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const config: KickoffSourceConfig = {
                    id: `source-${crypto.randomUUID()}`,
                    label: "Custom source",
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
                <Plus className="size-3.5" />
                Add source
              </Button>
            </div>
          }
        >
          <div className="space-y-2">
            {sourceConfigs.map((config, index) => {
              const expanded = expandedSourceId === config.id;
              return (
                <div
                  key={config.id}
                  className="rounded-md border border-border/70 bg-background"
                >
                  <div className="flex items-center gap-3 px-3 py-2.5">
                    <Switch
                      checked={config.enabled}
                      aria-label={`${config.enabled ? "Disable" : "Enable"} ${config.label}`}
                      onCheckedChange={(enabled) =>
                        patchConfig(config.id, { enabled })
                      }
                    />
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                      onClick={() =>
                        setExpandedSourceId(expanded ? null : config.id)
                      }
                    >
                      {expanded ? (
                        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          {config.label}
                          {config.builtIn ? (
                            <Badge variant="secondary">Built-in</Badge>
                          ) : null}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {matchSummary(config)}
                        </span>
                      </span>
                    </button>
                    <div className="flex shrink-0 items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === 0}
                        aria-label={`Move ${config.label} earlier`}
                        onClick={() => moveConfig(index, -1)}
                      >
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        disabled={index === sourceConfigs.length - 1}
                        aria-label={`Move ${config.label} later`}
                        onClick={() => moveConfig(index, 1)}
                      >
                        <ArrowDown className="size-3.5" />
                      </Button>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-1">
                      {config.mcpServers.map((server) => {
                        const available = discoveredServerNames.has(
                          server.toLowerCase(),
                        );
                        return (
                          <Badge
                            key={server}
                            variant={available ? "secondary" : "outline"}
                          >
                            {server} · {available ? "found" : "missing"}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                  {expanded ? (
                    <div className="space-y-4 border-t border-border/60 px-3 py-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5 text-xs font-medium">
                          Label
                          <DraftInput
                            value={config.label}
                            onCommit={(label) =>
                              patchConfig(config.id, {
                                label,
                              })
                            }
                          />
                        </label>
                        <label className="space-y-1.5 text-xs font-medium">
                          Information panel target
                          <Select
                            value={config.panelTarget}
                            onValueChange={(panelTarget) =>
                              patchConfig(config.id, {
                                panelTarget: panelTarget as KickoffPanelTarget,
                              })
                            }
                          >
                            <SelectTrigger className="w-full bg-background">
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
                      <label className="block space-y-1.5 text-xs font-medium">
                        Host suffixes
                        <DraftInput
                          value={config.match.hostSuffixes.join(", ")}
                          placeholder="example.com, internal.example.com"
                          onCommit={(value) =>
                            patchConfigMatch(config.id, {
                              hostSuffixes: parseList(value),
                            })
                          }
                        />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1.5 text-xs font-medium">
                          Path regex
                          <Input
                            value={config.match.pathPattern}
                            className="font-mono text-xs"
                            placeholder="^/issues/"
                            onChange={(event) =>
                              patchConfigMatch(config.id, {
                                pathPattern: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="space-y-1.5 text-xs font-medium">
                          Key regex
                          <Input
                            value={config.match.keyPattern}
                            className="font-mono text-xs"
                            placeholder="\\bPROJ-\\d+\\b"
                            onChange={(event) =>
                              patchConfigMatch(config.id, {
                                keyPattern: event.target.value,
                              })
                            }
                          />
                        </label>
                      </div>
                      <label className="block space-y-1.5 text-xs font-medium">
                        MCP server names
                        <DraftInput
                          value={config.mcpServers.join(", ")}
                          placeholder="jira, company-reports"
                          onCommit={(value) =>
                            patchConfig(config.id, {
                              mcpServers: parseList(value),
                            })
                          }
                        />
                      </label>
                      <label className="block space-y-1.5 text-xs font-medium">
                        Resolution hint
                        <KickoffDraftTextarea
                          value={config.resolutionHint}
                          className="min-h-20"
                          onCommit={(resolutionHint) =>
                            patchConfig(config.id, {
                              resolutionHint,
                            })
                          }
                        />
                      </label>
                      <div className="flex justify-end">
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
                          <Trash2 className="size-3.5" />
                          Remove source
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
          {sourceConfigs.length === 0 ? (
            <p className="rounded-md border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              No configured sources. Free-form prompts still work.
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-3">
            <p className="text-xs text-muted-foreground">
              Source order controls match priority. Confluence precedes Jira by
              default because they can share a host.
            </p>
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
              <RefreshCcw className="size-3.5" />
              Restore default sources
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Resolution"
          description="The primary and fallback models produce the editable preview. If both fail, deterministic parsing still creates a proposal."
        >
          <KickoffModelField
            title="Primary model"
            description="Preferred model for source resolution and proposal generation."
            value={primaryModel}
            onSelect={(kickoffPrimaryModel) =>
              updateSettings({ patch: { kickoffPrimaryModel } })
            }
          />
          <KickoffModelField
            title="Fallback model"
            description="Used when the primary model is unavailable or returns an invalid proposal."
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
