/**
 * Application settings contract and defaults.
 *
 * Extracted from `@/store/app.store` to keep the store file within the
 * max-lines ratchet. `app.store` re-exports the public names.
 */
import type { BorderBeamColorVariant, BorderBeamSize } from "border-beam";
import type {
  LensAgentPresentationMode,
  LensSessionScope,
} from "@/lib/lens/lens.types";
import { normalizeLensHostList } from "@/lib/lens/lens-security";
import type {
  AdvisorTarget,
  AdvisorTargetByProvider,
  ClaudePluginMode,
  ClaudeSettingSource,
  ProviderId,
} from "@/lib/providers/provider.types";
import { DEFAULT_ADVISOR_CONSULT_LIMIT } from "@/lib/providers/advisor";
import {
  DEFAULT_AUXILIARY_INFERENCE_POLICY,
  type AuxiliaryInferencePolicy,
} from "@/lib/providers/auxiliary-inference-policy";
import type { WorkerProviderConfig } from "@/lib/providers/worker-mode";
import type { PrMergeMethod } from "@/lib/pr-status";
import type { ComposerControlPlacements } from "@/lib/composer-controls";
import type { ModelRuntimePreferences } from "@/lib/providers/model-runtime-preferences";
import type { ModelVisibility } from "@/lib/providers/model-visibility";
import type { AppShortcutKeys } from "@/lib/app-shortcuts";
import { DEFAULT_APP_SHORTCUT_KEYS } from "@/lib/app-shortcuts";
import {
  normalizeModelShortcutEfforts,
  normalizeModelShortcutKeys,
  type ModelShortcutEffort,
} from "@/lib/providers/model-shortcuts";
import { SETTINGS_MODEL_MIGRATION_VERSION } from "@/lib/providers/settings-model-migration";
import {
  DEFAULT_PROMPT_COMMENT_SHORTCUT,
  type PromptCommentShortcut,
} from "@/lib/prompt-comment-shortcuts";
import {
  DEFAULT_VISUAL_COMMENT_SHORTCUT,
  type VisualCommentShortcut,
} from "@/lib/visual-comment-shortcuts";
import {
  DEFAULT_STEER_QUEUE_ENTER_ACTION,
  type SteerQueueEnterAction,
} from "@/lib/steer-queue-shortcuts";
import {
  DEFAULT_PROMPT_RESPONSE_STYLE,
  DEFAULT_PROMPT_PR_DESCRIPTION,
  DEFAULT_PROMPT_INLINE_COMPLETION,
  DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY,
} from "@/lib/providers/prompt-defaults";
import {
  DEFAULT_PRE_PR_REVIEW_PROVIDER,
  type PrePrReviewProviderId,
} from "@/lib/source-control-review";
import type { Macro } from "@/lib/macros/types";
import type { PromptEnhancementExemplar } from "@/lib/providers/prompt-enhancement-context";
import { cloneDefaultTaskPresets, type TaskPreset } from "@/lib/task-presets";
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  DEFAULT_TERMINAL_FONT_SIZE,
} from "@/lib/terminal/defaults";
import {
  DEFAULT_ATTENTION_NOTIFICATION_SOUND_PRESET,
  DEFAULT_NOTIFICATION_SOUND_PRESET,
  DEFAULT_NOTIFICATION_SOUND_MODE,
  DEFAULT_NOTIFICATION_SOUND_VOLUME,
  type NotificationSoundMode,
  type NotificationSoundPreset,
} from "@/lib/notifications/notification-sound";
import {
  getDefaultModelForProvider,
  listProviderIds,
} from "@/lib/providers/model-catalog";
import { DEFAULT_PROVIDER_TIMEOUT_MS } from "@/lib/providers/runtime-option-contract";
import type { UtilityInferenceProvider } from "@/lib/providers/utility-inference";
import type { WorkspaceInformationSectionVisibility } from "@/lib/workspace-information-sections";
import type {
  CustomThemeDefinition,
  ThemeModeName,
  ThemeOverrideValues,
} from "@/lib/themes";
import {
  DEFAULT_CRANE_CONNECTOR_SETTINGS,
  type CraneConnectorSettings,
} from "@/lib/crane-connector/types";
import {
  DEFAULT_MARTIN_SYNC_SETTINGS,
  type MartinSyncSettings,
} from "@/lib/martin-sync/types";
import {
  DEFAULT_JIRA_CONNECTOR_SETTINGS,
  type JiraConnectorSettings,
} from "@/lib/jira-connector/types";
import {
  DEFAULT_TRACKER_TASKS_SETTINGS,
  type TrackerTasksSettings,
} from "@/lib/tracker-tasks/settings";
import {
  DEFAULT_WORKSPACE_KICKOFF_SETTINGS,
  type WorkspaceKickoffSettings,
} from "@/store/workspace-kickoff-actions";
import type {
  ClaudePermissionMode,
  ClaudePermissionModeBeforePlan,
  ClaudePlanModeApprovalScope,
} from "@/types/chat";
import { DEFAULT_CLAUDE_PLAN_MODE_APPROVAL_SCOPE } from "@/types/chat";

