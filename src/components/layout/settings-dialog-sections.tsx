import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
} from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Contrast,
  FileAudio,
  Globe,
  Monitor,
  Moon,
  RefreshCcw,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  buildModelSelectorOptions,
  buildModelSelectorValue,
  buildRecommendedModelSelectorOptions,
  ModelSelector,
} from "@/components/ai-elements/model-selector";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import {
  COMMAND_PALETTE_GROUP_LABELS,
  getCommandPaletteCoreCommands,
} from "@/components/layout/command-palette-registry";
import { type SectionId } from "@/components/layout/settings-dialog.schema";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { useShallow } from "zustand/react/shallow";
import { Badge, Button, Slider, Textarea } from "@/components/ui";
import {
  CUSTOM_AUDIO_ACCEPTED_TYPES,
  CUSTOM_AUDIO_MAX_SIZE_BYTES,
  NOTIFICATION_SOUND_PRESETS,
  playCustomNotificationSound,
  playNotificationSound,
  readFileAsDataUrl,
  validateCustomAudioFile,
  type NotificationSoundPreset,
} from "@/lib/notifications/notification-sound";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getDefaultModelForProvider,
  getProviderLabel,
  normalizeModelSelection,
  resolveClaudeEffortForModelSwitch,
} from "@/lib/providers/model-catalog";
import {
  APP_SHORTCUT_DEFINITIONS,
  APP_SHORTCUT_KEY_OPTIONS,
  DEFAULT_APP_SHORTCUT_KEYS,
  assignAppShortcutKey,
  buildAppShortcutSequences,
  createEmptyAppShortcutKeys,
  formatAppShortcutLabel,
  normalizeAppShortcutKeys,
  type AppShortcutCommandId,
} from "@/lib/app-shortcuts";
import {
  DEFAULT_MODEL_SHORTCUT_KEYS,
  describeModelShortcutKey,
  MODEL_SHORTCUT_SLOT_LABELS,
  normalizeModelShortcutKeys,
} from "@/lib/providers/model-shortcuts";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import { BOOLEAN_TOGGLE_OPTIONS } from "@/lib/providers/runtime-option-contract";
import { resolveSidebarArtworkClass } from "@/lib/themes";
import { cn } from "@/lib/utils";
import {
  BUILTIN_CUSTOM_THEMES,
  MAX_USER_THEMES,
  PRESET_THEME_TOKENS,
  SIDEBAR_ARTWORK_OPTIONS,
  THEME_TOKEN_NAMES,
  exportCustomThemeJson,
  listAllCustomThemes,
  parseCustomThemeFile,
  type SidebarArtworkMode,
  type CustomThemeDefinition,
  type ThemeModeName,
  type ThemeTokenName,
  useAppStore,
} from "@/store/app.store";
import {
  normalizeProjectBasePrompt,
  normalizeProjectWorkspaceInitCommand,
  normalizeProjectWorkspaceRootNodeModulesSymlinkPreference,
  type RecentProjectState,
} from "@/store/project.utils";
import {
  DEFAULT_PROMPT_RESPONSE_STYLE,
  DEFAULT_PROMPT_PR_DESCRIPTION,
  DEFAULT_PROMPT_SUPERVISOR_BREAKDOWN,
  DEFAULT_PROMPT_SUPERVISOR_SYNTHESIS,
  DEFAULT_PROMPT_PREPROCESSOR_CLASSIFIER,
  DEFAULT_PROMPT_INLINE_COMPLETION,
  DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY,
} from "@/lib/providers/prompt-defaults";
import {
  THINKING_PHRASE_ANIMATION_OPTIONS,
  normalizeThinkingPhraseAnimationStyle,
} from "@/lib/thinking-phrases";
import type { ResolvedWorkspaceScriptsConfig } from "@/lib/workspace-scripts/types";
import { ChangelogSection } from "./settings-dialog-changelog-section";
import { DeveloperSection } from "./settings-dialog-developer-section";
import { PresetsSection } from "./settings-dialog-presets-section";
import { CodexSection } from "./settings-dialog-codex-section";
import { McpSection } from "./settings-dialog-mcp-section";
import { MuseSection } from "./settings-dialog-muse-section";
import { ProvidersSection } from "./settings-dialog-providers-section";
import { ToolingSection } from "./settings-dialog-tooling-section";
import { WorkspaceScriptsManager } from "./WorkspaceScriptsManager";
import { WorkspaceShortcutChip } from "./WorkspaceShortcutChip";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  readFloat,
  readInt,
  SectionHeading,
  SectionStack,
  SettingsCard,
  SwitchField,
} from "./settings-dialog.shared";

function formatThemeTokenLabel(token: ThemeTokenName) {
  return token
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatNotificationSoundPresetLabel(preset: NotificationSoundPreset) {
  return `${preset.slice(0, 1).toUpperCase()}${preset.slice(1)}`;
}

const NOTIFICATION_SOUND_PRESET_OPTIONS: Array<{
  value: NotificationSoundPreset;
  label: string;
}> = NOTIFICATION_SOUND_PRESETS.map((preset) => ({
  value: preset,
  label: formatNotificationSoundPresetLabel(preset),
}));

const PROMPT_MODEL_PROVIDER_IDS = ["claude-code", "codex"] as const;
const MODEL_SHORTCUT_PROVIDER_IDS = [
  "stave",
  ...PROMPT_MODEL_PROVIDER_IDS,
] as const;
const UNASSIGNED_APP_SHORTCUT_VALUE = "__shortcut_unassigned__";
const UNASSIGNED_MODEL_SHORTCUT_VALUE = "__unassigned__";

interface GitRemoteState {
  name: string;
  fetchUrl: string | null;
  pushUrl: string | null;
}

function parseGitRemotes(args: { stdout: string }) {
  const remoteStateByName = new Map<string, GitRemoteState>();
  const lines = args.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^(\S+)\s+(.+?)\s+\((fetch|push)\)$/i);
    if (!match) {
      continue;
    }
    const [, name, url, kind] = match;
    if (!name || !url || !kind) {
      continue;
    }
    const current = remoteStateByName.get(name) ?? {
      name,
      fetchUrl: null,
      pushUrl: null,
    };
    if (kind.toLowerCase() === "fetch") {
      current.fetchUrl = url;
    } else {
      current.pushUrl = url;
    }
    remoteStateByName.set(name, current);
  }

  return Array.from(remoteStateByName.values());
}

type DraftTextareaProps = Omit<
  ComponentPropsWithoutRef<typeof Textarea>,
  "value" | "defaultValue" | "onChange"
> & {
  value: string;
  onCommit: (value: string) => void;
};

const DraftTextarea = memo(function DraftTextarea(args: DraftTextareaProps) {
  const { value, onCommit, onBlur, ...textareaProps } = args;
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  return (
    <Textarea
      {...textareaProps}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        if (event.target.value !== value) {
          onCommit(event.target.value);
        }
        onBlur?.(event);
      }}
    />
  );
});

