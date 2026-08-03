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
  Loader2,
  Monitor,
  Moon,
  Plus,
  RefreshCcw,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ModelIcon } from "@/components/ai-elements/model-icon";
import { ComposerControlPlacementList } from "@/components/ai-elements/prompt-input-control-menu";
import {
  buildModelSelectorOptions,
  buildModelSelectorValue,
  buildRecommendedModelSelectorOptions,
  ModelSelector,
  type ModelSelectorOption,
} from "@/components/ai-elements/model-selector";
import { ConfirmDialog } from "@/components/layout/ConfirmDialog";
import { CraneConnectorSettingsSection } from "@/components/layout/settings-dialog-crane-connector";
import {
  COMMAND_PALETTE_GROUP_LABELS,
  getCommandPaletteCoreCommands,
} from "@/components/layout/command-palette-registry";
import { type SectionId } from "@/components/layout/settings-dialog.schema";
import { formatTaskUpdatedAt } from "@/lib/tasks";
import { useShallow } from "zustand/react/shallow";
import { Badge, Button, Input, Slider, Textarea, toast } from "@/components/ui";
import type {
  LensAgentPresentationMode,
  LensSessionScope,
} from "@/lib/lens/lens.types";
import { normalizeLensHostEntry } from "@/lib/lens/lens-security";
import {
  CUSTOM_AUDIO_ACCEPTED_TYPES,
  CUSTOM_AUDIO_MAX_SIZE_BYTES,
  NOTIFICATION_SOUND_PRESETS,
  playCustomAttentionNotificationSound,
  playCustomNotificationSound,
  playAttentionNotificationSound,
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
  getSdkModelOptions,
  normalizeModelSelection,
  resolveClaudeEffortForModelSwitch,
  toHumanModelName,
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
  DEFAULT_MODEL_SHORTCUT_EFFORTS,
  DEFAULT_MODEL_SHORTCUT_KEYS,
  describeModelShortcutKey,
  listModelShortcutEffortOptions,
  MODEL_SHORTCUT_DEFAULT_EFFORT_VALUE,
  MODEL_SHORTCUT_SLOT_LABELS,
  normalizeModelShortcutEfforts,
  normalizeModelShortcutKeys,
  resolveModelShortcutEffort,
  type ModelShortcutEffort,
} from "@/lib/providers/model-shortcuts";
import {
  formatPromptCommentShortcutLabel,
  normalizePromptCommentShortcut,
  PROMPT_COMMENT_SHORTCUT_OPTIONS,
} from "@/lib/prompt-comment-shortcuts";
import {
  formatSteerQueueEnterActionLabel,
  normalizeSteerQueueEnterAction,
  STEER_QUEUE_ENTER_ACTION_OPTIONS,
} from "@/lib/steer-queue-shortcuts";
import {
  formatVisualCommentShortcutLabel,
  normalizeVisualCommentShortcut,
  VISUAL_COMMENT_SHORTCUT_OPTIONS,
} from "@/lib/visual-comment-shortcuts";
import { useCodexModelCatalog } from "@/lib/providers/use-codex-model-catalog";
import {
  BOOLEAN_TOGGLE_OPTIONS,
  CLAUDE_EFFORT_OPTIONS,
  listCodexEffortOptionsForModel,
} from "@/lib/providers/runtime-option-contract";
import { cn } from "@/lib/utils";
import {
  BUILTIN_CUSTOM_THEMES,
  MAX_USER_THEMES,
  PRESET_THEME_TOKENS,
  SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MAX,
  SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MIN,
  THEME_TOKEN_NAMES,
  exportCustomThemeJson,
  listAllCustomThemes,
  parseCustomThemeFile,
  type CustomThemeDefinition,
  type ThemeModeName,
  type ThemeTokenName,
  useAppStore,
} from "@/store/app.store";
import {
  normalizeProjectAppearanceColor,
  normalizeProjectAppearanceIcon,
  normalizeProjectBasePrompt,
  normalizeProjectKickoffBranchNamingRule,
  normalizeProjectWorkspaceInitCommand,
  normalizeProjectWorkspaceRootNodeModulesSymlinkPreference,
  type RecentProjectState,
} from "@/store/project.utils";
import {
  PROJECT_COLOR_OPTIONS,
  PROJECT_ICON_OPTIONS,
  ProjectColorSwatch,
  ProjectIdentityMark,
} from "@/components/layout/project-appearance";
import {
  DEFAULT_PROMPT_RESPONSE_STYLE,
  DEFAULT_PROMPT_PR_DESCRIPTION,
  DEFAULT_PROMPT_INLINE_COMPLETION,
  DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY,
} from "@/lib/providers/prompt-defaults";
import type { PrePrReviewProviderId } from "@/lib/source-control-review";
import type { PrMergeMethod } from "@/lib/pr-status";
import type { ResolvedWorkspaceScriptsConfig } from "@/lib/workspace-scripts/types";
import { WORKSPACE_TOOLS_LABEL } from "@/lib/workspace-scripts/constants";
import { ChangelogSection } from "./settings-dialog-changelog-section";
import { DeveloperSection } from "./settings-dialog-developer-section";
import { PresetsSection } from "./settings-dialog-presets-section";
import { CodexSection } from "./settings-dialog-codex-section";
import { McpSection } from "./settings-dialog-mcp-section";
import { KickoffSection } from "./settings-dialog-kickoff-section";
import { ProvidersSection } from "./settings-dialog-providers-section";
import { LensCredentialsSettingsCard } from "./settings-dialog-lens-credentials";
import { SecretsSettingsCard } from "./settings-dialog-secrets";
import { ToolingSection } from "./settings-dialog-tooling-section";
import { ScriptsSection } from "./settings-dialog-scripts-section";
import { WorkspaceShortcutChip } from "./WorkspaceShortcutChip";
import {
  ChoiceButtons,
  DraftInput,
  LabeledField,
  readFloat,
  readInt,
  SectionStack,
  SelectField,
  SettingsCard,
  SwitchField,
  ToggleChipGroup,
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

interface NotificationSoundControlsValue {
  enabled: boolean;
  mode: "preset" | "custom";
  preset: NotificationSoundPreset;
  volume: number;
  customAudioData: string | null;
  customAudioName: string | null;
}

interface NotificationSoundControlsCopy {
  /** Label for the on/off toggle. */
  enableTitle: string;
  enableDescription: string;
  presetDescription: string;
  volumeDescription: string;
  /** aria-label for the volume slider — must be unique per card. */
  volumeAriaLabel: string;
}

/**
 * Shared editor for a single notification-sound configuration (enable / source
 * / preset / custom upload / volume / preview). Rendered once for the task
 * completion sound and once for the attention (question / approval) sound so
 * both behave identically. Stateless w.r.t. persistence — the parent supplies
 * the current values via `value`, applies changes via `onPatch`, and provides a
 * `previewPlayers` pair so each card previews through its own player instance.
 */
function NotificationSoundControls({
  value,
  copy,
  onPatch,
  previewPlayers,
}: {
  value: NotificationSoundControlsValue;
  copy: NotificationSoundControlsCopy;
  onPatch: (patch: Partial<NotificationSoundControlsValue>) => void;
  previewPlayers: {
    playPreset: (options: {
      preset: NotificationSoundPreset;
      volume: number;
    }) => void;
    playCustom: (options: { dataUrl: string; volume: number }) => void;
  };
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const volumePercent = Math.round(value.volume * 100);

  const handleCustomAudioUpload = async (file: File) => {
    setUploadError(null);
    const error = validateCustomAudioFile(file);
    if (error) {
      setUploadError(error);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      onPatch({
        mode: "custom",
        customAudioData: dataUrl,
        customAudioName: file.name,
      });
    } catch {
      setUploadError("Failed to read the audio file.");
    }
  };

  const handleRemoveCustomAudio = () => {
    setUploadError(null);
    onPatch({
      mode: "preset",
      customAudioData: null,
      customAudioName: null,
    });
  };

  const handleTestSound = () => {
    if (value.mode === "custom" && value.customAudioData) {
      previewPlayers.playCustom({
        dataUrl: value.customAudioData,
        volume: value.volume,
      });
    } else {
      previewPlayers.playPreset({
        preset: value.preset,
        volume: value.volume,
      });
    }
  };

  return (
    <>
      <SwitchField
        title={copy.enableTitle}
        description={copy.enableDescription}
        checked={value.enabled}
        onCheckedChange={(checked) => onPatch({ enabled: checked })}
      />
      {value.enabled ? (
        <>
          <LabeledField
            title="Source"
            description="Use a built-in preset or upload your own audio file."
          >
            <ChoiceButtons
              value={value.mode}
              onChange={(next) =>
                onPatch({ mode: next as "preset" | "custom" })
              }
              options={[
                { value: "preset", label: "Preset" },
                { value: "custom", label: "Custom" },
              ]}
            />
          </LabeledField>
          {value.mode === "preset" ? (
            <LabeledField title="Preset" description={copy.presetDescription}>
              <ChoiceButtons
                value={value.preset}
                onChange={(next) =>
                  onPatch({ preset: next as NotificationSoundPreset })
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
                {value.customAudioName ? (
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 rounded-md border border-border/80 bg-muted/50 px-3 py-2 text-sm flex-1 min-w-0">
                      <FileAudio className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{value.customAudioName}</span>
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
          <LabeledField title="Volume" description={copy.volumeDescription}>
            <div className="flex items-center gap-3">
              <Slider
                aria-label={copy.volumeAriaLabel}
                className="flex-1"
                value={volumePercent}
                min={0}
                max={100}
                step={1}
                onValueChange={(nextValue) => {
                  onPatch({ volume: nextValue / 100 });
                }}
              />
              <Badge variant="outline" className="min-w-14 justify-center">
                {volumePercent}%
              </Badge>
            </div>
          </LabeledField>
          <LabeledField
            title="Preview"
            description={
              value.mode === "custom"
                ? "Play the uploaded audio once with the current volume."
                : "Play the current preset once with the current volume."
            }
          >
            <Button
              size="sm"
              variant="outline"
              onClick={handleTestSound}
              disabled={value.mode === "custom" && !value.customAudioData}
            >
              Test Sound
            </Button>
          </LabeledField>
        </>
      ) : null}
    </>
  );
}

const PROMPT_MODEL_PROVIDER_IDS = ["claude-code", "codex"] as const;
const MODEL_SHORTCUT_PROVIDER_IDS = PROMPT_MODEL_PROVIDER_IDS;
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
  onNavigateSection?: (id: SectionId) => void;
}) {
  const setProjectBasePrompt = useAppStore(
    (state) => state.setProjectBasePrompt,
  );
  const setProjectKickoffBranchNamingRule = useAppStore(
    (state) => state.setProjectKickoffBranchNamingRule,
  );
  const setProjectWorkspaceInitCommand = useAppStore(
    (state) => state.setProjectWorkspaceInitCommand,
  );
  const setProjectWorkspaceUseRootNodeModulesSymlink = useAppStore(
    (state) => state.setProjectWorkspaceUseRootNodeModulesSymlink,
  );
  const setProjectAppearance = useAppStore(
    (state) => state.setProjectAppearance,
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
  const kickoffBranchNamingRule = normalizeProjectKickoffBranchNamingRule({
    value: args.project.kickoffBranchNamingRule,
  });
  const projectUseRootNodeModulesSymlink =
    normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
      value: args.project.newWorkspaceUseRootNodeModulesSymlink,
    });
  const projectAppearanceIcon = normalizeProjectAppearanceIcon(
    args.project.appearanceIcon,
  );
  const projectAppearanceColor = normalizeProjectAppearanceColor(
    args.project.appearanceColor,
  );
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
        title="Project Appearance"
        description="Give each project a stable visual identity across the sidebar and project switcher."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <LabeledField
            title="Icon"
            description="Choose a shape that makes this repository recognizable at a glance."
          >
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">Project icon</legend>
              {PROJECT_ICON_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  title={option.label}
                  className="cursor-pointer rounded-lg"
                >
                  <input
                    type="radio"
                    name={`project-icon-${args.project.projectPath}`}
                    value={option.id}
                    checked={projectAppearanceIcon === option.id}
                    aria-label={option.label}
                    className="peer sr-only"
                    onChange={() =>
                      setProjectAppearance({
                        projectPath: args.project.projectPath,
                        icon: option.id,
                        color: projectAppearanceColor,
                      })
                    }
                  />
                  <span
                    className={cn(
                      "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border/60 text-muted-foreground transition-[background-color,border-color,color] hover:bg-muted/60 hover:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                      projectAppearanceIcon === option.id &&
                        "border-primary/50 bg-primary/8 text-primary",
                    )}
                  >
                    <option.icon className="size-4" />
                  </span>
                </label>
              ))}
            </fieldset>
          </LabeledField>

          <LabeledField
            title="Color"
            description="Color applies to the project icon while the surrounding surface follows the active theme."
          >
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">Project color</legend>
              {PROJECT_COLOR_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  title={option.label}
                  className="cursor-pointer rounded-full"
                >
                  <input
                    type="radio"
                    name={`project-color-${args.project.projectPath}`}
                    value={option.id}
                    checked={projectAppearanceColor === option.id}
                    aria-label={option.label}
                    className="peer sr-only"
                    onChange={() =>
                      setProjectAppearance({
                        projectPath: args.project.projectPath,
                        icon: projectAppearanceIcon,
                        color: option.id,
                      })
                    }
                  />
                  <span
                    className={cn(
                      "inline-flex h-10 w-10 items-center justify-center rounded-full border border-transparent transition-[background-color,border-color] peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background",
                      projectAppearanceColor === option.id &&
                        "border-foreground/30 bg-muted/70",
                    )}
                  >
                    <ProjectColorSwatch color={option.id} className="size-5" />
                  </span>
                </label>
              ))}
            </fieldset>
          </LabeledField>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-muted/45 px-3 py-2.5">
          <ProjectIdentityMark
            icon={projectAppearanceIcon}
            color={projectAppearanceColor}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {args.project.projectName}
            </p>
            <p className="text-xs text-muted-foreground">Sidebar preview</p>
          </div>
        </div>
      </SettingsCard>

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
          title="Kickoff Branch Naming Rule"
          description="Included in workspace kickoff resolution for this project. Use it to encode repository-specific prefixes, ticket conventions, or casing rules."
        >
          <DraftTextarea
            className="min-h-[110px] rounded-md border-border/80 bg-background text-sm"
            value={kickoffBranchNamingRule}
            onCommit={(nextValue) =>
              setProjectKickoffBranchNamingRule({
                projectPath: args.project.projectPath,
                rule: nextValue,
              })
            }
            placeholder="Use feat/<jira-key>-<short-description> for feature work and fix/<jira-key>-<short-description> for bugs."
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

      <SettingsCard
        title={WORKSPACE_TOOLS_LABEL}
        description="One-shot commands, long-running processes, lifecycle triggers, and execution environments for this project."
        titleAccessory={
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => args.onNavigateSection?.("scripts")}
          >
            <Sparkles className="size-3.5" />
            Manage workspace tools
            <ChevronRight className="size-3.5" />
          </Button>
        }
      >
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["Commands", resolvedScriptsConfig?.actions.length ?? 0],
              ["Processes", resolvedScriptsConfig?.services.length ?? 0],
              [
                "Triggers",
                Object.keys(resolvedScriptsConfig?.hooks ?? {}).length,
              ],
              [
                "Environments",
                Object.keys(resolvedScriptsConfig?.targets ?? {}).length,
              ],
            ] as const
          ).map(([label, count]) => (
            <Badge
              key={label}
              variant="secondary"
              className="rounded-md px-2 py-0.5 text-xs font-normal"
            >
              {count} {label}
            </Badge>
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Configure and run them from the dedicated {WORKSPACE_TOOLS_LABEL}{" "}
          section.
        </p>
      </SettingsCard>
    </div>
  );
}