export interface AppSettings extends WorkspaceKickoffSettings {
  showPresetBar: boolean;
  themeMode: "light" | "dark" | "system";
  /** ID of the active custom theme preset, or `null` for the default. */
  customThemeId: string | null;
  /** Show the Fleet View shortcut in the left workspace sidebar. */
  sidebarShowFleetView: boolean;
  /**
   * Which of the two sidebar views is showing. The header toggle writes this
   * same key, so "the view you mostly use" and "the view you are in" are one
   * value — the sidebar reopens in whatever you last switched to.
   */
  sidebarNavView: SidebarNavView;
  /**
   * When `true`, an animated "border beam" highlight travels around the
   * prompt input and active-workspace rows while a task is streaming. Purely
   * decorative — honors `prefers-reduced-motion`.
   */
  borderBeamEnabled: boolean;
  /**
   * Size preset passed to the `border-beam` library.
   */
  borderBeamSize: BorderBeamSize;
  /**
   * Color palette preset passed to the `border-beam` library. These are the
   * library's own presets — do not remap onto our theme tokens.
   */
  borderBeamVariant: BorderBeamColorVariant;
  /**
   * Overall beam opacity/intensity. Passed through to the library's
   * `strength` prop as a 0-1 value.
   */
  borderBeamStrength: number;
  /** User-installed custom theme definitions (persisted in localStorage). */
  userCustomThemes: CustomThemeDefinition[];
  themeOverrides: Record<ThemeModeName, ThemeOverrideValues>;
  chatStreamingEnabled: boolean;
  messageFontSize: number;
  messageCodeFontSize: number;
  messageFontFamily: string;
  messageMonoFontFamily: string;
  messageKoreanFontFamily: string;
  /** Zoom scale for the workspace information panel (0.8 – 1.3, default 1). */
  infoPanelScale: number;
  /** Per-section visibility overrides for the workspace information panel. */
  infoPanelSectionVisibility: WorkspaceInformationSectionVisibility;
  reasoningExpansionMode: "auto" | "manual";
  showInterimMessages: boolean;
  /** Show the conversation turn rail beside eligible task histories. */
  showConversationTurnRail: boolean;
  /**
   * Open the turn activity shelf (above the prompt input) expanded by default
   * so every tracked activity is visible without a click. Users can still
   * collapse it manually for the current turn; the next turn re-applies this
   * default.
   */
  turnActivityExpandedByDefault: boolean;
  /**
   * Where the turn activity surface renders: docked above the prompt input
   * (default), floating as a draggable card over the message pane, or inside
   * the right rail's Activity panel for a full-height view.
   */
  turnActivityPlacement: TurnActivityPlacement;
  /**
   * Composer chrome preference. `framed` is the shipped default; `classic`
   * restores the pre-frame stack for users who want it back.
   */
  composerLayout: ComposerLayoutMode;
  /**
   * Where each prompt-input control renders: the toolbar, the `⋯` tray, or
   * nowhere. Sparse — an absent entry means "toolbar", so controls added later
   * are visible by default without a migration.
   */
  composerControlPlacements: ComposerControlPlacements;
  modelClaude: string;
  modelCodex: string;
  modelCursor: string;
  modelKiro: string;
  modelRuntimePreferences: ModelRuntimePreferences;
  /**
   * Which catalog models the model selector offers before the user expands the
   * list. Sparse — an absent entry follows the "current models only" baseline,
   * so a provider shipping a new model needs no migration here.
   */
  modelVisibility: ModelVisibility;
  /** Provider preference for isolated task-name, routing, and commit utilities. */
  utilityInferenceProvider: UtilityInferenceProvider;
  /**
   * The user's own description of how they want prompts written (tone,
   * language, what to always include). Sent with every Enhance request when
   * non-empty.
   */
  promptEnhancementStyleProfile: string;
  /** Whether kept and undone rewrites are remembered as future examples. */
  promptEnhancementLearnFromEdits: boolean;
  /** Bounded memory of past rewrites and what the user did with them. */
  promptEnhancementExemplars: PromptEnhancementExemplar[];
  autoRoutingEnabled: boolean;
  autoRoutingUseClassifier: boolean;
  autoRoutingObjective: number;
  autoRoutingSafetyEscalation: boolean;
  autoRoutingAllowProviderSwitch: boolean;
  autoRoutingEligibleClaudeModels: string[];
  autoRoutingEligibleCodexModels: string[];
  /**
   * User-configurable presets rendered in the preset bar between the task
   * tab strip and the chat panel. Each preset either seeds a new task with a
   * fixed provider + model, or launches a native CLI session.
   */
  taskPresets: TaskPreset[];
  /**
   * Saved composer snippets. Selecting one expands its body into the current
   * draft and may pin a per-turn model + effort override.
   */
  macros: Macro[];
  permissionMode: "require-approval" | "auto-safe";
  trustedTools: string[];
  skillsEnabled: boolean;
  skillsAutoSuggest: boolean;
  sharedSkillsHome: string;
  commandPaletteShowRecent: boolean;
  commandPalettePinnedCommandIds: string[];
  commandPaletteHiddenCommandIds: string[];
  commandPaletteRecentCommandIds: string[];
  /** Cmd/Ctrl+K shell chord bindings for navigation and panel actions. */
  appShortcutKeys: AppShortcutKeys;
  /**
   * Highest one-time settings migration applied to this snapshot. Absent on
   * snapshots written before the marker existed, which is exactly how
   * `migrateSettingsModelDefaults` recognizes a pre-migration user.
   */
  settingsModelMigrationVersion: number;
  /** Alt+1..0 prompt-model bindings, stored as `provider:model` keys. */
  modelShortcutKeys: string[];
  /** Optional per-slot effort overrides for the Alt+1..0 prompt-model bindings. */
  modelShortcutEfforts: ModelShortcutEffort[];
  /** Composer shortcut that stages the current prompt text as a comment. */
  promptCommentShortcut: PromptCommentShortcut;
  /**
   * Which key (Enter or Tab) steers vs queues during an active turn's
   * steer-or-queue composer mode. The other key always does the opposite —
   * neither is a fallback for the other.
   */
  steerQueueEnterAction: SteerQueueEnterAction;
  /**
   * Whether mid-turn steering is offered to the user at all. Previously this
   * was solely gated by the `STAVE_ENABLE_MID_TURN_STEERING` env var on the
   * main process; that env var still works as a fallback (e.g. for ops/dev
   * use) but this setting is the primary, user-facing on/off switch.
   */
  midTurnSteeringEnabled: boolean;
  /** Lens shortcut that toggles visual comment mode. */
  visualCommentShortcut: VisualCommentShortcut;
  /** When enabled, visual comment screenshots are included as provider image context. */
  lensVisualCommentScreenshotsAsImageContext: boolean;
  prePrReviewEnabled: boolean;
  prePrReviewProvider: PrePrReviewProviderId;
  /** Queue the created ready PR for automatic merging. */
  createPrAutoMergeEnabled: boolean;
  /** Merge strategy used when automatic merging is queued. */
  createPrMergeMethod: PrMergeMethod;
  terminalFontSize: number;
  terminalFontFamily: string;
  terminalCursorStyle: "block" | "bar" | "underline";
  terminalLineHeight: number;
  editorFontSize: number;
  editorFontFamily: string;
  editorWordWrap: boolean;
  editorMinimap: boolean;
  editorLineNumbers: "on" | "off" | "relative";
  editorTabSize: number;
  editorLspEnabled: boolean;
  editorAiCompletions: boolean;
  editorEslintEnabled: boolean;
  editorFormatOnSave: boolean;
  pythonLspCommand: string;
  typescriptLspCommand: string;
  diffViewMode: "unified" | "split";
  /** Auto-refresh interval (seconds) for the Source Control panel. 0 = disabled. */
  scmAutoRefreshSeconds: number;
  confirmBeforeClose: boolean;
  nativeNotificationsEnabled: boolean;
  notificationSoundEnabled: boolean;
  notificationSoundVolume: number;
  notificationSoundPreset: NotificationSoundPreset;
  notificationSoundMode: NotificationSoundMode;
  /** Base64 data URL of the user-uploaded custom audio file. */
  notificationSoundCustomAudioData: string | null;
  /** Original file name of the uploaded custom audio, for display purposes. */
  notificationSoundCustomAudioName: string | null;
  /**
   * Whether a sound plays when a task needs the user's attention — i.e. the AI
   * asks a question / requests input (`task.user_input_requested`) or requests a
   * tool permission/approval (`task.approval_requested`). Independent from the
   * completion sound so the two can be distinguished by ear.
   */
  attentionNotificationSoundEnabled: boolean;
  attentionNotificationSoundVolume: number;
  attentionNotificationSoundPreset: NotificationSoundPreset;
  attentionNotificationSoundMode: NotificationSoundMode;
  /** Base64 data URL of the user-uploaded custom attention audio file. */
  attentionNotificationSoundCustomAudioData: string | null;
  /** Original file name of the uploaded custom attention audio, for display. */
  attentionNotificationSoundCustomAudioName: string | null;
  providerDebugStream: boolean;
  providerTimeoutMs: number;
  claudeBinaryPath: string;
  /** Absolute folder the Standalone CLI overlay runs claude and codex in. */
  standaloneCliFolderPath: string;
  claudePermissionMode: ClaudePermissionMode;
  /** Stores the permission mode that was active before entering plan mode, so it can be restored when plan mode is exited. */
  claudePermissionModeBeforePlan: ClaudePermissionModeBeforePlan;
  /** How much plan mode auto-approves non-mutating tool calls (Bash/Task/MCP). */
  claudePlanModeApprovalScope: ClaudePlanModeApprovalScope;
  claudeAllowDangerouslySkipPermissions: boolean;
  claudeSandboxEnabled: boolean;
  claudeAllowUnsandboxedCommands: boolean;
  /** Comma/newline-delimited credential file paths denied by Claude sandbox. */
  claudeSandboxCredentialFiles: string;
  /** Comma/newline-delimited credential env names denied by Claude sandbox. */
  claudeSandboxCredentialEnvVars: string;
  claudeTaskBudgetTokens: number;
  /**
   * Whether new tasks arm the isolated read-only Advisor the primary consults
   * on demand. Split from the target so turning the default off keeps the
   * configured pick instead of erasing it.
   */
  advisorEnabled: boolean;
  /**
   * The Advisor pick new tasks inherit, remembered while `advisorEnabled` is
   * false. `null` means nothing has been configured yet.
   */
  advisorTarget: AdvisorTarget | null;
  /**
   * Default Advisor model and effort per provider, so both providers can be
   * set up before either is armed and switching between them is not a
   * destructive edit. Mirrors the per-task memory of the same name.
   */
  advisorTargetByProvider: AdvisorTargetByProvider;
  /** Per-turn on-demand Advisor consult budget (1–20). */
  advisorConsultLimit: number;
  /**
   * Whether new tasks arm Worker mode by default. Tasks may override in either
   * direction from the composer.
   */
  workerEnabled: boolean;
  /**
   * Default worker configuration per provider: preset, model, effort, and any
   * user-edited description/instructions/tools. Keyed by provider because the
   * providers have different worker catalogs, effort scales, and adapters.
   */
  workerConfigByProvider: Partial<Record<ProviderId, WorkerProviderConfig>>;
  /** Optional outbound-only Crane dispatch connector. Secrets stay in Electron main. */
  craneConnector: CraneConnectorSettings;
  /** Martin workspace sync toggles. Secrets stay in Electron main. */
  martinSync: MartinSyncSettings;
  /**
   * Jira Cloud tracker connector. Site, JQL, and project mappings live here;
   * the email and API token never leave the Electron main vault.
   */
  jiraConnector: JiraConnectorSettings;
  /** Tasks surface defaults: view, refresh cadence, and kickoff start mode. */
  trackerTasks: TrackerTasksSettings;
  claudeSettingSources: ClaudeSettingSource[];
  claudeEffort: "low" | "medium" | "high" | "xhigh" | "max";
  claudeThinkingMode: "adaptive" | "enabled" | "disabled";
  claudeAgentProgressSummaries: boolean;
  claudePromptSuggestions: boolean;
  claudeForwardSubagentText: boolean;
  claudeEnableFileCheckpointing: boolean;
  claudeForkSession: boolean;
  claudeStrictMcpConfig: boolean;
  claudeFastMode: boolean;
  /**
   * Opt-in: let Stave arm the provider-native browser without an explicit
   * `@web`, both up front for hosts that are unreadable without a signed-in
   * session and as a one-shot retry after a plain fetch hits an auth wall.
   * Off by default because it widens `@web` from a per-prompt opt-in.
   */
  providerBrowserAutoFallback: boolean;
  /**
   * Extra hosts, beyond Stave's built-in list, that arm the provider browser up
   * front when `providerBrowserAutoFallback` is on. Whitespace- or
   * comma-separated; subdomains of each entry match.
   */
  providerBrowserAutoFallbackDomains: string;
  claudeSkills: string;
  claudePluginPaths: string;
  /**
   * How plugins installed through the Claude CLI (`claude plugin install`) are
   * treated. Stave narrows Claude's `settingSources`, so it re-states the
   * enable decision itself instead of relying on the user settings layer.
   */
  claudePluginMode: ClaudePluginMode;
  /** Per-plugin overrides keyed by `<name>@<marketplace>`. */
  claudePluginOverrides: Record<string, boolean>;
  claudeAgentName: string;
  claudeFallbackModel: string;
  claudeResumeSessionAt: string;
  codexFileAccess: "read-only" | "workspace-write" | "danger-full-access";
  codexNetworkAccess: boolean;
  codexApprovalPolicy: "never" | "on-request" | "on-failure" | "untrusted";
  codexBinaryPath: string;
  codexReasoningEffort:
    "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "ultra";
  codexWebSearch: "disabled" | "cached" | "live" | "indexed";
  codexAppToolApprovalMode:
    "inherit" | "auto" | "prompt" | "writes" | "approve";
  codexShowRawReasoning: boolean;
  codexReasoningSummary: "auto" | "concise" | "detailed" | "none";
  codexReasoningSummarySupport: "auto" | "enabled" | "disabled";
  codexFastMode: boolean;
  codexPlanMode: boolean;
  cursorBinaryPath: string;
  cursorMode: "agent" | "plan" | "ask";
  /**
   * Approval autonomy for Cursor turns. Delivered as `agent acp` process flags,
   * so it applies for the whole session rather than per tool call.
   */
  cursorApprovalMode: "manual" | "guided" | "auto";
  kiroBinaryPath: string;
  kiroEffort: "low" | "medium" | "high" | "xhigh" | "max";
  /** Approval autonomy for Kiro turns. `auto` adds `acp --trust-all-tools`. */
  kiroApprovalMode: "manual" | "auto";
  // ---------------------------------------------------------------------------
  // Customisable AI prompt templates (Settings → Prompts)
  // ---------------------------------------------------------------------------
  /** Response formatting guidance injected into both Claude and Codex turns. Empty = disabled. */
  promptResponseStyle: string;
  /** Prompt template for AI-generated PR descriptions. */
  promptPrDescription: string;
  /** System prompt for inline code completion. */
  promptInlineCompletion: string;
  /** Prompt template for the Information panel's automatic latest-turn summary. */
  workspaceTurnSummaryPrompt: string;
  /**
   * Per-lane policy for background ("auxiliary") model calls Stave makes on the
   * user's behalf — intent guard, turn summary, task naming, and so on. Every
   * lane is always present after normalization so store selectors can index it
   * without allocating a fallback object.
   */
  auxiliaryInferencePolicy: AuxiliaryInferencePolicy;