function ProjectSettingsPanel(args: {
  project: RecentProjectState;
  isCurrent: boolean;
  onRequestRemove: (args: { projectPath: string; projectName: string }) => void;
}) {
  const setProjectBasePrompt = useAppStore(
    (state) => state.setProjectBasePrompt,
  );
  const setProjectWorkspaceInitCommand = useAppStore(
    (state) => state.setProjectWorkspaceInitCommand,
  );
  const setProjectWorkspaceUseRootNodeModulesSymlink = useAppStore(
    (state) => state.setProjectWorkspaceUseRootNodeModulesSymlink,
  );
  const [currentProjectPath, activeWorkspaceId, workspacePathById] =
    useAppStore(
      useShallow(
        (state) =>
          [
            state.projectPath,
            state.activeWorkspaceId,
            state.workspacePathById,
          ] as const,
      ),
    );
  const projectWorkspaceInitCommand = normalizeProjectWorkspaceInitCommand({
    value: args.project.newWorkspaceInitCommand,
  });
  const projectBasePrompt = normalizeProjectBasePrompt({
    value: args.project.projectBasePrompt,
  });
  const projectUseRootNodeModulesSymlink =
    normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
      value: args.project.newWorkspaceUseRootNodeModulesSymlink,
    });
  const scriptsWorkspacePath = args.isCurrent
    ? (workspacePathById[activeWorkspaceId] ??
      currentProjectPath ??
      args.project.projectPath)
    : args.project.projectPath;
  const [resolvedScriptsConfig, setResolvedScriptsConfig] =
    useState<ResolvedWorkspaceScriptsConfig | null>(null);
  const [repositoryRefreshNonce, setRepositoryRefreshNonce] = useState(0);
  const [repositoryState, setRepositoryState] = useState<{
    status: "idle" | "loading" | "ready" | "error";
    rootPath: string | null;
    remotes: GitRemoteState[];
    detail: string;
  }>({
    status: "idle",
    rootPath: null,
    remotes: [],
    detail: "Refreshing repository metadata...",
  });

  const loadResolvedScriptsConfig = useCallback(async () => {
    const getConfig = window.api?.scripts?.getConfig;
    if (!getConfig || !args.project.projectPath || !scriptsWorkspacePath) {
      setResolvedScriptsConfig(null);
      return;
    }

    const result = await getConfig({
      projectPath: args.project.projectPath,
      workspacePath: scriptsWorkspacePath,
    });
    setResolvedScriptsConfig(result.ok ? result.config : null);
  }, [args.project.projectPath, scriptsWorkspacePath]);

  useEffect(() => {
    void loadResolvedScriptsConfig();
  }, [loadResolvedScriptsConfig]);

  useEffect(() => {
    const runCommand = window.api?.terminal?.runCommand;
    if (!runCommand) {
      setRepositoryState({
        status: "error",
        rootPath: null,
        remotes: [],
        detail: "Terminal bridge unavailable.",
      });
      return;
    }

    let cancelled = false;
    setRepositoryState((current) => ({
      ...current,
      status: "loading",
      detail: "Refreshing repository metadata...",
    }));

    void (async () => {
      const [rootResult, remoteResult] = await Promise.all([
        runCommand({
          cwd: args.project.projectPath,
          command: "git rev-parse --show-toplevel",
        }),
        runCommand({
          cwd: args.project.projectPath,
          command: "git remote -v",
        }),
      ]);
      if (cancelled) {
        return;
      }

      if (!rootResult.ok) {
        setRepositoryState({
          status: "error",
          rootPath: null,
          remotes: [],
          detail:
            rootResult.stderr?.trim() ||
            "This project is unavailable or is not a git repository.",
        });
        return;
      }

      const rootPath =
        rootResult.stdout
          .split("\n")
          .map((line) => line.trim())
          .find(Boolean) ?? args.project.projectPath;
      const remotes = remoteResult.ok
        ? parseGitRemotes({ stdout: remoteResult.stdout })
        : [];
      const detail = remoteResult.ok
        ? remotes.length > 0
          ? `${remotes.length} remote${remotes.length === 1 ? "" : "s"} configured.`
          : "No git remotes configured."
        : remoteResult.stderr?.trim() || "Failed to inspect git remotes.";

      setRepositoryState({
        status: "ready",
        rootPath,
        remotes,
        detail,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [args.project.projectPath, repositoryRefreshNonce]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border/80 bg-card/95 px-4 py-3 shadow-xs">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Project Settings</Badge>
            {args.isCurrent ? <Badge>Current</Badge> : null}
            <Badge variant="secondary">
              {args.project.workspaces.length} workspace
              {args.project.workspaces.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant="secondary">
              default: {args.project.defaultBranch}
            </Badge>
          </div>
          <div className="space-y-1">
            <h4 className="text-lg font-semibold tracking-tight">
              {args.project.projectName}
            </h4>
            <p className="text-sm text-muted-foreground">
              Review repository-specific workspace defaults, git metadata,
              scripts config, and removal actions for this project.
            </p>
          </div>
          <p className="font-mono text-xs text-muted-foreground break-all">
            {args.project.projectPath}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={repositoryState.status === "loading"}
            onClick={() => setRepositoryRefreshNonce((value) => value + 1)}
          >
            <RefreshCcw
              className={cn(
                "size-3.5",
                repositoryState.status === "loading" && "animate-spin",
              )}
            />
            Refresh
          </Button>
        </div>
      </div>

      <SettingsCard
        title="Repository Settings"
        description="Repository-specific defaults, git metadata, and list management for this project."
      >
        <LabeledField
          title="Project Instructions"
          description="Prepended to every Claude and Codex turn for this project. Use it for repo-specific guardrails, tooling preferences, and workflow rules."
        >
          <DraftTextarea
            className="min-h-[140px] rounded-md border-border/80 bg-background text-sm"
            value={projectBasePrompt}
            onCommit={(nextValue) =>
              setProjectBasePrompt({
                projectPath: args.project.projectPath,
                prompt: nextValue,
              })
            }
            placeholder="Prefer bun over npm. Preserve existing Zustand selector stability patterns. Keep documentation in sync with user-facing changes."
          />
        </LabeledField>

        <LabeledField
          title="Post-Create Command"
          description="Runs once in the new workspace root after creation. Useful for `bun install`, `npm install`, or multi-line bootstrap commands."
        >
          <DraftTextarea
            className="min-h-[120px] rounded-md border-border/80 bg-background font-mono text-sm"
            value={projectWorkspaceInitCommand}
            onCommit={(nextValue) =>
              setProjectWorkspaceInitCommand({
                projectPath: args.project.projectPath,
                command: nextValue,
              })
            }
            placeholder="bun install"
          />
        </LabeledField>

        <LabeledField
          title="Reuse Root node_modules"
          description="Creates `node_modules` in each new worktree as a symlink to the repository root install. Faster startup, but later installs in that workspace will modify the shared dependency tree."
        >
          <button
            type="button"
            aria-pressed={projectUseRootNodeModulesSymlink}
            onClick={() =>
              setProjectWorkspaceUseRootNodeModulesSymlink({
                projectPath: args.project.projectPath,
                enabled: !projectUseRootNodeModulesSymlink,
              })
            }
            className={cn(
              "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left transition-colors",
              projectUseRootNodeModulesSymlink
                ? "border-primary/50 bg-primary/5"
                : "border-border/80 bg-background hover:border-border",
            )}
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                Enable shared `node_modules` symlink
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                The symlink exists only inside the created workspace, so
                deleting the workspace leaves the repository root untouched.
              </p>
            </div>
            <span
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]",
                projectUseRootNodeModulesSymlink
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border/80 text-muted-foreground",
              )}
            >
              {projectUseRootNodeModulesSymlink ? "On" : "Off"}
            </span>
          </button>
        </LabeledField>

        <LabeledField title="Repository Root Path">
          <div className="rounded-md border border-border/80 bg-background px-3 py-2.5 font-mono text-xs break-all">
            {repositoryState.rootPath ?? "Not detected"}
          </div>
        </LabeledField>

        <LabeledField
          title="Remote Status"
          description={repositoryState.detail}
        >
          {repositoryState.status === "error" ? (
            <p className="text-sm text-destructive">{repositoryState.detail}</p>
          ) : repositoryState.remotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No remotes configured.
            </p>
          ) : (
            <div className="space-y-2">
              {repositoryState.remotes.map((remote) => (
                <div
                  key={remote.name}
                  className="rounded-md border border-border/80 bg-background px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{remote.name}</p>
                    <Badge
                      variant="secondary"
                      className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                    >
                      configured
                    </Badge>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
                    fetch: {remote.fetchUrl ?? "-"}
                  </p>
                  <p className="mt-1 font-mono text-xs text-muted-foreground break-all">
                    push: {remote.pushUrl ?? remote.fetchUrl ?? "-"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </LabeledField>

        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium text-destructive">
                Remove project
              </p>
              <p className="text-sm text-muted-foreground">
                Removes this project from Stave&apos;s registered project list
                without deleting files on disk.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() =>
                args.onRequestRemove({
                  projectPath: args.project.projectPath,
                  projectName: args.project.projectName,
                })
              }
            >
              <Trash2 className="size-4" />
              Remove project
            </Button>
          </div>
        </div>
      </SettingsCard>

      <WorkspaceScriptsManager
        projectPath={args.project.projectPath}
        workspacePath={scriptsWorkspacePath}
        resolvedConfig={resolvedScriptsConfig}
        onSaved={loadResolvedScriptsConfig}
      />
    </div>
  );
}

function ProjectsSection(args: {
  currentProjectPath?: string | null;
  projects: RecentProjectState[];
  selectedProjectPath?: string | null;
}) {
  const removeProjectFromList = useAppStore(
    (state) => state.removeProjectFromList,
  );
  const [projectToRemove, setProjectToRemove] = useState<{
    projectPath: string;
    projectName: string;
  } | null>(null);
  const selectedProject =
    args.projects.find(
      (project) => project.projectPath === args.selectedProjectPath,
    ) ?? null;

  return (
    <>
      <SectionHeading
        title="Projects"
        description="Review repository-specific workspace defaults, git metadata, scripts config, and removal actions for the selected project."
      />
      {args.projects.length === 0 ? (
        <SettingsCard
          title="No Projects Yet"
          description="Open a project from the sidebar to register it here."
        >
          <p className="text-sm text-muted-foreground">
            Registered projects will show their repository defaults and metadata
            in this section.
          </p>
        </SettingsCard>
      ) : (
        <div className="min-w-0">
          {selectedProject ? (
            <ProjectSettingsPanel
              project={selectedProject}
              isCurrent={
                selectedProject.projectPath === args.currentProjectPath
              }
              onRequestRemove={setProjectToRemove}
            />
          ) : (
            <SettingsCard
              title="Project Details"
              description="Choose a project from the Settings sidebar to open its settings panel."
            >
              <p className="text-sm text-muted-foreground">
                Pick a project from the sidebar to inspect its workspace
                defaults and repository metadata.
              </p>
            </SettingsCard>
          )}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(projectToRemove)}
        title="Remove Project"
        description={
          projectToRemove
            ? `Remove "${projectToRemove.projectName}" from Stave's project list? This does not delete files on disk.`
            : ""
        }
        confirmLabel="Remove Project"
        onCancel={() => setProjectToRemove(null)}
        onConfirm={() => {
          if (!projectToRemove) {
            return;
          }
          void removeProjectFromList({
            projectPath: projectToRemove.projectPath,
          });
          setProjectToRemove(null);
        }}
      />
    </>
  );
}

function GeneralSection() {
  const [
    appShellMode,
    confirmBeforeClose,
    notificationSoundEnabled,
    notificationSoundPreset,
    notificationSoundVolume,
    notificationSoundMode,
    notificationSoundCustomAudioData,
    notificationSoundCustomAudioName,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.appShellMode,
          state.settings.confirmBeforeClose,
          state.settings.notificationSoundEnabled,
          state.settings.notificationSoundPreset,
          state.settings.notificationSoundVolume,
          state.settings.notificationSoundMode,
          state.settings.notificationSoundCustomAudioData,
          state.settings.notificationSoundCustomAudioName,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const notificationSoundVolumePercent = Math.round(
    notificationSoundVolume * 100,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleCustomAudioUpload = async (file: File) => {
    setUploadError(null);
    const error = validateCustomAudioFile(file);
    if (error) {
      setUploadError(error);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      updateSettings({
        patch: {
          notificationSoundMode: "custom",
          notificationSoundCustomAudioData: dataUrl,
          notificationSoundCustomAudioName: file.name,
        },
      });
    } catch {
      setUploadError("Failed to read the audio file.");
    }
  };

  const handleRemoveCustomAudio = () => {
    setUploadError(null);
    updateSettings({
      patch: {
        notificationSoundMode: "preset",
        notificationSoundCustomAudioData: null,
        notificationSoundCustomAudioName: null,
      },
    });
  };

  const handleTestSound = () => {
    if (
      notificationSoundMode === "custom" &&
      notificationSoundCustomAudioData
    ) {
      playCustomNotificationSound({
        dataUrl: notificationSoundCustomAudioData,
        volume: notificationSoundVolume,
      });
    } else {
      playNotificationSound({
        preset: notificationSoundPreset,
        volume: notificationSoundVolume,
      });
    }
  };

  return (
    <>
      <SectionHeading
        title="General"
        description="Global preferences for the app window and reserved future defaults."
      />
      <SectionStack>
        <SettingsCard
          title="Workspace Mode"
          description="Choose the default shell shown when the app opens and when Zen mode is toggled."
        >
          <LabeledField
            title="Mode"
            description="Stave keeps the full workspace chrome visible. Zen keeps the focused chat-only shell active until you switch back."
          >
            <ChoiceButtons
              value={appShellMode}
              onChange={(value) =>
                updateSettings({ patch: { appShellMode: value } })
              }
              options={[
                {
                  value: "stave",
                  label: "Stave",
                  description:
                    "Default workspace shell with sidebar, tabs, editor, terminal, and right rail.",
                },
                {
                  value: "zen",
                  label: "Zen",
                  description:
                    "Focused shell that stays in Zen mode until you switch back to Stave.",
                },
              ]}
            />
          </LabeledField>
        </SettingsCard>
        <SettingsCard
          title="Window Behavior"
          description="Control how the app handles the close shortcut."
        >
          <SwitchField
            title="Confirm Before Close"
            description="Show a confirmation dialog before closing the app with ⌘W / Ctrl+W when no tabs or tasks are open."
            checked={confirmBeforeClose}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { confirmBeforeClose: checked } })
            }
          />
        </SettingsCard>
        <SettingsCard
          title="Notification Sound"
          description="Customize the success sound played when a task turn finishes."
        >
          <SwitchField
            title="Sound"
            description="Enable or mute the task completion sound."
            checked={notificationSoundEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { notificationSoundEnabled: checked } })
            }
          />
          {notificationSoundEnabled ? (
            <>
              <LabeledField
                title="Source"
                description="Use a built-in preset or upload your own audio file."
              >
                <ChoiceButtons
                  value={notificationSoundMode}
                  onChange={(value) =>
                    updateSettings({
                      patch: {
                        notificationSoundMode: value as "preset" | "custom",
                      },
                    })
                  }
                  options={[
                    { value: "preset", label: "Preset" },
                    { value: "custom", label: "Custom" },
                  ]}
                />
              </LabeledField>
              {notificationSoundMode === "preset" ? (
                <LabeledField
                  title="Preset"
                  description="Choose the synthesized tone used for task completion."
                >
                  <ChoiceButtons
                    value={notificationSoundPreset}
                    onChange={(value) =>
                      updateSettings({
                        patch: { notificationSoundPreset: value },
                      })
                    }
                    options={NOTIFICATION_SOUND_PRESET_OPTIONS}
                  />
                </LabeledField>
              ) : (
                <LabeledField
                  title="Custom Audio"
                  description={`Upload an audio file (MP3, WAV, OGG, M4A, WebM). Max ${CUSTOM_AUDIO_MAX_SIZE_BYTES / 1024} KB.`}
                >
                  <div className="flex flex-col gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept={CUSTOM_AUDIO_ACCEPTED_TYPES.join(",")}
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          void handleCustomAudioUpload(file);
                        }
                        // Reset so the same file can be re-selected
                        e.target.value = "";
                      }}
                    />
                    {notificationSoundCustomAudioName ? (
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2 rounded-md border border-border/80 bg-muted/50 px-3 py-2 text-sm flex-1 min-w-0">
                          <FileAudio className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">
                            {notificationSoundCustomAudioName}
                          </span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Upload className="h-3.5 w-3.5 mr-1" />
                          Replace
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={handleRemoveCustomAudio}
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          Remove
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-3.5 w-3.5 mr-1" />
                        Upload Audio File
                      </Button>
                    )}
                    {uploadError ? (
                      <p className="text-sm text-destructive">{uploadError}</p>
                    ) : null}
                  </div>
                </LabeledField>
              )}
              <LabeledField
                title="Volume"
                description="Adjust playback level for the task completion sound."
              >
                <div className="flex items-center gap-3">
                  <Slider
                    aria-label="Notification sound volume"
                    className="flex-1"
                    value={[notificationSoundVolumePercent]}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(values) => {
                      const nextValue = values[0];
                      if (typeof nextValue !== "number") {
                        return;
                      }
                      updateSettings({
                        patch: { notificationSoundVolume: nextValue / 100 },
                      });
                    }}
                  />
                  <Badge variant="outline" className="min-w-14 justify-center">
                    {notificationSoundVolumePercent}%
                  </Badge>
                </div>
              </LabeledField>
              <LabeledField
                title="Preview"
                description={
                  notificationSoundMode === "custom"
                    ? "Play the uploaded audio once with the current volume."
                    : "Play the current preset once with the current volume."
                }
              >
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleTestSound}
                  disabled={
                    notificationSoundMode === "custom" &&
                    !notificationSoundCustomAudioData
                  }
                >
                  Test Sound
                </Button>
              </LabeledField>
            </>
          ) : null}
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function ThemeSection() {
  const [themeEditorMode, setThemeEditorMode] =
    useState<ThemeModeName>("light");
  const themeMode = useAppStore((state) => state.settings.themeMode);
  const customThemeId = useAppStore((state) => state.settings.customThemeId);
  const sidebarArtworkMode = useAppStore(
    (state) => state.settings.sidebarArtworkMode,
  );
  const borderBeamEnabled = useAppStore(
    (state) => state.settings.borderBeamEnabled,
  );
  const borderBeamSize = useAppStore((state) => state.settings.borderBeamSize);
  const borderBeamVariant = useAppStore(
    (state) => state.settings.borderBeamVariant,
  );
  const userCustomThemes = useAppStore(
    (state) => state.settings.userCustomThemes,
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const installCustomTheme = useAppStore((state) => state.installCustomTheme);
  const removeCustomTheme = useAppStore((state) => state.removeCustomTheme);

  const allThemes = useMemo(
    () => listAllCustomThemes({ userThemes: userCustomThemes }),
    [userCustomThemes],
  );
  const builtinIds = useMemo(
    () => new Set(BUILTIN_CUSTOM_THEMES.map((t) => t.id)),
    [],
  );

  return (
    <>
      <SectionHeading
        title="Design"
        description="Control theme mode, theme presets, and design token overrides."
      />
      <SectionStack>
        <SettingsCard
          title="Appearance"
          description="Choose how the app resolves light and dark mode."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              className="h-10 rounded-md"
              variant={themeMode === "light" ? "default" : "outline"}
              onClick={() =>
                updateSettings({
                  patch: { themeMode: "light", customThemeId: null },
                })
              }
            >
              <Sun className="size-4" />
              Light
            </Button>
            <Button
              className="h-10 rounded-md"
              variant={themeMode === "dark" ? "default" : "outline"}
              onClick={() =>
                updateSettings({
                  patch: { themeMode: "dark", customThemeId: null },
                })
              }
            >
              <Moon className="size-4" />
              Dark
            </Button>
            <Button
              className="h-10 rounded-md"
              variant={themeMode === "system" ? "default" : "outline"}
              onClick={() =>
                updateSettings({
                  patch: { themeMode: "system", customThemeId: null },
                })
              }
            >
              <Monitor className="size-4" />
              System
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Sidebar Artwork"
          description="Choose the ambient gradient artwork behind the left sidebar. Space Haze is the default shell backdrop."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            {SIDEBAR_ARTWORK_OPTIONS.map((option) => {
              const isActive = sidebarArtworkMode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "grid gap-2 rounded-xl border p-3 text-left transition-colors",
                    isActive
                      ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                      : "border-border/70 bg-background/60 hover:border-primary/35 hover:bg-muted/30",
                  )}
                  onClick={() =>
                    updateSettings({
                      patch: {
                        sidebarArtworkMode: option.value as SidebarArtworkMode,
                      },
                    })
                  }
                >
                  <SidebarArtworkPreview
                    mode={option.value as SidebarArtworkMode}
                  />
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{option.label}</p>
                    {option.value === "space-haze" ? (
                      <Badge
                        variant="outline"
                        className="text-[10px] uppercase tracking-wide"
                      >
                        Default
                      </Badge>
                    ) : null}
                    {isActive ? (
                      <span className="ml-auto flex items-center gap-1 text-xs font-medium text-primary">
                        <Check className="size-3.5" />
                        Active
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    {option.description}
                  </p>
                </button>
              );
            })}
          </div>
        </SettingsCard>

        <SettingsCard
          title="Motion"
          description="Opt-in animated accents. All motion honors your system Reduced Motion preference."
        >
          <SwitchField
            title="Border Beam"
            description="Animate a soft highlight around the prompt input and the active workspace row while a task is streaming. Style presets come from the border-beam library."
            checked={borderBeamEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { borderBeamEnabled: checked } })
            }
          />
          {borderBeamEnabled ? (
            <div className="mt-3 grid gap-3 border-t border-border/50 pt-3">
              <LabeledField
                title="Beam Size"
                description="Library size preset. `md` is the full border glow; `sm` is compact for small inputs; `line` sweeps a lit stripe along the bottom edge."
              >
                <ChoiceButtons
                  value={borderBeamSize}
                  columns={3}
                  onChange={(value) =>
                    updateSettings({ patch: { borderBeamSize: value } })
                  }
                  options={[
                    { value: "sm", label: "Small" },
                    { value: "md", label: "Medium" },
                    { value: "line", label: "Line" },
                  ]}
                />
              </LabeledField>
              <LabeledField
                title="Beam Colors"
                description="Library color palette. `Colorful` is a full rainbow sweep; `Ocean` and `Sunset` are cool and warm variants; `Mono` is grayscale."
              >
                <ChoiceButtons
                  value={borderBeamVariant}
                  columns={2}
                  onChange={(value) =>
                    updateSettings({ patch: { borderBeamVariant: value } })
                  }
                  options={[
                    { value: "colorful", label: "Colorful" },
                    { value: "mono", label: "Mono" },
                    { value: "ocean", label: "Ocean" },
                    { value: "sunset", label: "Sunset" },
                  ]}
                />
              </LabeledField>
            </div>
          ) : null}
        </SettingsCard>

        <SettingsCard
          title="Theme Presets"
          description="Apply a curated palette inspired by popular VS Code themes. Presets override the base light / dark tokens; manual token tweaks below still take priority."
        >
          <div className="grid gap-3">
            {allThemes.map((theme) => (
              <CustomThemeCard
                key={theme.id}
                theme={theme}
                isActive={customThemeId === theme.id}
                isBuiltin={builtinIds.has(theme.id)}
                onSelect={() =>
                  updateSettings({ patch: { customThemeId: theme.id } })
                }
                onDeselect={() =>
                  updateSettings({ patch: { customThemeId: null } })
                }
                onRemove={
                  builtinIds.has(theme.id)
                    ? undefined
                    : () => removeCustomTheme({ themeId: theme.id })
                }
                onExport={() => {
                  const json = exportCustomThemeJson({ theme });
                  const blob = new Blob([json], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${theme.id}.theme.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              />
            ))}
          </div>

          <ThemeImportButton
            existingIds={allThemes.map((t) => t.id)}
            userThemeCount={userCustomThemes.length}
            onInstall={(theme) => {
              const result = installCustomTheme({ theme });
              if (result.ok) {
                updateSettings({ patch: { customThemeId: theme.id } });
              }
              return result;
            }}
          />
        </SettingsCard>

        <SettingsCard
          title="Design Tokens"
          description="These are Stave's base light and dark tokens. Custom presets layer on top, and manual overrides below still win."
        >
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={themeEditorMode === "light" ? "default" : "outline"}
                onClick={() => setThemeEditorMode("light")}
              >
                Light Tokens
              </Button>
              <Button
                size="sm"
                variant={themeEditorMode === "dark" ? "default" : "outline"}
                onClick={() => setThemeEditorMode("dark")}
              >
                Dark Tokens
              </Button>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const themeOverrides =
                  useAppStore.getState().settings.themeOverrides;
                updateSettings({
                  patch: {
                    themeOverrides: {
                      ...themeOverrides,
                      [themeEditorMode]: {},
                    },
                  },
                });
              }}
            >
              Reset {themeEditorMode}
            </Button>
          </div>

          <div className="grid gap-3">
            {THEME_TOKEN_NAMES.map((token) => (
              <ThemeTokenRow
                key={`${themeEditorMode}-${token}`}
                token={token}
                themeEditorMode={themeEditorMode}
              />
            ))}
          </div>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

const SidebarArtworkPreview = memo(function SidebarArtworkPreview(args: {
  mode: SidebarArtworkMode;
}) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "sidebar-liquid-glass relative h-20 overflow-hidden rounded-lg border border-sidebar-border/40 bg-sidebar/70",
        resolveSidebarArtworkClass({ mode: args.mode }),
      )}
    >
      <div className="absolute inset-x-3 top-2 h-px rounded-full bg-sidebar-border/75" />
      <div className="absolute inset-x-2 bottom-2 grid gap-1.5">
        <div className="rounded-md border border-sidebar-border/45 bg-background/20 px-2 py-1 shadow-sm">
          <div className="h-1.5 w-2/5 rounded-full bg-foreground/60" />
        </div>
        <div className="rounded-md border border-sidebar-border/60 bg-background/24 px-2 py-1 ring-1 ring-primary/20 shadow-sm backdrop-blur-sm">
          <div className="h-1.5 w-3/5 rounded-full bg-foreground/80" />
        </div>
      </div>
    </div>
  );
});