function ProjectsSection(args: {
  currentProjectPath?: string | null;
  projects: RecentProjectState[];
  selectedProjectPath?: string | null;
  onNavigateSection?: (id: SectionId) => void;
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
              onNavigateSection={args.onNavigateSection}
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
    confirmBeforeClose,
    nativeNotificationsEnabled,
    notificationSoundEnabled,
    notificationSoundPreset,
    notificationSoundVolume,
    notificationSoundMode,
    notificationSoundCustomAudioData,
    notificationSoundCustomAudioName,
    attentionNotificationSoundEnabled,
    attentionNotificationSoundPreset,
    attentionNotificationSoundVolume,
    attentionNotificationSoundMode,
    attentionNotificationSoundCustomAudioData,
    attentionNotificationSoundCustomAudioName,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.confirmBeforeClose,
          state.settings.nativeNotificationsEnabled,
          state.settings.notificationSoundEnabled,
          state.settings.notificationSoundPreset,
          state.settings.notificationSoundVolume,
          state.settings.notificationSoundMode,
          state.settings.notificationSoundCustomAudioData,
          state.settings.notificationSoundCustomAudioName,
          state.settings.attentionNotificationSoundEnabled,
          state.settings.attentionNotificationSoundPreset,
          state.settings.attentionNotificationSoundVolume,
          state.settings.attentionNotificationSoundMode,
          state.settings.attentionNotificationSoundCustomAudioData,
          state.settings.attentionNotificationSoundCustomAudioName,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);

  return (
    <>
      <SectionStack>
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
          <NotificationSoundControls
            value={{
              enabled: notificationSoundEnabled,
              mode: notificationSoundMode,
              preset: notificationSoundPreset,
              volume: notificationSoundVolume,
              customAudioData: notificationSoundCustomAudioData,
              customAudioName: notificationSoundCustomAudioName,
            }}
            copy={{
              enableTitle: "Sound",
              enableDescription: "Enable or mute the task completion sound.",
              presetDescription:
                "Choose the synthesized tone used for task completion.",
              volumeDescription:
                "Adjust playback level for the task completion sound.",
              volumeAriaLabel: "Notification sound volume",
            }}
            previewPlayers={{
              playPreset: playNotificationSound,
              playCustom: playCustomNotificationSound,
            }}
            onPatch={(patch) =>
              updateSettings({
                patch: {
                  ...(patch.enabled === undefined
                    ? {}
                    : { notificationSoundEnabled: patch.enabled }),
                  ...(patch.mode === undefined
                    ? {}
                    : { notificationSoundMode: patch.mode }),
                  ...(patch.preset === undefined
                    ? {}
                    : { notificationSoundPreset: patch.preset }),
                  ...(patch.volume === undefined
                    ? {}
                    : { notificationSoundVolume: patch.volume }),
                  ...(patch.customAudioData === undefined
                    ? {}
                    : {
                        notificationSoundCustomAudioData: patch.customAudioData,
                      }),
                  ...(patch.customAudioName === undefined
                    ? {}
                    : {
                        notificationSoundCustomAudioName: patch.customAudioName,
                      }),
                },
              })
            }
          />
        </SettingsCard>
        <SettingsCard
          title="Attention Sound"
          description="Customize the sound played when the AI asks you a question or requests permission and is waiting on you."
        >
          <NotificationSoundControls
            value={{
              enabled: attentionNotificationSoundEnabled,
              mode: attentionNotificationSoundMode,
              preset: attentionNotificationSoundPreset,
              volume: attentionNotificationSoundVolume,
              customAudioData: attentionNotificationSoundCustomAudioData,
              customAudioName: attentionNotificationSoundCustomAudioName,
            }}
            copy={{
              enableTitle: "Sound",
              enableDescription:
                "Play a sound when the AI needs your input or approval.",
              presetDescription:
                "Choose the synthesized tone used when the AI needs you.",
              volumeDescription:
                "Adjust playback level for the attention sound.",
              volumeAriaLabel: "Attention sound volume",
            }}
            previewPlayers={{
              playPreset: playAttentionNotificationSound,
              playCustom: playCustomAttentionNotificationSound,
            }}
            onPatch={(patch) =>
              updateSettings({
                patch: {
                  ...(patch.enabled === undefined
                    ? {}
                    : { attentionNotificationSoundEnabled: patch.enabled }),
                  ...(patch.mode === undefined
                    ? {}
                    : { attentionNotificationSoundMode: patch.mode }),
                  ...(patch.preset === undefined
                    ? {}
                    : { attentionNotificationSoundPreset: patch.preset }),
                  ...(patch.volume === undefined
                    ? {}
                    : { attentionNotificationSoundVolume: patch.volume }),
                  ...(patch.customAudioData === undefined
                    ? {}
                    : {
                        attentionNotificationSoundCustomAudioData:
                          patch.customAudioData,
                      }),
                  ...(patch.customAudioName === undefined
                    ? {}
                    : {
                        attentionNotificationSoundCustomAudioName:
                          patch.customAudioName,
                      }),
                },
              })
            }
          />
        </SettingsCard>
        <SettingsCard
          title="Desktop Notifications"
          description="Show task completion, approval, and input requests through the operating system."
        >
          <SwitchField
            title="Native Notifications"
            description="Notify you when a task needs attention outside the active workspace."
            checked={nativeNotificationsEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { nativeNotificationsEnabled: checked } })
            }
          />
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
  const sidebarShowFleetView = useAppStore(
    (state) => state.settings.sidebarShowFleetView,
  );
  const sidebarShowActiveWorkspaces = useAppStore(
    (state) => state.settings.sidebarShowActiveWorkspaces,
  );
  const sidebarActiveWorkspaceLimit = useAppStore(
    (state) => state.settings.sidebarActiveWorkspaceLimit,
  );
  const borderBeamEnabled = useAppStore(
    (state) => state.settings.borderBeamEnabled,
  );
  const borderBeamSize = useAppStore((state) => state.settings.borderBeamSize);
  const borderBeamVariant = useAppStore(
    (state) => state.settings.borderBeamVariant,
  );
  const borderBeamStrength = useAppStore(
    (state) => state.settings.borderBeamStrength,
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
  const borderBeamStrengthPercent = Math.round(borderBeamStrength * 100);

  return (
    <>
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
          title="Sidebar"
          description="Choose which workspace navigation surfaces appear in the left sidebar."
        >
          <SwitchField
            title="Fleet View Shortcut"
            description="Show the Fleet View entry in the sidebar header area."
            checked={sidebarShowFleetView}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { sidebarShowFleetView: checked } })
            }
          />
          <SwitchField
            title="Active Workspaces"
            description="Show a ranked list of active, attention, and recently used workspaces."
            checked={sidebarShowActiveWorkspaces}
            onCheckedChange={(checked) =>
              updateSettings({
                patch: { sidebarShowActiveWorkspaces: checked },
              })
            }
          />
          {sidebarShowActiveWorkspaces ? (
            <LabeledField
              title="Active Workspace Rows"
              description="Maximum number of rows shown before the project list."
            >
              <div className="flex items-center gap-3">
                <Slider
                  aria-label="Active workspace rows"
                  className="flex-1"
                  value={sidebarActiveWorkspaceLimit}
                  min={SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MIN}
                  max={SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MAX}
                  step={1}
                  onValueChange={(nextValue) => {
                    updateSettings({
                      patch: { sidebarActiveWorkspaceLimit: nextValue },
                    });
                  }}
                />
                <Badge variant="outline" className="min-w-12 justify-center">
                  {sidebarActiveWorkspaceLimit}
                </Badge>
              </div>
            </LabeledField>
          ) : null}
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
                description="Library size preset. Choose between a full border glow, compact controls, or a bottom sweep."
              >
                <ChoiceButtons
                  value={borderBeamSize}
                  columns={2}
                  onChange={(value) =>
                    updateSettings({ patch: { borderBeamSize: value } })
                  }
                  options={[
                    {
                      value: "md",
                      label: "Rotate",
                      description: "Full border glow",
                    },
                    {
                      value: "sm",
                      label: "Compact",
                      description: "Small controls",
                    },
                    {
                      value: "line",
                      label: "Line",
                      description: "Bottom sweep",
                    },
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
              <LabeledField
                title="Beam Strength"
                description="Controls the library `strength` prop without changing the wrapped content."
              >
                <div className="flex items-center gap-3">
                  <Slider
                    aria-label="Border Beam strength"
                    className="flex-1"
                    value={borderBeamStrengthPercent}
                    min={0}
                    max={100}
                    step={1}
                    onValueChange={(nextValue) => {
                      updateSettings({
                        patch: { borderBeamStrength: nextValue / 100 },
                      });
                    }}
                  />
                  <Badge variant="outline" className="min-w-14 justify-center">
                    {borderBeamStrengthPercent}%
                  </Badge>
                </div>
              </LabeledField>
            </div>
          ) : null}
        </SettingsCard>

        <SettingsCard
          title="Theme Presets"
          description="Choose a Stave original or a curated palette inspired by popular editor themes. Presets override the base light / dark tokens; manual token tweaks below still take priority."
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
  const [
    modelClaude,
    modelCodex,
    claudeEffort,
    codexReasoningEffort,
    codexBinaryPath,
    utilityInferenceProvider,
    autoRoutingEnabled,
    autoRoutingUseClassifier,
    autoRoutingObjective,
    autoRoutingSafetyEscalation,
    autoRoutingAllowProviderSwitch,
    autoRoutingEligibleClaudeModels,
    autoRoutingEligibleCodexModels,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.modelClaude,
          state.settings.modelCodex,
          state.settings.claudeEffort,
          state.settings.codexReasoningEffort,
          state.settings.codexBinaryPath,
          state.settings.utilityInferenceProvider,
          state.settings.autoRoutingEnabled,
          state.settings.autoRoutingUseClassifier,
          state.settings.autoRoutingObjective,
          state.settings.autoRoutingSafetyEscalation,
          state.settings.autoRoutingAllowProviderSwitch,
          state.settings.autoRoutingEligibleClaudeModels,
          state.settings.autoRoutingEligibleCodexModels,
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
  const claudeRoutingOptions = useMemo(
    () => modelOptions.filter((option) => option.providerId === "claude-code"),
    [modelOptions],
  );
  const codexRoutingOptions = useMemo(
    () => modelOptions.filter((option) => option.providerId === "codex"),
    [modelOptions],
  );
  // Scoped to the default Codex model so, e.g., GPT-5.6 Luna never offers
  // "Ultra" here — a value only Sol/Terra accept.
  const codexEffortOptions = useMemo(
    () => listCodexEffortOptionsForModel({ model: modelCodex }),
    [modelCodex],
  );
  const updateEligibleModels = useCallback(
    (args: { providerId: "claude-code" | "codex"; models: string[] }) => {
      updateSettings({
        patch:
          args.providerId === "claude-code"
            ? { autoRoutingEligibleClaudeModels: args.models }
            : { autoRoutingEligibleCodexModels: args.models },
      });
    },
    [updateSettings],
  );
  const renderEligibleModelButtons = (
    providerId: "claude-code" | "codex",
    options: typeof modelOptions,
    selectedModels: readonly string[],
  ) => (
    <ToggleChipGroup
      allLabel="All"
      onSelectAll={() => updateEligibleModels({ providerId, models: [] })}
      selected={selectedModels}
      onToggle={(model) =>
        updateEligibleModels({
          providerId,
          models: selectedModels.includes(model)
            ? selectedModels.filter((selectedModel) => selectedModel !== model)
            : [...selectedModels, model],
        })
      }
      options={options.map((option) => ({
        value: option.model,
        label: option.label,
      }))}
    />
  );

  return (
    <>
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
              triggerAriaLabel={`Claude model: ${toHumanModelName({
                model: modelClaude,
              })}`}
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
            title="Claude Effort"
            description="Default reasoning effort applied to new Claude turns."
          >
            <Select
              value={claudeEffort}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    claudeEffort: value as typeof claudeEffort,
                  },
                })
              }
            >
              <SelectTrigger className="h-10 w-full max-w-none rounded-md border border-border/80 bg-background px-3 hover:bg-muted/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLAUDE_EFFORT_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              triggerAriaLabel={`Codex model: ${toHumanModelName({
                model: modelCodex,
              })}`}
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
          <LabeledField
            title="Codex Effort"
            description="Default reasoning effort applied to new Codex turns."
          >
            <Select
              value={codexReasoningEffort}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    codexReasoningEffort: value as typeof codexReasoningEffort,
                  },
                })
              }
            >
              <SelectTrigger className="h-10 w-full max-w-none rounded-md border border-border/80 bg-background px-3 hover:bg-muted/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {codexEffortOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </LabeledField>
          <LabeledField
            title="Utility AI"
            description="Provider used for task names, low-confidence route classification, and commit messages. Auto prefers the active task provider and falls back safely."
          >
            <Select
              value={utilityInferenceProvider}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    utilityInferenceProvider: value as
                      | "auto"
                      | "claude-code"
                      | "codex",
                  },
                })
              }
            >
              <SelectTrigger
                className="h-10 w-full max-w-none rounded-md border border-border/80 bg-background px-3 hover:bg-muted/40"
                aria-label="Utility AI provider"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                <SelectItem value="claude-code">Claude</SelectItem>
                <SelectItem value="codex">Codex</SelectItem>
              </SelectContent>
            </Select>
          </LabeledField>
          <div className="space-y-3 border-t border-border/70 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="size-4 text-primary" />
                  <p className="text-sm font-medium">Auto</p>
                  <Badge variant="secondary">v1</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  Route Auto-selected drafts through deterministic heuristics,
                  optional classification, and provider stickiness.
                </p>
              </div>
            </div>
            <SwitchField
              title="Enable Auto Routing"
              description="Global kill switch. Off keeps the existing provider and model path."
              checked={autoRoutingEnabled}
              onCheckedChange={(checked) =>
                updateSettings({ patch: { autoRoutingEnabled: checked } })
              }
            />
            <LabeledField
              title="Objective"
              description="Bias routing toward lower cost or higher quality."
            >
              <div className="flex items-center gap-3">
                <span className="w-12 text-xs text-muted-foreground">Cost</span>
                <Slider
                  aria-label="Auto routing objective"
                  min={0}
                  max={1}
                  step={0.05}
                  value={autoRoutingObjective}
                  onValueChange={(value) =>
                    updateSettings({
                      patch: { autoRoutingObjective: value },
                    })
                  }
                />
                <span className="w-14 text-right text-xs text-muted-foreground">
                  Quality
                </span>
              </div>
            </LabeledField>
            <div className="grid gap-3 md:grid-cols-3">
              <SwitchField
                title="Classifier"
                description="Use the selected Utility AI for low-confidence prompts."
                checked={autoRoutingUseClassifier}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { autoRoutingUseClassifier: checked },
                  })
                }
              />
              <SwitchField
                title="Safety Escalation"
                description="Lift sensitive domains to stronger tiers."
                checked={autoRoutingSafetyEscalation}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { autoRoutingSafetyEscalation: checked },
                  })
                }
              />
              <SwitchField
                title="Provider Switch"
                description="Allow Auto to move between Claude and Codex after a task starts."
                checked={autoRoutingAllowProviderSwitch}
                onCheckedChange={(checked) =>
                  updateSettings({
                    patch: { autoRoutingAllowProviderSwitch: checked },
                  })
                }
              />
            </div>
            <LabeledField
              title="Claude Eligible Models"
              description="Empty selection means every catalog Claude model can be used."
            >
              {renderEligibleModelButtons(
                "claude-code",
                claudeRoutingOptions,
                autoRoutingEligibleClaudeModels,
              )}
            </LabeledField>
            <LabeledField
              title="Codex Eligible Models"
              description="Empty selection means every available Codex model can be used."
            >
              {renderEligibleModelButtons(
                "codex",
                codexRoutingOptions.length > 0
                  ? codexRoutingOptions
                  : getSdkModelOptions({ providerId: "codex" }).map((model) =>
                      buildModelSelectorValue({
                        providerId: "codex",
                        model,
                      }),
                    ),
                autoRoutingEligibleCodexModels,
              )}
            </LabeledField>
          </div>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function ChatSection() {
  const [
    chatStreamingEnabled,
    messageFontSize,
    messageCodeFontSize,
    messageFontFamily,
    messageMonoFontFamily,
    messageKoreanFontFamily,
    infoPanelScale,
    reasoningExpansionMode,
    showInterimMessages,
    turnActivityExpandedByDefault,
    composerControlPlacements,
    steerQueueEnterAction,
    midTurnSteeringEnabled,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.chatStreamingEnabled,
          state.settings.messageFontSize,
          state.settings.messageCodeFontSize,
          state.settings.messageFontFamily,
          state.settings.messageMonoFontFamily,
          state.settings.messageKoreanFontFamily,
          state.settings.infoPanelScale,
          state.settings.reasoningExpansionMode,
          state.settings.showInterimMessages,
          state.settings.turnActivityExpandedByDefault,
          state.settings.composerControlPlacements,
          state.settings.steerQueueEnterAction,
          state.settings.midTurnSteeringEnabled,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const normalizedSteerQueueEnterAction = normalizeSteerQueueEnterAction(
    steerQueueEnterAction,
  );

  return (
    <>
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
                aria-label="Message font size"
                min={12}
                max={24}
                step={1}
                value={messageFontSize}
                onValueChange={(value) =>
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
                aria-label="Code font size"
                min={10}
                max={20}
                step={1}
                value={messageCodeFontSize}
                onValueChange={(value) =>
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
            description="Base sans-serif font for the app UI and chat messages. Pick a preset or type any installed family. Falls back to the Korean font, then sans-serif."
          >
            <div className="space-y-2">
              <ChoiceButtons
                value={messageFontFamily}
                onChange={(value) =>
                  updateSettings({ patch: { messageFontFamily: value } })
                }
                options={[
                  { value: "Geist Variable", label: "Geist" },
                  { value: "Inter Variable", label: "Inter" },
                ]}
              />
              <DraftInput
                value={messageFontFamily}
                className="h-9 font-mono text-sm"
                onCommit={(nextValue) =>
                  updateSettings({ patch: { messageFontFamily: nextValue } })
                }
              />
            </div>
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
                aria-label="Information panel scale"
                min={80}
                max={130}
                step={5}
                value={Math.round(infoPanelScale * 100)}
                onValueChange={(value) =>
                  updateSettings({
                    patch: { infoPanelScale: value / 100 },
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
          <SwitchField
            title="Expand Turn Activity"
            description="Keep the turn activity shelf above the prompt input expanded while a turn runs, so agents, tools, and todos stay visible. Turn this off to show only the headline row."
            checked={turnActivityExpandedByDefault}
            onCheckedChange={(checked) =>
              updateSettings({
                patch: { turnActivityExpandedByDefault: checked },
              })
            }
          />
        </SettingsCard>
        <SettingsCard
          title="Composer Controls"
          description="Choose where each prompt input control lives: pinned to the toolbar, tucked into the ⋯ tray, or off. You can also right-click the toolbar to edit this in place."
        >
          <ComposerControlPlacementList
            placements={composerControlPlacements}
            onChange={(next) =>
              updateSettings({ patch: { composerControlPlacements: next } })
            }
          />
        </SettingsCard>
        <SettingsCard
          title="Active Turn"
          description="Control what happens when you send a follow-up while an assistant turn is still running."
          titleAccessory={
            <Badge variant={midTurnSteeringEnabled ? "secondary" : "outline"}>
              {midTurnSteeringEnabled ? "Enabled" : "Disabled"}
            </Badge>
          }
        >
          <SwitchField
            title="Mid-Turn Steering"
            description="When off, follow-ups are queued until the current turn finishes. When on, supported providers can receive live steering messages."
            checked={midTurnSteeringEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { midTurnSteeringEnabled: checked } })
            }
          />
          <SelectField
            title="Active-Turn Keys"
            description="Choose which Enter action steers into the live turn and which queues for later."
            guide={
              <Badge variant="secondary">
                {formatSteerQueueEnterActionLabel(
                  normalizedSteerQueueEnterAction,
                )}
              </Badge>
            }
            value={normalizedSteerQueueEnterAction}
            disabled={!midTurnSteeringEnabled}
            onChange={(value) =>
              updateSettings({
                patch: {
                  steerQueueEnterAction: normalizeSteerQueueEnterAction(value),
                },
              })
            }
            options={STEER_QUEUE_ENTER_ACTION_OPTIONS.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
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
    const normalizedSharedSkillsHome = sharedSkillsHome.trim() || null;
    const catalogMatchesRequest =
      skillCatalog.workspacePath === workspacePath &&
      skillCatalog.sharedSkillsHome === normalizedSharedSkillsHome;

    if (catalogMatchesRequest) {
      if (
        skillCatalog.status === "loading" ||
        skillCatalog.status === "error"
      ) {
        return;
      }

      if (skillCatalog.status !== "ready") {
        void refreshSkillCatalog({ workspacePath });
        return;
      }

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

/**
 * Row for one `Alt+1..0` slot option.
 *
 * This is the one model list in Settings that is genuinely mixed — a single flat
 * dropdown spanning both providers — so the mark is doing identification work
 * here, not decoration. Base UI's `SelectValue` replays the selected item's
 * children, so the collapsed trigger gets the mark for free.
 */
function ModelShortcutOptionLabel(args: { option: ModelSelectorOption }) {
  const { option } = args;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <ModelIcon
        providerId={option.providerId}
        model={option.model}
        className="size-3.5"
      />
      <span className="truncate">
        {getProviderLabel({ providerId: option.providerId, variant: "full" })} ·{" "}
        {option.label}
      </span>
    </span>
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
    modelShortcutEfforts,
    promptCommentShortcut,
    visualCommentShortcut,
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
          state.settings.modelShortcutEfforts,
          state.settings.promptCommentShortcut,
          state.settings.visualCommentShortcut,
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
  const normalizedModelShortcutEfforts = useMemo(
    () => normalizeModelShortcutEfforts(modelShortcutEfforts),
    [modelShortcutEfforts],
  );
  const normalizedPromptCommentShortcut = normalizePromptCommentShortcut(
    promptCommentShortcut,
  );
  const normalizedVisualCommentShortcut = normalizeVisualCommentShortcut(
    visualCommentShortcut,
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
    const nextEfforts = [...normalizedModelShortcutEfforts];
    nextKeys[slotIndex] = nextShortcutKey;
    nextEfforts[slotIndex] =
      resolveModelShortcutEffort({
        shortcutKey: nextShortcutKey,
        effort: nextEfforts[slotIndex],
      }) ?? "";
    updateSettings({
      patch: {
        modelShortcutKeys: nextKeys,
        modelShortcutEfforts: nextEfforts,
      },
    });
  }

  function updateModelShortcutEffort(
    slotIndex: number,
    nextEffort: ModelShortcutEffort,
  ) {
    const nextEfforts = [...normalizedModelShortcutEfforts];
    nextEfforts[slotIndex] = nextEffort;
    updateSettings({
      patch: {
        modelShortcutEfforts: nextEfforts,
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
          title="Composer Shortcut"
          description="Choose the shortcut that stages the current prompt text as a comment instead of sending it."
          titleAccessory={
            <Badge variant="secondary">
              {formatPromptCommentShortcutLabel(
                normalizedPromptCommentShortcut,
              )}
            </Badge>
          }
        >
          <LabeledField
            title="Stage Comment"
            description="The staged comment appears under the composer and is merged into the next sent prompt."
          >
            <Select
              value={normalizedPromptCommentShortcut}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    promptCommentShortcut:
                      normalizePromptCommentShortcut(value),
                  },
                })
              }
            >
              <SelectTrigger className="h-10 w-full rounded-md border-border/80 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Shortcut</SelectLabel>
                  {PROMPT_COMMENT_SHORTCUT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </LabeledField>
        </SettingsCard>

        <SettingsCard
          title="Lens Shortcut"
          description="Choose the shortcut that toggles Lens visual comment mode."
          titleAccessory={
            <Badge variant="secondary">
              {formatVisualCommentShortcutLabel(
                normalizedVisualCommentShortcut,
              )}
            </Badge>
          }
        >
          <LabeledField
            title="Visual Comment"
            description="The shortcut turns visual comment picking on or off while Lens is available."
          >
            <Select
              value={normalizedVisualCommentShortcut}
              onValueChange={(value) =>
                updateSettings({
                  patch: {
                    visualCommentShortcut:
                      normalizeVisualCommentShortcut(value),
                  },
                })
              }
            >
              <SelectTrigger className="h-10 w-full rounded-md border-border/80 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Shortcut</SelectLabel>
                  {VISUAL_COMMENT_SHORTCUT_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </LabeledField>
        </SettingsCard>

        <SettingsCard
          title="Model Shortcuts"
          description="Map Alt+1..0 to prompt models and optional effort overrides. These shortcuts switch the active task provider and draft model immediately."
          titleAccessory={<Badge variant="secondary">Alt+1..0</Badge>}
        >
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                updateSettings({
                  patch: {
                    modelShortcutKeys: [...DEFAULT_MODEL_SHORTCUT_KEYS],
                    modelShortcutEfforts: [...DEFAULT_MODEL_SHORTCUT_EFFORTS],
                  },
                })
              }
              disabled={
                normalizedModelShortcutKeys.every(
                  (value, index) =>
                    value === (DEFAULT_MODEL_SHORTCUT_KEYS[index] ?? ""),
                ) &&
                normalizedModelShortcutEfforts.every(
                  (value, index) =>
                    value === (DEFAULT_MODEL_SHORTCUT_EFFORTS[index] ?? ""),
                )
              }
            >
              Reset Default Shortcuts
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                updateSettings({
                  patch: {
                    modelShortcutKeys: MODEL_SHORTCUT_SLOT_LABELS.map(() => ""),
                    modelShortcutEfforts: [...DEFAULT_MODEL_SHORTCUT_EFFORTS],
                  },
                })
              }
              disabled={
                normalizedModelShortcutKeys.every(
                  (value) => value.length === 0,
                ) &&
                normalizedModelShortcutEfforts.every(
                  (value) => value.length === 0,
                )
              }
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
              const effortOptions = listModelShortcutEffortOptions({
                shortcutKey: selectedShortcutKey,
              });
              const selectedShortcutEffort =
                normalizedModelShortcutEfforts[slotIndex] ?? "";
              const currentEffortValue = effortOptions.some(
                (option) => option.value === selectedShortcutEffort,
              )
                ? selectedShortcutEffort
                : MODEL_SHORTCUT_DEFAULT_EFFORT_VALUE;
              const selectedEffortLabel = effortOptions.find(
                (option) => option.value === selectedShortcutEffort,
              )?.label;
              const selectedEffortDescription = selectedEffortLabel
                ? `${selectedEffortLabel} effort`
                : "the current effort setting";

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
                                <ModelShortcutOptionLabel option={option} />
                              </SelectItem>
                            ))}
                          </SelectGroup>
                          <SelectSeparator />
                          <SelectGroup>
                            <SelectLabel>All Models</SelectLabel>
                            {additionalModelShortcutOptions.map((option) => (
                              <SelectItem key={option.key} value={option.key}>
                                <ModelShortcutOptionLabel option={option} />
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-xs font-medium text-muted-foreground">
                          Effort
                        </span>
                        <Select
                          value={currentEffortValue}
                          disabled={!selectedShortcutDetails}
                          onValueChange={(value) =>
                            updateModelShortcutEffort(
                              slotIndex,
                              value === MODEL_SHORTCUT_DEFAULT_EFFORT_VALUE
                                ? ""
                                : (value as ModelShortcutEffort),
                            )
                          }
                        >
                          <SelectTrigger
                            className="h-9 min-w-0 flex-1 rounded-md border-border/80 bg-background"
                            aria-label={`Effort for Model Slot ${slotLabel}`}
                          >
                            <SelectValue placeholder="Use current effort" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem
                              value={MODEL_SHORTCUT_DEFAULT_EFFORT_VALUE}
                            >
                              Use current effort
                            </SelectItem>
                            {effortOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {selectedShortcutDetails
                          ? `Currently selects ${selectedShortcutDetails.modelLabel} on ${selectedShortcutDetails.providerLabel} with ${selectedEffortDescription}.`
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
  onNavigateSection?: (id: SectionId) => void;
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
          onNavigateSection={args.onNavigateSection}
        />
      );
    case "scripts":
      return (
        <ScriptsSection
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
    case "tooling":
      return <ToolingSection />;
    case "skills":
      return <SkillsSection />;
    case "commandPalette":
      return <CommandPaletteSection />;
    case "editor":
      return <EditorSection />;
    case "providers":
      return <ProvidersSection />;
    case "models":
      return <ModelsSection />;
    case "codex":
      return <CodexSection />;
    case "mcp":
      return <McpSection />;
    case "integrations":
      return <CraneConnectorSettingsSection />;
    case "kickoff":
      return <KickoffSection />;
    case "prompts":
      return <PromptsSection />;
    case "developer":
      return <DeveloperSection />;
    case "lens":
      return <LensSection />;
    case "secrets":
      return <SecretsSection />;
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
    prePrReviewEnabled,
    prePrReviewProvider,
    promptPrDescription,
    createPrAutoMergeEnabled,
    createPrMergeMethod,
    promptInlineCompletion,
    workspaceTurnSummaryPrimaryModel,
    workspaceTurnSummaryFallbackModel,
    workspaceTurnSummaryPrompt,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.promptResponseStyle,
          state.settings.prePrReviewEnabled,
          state.settings.prePrReviewProvider,
          state.settings.promptPrDescription,
          state.settings.createPrAutoMergeEnabled,
          state.settings.createPrMergeMethod,
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
      <SectionStack>
        <SettingsCard
          title="Pre-PR Review"
          description="Run a best-effort one-shot AI review before Stave pushes a branch and opens a pull request."
        >
          <SwitchField
            title="Review Before Opening PR"
            description="Shows concrete findings in the PR dialog with options to stop and fix or proceed anyway. Model failures never block PR creation."
            checked={prePrReviewEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { prePrReviewEnabled: checked } })
            }
          />
          <LabeledField
            title="Review Provider"
            description="Choose which provider runs the one-shot review. The provider uses its configured default model."
          >
            <ChoiceButtons<PrePrReviewProviderId>
              value={prePrReviewProvider}
              onChange={(providerId) =>
                updateSettings({
                  patch: { prePrReviewProvider: providerId },
                })
              }
              options={[
                {
                  value: "claude-code",
                  label: "Claude",
                  description: "Uses the configured Claude model.",
                  icon: (
                    <ModelIcon providerId="claude-code" className="size-3.5" />
                  ),
                },
                {
                  value: "codex",
                  label: "Codex",
                  description: "Uses the configured Codex model.",
                  icon: <ModelIcon providerId="codex" className="size-3.5" />,
                },
              ]}
            />
          </LabeledField>
        </SettingsCard>

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
          title="PR Completion"
          description="Controls the final steps after Stave creates a ready pull request."
        >
          <SwitchField
            title="Queue Auto-Merge"
            description="After the ready PR is created, queue the selected merge strategy using GitHub's configured checks."
            checked={createPrAutoMergeEnabled}
            onCheckedChange={(checked) =>
              updateSettings({ patch: { createPrAutoMergeEnabled: checked } })
            }
          />
          <LabeledField
            title="Merge Method"
            description="Choose the strategy passed to GitHub when auto-merge is queued."
          >
            <ChoiceButtons<PrMergeMethod>
              value={createPrMergeMethod}
              columns={3}
              onChange={(method) =>
                updateSettings({ patch: { createPrMergeMethod: method } })
              }
              options={[
                {
                  value: "default",
                  label: "Repository default",
                  description:
                    "Let GitHub choose the configured strategy or merge queue.",
                },
                {
                  value: "merge",
                  label: "Merge",
                  description: "Create a merge commit.",
                },
                {
                  value: "squash",
                  label: "Squash",
                  description: "Combine the branch into one commit.",
                },
                {
                  value: "rebase",
                  label: "Rebase",
                  description: "Rebase and merge without a merge commit.",
                },
              ]}
            />
          </LabeledField>
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

function parseLensHostList(value: string): string[] {
  const seen = new Set<string>();
  const hosts: string[] = [];

  for (const line of value.split("\n")) {
    const host = line.trim().toLowerCase();
    if (!host || seen.has(host)) {
      continue;
    }
    seen.add(host);
    hosts.push(host);
  }

  return hosts;
}

function formatLensHostList(hosts: readonly string[]): string {
  return hosts.join("\n");
}

function LensSection() {
  const [
    heuristic,
    reactDebugSource,
    sessionScope,
    agentPresentationMode,
    developerModeCdp,
    visualCommentScreenshotsAsImageContext,
    cdpApprovedHosts,
    allowedHosts,
    blockedHosts,
    activeWorkspaceId,
    projectPath,
  ] = useAppStore(
    useShallow(
      (state) =>
        [
          state.settings.lensSourceMappingHeuristic,
          state.settings.lensSourceMappingReactDebugSource,
          state.settings.lensSessionScope,
          state.settings.lensAgentPresentationMode,
          state.settings.lensDeveloperModeCdp,
          state.settings.lensVisualCommentScreenshotsAsImageContext,
          state.settings.lensCdpApprovedHosts,
          state.settings.lensAllowedHosts,
          state.settings.lensBlockedHosts,
          state.activeWorkspaceId,
          state.projectPath,
        ] as const,
    ),
  );
  const updateSettings = useAppStore((state) => state.updateSettings);
  const [clearingScope, setClearingScope] = useState<LensSessionScope | null>(
    null,
  );
  const [cdpHostDraft, setCdpHostDraft] = useState("");
  const allowedHostsText = useMemo(
    () => formatLensHostList(allowedHosts),
    [allowedHosts],
  );
  const blockedHostsText = useMemo(
    () => formatLensHostList(blockedHosts),
    [blockedHosts],
  );
  const clearLensSessionData = useCallback(
    async (scope: LensSessionScope) => {
      if (!activeWorkspaceId) {
        toast.error("Select a workspace before clearing Lens data.");
        return;
      }

      const clearSessionData = window.api?.lens?.clearSessionData;
      if (!clearSessionData) {
        toast.error("Lens session controls are unavailable.");
        return;
      }

      setClearingScope(scope);
      try {
        const result = await clearSessionData({
          workspaceId: activeWorkspaceId,
          sessionScope: scope,
          projectKey: projectPath,
        });
        if (!result.ok) {
          toast.error("Failed to clear Lens data", {
            description: result.message,
          });
          return;
        }
        toast.success(
          scope === "project"
            ? "Project Lens data cleared"
            : "Workspace Lens data cleared",
        );
      } catch (err) {
        toast.error("Failed to clear Lens data", {
          description: err instanceof Error ? err.message : String(err),
        });
      } finally {
        setClearingScope(null);
      }
    },
    [activeWorkspaceId, projectPath],
  );
  const addCdpApprovedHost = useCallback(() => {
    const host = normalizeLensHostEntry(cdpHostDraft);
    if (!host) {
      toast.error("Enter a valid host or URL.");
      return;
    }

    const alreadyApproved = cdpApprovedHosts.some(
      (entry) => normalizeLensHostEntry(entry) === host,
    );
    if (alreadyApproved) {
      toast.message("Host is already approved", {
        description: host,
      });
      setCdpHostDraft("");
      return;
    }

    updateSettings({
      patch: {
        lensCdpApprovedHosts: [...cdpApprovedHosts, host],
      },
    });
    setCdpHostDraft("");
  }, [cdpApprovedHosts, cdpHostDraft, updateSettings]);

  return (
    <>
      <SectionStack>
        <SettingsCard
          title="Session & Sign-in"
          description="Control where Lens keeps website cookies and local browser storage. Saved account passwords are managed separately below."
        >
          <ChoiceButtons<LensSessionScope>
            value={sessionScope}
            columns={2}
            options={[
              {
                value: "project",
                label: "Project profile",
                description:
                  "Share Lens sign-in across workspaces for this project.",
              },
              {
                value: "workspace",
                label: "Workspace isolated",
                description:
                  "Keep Lens sign-in separate for the active workspace.",
              },
            ]}
            onChange={(value) =>
              updateSettings({ patch: { lensSessionScope: value } })
            }
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={
                !activeWorkspaceId || !projectPath || clearingScope !== null
              }
              onClick={() => {
                void clearLensSessionData("project");
              }}
              className="justify-start gap-2"
            >
              {clearingScope === "project" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              Clear project data
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!activeWorkspaceId || clearingScope !== null}
              onClick={() => {
                void clearLensSessionData("workspace");
              }}
              className="justify-start gap-2"
            >
              {clearingScope === "workspace" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              Clear workspace data
            </Button>
          </div>
        </SettingsCard>
        <SettingsCard
          title="Agent Activity"
          description="Choose how a hidden Lens session appears when an agent starts visual inspection or page interaction. Navigation, DOM reads, and diagnostics alone stay hidden."
        >
          <ChoiceButtons<LensAgentPresentationMode>
            value={agentPresentationMode}
            columns={3}
            options={[
              {
                value: "split-right",
                label: "Show beside task",
                description:
                  "Open Lens in a right split without taking focus from the task.",
              },
              {
                value: "background-tab",
                label: "Background tab",
                description:
                  "Add a Lens tab without changing the visible task surface.",
              },
              {
                value: "agent-decides",
                label: "Agent decides",
                description:
                  "Keep agent sessions hidden until the agent explicitly presents one.",
              },
            ]}
            onChange={(value) =>
              updateSettings({
                patch: { lensAgentPresentationMode: value },
              })
            }
          />
        </SettingsCard>
        <LensCredentialsSettingsCard />
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
        <SettingsCard
          title="Visual Comments"
          description="Control whether visual comment screenshots are used only as local UI context or also sent to the selected AI provider."
        >
          <SwitchField
            title="Send screenshots as AI image context"
            description="Off by default. When enabled, screenshots captured through visual comment are included with the next message so the AI can inspect the selected region."
            checked={visualCommentScreenshotsAsImageContext}
            onCheckedChange={(checked) =>
              updateSettings({
                patch: {
                  lensVisualCommentScreenshotsAsImageContext: checked,
                },
              })
            }
          />
        </SettingsCard>
        <SettingsCard
          title="Developer Mode"
          description="Control CDP-backed Lens actions such as screenshots, JavaScript evaluation, and agent page control. Approval prompts appear app-wide, even when the Lens panel is closed."
        >
          <SwitchField
            title="CDP Tools"
            description="Ask before the first CDP action for each host. Allow once is temporary; always allow saves the hostname below."
            checked={developerModeCdp}
            onCheckedChange={(checked) =>
              updateSettings({
                patch: { lensDeveloperModeCdp: checked },
              })
            }
          />
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              Approved CDP Hosts
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={cdpHostDraft}
                placeholder="localhost or https://example.com"
                aria-label="CDP approved host"
                className="h-8 font-mono text-xs"
                onChange={(event) => setCdpHostDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCdpApprovedHost();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-center gap-1.5 sm:w-auto"
                onClick={addCdpApprovedHost}
              >
                <Plus className="size-3.5" />
                Add host
              </Button>
            </div>
            <p className="text-xs leading-5 text-muted-foreground">
              Enter a hostname or URL. Ports and paths are ignored, so{" "}
              <code>localhost</code> covers <code>localhost:3000</code>,{" "}
              <code>localhost:8899</code>, and other localhost ports.
            </p>
            {cdpApprovedHosts.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {cdpApprovedHosts.map((host) => (
                  <Badge
                    key={host}
                    variant="secondary"
                    className="gap-1 rounded-md pr-1"
                  >
                    <span className="max-w-48 truncate font-mono text-[11px]">
                      {host}
                    </span>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Remove ${host}`}
                      onClick={() =>
                        updateSettings({
                          patch: {
                            lensCdpApprovedHosts: cdpApprovedHosts.filter(
                              (entry) => entry !== host,
                            ),
                          },
                        })
                      }
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No hosts are pre-approved. The first CDP action will show an
                approval dialog.
              </p>
            )}
          </div>
        </SettingsCard>
        <SettingsCard
          title="Site Access"
          description="Restrict Lens navigation by hostname. Blocked hosts win over allowed hosts. Loopback targets are always allowed for navigation, but CDP actions still require approval above."
        >
          <LabeledField
            title="Allowed Hosts"
            description="One host per line. Leave empty to allow any host that is not blocked."
          >
            <DraftTextarea
              value={allowedHostsText}
              placeholder={"example.com\napp.example.com"}
              rows={4}
              onCommit={(value) =>
                updateSettings({
                  patch: { lensAllowedHosts: parseLensHostList(value) },
                })
              }
            />
          </LabeledField>
          <LabeledField
            title="Blocked Hosts"
            description="One host per line. These hosts are blocked even when they also match the allow list."
          >
            <DraftTextarea
              value={blockedHostsText}
              placeholder={"example.org\nstaging.example.com"}
              rows={4}
              onCommit={(value) =>
                updateSettings({
                  patch: { lensBlockedHosts: parseLensHostList(value) },
                })
              }
            />
          </LabeledField>
        </SettingsCard>
      </SectionStack>
    </>
  );
}

function SecretsSection() {
  return (
    <SectionStack>
      <SecretsSettingsCard />
    </SectionStack>
  );
}