  // -- Lens (built-in browser) --
  /** Heuristic search: AI uses class names, text, ID to grep source files. */
  lensSourceMappingHeuristic: boolean;
  /** React _debugSource: extract file:line from React fiber (dev builds). */
  lensSourceMappingReactDebugSource: boolean;
  /** Browser session storage scope for Lens sign-in cookies and site storage. */
  lensSessionScope: LensSessionScope;
  /** How agent visual activity promotes hidden Lens sessions into the UI. */
  lensAgentPresentationMode: LensAgentPresentationMode;
  /** Hosts always allowed for Lens navigation. Empty = no allowlist restriction. */
  lensAllowedHosts: string[];
  /** Hosts always blocked for Lens navigation (wins over the allowlist). */
  lensBlockedHosts: string[];
  /** Master switch for CDP-backed Lens tools (screenshot/evaluate/click/etc.). */
  lensDeveloperModeCdp: boolean;
  /** Hosts the user has approved for CDP access (per-host opt-in). */
  lensCdpApprovedHosts: string[];
}

/**
 * The two exclusive left-sidebar views.
 *
 * - `projects` — the project → workspace tree: "where do I want to go?"
 * - `work-queue` — every workspace grouped into attention lanes: "what is
 *   waiting on me?"
 *
 * Both list the same workspaces, so either one on its own is a complete way to
 * navigate; they differ only in the axis they sort by.
 */