/** A visual card for a single custom theme preset. */
const CustomThemeCard = memo(function CustomThemeCard(args: {
  theme: CustomThemeDefinition;
  isActive: boolean;
  isBuiltin: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  onRemove?: () => void;
  onExport?: () => void;
}) {
  const { theme, isActive, isBuiltin } = args;
  const previewTokens = [
    "background",
    "foreground",
    "primary",
    "accent",
    "destructive",
    "border",
    "success",
    "warning",
  ] as const;
  const previewColors = previewTokens
    .map((t) => theme.tokens[t])
    .filter(Boolean);

  return (
    <div
      className={cn(
        "group relative grid gap-3 rounded-xl border p-4 transition-colors sm:grid-cols-[1fr_auto] sm:items-center",
        isActive
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border/70 bg-background/60 hover:border-primary/40 hover:bg-muted/30",
      )}
    >
      {/* main clickable area */}
      <button
        type="button"
        className="grid gap-1.5 text-left"
        onClick={isActive ? args.onDeselect : args.onSelect}
      >
        <div className="flex items-center gap-2">
          <Contrast className="size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm font-semibold">{theme.name}</p>
          <Badge
            variant="outline"
            className="text-[10px] uppercase tracking-wide"
          >
            {theme.baseMode}
          </Badge>
          {!isBuiltin && (
            <Badge
              variant="secondary"
              className="text-[10px] uppercase tracking-wide"
            >
              User
            </Badge>
          )}
          {isActive && (
            <span className="ml-auto flex items-center gap-1 text-xs font-medium text-primary sm:ml-0">
              <Check className="size-3.5" />
              Active
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{theme.description}</p>
        {theme.author && (
          <p className="text-[11px] text-muted-foreground/70">
            by {theme.author}
            {theme.version ? ` \u00B7 v${theme.version}` : ""}
          </p>
        )}
      </button>

      {/* right column: swatches + action buttons */}
      <div className="flex flex-col items-end gap-2">
        {/* colour swatch strip */}
        <div className="flex items-center gap-1">
          {previewColors.map((color, i) => (
            <span
              key={i}
              className="size-6 rounded-md border border-border/50"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
          ))}
        </div>

        {/* action buttons */}
        <div className="flex items-center gap-1">
          {args.onExport && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                args.onExport?.();
              }}
            >
              <Upload className="size-3" />
              Export
            </Button>
          )}
          {args.onRemove && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs text-destructive hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                args.onRemove?.();
              }}
            >
              <Trash2 className="size-3" />
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
});