export type SidebarNavView = "projects" | "work-queue";

export const SIDEBAR_NAV_VIEWS: readonly SidebarNavView[] = [
  "projects",
  "work-queue",
] as const;

/**
 * Where the turn activity surface lives.
 *
 * - `docked` — the shelf above the prompt input (default).
 * - `floating` — a draggable card floating over the message pane.
 * - `panel` — the right rail's Activity panel, full height.
 */
export type TurnActivityPlacement = "docked" | "floating" | "panel";

export const TURN_ACTIVITY_PLACEMENTS: readonly TurnActivityPlacement[] = [
  "docked",
  "floating",
  "panel",
] as const;

export function normalizeTurnActivityPlacement(
  value: unknown,
): TurnActivityPlacement {
  return TURN_ACTIVITY_PLACEMENTS.includes(value as TurnActivityPlacement)
    ? (value as TurnActivityPlacement)
    : "docked";
}

/**
 * Which composer chrome the session view renders.
 *
 * - `framed` — the raised input card with the turn-activity shelf above, the
 *   workspace status bar below, and the two control wings tucked in beside it.
 * - `classic` — the shipped layout: a full-measure turn-activity shelf stacked
 *   on a full-measure input card whose controls all live in the toolbar row.
 *
 * The frame needs room for both wings, so a narrow window renders `classic`
 * regardless of this setting; this is the preference, not the resolved mode.
 */
export type ComposerLayoutMode = "framed" | "classic";

export const COMPOSER_LAYOUT_MODES: readonly ComposerLayoutMode[] = [
  "framed",
  "classic",
] as const;

export function normalizeComposerLayoutMode(
  value: unknown,
): ComposerLayoutMode {
  return value === "classic" ? "classic" : "framed";
}

export function normalizeReasoningExpansionMode(
  value: unknown,
): "auto" | "manual" {
  return value === "auto" ? "auto" : "manual";
}

export function normalizeCursorMode(value: unknown): AppSettings["cursorMode"] {
  return value === "plan" || value === "ask" ? value : "agent";
}

export function normalizeCursorApprovalMode(
  value: unknown,
): AppSettings["cursorApprovalMode"] {
  // Unknown values fall back to the most conservative tier: a corrupt or
  // future-build value must never be read as "approvals off".
  return value === "guided" || value === "auto" ? value : "manual";
}

export function normalizeKiroApprovalMode(
  value: unknown,
): AppSettings["kiroApprovalMode"] {
  return value === "auto" ? "auto" : "manual";
}

export function normalizeKiroEffort(value: unknown): AppSettings["kiroEffort"] {
  return value === "low" ||
    value === "high" ||
    value === "xhigh" ||
    value === "max"
    ? value
    : "medium";
}