/** Button + file input for importing a custom theme JSON file. */
function ThemeImportButton(args: {
  existingIds: string[];
  userThemeCount: number;
  onInstall: (theme: CustomThemeDefinition) => { ok: boolean; error?: string };
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset so the same file can be re-selected.
    e.target.value = "";

    if (file.size > 256 * 1024) {
      setImportError("File too large (max 256 KB).");
      return;
    }

    const text = await file.text();
    const result = parseCustomThemeFile({
      text,
      existingIds: args.existingIds,
    });
    if (!result.ok) {
      setImportError(result.errors?.join(" ") ?? "Unknown validation error.");
      return;
    }

    const installResult = args.onInstall(result.theme!);
    if (!installResult.ok) {
      setImportError(installResult.error ?? "Failed to install theme.");
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={args.userThemeCount >= MAX_USER_THEMES}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="size-3.5" />
          Import Theme JSON
        </Button>
        <span className="text-xs text-muted-foreground">
          {args.userThemeCount} / {MAX_USER_THEMES} user themes
        </span>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFileChange}
      />

      {importError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {importError}
        </p>
      )}

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Drop a{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
          .theme.json
        </code>{" "}
        file to install a community theme. The JSON must include{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">id</code>,{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">name</code>,{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">
          baseMode
        </code>
        , and a{" "}
        <code className="rounded bg-muted px-1 py-0.5 text-[10px]">tokens</code>{" "}
        map.
      </p>
    </div>
  );
}

const ThemeTokenRow = memo(function ThemeTokenRow(args: {
  token: ThemeTokenName;
  themeEditorMode: ThemeModeName;
}) {
  const updateSettings = useAppStore((state) => state.updateSettings);
  const overrideValue = useAppStore(
    (state) =>
      state.settings.themeOverrides[args.themeEditorMode][args.token] ?? "",
  );
  const effectiveValue =
    overrideValue || PRESET_THEME_TOKENS[args.themeEditorMode][args.token];

  return (
    <div className="grid gap-3 rounded-xl border border-border/70 bg-background/60 p-4 lg:grid-cols-[190px_52px_1fr_auto] lg:items-center">
      <div>
        <p className="text-sm font-medium">
          {formatThemeTokenLabel(args.token)}
        </p>
        <p className="text-xs text-muted-foreground">
          Preset: {PRESET_THEME_TOKENS[args.themeEditorMode][args.token]}
        </p>
      </div>
      <span
        className="size-11 rounded-lg border border-border"
        style={{ backgroundColor: effectiveValue }}
        aria-hidden="true"
      />
      <DraftInput
        className="h-10 rounded-md border-border/80 bg-background font-mono text-sm"
        value={overrideValue}
        placeholder={PRESET_THEME_TOKENS[args.themeEditorMode][args.token]}
        onCommit={(nextValue) => {
          const themeOverrides = useAppStore.getState().settings.themeOverrides;
          updateSettings({
            patch: {
              themeOverrides: {
                ...themeOverrides,
                [args.themeEditorMode]: {
                  ...themeOverrides[args.themeEditorMode],
                  [args.token]: nextValue,
                },
              },
            },
          });
        }}
      />
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          const themeOverrides = useAppStore.getState().settings.themeOverrides;
          updateSettings({
            patch: {
              themeOverrides: {
                ...themeOverrides,
                [args.themeEditorMode]: {
                  ...themeOverrides[args.themeEditorMode],
                  [args.token]: "",
                },
              },
            },
          });
        }}
      >
        Reset
      </Button>
    </div>
  );
});