export function normalizeBorderBeamSize(
  value: unknown,
): AppSettings["borderBeamSize"] {
  return value === "sm" || value === "md" || value === "line" ? value : "md";
}

export function normalizeBorderBeamVariant(
  value: unknown,
): AppSettings["borderBeamVariant"] {
  return value === "colorful" ||
    value === "mono" ||
    value === "ocean" ||
    value === "sunset"
    ? value
    : "colorful";
}

export function normalizeBorderBeamStrength(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return defaultSettings.borderBeamStrength;
  }
  return Math.min(1, Math.max(0, value));
}

export function normalizeSidebarNavView(value: unknown): SidebarNavView {
  return value === "work-queue" ? "work-queue" : "projects";
}

export const defaultSettings: AppSettings = {
  showPresetBar: true,
  themeMode: "dark",
  customThemeId: null,
  sidebarShowFleetView: true,
  sidebarNavView: "projects",
  borderBeamEnabled: false,
  borderBeamSize: "md",
  borderBeamVariant: "colorful",
  borderBeamStrength: 1,
  userCustomThemes: [],
  themeOverrides: {
    light: {},
    dark: {},
  },
  chatStreamingEnabled: true,
  messageFontSize: 18,
  messageCodeFontSize: 14,
  messageFontFamily: "Geist Variable",
  messageMonoFontFamily: "JetBrains Mono",
  messageKoreanFontFamily: "Pretendard Variable",
  infoPanelScale: 1,
  infoPanelSectionVisibility: {},
  reasoningExpansionMode: "manual",
  showInterimMessages: false,
  showConversationTurnRail: true,
  turnActivityExpandedByDefault: true,
  turnActivityPlacement: "docked",
  composerLayout: "framed",
  composerControlPlacements: {},
  modelClaude: getDefaultModelForProvider({ providerId: "claude-code" }),
  modelCodex: getDefaultModelForProvider({ providerId: "codex" }),
  modelCursor: getDefaultModelForProvider({ providerId: "cursor" }),
  modelKiro: getDefaultModelForProvider({ providerId: "kiro" }),
  modelRuntimePreferences: {},
  modelVisibility: {},
  utilityInferenceProvider: "auto",
  promptEnhancementStyleProfile: "",
  promptEnhancementLearnFromEdits: true,
  promptEnhancementExemplars: [],
  autoRoutingEnabled: false,
  autoRoutingUseClassifier: false,
  autoRoutingObjective: 0.5,
  autoRoutingSafetyEscalation: true,
  autoRoutingAllowProviderSwitch: false,
  autoRoutingEligibleClaudeModels: [],
  autoRoutingEligibleCodexModels: [],
  taskPresets: cloneDefaultTaskPresets(),
  macros: [],
  permissionMode: "auto-safe",
  trustedTools: [],
  skillsEnabled: true,
  skillsAutoSuggest: true,
  sharedSkillsHome: "",
  commandPaletteShowRecent: true,
  commandPalettePinnedCommandIds: [],
  commandPaletteHiddenCommandIds: [],
  commandPaletteRecentCommandIds: [],
  appShortcutKeys: { ...DEFAULT_APP_SHORTCUT_KEYS },
  // A fresh install is already on the current defaults, so it starts fully
  // migrated and no migration rule ever runs against it.
  settingsModelMigrationVersion: SETTINGS_MODEL_MIGRATION_VERSION,
  modelShortcutKeys: normalizeModelShortcutKeys(),
  modelShortcutEfforts: normalizeModelShortcutEfforts(),
  promptCommentShortcut: DEFAULT_PROMPT_COMMENT_SHORTCUT,
  steerQueueEnterAction: DEFAULT_STEER_QUEUE_ENTER_ACTION,
  midTurnSteeringEnabled: false,
  visualCommentShortcut: DEFAULT_VISUAL_COMMENT_SHORTCUT,
  lensVisualCommentScreenshotsAsImageContext: false,
  prePrReviewEnabled: false,
  prePrReviewProvider: DEFAULT_PRE_PR_REVIEW_PROVIDER,
  createPrAutoMergeEnabled: true,
  createPrMergeMethod: "default",
  terminalFontSize: DEFAULT_TERMINAL_FONT_SIZE,
  terminalFontFamily: DEFAULT_TERMINAL_FONT_FAMILY,
  terminalCursorStyle: "block",
  terminalLineHeight: 1,
  editorFontSize: 14,
  editorFontFamily: "JetBrains Mono, monospace",
  editorWordWrap: true,
  editorMinimap: false,
  editorLineNumbers: "on" as const,
  editorTabSize: 2,
  editorLspEnabled: false,
  editorAiCompletions: false,
  editorEslintEnabled: false,
  editorFormatOnSave: false,
  pythonLspCommand: "",
  typescriptLspCommand: "",
  diffViewMode: "unified",
  scmAutoRefreshSeconds: 0,
  confirmBeforeClose: true,
  nativeNotificationsEnabled: true,
  notificationSoundEnabled: true,
  notificationSoundVolume: DEFAULT_NOTIFICATION_SOUND_VOLUME,
  notificationSoundPreset: DEFAULT_NOTIFICATION_SOUND_PRESET,
  notificationSoundMode: DEFAULT_NOTIFICATION_SOUND_MODE,
  notificationSoundCustomAudioData: null,
  notificationSoundCustomAudioName: null,
  attentionNotificationSoundEnabled: true,
  attentionNotificationSoundVolume: DEFAULT_NOTIFICATION_SOUND_VOLUME,
  // Default to a distinct preset from the completion sound (`chime`) so the
  // "AI needs you" cue is audibly different out of the box.
  attentionNotificationSoundPreset: DEFAULT_ATTENTION_NOTIFICATION_SOUND_PRESET,
  attentionNotificationSoundMode: DEFAULT_NOTIFICATION_SOUND_MODE,
  attentionNotificationSoundCustomAudioData: null,
  attentionNotificationSoundCustomAudioName: null,
  providerDebugStream: false,
  providerTimeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS,
  claudeBinaryPath: "",
  standaloneCliFolderPath: "",
  claudePermissionMode: "auto",
  claudePermissionModeBeforePlan: null,
  claudePlanModeApprovalScope: DEFAULT_CLAUDE_PLAN_MODE_APPROVAL_SCOPE,
  claudeAllowDangerouslySkipPermissions: false,
  claudeSandboxEnabled: false,
  claudeAllowUnsandboxedCommands: true,
  claudeSandboxCredentialFiles: "",
  claudeSandboxCredentialEnvVars: "",
  claudeTaskBudgetTokens: 0,
  advisorEnabled: false,
  advisorTarget: null,
  advisorTargetByProvider: {},
  advisorConsultLimit: DEFAULT_ADVISOR_CONSULT_LIMIT,
  // Off by default: Worker mode changes how a turn spends tokens, so it must be
  // an explicit opt-in rather than something a user discovers on their bill.
  workerEnabled: false,
  workerConfigByProvider: {},
  craneConnector: {
    ...DEFAULT_CRANE_CONNECTOR_SETTINGS,
    projectMappings: [],
  },
  martinSync: { ...DEFAULT_MARTIN_SYNC_SETTINGS },
  jiraConnector: {
    ...DEFAULT_JIRA_CONNECTOR_SETTINGS,
    projectMappings: [],
  },
  trackerTasks: { ...DEFAULT_TRACKER_TASKS_SETTINGS },
  claudeSettingSources: ["project"],
  // Matches `resolveDefaultClaudeEffortForModel` for the default model
  // (Opus 5). Keep the two in step when either changes.
  claudeEffort: "high",
  claudeThinkingMode: "adaptive",
  claudeAgentProgressSummaries: false,
  claudePromptSuggestions: true,
  claudeForwardSubagentText: false,
  claudeEnableFileCheckpointing: false,
  claudeForkSession: false,
  claudeStrictMcpConfig: false,
  claudeFastMode: false,
  providerBrowserAutoFallback: false,
  providerBrowserAutoFallbackDomains: "",
  claudeSkills: "",
  claudePluginPaths: "",
  claudePluginMode: "claude-config",
  claudePluginOverrides: {},
  claudeAgentName: "",
  claudeFallbackModel: "",
  claudeResumeSessionAt: "",
  codexFileAccess: "danger-full-access",
  codexNetworkAccess: true,
  codexApprovalPolicy: "never",
  codexBinaryPath: "",
  // Matches `resolveDefaultCodexEffortForModel` for the default model
  // (GPT-5.6 Sol). Keep the two in step when either changes.
  codexReasoningEffort: "high",
  codexWebSearch: "live",
  codexAppToolApprovalMode: "inherit",
  codexShowRawReasoning: false,
  codexReasoningSummary: "auto",
  codexReasoningSummarySupport: "auto",
  codexFastMode: false,
  codexPlanMode: false,
  cursorBinaryPath: "",
  cursorMode: "agent",
  cursorApprovalMode: "auto",
  kiroBinaryPath: "",
  kiroEffort: "medium",
  kiroApprovalMode: "auto",
  promptResponseStyle: DEFAULT_PROMPT_RESPONSE_STYLE,
  promptPrDescription: DEFAULT_PROMPT_PR_DESCRIPTION,
  promptInlineCompletion: DEFAULT_PROMPT_INLINE_COMPLETION,
  workspaceTurnSummaryPrompt: DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY,
  auxiliaryInferencePolicy: DEFAULT_AUXILIARY_INFERENCE_POLICY,
  ...DEFAULT_WORKSPACE_KICKOFF_SETTINGS,

  // Lens
  lensSourceMappingHeuristic: true,
  lensSourceMappingReactDebugSource: false,
  lensSessionScope: "project",
  lensAgentPresentationMode: "split-right",
  lensAllowedHosts: [],
  lensBlockedHosts: [],
  lensDeveloperModeCdp: true,
  lensCdpApprovedHosts: [],
};