function TerminalSection() {
  const [
    terminalFontSize,
    terminalFontFamily,
    terminalCursorStyle,
    terminalLineHeight,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.terminalFontSize,
          state.settings.terminalFontFamily,
          state.settings.terminalCursorStyle,
          state.settings.terminalLineHeight,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading
        title="Terminal"
        description="Configure terminal appearance and behavior."
      />
      <SectionStack>
        <SettingsCard
          title="Typography"
          description="Tune readability for the integrated terminal."
        >
          <LabeledField title="Font Size">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              value={String(terminalFontSize)}
              onCommit={(nextValue) =>
                updateSettings({
                  patch: {
                    terminalFontSize: readInt(nextValue, terminalFontSize),
                  },
                })
              }
            />
          </LabeledField>
          <LabeledField title="Font Family">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              value={terminalFontFamily}
              onCommit={(nextValue) =>
                updateSettings({ patch: { terminalFontFamily: nextValue } })
              }
            />
          </LabeledField>
          <LabeledField title="Line Height">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              value={String(terminalLineHeight)}
              onCommit={(nextValue) =>
                updateSettings({
                  patch: {
                    terminalLineHeight: readFloat(
                      nextValue,
                      terminalLineHeight,
                    ),
                  },
                })
              }
            />
          </LabeledField>
        </SettingsCard>

        <SettingsCard
          title="Cursor"
          description="Choose the terminal cursor shape."
        >
          <ChoiceButtons
            value={terminalCursorStyle}
            columns={3}
            onChange={(value) =>
              updateSettings({ patch: { terminalCursorStyle: value } })
            }
            options={[
              { value: "block", label: "Block" },
              { value: "bar", label: "Bar" },
              { value: "underline", label: "Underline" },
            ]}
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function ModelsSection() {
  const [modelClaude, modelCodex, claudeEffort, codexBinaryPath] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.modelClaude,
          state.settings.modelCodex,
          state.settings.claudeEffort,
          state.settings.codexBinaryPath,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const codexModelCatalog = useCodexModelCatalog({
    enabled: true,
    codexBinaryPath,
  });
  const codexModelEnrichment = useMemo(() => {
    if (codexModelCatalog.entries.length === 0) {
      return undefined;
    }
    const map = new Map<
      string,
      { description?: string; isDefault?: boolean }
    >();
    for (const entry of codexModelCatalog.entries) {
      const id = entry.model.trim();
      if (id) {
        map.set(id, {
          description: entry.description || undefined,
          isDefault: entry.isDefault || undefined,
        });
      }
    }
    return map.size > 0 ? map : undefined;
  }, [codexModelCatalog.entries]);
  const modelOptions = useMemo(
    () =>
      buildModelSelectorOptions({
        providerIds: ["claude-code", "codex"],
        modelsByProvider: {
          codex: codexModelCatalog.models,
        },
        enrichmentByModel: codexModelEnrichment,
      }),
    [codexModelCatalog.models, codexModelEnrichment],
  );
  const recommendedModelOptions = useMemo(
    () => buildRecommendedModelSelectorOptions({ options: modelOptions }),
    [modelOptions],
  );

  return (
    <>
      <SectionHeading
        title="Models"
        description="Set the default model routing used for new turns. Codex options come from the current App Server runtime when available."
      />
      <SectionStack>
        <SettingsCard
          title="Model Routing"
          description="Pick the default Claude and Codex models used for new turns. Stave falls back to its verified Codex baseline if the App Server catalog is unavailable."
        >
          <LabeledField title="Claude">
            <ModelSelector
              value={buildModelSelectorValue({
                providerId: "claude-code",
                model: modelClaude,
              })}
              options={modelOptions.filter(
                (option) => option.providerId === "claude-code",
              )}
              recommendedOptions={recommendedModelOptions.filter(
                (option) => option.providerId === "claude-code",
              )}
              className="w-full"
              triggerClassName="h-10 w-full max-w-none rounded-md border border-border/80 bg-background px-3 hover:bg-muted/40"
              menuClassName="sm:max-w-lg"
              onSelect={({ selection }) => {
                const nextModel = normalizeModelSelection({
                  value: selection.model,
                  fallback: getDefaultModelForProvider({
                    providerId: "claude-code",
                  }),
                });
                updateSettings({
                  patch: {
                    modelClaude: nextModel,
                    claudeEffort: resolveClaudeEffortForModelSwitch({
                      previousModel: modelClaude,
                      nextModel,
                      currentEffort: claudeEffort,
                    }),
                  },
                });
              }}
            />
          </LabeledField>
          <LabeledField
            title="Codex"
            description={
              codexModelCatalog.detail.trim().length > 0
                ? codexModelCatalog.detail
                : undefined
            }
          >
            <ModelSelector
              value={buildModelSelectorValue({
                providerId: "codex",
                model: modelCodex,
              })}
              options={modelOptions.filter(
                (option) => option.providerId === "codex",
              )}
              recommendedOptions={recommendedModelOptions.filter(
                (option) => option.providerId === "codex",
              )}
              className="w-full"
              triggerClassName="h-10 w-full max-w-none rounded-md border border-border/80 bg-background px-3 hover:bg-muted/40"
              menuClassName="sm:max-w-lg"
              onSelect={({ selection }) =>
                updateSettings({
                  patch: {
                    modelCodex: normalizeModelSelection({
                      value: selection.model,
                      fallback: getDefaultModelForProvider({
                        providerId: "codex",
                      }),
                    }),
                  },
                })
              }
            />
          </LabeledField>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function RulesSection() {
  const [rulesPresetPrimary, rulesPresetSecondary] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.rulesPresetPrimary,
          state.settings.rulesPresetSecondary,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading
        title="Rules"
        description="Default rule presets injected into provider runs."
      />
      <SectionStack>
        <SettingsCard
          title="Rule Presets"
          description="Primary and secondary presets are appended to new task turns."
        >
          <DraftInput
            className="h-10 rounded-md border-border/80 bg-background"
            value={rulesPresetPrimary}
            onCommit={(nextValue) =>
              updateSettings({ patch: { rulesPresetPrimary: nextValue } })
            }
          />
          <DraftInput
            className="h-10 rounded-md border-border/80 bg-background"
            value={rulesPresetSecondary}
            onCommit={(nextValue) =>
              updateSettings({ patch: { rulesPresetSecondary: nextValue } })
            }
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function ChatSection() {
  const [
    smartSuggestions,
    chatSendPreview,
    chatStreamingEnabled,
    messageFontSize,
    messageCodeFontSize,
    messageFontFamily,
    messageMonoFontFamily,
    messageKoreanFontFamily,
    infoPanelScale,
    reasoningExpansionMode,
    showInterimMessages,
    thinkingPhraseAnimationStyle,
    codexFastModeVisible,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.smartSuggestions,
          state.settings.chatSendPreview,
          state.settings.chatStreamingEnabled,
          state.settings.messageFontSize,
          state.settings.messageCodeFontSize,
          state.settings.messageFontFamily,
          state.settings.messageMonoFontFamily,
          state.settings.messageKoreanFontFamily,
          state.settings.infoPanelScale,
          state.settings.reasoningExpansionMode,
          state.settings.showInterimMessages,
          state.settings.thinkingPhraseAnimationStyle,
          state.settings.codexFastModeVisible,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading
        title="Chat"
        description="Typography and behavior defaults for the chat message surface."
      />
      <SectionStack>
        <SettingsCard
          title="Typography"
          description="Font sizes and families applied to the shared chat surface."
        >
          <LabeledField
            title="Message Font Size"
            description="Prose font size for chat messages. Line height scales proportionally."
          >
            <div className="flex items-center gap-3">
              <Slider
                min={12}
                max={24}
                step={1}
                value={[messageFontSize]}
                onValueChange={([value]) =>
                  updateSettings({ patch: { messageFontSize: value } })
                }
                className="flex-1"
              />
              <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">
                {messageFontSize}px
              </span>
            </div>
          </LabeledField>
          <LabeledField
            title="Code Font Size"
            description="Font size for inline code and code blocks in chat messages."
          >
            <div className="flex items-center gap-3">
              <Slider
                min={10}
                max={20}
                step={1}
                value={[messageCodeFontSize]}
                onValueChange={([value]) =>
                  updateSettings({ patch: { messageCodeFontSize: value } })
                }
                className="flex-1"
              />
              <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">
                {messageCodeFontSize}px
              </span>
            </div>
          </LabeledField>
          <LabeledField
            title="Font Family"
            description="Base sans-serif font for chat messages. Falls back to the Korean font, then sans-serif."
          >
            <DraftInput
              value={messageFontFamily}
              className="h-9 font-mono text-sm"
              onCommit={(nextValue) =>
                updateSettings({ patch: { messageFontFamily: nextValue } })
              }
            />
          </LabeledField>
          <LabeledField
            title="Mono Font Family"
            description="Monospace font for inline code and code blocks in messages."
          >
            <DraftInput
              value={messageMonoFontFamily}
              className="h-9 font-mono text-sm"
              onCommit={(nextValue) =>
                updateSettings({ patch: { messageMonoFontFamily: nextValue } })
              }
            />
          </LabeledField>
          <LabeledField
            title="Korean Font Family"
            description="Fallback font for Korean (CJK) text in messages. Pretendard Variable is loaded by default."
          >
            <DraftInput
              value={messageKoreanFontFamily}
              className="h-9 font-mono text-sm"
              onCommit={(nextValue) =>
                updateSettings({
                  patch: { messageKoreanFontFamily: nextValue },
                })
              }
            />
          </LabeledField>
          <LabeledField
            title="Information Panel Scale"
            description="Zoom level for the workspace information panel. Affects text, icons, buttons, and spacing uniformly."
          >
            <div className="flex items-center gap-3">
              <Slider
                min={80}
                max={130}
                step={5}
                value={[Math.round(infoPanelScale * 100)]}
                onValueChange={([value]) =>
                  updateSettings({
                    patch: { infoPanelScale: (value ?? 100) / 100 },
                  })
                }
                className="flex-1"
              />
              <span className="w-12 text-right text-sm tabular-nums text-muted-foreground">
                {Math.round(infoPanelScale * 100)}%
              </span>
            </div>
          </LabeledField>
        </SettingsCard>
        <SettingsCard
          title="Behavior"
          description="Toggle chat features and display preferences."
        >
          <SwitchField
            title="Smart Suggestions"
            checked={smartSuggestions}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { smartSuggestions: checked } })
            }
          />
          <SwitchField
            title="Send Preview"
            checked={chatSendPreview}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { chatSendPreview: checked } })
            }
          />
          <SwitchField
            title="Streaming UI"
            checked={chatStreamingEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { chatStreamingEnabled: checked } })
            }
          />
          <LabeledField
            title="Reasoning Expansion"
            description="Auto expands the reasoning trace while a turn is streaming, then collapses it again. Manual keeps it collapsed until you open it."
          >
            <ChoiceButtons<"auto" | "manual">
              value={reasoningExpansionMode}
              onChange={(value) =>
                updateSettings({ patch: { reasoningExpansionMode: value } })
              }
              options={[
                { value: "auto", label: "Auto" },
                { value: "manual", label: "Manual" },
              ]}
            />
          </LabeledField>
          <SwitchField
            title="Show Interim Messages"
            description="Show pre-final assistant text segments between execution steps. Hidden by default to keep the final response cleaner."
            checked={showInterimMessages}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { showInterimMessages: checked } })
            }
          />
          <LabeledField
            title="Reasoning Phrase Animation"
            description="Animation used for in-progress reasoning labels while streaming, including the rotating phrase and the Thinking label in the reasoning step."
          >
            <Select
              value={thinkingPhraseAnimationStyle}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    thinkingPhraseAnimationStyle:
                      normalizeThinkingPhraseAnimationStyle(value),
                  },
                })
              }
            >
              <SelectTrigger className="w-full bg-background">
                <SelectValue placeholder="Select animation" />
              </SelectTrigger>
              <SelectContent>
                {THINKING_PHRASE_ANIMATION_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                    {option.value === "soft" ? " (Recommended)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <SwitchField
            title="Show Fast Mode Toggle (Codex)"
            description="Show the Fast mode toggle button when Codex is the active provider."
            checked={codexFastModeVisible}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { codexFastModeVisible: checked } })
            }
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function SkillsSection() {
  const [
    skillsEnabled,
    skillsAutoSuggest,
    sharedSkillsHome,
    skillCatalog,
    activeWorkspaceId,
    projectPath,
    workspacePathById,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.skillsEnabled,
          state.settings.skillsAutoSuggest,
          state.settings.sharedSkillsHome,
          state.skillCatalog,
          state.activeWorkspaceId,
          state.projectPath,
          state.workspacePathById,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const refreshSkillCatalog = useAppStore((state) => state.refreshSkillCatalog);
  const workspacePath =
    workspacePathById[activeWorkspaceId] ?? projectPath ?? null;

  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);

  const skillCountByRootPath = useMemo(() => {
    const counts = new Map<string, number>();
    for (const skill of skillCatalog.skills) {
      counts.set(
        skill.sourceRootPath,
        (counts.get(skill.sourceRootPath) ?? 0) + 1,
      );
    }
    return counts;
  }, [skillCatalog.skills]);

  const skillsByRoot = useMemo(() => {
    const groups = new Map<
      string,
      {
        root: (typeof skillCatalog.roots)[number] | null;
        skills: typeof skillCatalog.skills;
      }
    >();
    for (const skill of skillCatalog.skills) {
      const key = skill.sourceRootPath;
      if (!groups.has(key)) {
        const matchingRoot =
          skillCatalog.roots.find((r) => r.path === key) ?? null;
        groups.set(key, { root: matchingRoot, skills: [] });
      }
      groups.get(key)!.skills.push(skill);
    }
    return groups;
  }, [skillCatalog.skills, skillCatalog.roots]);

  useEffect(() => {
    if (!skillsEnabled) {
      return;
    }
    if (
      skillCatalog.status === "loading" &&
      skillCatalog.workspacePath === workspacePath &&
      skillCatalog.sharedSkillsHome === (sharedSkillsHome.trim() || null)
    ) {
      return;
    }
    if (
      skillCatalog.status === "ready" &&
      skillCatalog.workspacePath === workspacePath &&
      skillCatalog.sharedSkillsHome === (sharedSkillsHome.trim() || null)
    ) {
      const CATALOG_TTL_MS = 5 * 60 * 1000;
      const fetchedAtMs = skillCatalog.fetchedAt
        ? Date.parse(skillCatalog.fetchedAt)
        : 0;
      if (Date.now() - fetchedAtMs < CATALOG_TTL_MS) {
        return;
      }
    }
    void refreshSkillCatalog({ workspacePath });
  }, [
    refreshSkillCatalog,
    sharedSkillsHome,
    skillCatalog.status,
    skillCatalog.workspacePath,
    skillCatalog.sharedSkillsHome,
    skillCatalog.fetchedAt,
    skillsEnabled,
    workspacePath,
  ]);

  return (
    <>
      <SectionHeading
        title="Skills"
        description="Configure skill discovery and automatic prompting."
      />
      <SectionStack>
        <SettingsCard
          title="Skills"
          description="Control skill suggestions and automatic prompting."
        >
          <SwitchField
            title="Enabled"
            checked={skillsEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { skillsEnabled: checked } })
            }
          />
          <SwitchField
            title="Auto Suggest"
            checked={skillsAutoSuggest}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { skillsAutoSuggest: checked } })
            }
          />
          <LabeledField
            title="Shared Skills Root"
            description="Optional shared global skill directory. Leave blank to follow STAVE_SHARED_SKILLS_HOME when present. Supports ~/..."
          >
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              placeholder="~/shared-skills"
              value={sharedSkillsHome}
              onCommit={(nextValue) =>
                updateSettings({ patch: { sharedSkillsHome: nextValue } })
              }
            />
          </LabeledField>
        </SettingsCard>
        <SettingsCard
          title="Detected Skills"
          description="Stave scans global, user, and workspace-local skill roots. The shared global root follows Settings first, then STAVE_SHARED_SKILLS_HOME."
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {skillCatalog.status === "loading"
                  ? "Refreshing catalog..."
                  : skillCatalog.status === "error"
                    ? "Skill discovery failed"
                    : `${skillCatalog.skills.length} skills across ${skillCatalog.roots.length} roots`}
              </p>
              <p className="text-sm text-muted-foreground">
                {skillCatalog.detail}
              </p>
              {skillCatalog.fetchedAt ? (
                <p className="text-xs text-muted-foreground">
                  Last updated{" "}
                  {formatTaskUpdatedAt({ value: skillCatalog.fetchedAt })}
                </p>
              ) : null}
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void refreshSkillCatalog({ workspacePath })}
            >
              Refresh
            </Button>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Roots
            </p>
            {skillCatalog.roots.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No skill roots were discovered for the current workspace.
              </p>
            ) : (
              skillCatalog.roots.map((root) => (
                <div
                  key={root.id}
                  className="rounded-lg border border-border/70 bg-background/60 px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">{root.path}</span>
                    <Badge
                      variant="secondary"
                      className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                    >
                      {root.scope}
                    </Badge>
                    <Badge
                      variant="outline"
                      className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                    >
                      {root.provider}
                    </Badge>
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                      {skillCountByRootPath.get(root.path) ?? 0} skills
                    </Badge>
                  </div>
                  {root.detail ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {root.detail}
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Catalog
            </p>
            {skillCatalog.skills.length === 0 ? (
              skillCatalog.status === "loading" ? (
                <p className="text-sm text-muted-foreground">
                  Loading skills...
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No SKILL.md entries were found.
                </p>
              )
            ) : (
              Array.from(skillsByRoot.entries()).map(([rootPath, group]) => {
                const isCollapsed = collapsedGroups.includes(rootPath);
                return (
                  <div
                    key={rootPath}
                    className="rounded-lg border border-border/70 bg-background/40"
                  >
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted/30"
                      onClick={() => {
                        setCollapsedGroups((current) =>
                          current.includes(rootPath)
                            ? current.filter((v) => v !== rootPath)
                            : [...current, rootPath],
                        );
                      }}
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {rootPath}
                        </span>
                        <Badge
                          variant="secondary"
                          className="h-5 px-1.5 text-[10px]"
                        >
                          {group.skills.length}
                        </Badge>
                        {group.root ? (
                          <Badge
                            variant="outline"
                            className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                          >
                            {group.root.scope}
                          </Badge>
                        ) : null}
                      </div>
                      {isCollapsed ? (
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                    {!isCollapsed ? (
                      <div className="space-y-2 border-t border-border/70 px-3 py-2">
                        {group.skills.map((skill) => (
                          <div
                            key={skill.id}
                            className="rounded-lg border border-border/70 bg-background/60 px-3 py-2"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium">
                                {skill.name}
                              </span>
                              <Badge
                                variant="secondary"
                                className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                              >
                                {skill.scope}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="h-5 px-1.5 text-[10px] uppercase tracking-wide"
                              >
                                {skill.provider}
                              </Badge>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {skill.description}
                            </p>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground/70">
                              {skill.path}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function SubagentsSection() {
  const [subagentsEnabled, subagentsProfile] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.subagentsEnabled,
          state.settings.subagentsProfile,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading
        title="Subagents"
        description="Control how the main agent delegates tasks to child agents."
      />
      <SectionStack>
        <SettingsCard
          title="Delegation"
          description="Subagents allow the primary model to spawn lightweight child agents for research, exploration, and parallel workstreams."
        >
          <SwitchField
            title="Enabled"
            description="When enabled, the agent may delegate sub-tasks to smaller worker agents."
            checked={subagentsEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { subagentsEnabled: checked } })
            }
          />
          <LabeledField
            title="Profile"
            description="Optional profile identifier that controls the subagent model and tool policy."
          >
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              placeholder="default"
              value={subagentsProfile}
              onCommit={(nextValue) =>
                updateSettings({ patch: { subagentsProfile: nextValue } })
              }
            />
          </LabeledField>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function CommandPaletteSection() {
  const [
    commandPaletteShowRecent,
    commandPalettePinnedCommandIds,
    commandPaletteHiddenCommandIds,
    commandPaletteRecentCommandIds,
    appShortcutKeys,
    modelShortcutKeys,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.commandPaletteShowRecent,
          state.settings.commandPalettePinnedCommandIds,
          state.settings.commandPaletteHiddenCommandIds,
          state.settings.commandPaletteRecentCommandIds,
          state.settings.appShortcutKeys,
          state.settings.modelShortcutKeys,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const normalizedAppShortcutKeys = useMemo(
    () => normalizeAppShortcutKeys(appShortcutKeys),
    [appShortcutKeys],
  );
  const commands = useMemo(
    () =>
      getCommandPaletteCoreCommands({
        appShortcutKeys: normalizedAppShortcutKeys,
      }),
    [normalizedAppShortcutKeys],
  );
  const normalizedModelShortcutKeys = useMemo(
    () => normalizeModelShortcutKeys(modelShortcutKeys),
    [modelShortcutKeys],
  );
  const {
    options: modelShortcutOptions,
    recommendedOptions: recommendedModelShortcutOptions,
  } = useSettingsModelSelectorOptions({
    providerIds: MODEL_SHORTCUT_PROVIDER_IDS,
  });
  const recommendedModelShortcutKeySet = useMemo(
    () => new Set(recommendedModelShortcutOptions.map((option) => option.key)),
    [recommendedModelShortcutOptions],
  );
  const additionalModelShortcutOptions = useMemo(
    () =>
      modelShortcutOptions.filter(
        (option) => !recommendedModelShortcutKeySet.has(option.key),
      ),
    [modelShortcutOptions, recommendedModelShortcutKeySet],
  );

  function togglePinnedCommand(commandId: string) {
    const isPinned = commandPalettePinnedCommandIds.includes(commandId);
    updateSettings({
      patch: {
        commandPalettePinnedCommandIds: isPinned
          ? commandPalettePinnedCommandIds.filter((id) => id !== commandId)
          : [...commandPalettePinnedCommandIds, commandId],
        commandPaletteHiddenCommandIds: commandPaletteHiddenCommandIds.filter(
          (id) => id !== commandId,
        ),
      },
    });
  }

  function toggleHiddenCommand(commandId: string) {
    const isHidden = commandPaletteHiddenCommandIds.includes(commandId);
    updateSettings({
      patch: {
        commandPaletteHiddenCommandIds: isHidden
          ? commandPaletteHiddenCommandIds.filter((id) => id !== commandId)
          : [...commandPaletteHiddenCommandIds, commandId],
        commandPalettePinnedCommandIds: commandPalettePinnedCommandIds.filter(
          (id) => id !== commandId,
        ),
        commandPaletteRecentCommandIds: isHidden
          ? commandPaletteRecentCommandIds
          : commandPaletteRecentCommandIds.filter((id) => id !== commandId),
      },
    });
  }

  function updateModelShortcutSlot(slotIndex: number, nextShortcutKey: string) {
    const nextKeys = [...normalizedModelShortcutKeys];
    nextKeys[slotIndex] = nextShortcutKey;
    updateSettings({
      patch: {
        modelShortcutKeys: nextKeys,
      },
    });
  }

  function updateAppShortcut(actionId: AppShortcutCommandId, nextKey: string) {
    updateSettings({
      patch: {
        appShortcutKeys: assignAppShortcutKey({
          actionId,
          shortcutKeys: normalizedAppShortcutKeys,
          nextKey,
        }),
      },
    });
  }

  return (
    <>
      <SectionHeading
        title="Command Palette"
        description="Configure shell chords, the global command launcher, and prompt-model hotkeys. This is separate from slash commands in the chat input."
      />
      <SectionStack>
        <SettingsCard
          title="Behavior"
          description="Pinned commands appear first, hidden commands stay out of the palette, and recent history can be shown as its own section."
        >
          <SwitchField
            title="Recent Commands"
            checked={commandPaletteShowRecent}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { commandPaletteShowRecent: checked } })
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                updateSettings({
                  patch: { commandPaletteRecentCommandIds: [] },
                })
              }
              disabled={commandPaletteRecentCommandIds.length === 0}
            >
              Clear Recent History
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                updateSettings({
                  patch: {
                    commandPalettePinnedCommandIds: [],
                    commandPaletteHiddenCommandIds: [],
                    commandPaletteRecentCommandIds: [],
                    commandPaletteShowRecent: true,
                  },
                })
              }
              disabled={
                commandPalettePinnedCommandIds.length === 0 &&
                commandPaletteHiddenCommandIds.length === 0 &&
                commandPaletteRecentCommandIds.length === 0 &&
                commandPaletteShowRecent
              }
            >
              Reset Palette Settings
            </Button>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Shell Shortcut Chords"
          description="Keep panel and navigation shortcuts on a single Cmd/Ctrl+K prefix so they do not collide with editor and IDE bindings."
          titleAccessory={<Badge variant="secondary">Cmd/Ctrl+K</Badge>}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                updateSettings({
                  patch: {
                    appShortcutKeys: { ...DEFAULT_APP_SHORTCUT_KEYS },
                  },
                })
              }
              disabled={APP_SHORTCUT_DEFINITIONS.every(
                (definition) =>
                  normalizedAppShortcutKeys[definition.commandId] ===
                  definition.defaultKey,
              )}
            >
              Reset Default Chords
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                updateSettings({
                  patch: {
                    appShortcutKeys: createEmptyAppShortcutKeys(),
                  },
                })
              }
              disabled={APP_SHORTCUT_DEFINITIONS.every(
                (definition) =>
                  normalizedAppShortcutKeys[definition.commandId].length === 0,
              )}
            >
              Clear All Chords
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Assigning a key moves it off any conflicting shell command
            automatically.
          </p>
          <div className="space-y-2.5">
            {APP_SHORTCUT_DEFINITIONS.map((definition) => {
              const selectedKey =
                normalizedAppShortcutKeys[definition.commandId] ?? "";
              const currentValue = selectedKey || UNASSIGNED_APP_SHORTCUT_VALUE;
              const currentShortcutLabel =
                formatAppShortcutLabel({
                  actionId: definition.commandId,
                  modifierLabel: "Cmd/Ctrl",
                  shortcutKeys: normalizedAppShortcutKeys,
                }) ?? "Disabled";
              const shortcutSequences = buildAppShortcutSequences({
                actionId: definition.commandId,
                modifierLabel: "Cmd/Ctrl",
                shortcutKeys: normalizedAppShortcutKeys,
              });

              return (
                <div
                  key={definition.commandId}
                  className="rounded-lg border border-border/70 bg-card/60 p-3"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                    <div className="min-w-0 space-y-1 lg:w-64 lg:shrink-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {shortcutSequences.map((sequence, index) => (
                          <div
                            key={`${definition.commandId}-${sequence.join("-")}`}
                            className="flex items-center gap-2"
                          >
                            {index > 0 ? (
                              <span className="text-[11px] text-muted-foreground">
                                then
                              </span>
                            ) : null}
                            <Badge variant="secondary">
                              {sequence.join(" + ")}
                            </Badge>
                          </div>
                        ))}
                        <p className="text-sm font-medium text-foreground">
                          {definition.title}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {definition.description}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <Select
                        value={currentValue}
                        onValueChange={(value) =>
                          updateAppShortcut(
                            definition.commandId,
                            value === UNASSIGNED_APP_SHORTCUT_VALUE
                              ? ""
                              : value,
                          )
                        }
                      >
                        <SelectTrigger className="h-10 w-full rounded-md border-border/80 bg-background">
                          <SelectValue placeholder="Disabled" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Shortcut State</SelectLabel>
                            <SelectItem value={UNASSIGNED_APP_SHORTCUT_VALUE}>
                              Disabled
                            </SelectItem>
                          </SelectGroup>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>Assignable Keys</SelectLabel>
                            {APP_SHORTCUT_KEY_OPTIONS.map((option) => (
                              <SelectItem key={option.key} value={option.key}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Current chord: {currentShortcutLabel}.
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsCard>

        <SettingsCard
          title="Model Shortcuts"
          description="Map Alt+1..0 to prompt models. These shortcuts switch the active task provider and draft model immediately."
          titleAccessory={<Badge variant="secondary">Alt+1..0</Badge>}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                updateSettings({
                  patch: {
                    modelShortcutKeys: [...DEFAULT_MODEL_SHORTCUT_KEYS],
                  },
                })
              }
              disabled={normalizedModelShortcutKeys.every(
                (value, index) =>
                  value === (DEFAULT_MODEL_SHORTCUT_KEYS[index] ?? ""),
              )}
            >
              Reset Default Shortcuts
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                updateSettings({
                  patch: {
                    modelShortcutKeys: MODEL_SHORTCUT_SLOT_LABELS.map(() => ""),
                  },
                })
              }
              disabled={normalizedModelShortcutKeys.every(
                (value) => value.length === 0,
              )}
            >
              Clear All Shortcuts
            </Button>
          </div>
          <div className="space-y-2.5">
            {MODEL_SHORTCUT_SLOT_LABELS.map((slotLabel, slotIndex) => {
              const selectedShortcutKey =
                normalizedModelShortcutKeys[slotIndex] ?? "";
              const selectedShortcutDetails = describeModelShortcutKey({
                shortcutKey: selectedShortcutKey,
              });
              const defaultShortcutDetails = describeModelShortcutKey({
                shortcutKey: DEFAULT_MODEL_SHORTCUT_KEYS[slotIndex] ?? "",
              });
              const currentValue = modelShortcutOptions.some(
                (option) => option.key === selectedShortcutKey,
              )
                ? selectedShortcutKey
                : UNASSIGNED_MODEL_SHORTCUT_VALUE;

              return (
                <div
                  key={slotLabel}
                  className="rounded-lg border border-border/70 bg-card/60 p-3"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                    <div className="min-w-0 space-y-1 lg:w-52 lg:shrink-0">
                      <div className="flex items-center gap-2">
                        <WorkspaceShortcutChip
                          modifier="Alt"
                          label={slotLabel}
                        />
                        <p className="text-sm font-medium text-foreground">
                          Model Slot {slotLabel}
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Default:{" "}
                        {defaultShortcutDetails?.modelLabel ?? "Unassigned"}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1 space-y-2">
                      <Select
                        value={currentValue}
                        onValueChange={(value) =>
                          updateModelShortcutSlot(
                            slotIndex,
                            value === UNASSIGNED_MODEL_SHORTCUT_VALUE
                              ? ""
                              : value,
                          )
                        }
                      >
                        <SelectTrigger className="h-10 w-full rounded-md border-border/80 bg-background">
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent className="max-h-80">
                          <SelectGroup>
                            <SelectLabel>Shortcut State</SelectLabel>
                            <SelectItem value={UNASSIGNED_MODEL_SHORTCUT_VALUE}>
                              Unassigned
                            </SelectItem>
                          </SelectGroup>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>Recommended</SelectLabel>
                            {recommendedModelShortcutOptions.map((option) => (
                              <SelectItem key={option.key} value={option.key}>
                                {getProviderLabel({
                                  providerId: option.providerId,
                                  variant: "full",
                                })}{" "}
                                · {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>All Models</SelectLabel>
                            {additionalModelShortcutOptions.map((option) => (
                              <SelectItem key={option.key} value={option.key}>
                                {getProviderLabel({
                                  providerId: option.providerId,
                                  variant: "full",
                                })}{" "}
                                · {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {selectedShortcutDetails
                          ? `Currently selects ${selectedShortcutDetails.modelLabel} on ${selectedShortcutDetails.providerLabel}.`
                          : "No model assigned. The shortcut stays inactive until you set one."}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsCard>

        <SettingsCard
          title="Command Visibility"
          description="Pin the core actions you use most, or hide the ones you never want in the global palette."
        >
          <div className="space-y-2">
            {commands.map((command) => {
              const isPinned = commandPalettePinnedCommandIds.includes(
                command.id,
              );
              const isHidden = commandPaletteHiddenCommandIds.includes(
                command.id,
              );

              return (
                <div
                  key={command.id}
                  className="rounded-lg border border-border/70 bg-card/60 p-3"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">
                          {command.title}
                        </p>
                        <Badge variant="outline">
                          {COMMAND_PALETTE_GROUP_LABELS[command.group]}
                        </Badge>
                        {command.shortcut ? (
                          <Badge variant="secondary">{command.shortcut}</Badge>
                        ) : null}
                        {isPinned ? <Badge>Pinned</Badge> : null}
                        {isHidden ? (
                          <Badge variant="destructive">Hidden</Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {command.description}
                      </p>
                      <p className="font-mono text-[11px] text-muted-foreground">
                        {command.id}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        variant={isPinned ? "default" : "outline"}
                        size="sm"
                        onClick={() => togglePinnedCommand(command.id)}
                      >
                        {isPinned ? "Unpin" : "Pin"}
                      </Button>
                      <Button
                        variant={isHidden ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleHiddenCommand(command.id)}
                      >
                        {isHidden ? "Show" : "Hide"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsCard>

        <SettingsCard
          title="Programmatic Contributors"
          description="The palette is backed by a registry so internal modules can add commands without coupling to the dialog component."
        >
          <p className="text-sm leading-6 text-muted-foreground">
            Use <code>registerCommandPaletteContributor()</code> to inject
            additional commands. Core Stave commands are customizable here;
            dynamic workspace/task entries and future contributed commands
            inherit the same execution surface automatically.
          </p>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function EditorSection() {
  const [
    editorFontSize,
    editorFontFamily,
    editorWordWrap,
    editorMinimap,
    editorLineNumbers,
    editorTabSize,
    editorLspEnabled,
    editorAiCompletions,
    editorEslintEnabled,
    editorFormatOnSave,
    pythonLspCommand,
    typescriptLspCommand,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.editorFontSize,
          state.settings.editorFontFamily,
          state.settings.editorWordWrap,
          state.settings.editorMinimap,
          state.settings.editorLineNumbers,
          state.settings.editorTabSize,
          state.settings.editorLspEnabled,
          state.settings.editorAiCompletions,
          state.settings.editorEslintEnabled,
          state.settings.editorFormatOnSave,
          state.settings.pythonLspCommand,
          state.settings.typescriptLspCommand,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading
        title="Editor"
        description="Configure code editor defaults used by tabs and previews."
      />
      <SectionStack>
        <SettingsCard
          title="Typography"
          description="Base editor type and spacing defaults."
        >
          <LabeledField title="Font Size">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              type="number"
              min={10}
              max={32}
              value={String(editorFontSize)}
              onCommit={(nextValue) =>
                updateSettings({
                  patch: { editorFontSize: readInt(nextValue, editorFontSize) },
                })
              }
            />
          </LabeledField>
          <LabeledField title="Font Family">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background font-mono"
              value={editorFontFamily}
              onCommit={(nextValue) =>
                updateSettings({ patch: { editorFontFamily: nextValue } })
              }
            />
          </LabeledField>
          <LabeledField title="Tab Size">
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background"
              type="number"
              min={1}
              max={8}
              value={String(editorTabSize)}
              onCommit={(nextValue) =>
                updateSettings({
                  patch: { editorTabSize: readInt(nextValue, editorTabSize) },
                })
              }
            />
          </LabeledField>
        </SettingsCard>

        <SettingsCard
          title="Display"
          description="Toggle editor line wrapping and chrome."
        >
          <SwitchField
            title="Word Wrap"
            checked={editorWordWrap}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { editorWordWrap: checked } })
            }
          />
          <LabeledField title="Line Numbers">
            <ChoiceButtons
              value={editorLineNumbers}
              columns={3}
              onChange={(value) =>
                updateSettings({ patch: { editorLineNumbers: value } })
              }
              options={[
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
                { value: "relative", label: "Relative" },
              ]}
            />
          </LabeledField>
          <SwitchField
            title="Minimap"
            checked={editorMinimap}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { editorMinimap: checked } })
            }
          />
        </SettingsCard>

        <SettingsCard
          title="AI Inline Completions"
          description="Ghost-text code suggestions powered by Claude. Uses the Claude SDK with your local Claude auth when available, or falls back to the Anthropic API (requires ANTHROPIC_API_KEY)."
        >
          <SwitchField
            title="Enable AI Completions"
            description="Shows AI-generated inline suggestions as you type. Press Tab to accept. Uses Claude Haiku for fast, low-cost completions."
            checked={editorAiCompletions}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { editorAiCompletions: checked } })
            }
          />
        </SettingsCard>

        <SettingsCard
          title="Project Language Servers"
          description="LSP-backed intelligence for TypeScript/JavaScript and Python. Uses Electron-managed stdio language-server sessions per active workspace."
        >
          <SwitchField
            title="Enable LSP Runtime"
            description="Uses Electron-managed stdio language-server sessions per active workspace. Keep this off if you only want Monaco's built-in syntax support."
            checked={editorLspEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { editorLspEnabled: checked } })
            }
          />
          <LabeledField
            title="TypeScript LSP Command"
            description="Leave empty to auto-discover `typescript-language-server` from PATH. Install via `npm i -g typescript-language-server typescript`. Handles .ts, .tsx, .js, and .jsx files."
          >
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background font-mono text-sm"
              placeholder="typescript-language-server"
              value={typescriptLspCommand}
              onCommit={(nextValue) =>
                updateSettings({ patch: { typescriptLspCommand: nextValue } })
              }
            />
          </LabeledField>
          <LabeledField
            title="Python LSP Command"
            description="Leave empty to auto-discover `pyright-langserver` or `basedpyright-langserver` from PATH. You can also point this at an absolute executable path."
          >
            <DraftInput
              className="h-10 rounded-md border-border/80 bg-background font-mono text-sm"
              placeholder="pyright-langserver"
              value={pythonLspCommand}
              onCommit={(nextValue) =>
                updateSettings({ patch: { pythonLspCommand: nextValue } })
              }
            />
          </LabeledField>
        </SettingsCard>
        <SettingsCard title="ESLint">
          <SwitchField
            title="Enable ESLint"
            description="Reads ESLint config from the opened project and shows diagnostics in the editor. Requires ESLint installed in the project's node_modules."
            checked={editorEslintEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { editorEslintEnabled: checked } })
            }
          />
          <SwitchField
            title="Format on Save"
            description="Automatically apply ESLint auto-fix when saving a file."
            checked={editorFormatOnSave}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { editorFormatOnSave: checked } })
            }
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}

export function SettingsDialogSectionContent(args: {
  sectionId: SectionId;
  currentProjectPath?: string | null;
  projects: RecentProjectState[];
  selectedProjectPath?: string | null;
}) {
  switch (args.sectionId) {
    case "general":
      return <GeneralSection />;
    case "projects":
      return (
        <ProjectsSection
          currentProjectPath={args.currentProjectPath}
          projects={args.projects}
          selectedProjectPath={args.selectedProjectPath}
        />
      );
    case "presets":
      return <PresetsSection />;
    case "theme":
      return <ThemeSection />;
    case "terminal":
      return <TerminalSection />;
    case "chat":
      return <ChatSection />;
    case "muse":
      return <MuseSection />;
    case "tooling":
      return <ToolingSection />;
    case "skills":
      return <SkillsSection />;
    case "subagents":
      return <SubagentsSection />;
    case "commandPalette":
      return <CommandPaletteSection />;
    case "editor":
      return <EditorSection />;
    case "providers":
      return <ProvidersSection />;
    case "codex":
      return <CodexSection />;
    case "mcp":
      return <McpSection />;
    case "prompts":
      return <PromptsSection />;
    case "developer":
      return <DeveloperSection />;
    case "lens":
      return <LensSection />;
    case "changelog":
      return <ChangelogSection />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Prompts section – customisable AI prompt templates
// ---------------------------------------------------------------------------

interface PromptFieldProps {
  title: string;
  description: string;
  value: string;
  defaultValue: string;
  onCommit: (value: string) => void;
}

function PromptField({
  title,
  description,
  value,
  defaultValue,
  onCommit,
}: PromptFieldProps) {
  const [draft, setDraft] = useState(value);
  const isDefault = draft === defaultValue;

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function handleBlur() {
    if (draft !== value) {
      onCommit(draft);
    }
  }

  function handleReset() {
    setDraft(defaultValue);
    onCommit(defaultValue);
  }

  return (
    <LabeledField title={title} description={description}>
      <Textarea
        className="min-h-[120px] resize-y font-mono text-xs leading-relaxed"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={handleBlur}
        placeholder="(empty = disabled)"
      />
      <div className="flex items-center justify-between">
        <p
          className={cn(
            "text-xs",
            isDefault ? "text-muted-foreground" : "text-primary",
          )}
        >
          {isDefault ? "Using default" : "Customised"}
        </p>
        {!isDefault && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleReset}
          >
            <RefreshCcw className="size-3" />
            Reset to default
          </Button>
        )}
      </div>
    </LabeledField>
  );
}

function PromptModelField(args: {
  title: string;
  description: string;
  value: string;
  onSelect: (model: string) => void;
}) {
  const {
    options: promptModelOptions,
    recommendedOptions: promptRecommendedModelOptions,
  } = useSettingsModelSelectorOptions({
    providerIds: PROMPT_MODEL_PROVIDER_IDS,
  });

  return (
    <LabeledField title={args.title} description={args.description}>
      <ModelSelector
        value={buildModelSelectorValue({ model: args.value })}
        options={promptModelOptions}
        recommendedOptions={promptRecommendedModelOptions}
        className="w-full"
        triggerClassName="h-10 w-full max-w-none rounded-md border border-border/80 bg-background px-3 hover:bg-muted/40"
        menuClassName="sm:max-w-lg"
        onSelect={({ selection }) => args.onSelect(selection.model)}
      />
    </LabeledField>
  );
}

function useSettingsModelSelectorOptions(args: {
  providerIds: readonly (typeof MODEL_SHORTCUT_PROVIDER_IDS)[number][];
}) {
  const codexBinaryPath = useAppStore(
    (state) => state.settings.codexBinaryPath,
  );
  const codexModelCatalog = useCodexModelCatalog({
    enabled: true,
    codexBinaryPath,
  });
  const codexModelEnrichmentForPrompt = useMemo(() => {
    if (codexModelCatalog.entries.length === 0) {
      return undefined;
    }
    const map = new Map<
      string,
      { description?: string; isDefault?: boolean }
    >();
    for (const entry of codexModelCatalog.entries) {
      const id = entry.model.trim();
      if (id) {
        map.set(id, {
          description: entry.description || undefined,
          isDefault: entry.isDefault || undefined,
        });
      }
    }
    return map.size > 0 ? map : undefined;
  }, [codexModelCatalog.entries]);
  const promptModelOptions = useMemo(
    () =>
      buildModelSelectorOptions({
        providerIds: args.providerIds,
        modelsByProvider: {
          codex: codexModelCatalog.models,
        },
        enrichmentByModel: codexModelEnrichmentForPrompt,
      }),
    [args.providerIds, codexModelCatalog.models, codexModelEnrichmentForPrompt],
  );
  const promptRecommendedModelOptions = useMemo(
    () => buildRecommendedModelSelectorOptions({ options: promptModelOptions }),
    [promptModelOptions],
  );

  return {
    options: promptModelOptions,
    recommendedOptions: promptRecommendedModelOptions,
  };
}

function PromptsSection() {
  const [
    promptResponseStyle,
    promptPrDescription,
    promptSupervisorBreakdown,
    promptSupervisorSynthesis,
    promptPreprocessorClassifier,
    promptInlineCompletion,
    workspaceTurnSummaryPrimaryModel,
    workspaceTurnSummaryFallbackModel,
    workspaceTurnSummaryPrompt,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.promptResponseStyle,
          state.settings.promptPrDescription,
          state.settings.promptSupervisorBreakdown,
          state.settings.promptSupervisorSynthesis,
          state.settings.promptPreprocessorClassifier,
          state.settings.promptInlineCompletion,
          state.settings.workspaceTurnSummaryPrimaryModel,
          state.settings.workspaceTurnSummaryFallbackModel,
          state.settings.workspaceTurnSummaryPrompt,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading
        title="Prompts"
        description="Customise the AI prompts used by Stave for automated features. Each field has a sensible default; leave empty to disable."
      />

      <SectionStack>
        <SettingsCard
          title="Response Style"
          description="Formatting guidance injected into every Claude and Codex turn. Controls how the model structures its answers — headings, bullet lists, conciseness, etc."
        >
          <PromptField
            title="Response Formatting Rules"
            description="Appended to the system prompt (Claude) or injected as hidden developer instructions (Codex). Empty disables the injection."
            value={promptResponseStyle}
            defaultValue={DEFAULT_PROMPT_RESPONSE_STYLE}
            onCommit={(v) =>
              updateSettings({ patch: { promptResponseStyle: v } })
            }
          />
        </SettingsCard>

        <SettingsCard
          title="Pull Request Description"
          description="Template used when Stave auto-generates a PR title and body from the branch diff."
        >
          <PromptField
            title="PR Description Prompt"
            description="The instruction part of the prompt. Branch context (diff, commit log, file list) is appended automatically."
            value={promptPrDescription}
            defaultValue={DEFAULT_PROMPT_PR_DESCRIPTION}
            onCommit={(v) =>
              updateSettings({ patch: { promptPrDescription: v } })
            }
          />
        </SettingsCard>

        <SettingsCard
          title="Stave Auto — Orchestration"
          description="Prompts used by the Stave meta-provider for task breakdown and result synthesis."
        >
          <PromptField
            title="Supervisor Breakdown"
            description="Instructs the supervisor how to decompose a request into subtasks. Use {maxSubtasks} and {providerNote} placeholders for dynamic values."
            value={promptSupervisorBreakdown}
            defaultValue={DEFAULT_PROMPT_SUPERVISOR_BREAKDOWN}
            onCommit={(v) =>
              updateSettings({ patch: { promptSupervisorBreakdown: v } })
            }
          />
          <PromptField
            title="Supervisor Synthesis"
            description="Instructs the supervisor how to merge subtask results into a final response."
            value={promptSupervisorSynthesis}
            defaultValue={DEFAULT_PROMPT_SUPERVISOR_SYNTHESIS}
            onCommit={(v) =>
              updateSettings({ patch: { promptSupervisorSynthesis: v } })
            }
          />
          <PromptField
            title="Preprocessor Classifier"
            description="Classifies user intent for direct routing vs orchestration. Use {orchestrationGuidance} for mode-aware phrasing."
            value={promptPreprocessorClassifier}
            defaultValue={DEFAULT_PROMPT_PREPROCESSOR_CLASSIFIER}
            onCommit={(v) =>
              updateSettings({ patch: { promptPreprocessorClassifier: v } })
            }
          />
        </SettingsCard>

        <SettingsCard
          title="Inline Code Completion"
          description="System prompt for the FIM (fill-in-the-middle) code completion engine in the editor."
        >
          <PromptField
            title="Completion System Prompt"
            description="Controls how the model generates code completions. Must instruct the model to output raw code only."
            value={promptInlineCompletion}
            defaultValue={DEFAULT_PROMPT_INLINE_COMPLETION}
            onCommit={(v) =>
              updateSettings({ patch: { promptInlineCompletion: v } })
            }
          />
        </SettingsCard>

        <SettingsCard
          title="Workspace Latest Turn Summary"
          description="Automatically writes a short 'what the user asked / what the AI did' summary to the top of the Information panel after each completed turn."
        >
          <PromptModelField
            title="Primary Model"
            description="Preferred model for generating the latest-turn workspace summary."
            value={workspaceTurnSummaryPrimaryModel}
            onSelect={(model) =>
              updateSettings({
                patch: { workspaceTurnSummaryPrimaryModel: model },
              })
            }
          />
          <PromptModelField
            title="Fallback Model"
            description="Used when the primary model is unavailable or the summary request fails."
            value={workspaceTurnSummaryFallbackModel}
            onSelect={(model) =>
              updateSettings({
                patch: { workspaceTurnSummaryFallbackModel: model },
              })
            }
          />
          <PromptField
            title="Summary Prompt"
            description="Instruction template for the Information panel's automatic latest-turn summary. Task title, latest user request, and latest assistant response are appended automatically. Empty disables automatic summaries."
            value={workspaceTurnSummaryPrompt}
            defaultValue={DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY}
            onCommit={(v) =>
              updateSettings({
                patch: { workspaceTurnSummaryPrompt: v },
              })
            }
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}

// ---------------------------------------------------------------------------
// Lens section – built-in browser source mapping configuration
// ---------------------------------------------------------------------------

function LensSection() {
  const [heuristic, reactDebugSource] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.lensSourceMappingHeuristic,
          state.settings.lensSourceMappingReactDebugSource,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionHeading
        title="Lens"
        description="Configure the built-in browser for inspecting your running application."
      />
      <SectionStack>
        <SettingsCard
          title="Source Code Mapping"
          description="Choose which strategies the element picker uses to help AI locate source files."
        >
          <SwitchField
            title="Heuristic Search"
            description="AI uses class names, text content, and IDs to search for source files via grep. Recommended for most projects."
            checked={heuristic}
            onCheckedChange={(checked) =>
              updateSettings({
                patch: { lensSourceMappingHeuristic: checked },
              })
            }
          />
          <SwitchField
            title="React _debugSource"
            description="Extract exact file and line number from React fiber internals. Only works with dev builds that include @babel/plugin-transform-react-jsx-source (enabled by default in Vite React plugin, CRA, and Next.js dev)."
            checked={reactDebugSource}
            onCheckedChange={(checked) =>
              updateSettings({
                patch: { lensSourceMappingReactDebugSource: checked },
              })
            }
          />
        </SettingsCard>
      </SectionStack>
    </>
  );
}