export function normalizeLensSessionScope(value: unknown): LensSessionScope {
  return value === "workspace" ? "workspace" : "project";
}

export function normalizeLensAgentPresentationMode(
  value: unknown,
): LensAgentPresentationMode {
  return value === "background-tab" || value === "agent-decides"
    ? value
    : "split-right";
}

export function normalizePersistedLensSettings(
  value: Record<string, unknown>,
): Pick<
  AppSettings,
  | "lensAllowedHosts"
  | "lensBlockedHosts"
  | "lensCdpApprovedHosts"
  | "lensSessionScope"
  | "lensAgentPresentationMode"
  | "lensDeveloperModeCdp"
> {
  return {
    lensAllowedHosts: normalizeLensHostList(
      value.lensAllowedHosts,
      defaultSettings.lensAllowedHosts,
    ),
    lensBlockedHosts: normalizeLensHostList(
      value.lensBlockedHosts,
      defaultSettings.lensBlockedHosts,
    ),
    lensCdpApprovedHosts: normalizeLensHostList(
      value.lensCdpApprovedHosts,
      defaultSettings.lensCdpApprovedHosts,
    ),
    lensSessionScope: normalizeLensSessionScope(value.lensSessionScope),
    lensAgentPresentationMode: normalizeLensAgentPresentationMode(
      value.lensAgentPresentationMode,
    ),
    lensDeveloperModeCdp:
      typeof value.lensDeveloperModeCdp === "boolean"
        ? value.lensDeveloperModeCdp
        : defaultSettings.lensDeveloperModeCdp,
  };
}

export function createDefaultProviderAvailability() {
  return Object.fromEntries(
    listProviderIds().map((providerId) => [providerId, true] as const),
  ) as Record<ProviderId, boolean>;
}
