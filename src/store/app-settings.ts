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
  ClaudeSettingSource,
  ProviderId,
} from "@/lib/providers/provider.types";
import type { WorkerProviderConfig } from "@/lib/providers/worker-mode";
import type { PrMergeMethod } from "@/lib/pr-status";
import type { ComposerControlPlacements } from "@/lib/composer-controls";
import type { ModelRuntimePreferences } from "@/lib/providers/model-runtime-preferences";
import type { AppShortcutKeys } from "@/lib/app-shortcuts";
import { DEFAULT_APP_SHORTCUT_KEYS } from "@/lib/app-shortcuts";
import {
  normalizeModelShortcutEfforts,
  normalizeModelShortcutKeys,
  type ModelShortcutEffort,
} from "@/lib/providers/model-shortcuts";
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
  /** Show the ranked Active workspaces section in the left workspace sidebar. */
  sidebarShowActiveWorkspaces: boolean;
  /** Maximum number of rows shown in the Active workspaces section. */
  sidebarActiveWorkspaceLimit: number;
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
   * Where each prompt-input control renders: the toolbar, the `⋯` tray, or
   * nowhere. Sparse — an absent entry means "toolbar", so controls added later
   * are visible by default without a migration.
   */
  composerControlPlacements: ComposerControlPlacements;
  modelClaude: string;
  modelCodex: string;
  modelRuntimePreferences: ModelRuntimePreferences;
  /** Provider preference for isolated task-name, routing, and commit utilities. */
  utilityInferenceProvider: UtilityInferenceProvider;
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
  /** Optional isolated read-only preflight used before normal user turns. */
  advisorTarget: AdvisorTarget | null;
  /**
   * Whether new tasks arm Worker mode by default. Tasks may override in either
   * direction from the composer.
   */
  workerEnabled: boolean;
  /**
   * Default worker configuration per provider: preset, model, effort, and any
   * user-edited description/instructions/tools. Keyed by provider because the
   * two providers have different worker models and effort scales.
   */
  workerConfigByProvider: Partial<Record<ProviderId, WorkerProviderConfig>>;
  /** Optional outbound-only Crane dispatch connector. Secrets stay in Electron main. */
  craneConnector: CraneConnectorSettings;
  /** Martin workspace sync toggles. Secrets stay in Electron main. */
  martinSync: MartinSyncSettings;
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
  claudeSkills: string;
  claudePluginPaths: string;
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
  // ---------------------------------------------------------------------------
  // Customisable AI prompt templates (Settings → Prompts)
  // ---------------------------------------------------------------------------
  /** Response formatting guidance injected into both Claude and Codex turns. Empty = disabled. */
  promptResponseStyle: string;
  /** Prompt template for AI-generated PR descriptions. */
  promptPrDescription: string;
  /** System prompt for inline code completion. */
  promptInlineCompletion: string;
  /** Preferred model for the Information panel's automatic latest-turn summary. */
  workspaceTurnSummaryPrimaryModel: string;
  /** Fallback model when the primary summary model is unavailable or fails. */
  workspaceTurnSummaryFallbackModel: string;
  /** Prompt template for the Information panel's automatic latest-turn summary. */
  workspaceTurnSummaryPrompt: string;

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

export const SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MIN = 1;
export const SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MAX = 9;
export const DEFAULT_SIDEBAR_ACTIVE_WORKSPACE_LIMIT = 5;

export function normalizeReasoningExpansionMode(
  value: unknown,
): "auto" | "manual" {
  return value === "auto" ? "auto" : "manual";
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

export function normalizeSidebarActiveWorkspaceLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_SIDEBAR_ACTIVE_WORKSPACE_LIMIT;
  }
  return Math.min(
    SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MAX,
    Math.max(SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MIN, Math.round(value)),
  );
}

export const defaultSettings: AppSettings = {
  showPresetBar: true,
  themeMode: "dark",
  customThemeId: null,
  sidebarShowFleetView: true,
  sidebarShowActiveWorkspaces: true,
  sidebarActiveWorkspaceLimit: DEFAULT_SIDEBAR_ACTIVE_WORKSPACE_LIMIT,
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
  composerControlPlacements: {},
  modelClaude: getDefaultModelForProvider({ providerId: "claude-code" }),
  modelCodex: getDefaultModelForProvider({ providerId: "codex" }),
  modelRuntimePreferences: {},
  utilityInferenceProvider: "auto",
  autoRoutingEnabled: false,
  autoRoutingUseClassifier: false,
  autoRoutingObjective: 0.5,
  autoRoutingSafetyEscalation: true,
  autoRoutingAllowProviderSwitch: false,
  autoRoutingEligibleClaudeModels: [],
  autoRoutingEligibleCodexModels: [],
  taskPresets: cloneDefaultTaskPresets(),
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
  claudePermissionMode: "auto",
  claudePermissionModeBeforePlan: null,
  claudePlanModeApprovalScope: DEFAULT_CLAUDE_PLAN_MODE_APPROVAL_SCOPE,
  claudeAllowDangerouslySkipPermissions: false,
  claudeSandboxEnabled: false,
  claudeAllowUnsandboxedCommands: true,
  claudeSandboxCredentialFiles: "",
  claudeSandboxCredentialEnvVars: "",
  claudeTaskBudgetTokens: 0,
  advisorTarget: null,
  // Off by default: Worker mode changes how a turn spends tokens, so it must be
  // an explicit opt-in rather than something a user discovers on their bill.
  workerEnabled: false,
  workerConfigByProvider: {},
  craneConnector: {
    ...DEFAULT_CRANE_CONNECTOR_SETTINGS,
    projectMappings: [],
  },
  martinSync: { ...DEFAULT_MARTIN_SYNC_SETTINGS },
  claudeSettingSources: ["project"],
  claudeEffort: "high",
  claudeThinkingMode: "adaptive",
  claudeAgentProgressSummaries: false,
  claudePromptSuggestions: true,
  claudeForwardSubagentText: false,
  claudeEnableFileCheckpointing: false,
  claudeForkSession: false,
  claudeStrictMcpConfig: false,
  claudeFastMode: false,
  claudeSkills: "",
  claudePluginPaths: "",
  claudeAgentName: "",
  claudeFallbackModel: "",
  claudeResumeSessionAt: "",
  codexFileAccess: "danger-full-access",
  codexNetworkAccess: true,
  codexApprovalPolicy: "never",
  codexBinaryPath: "",
  // Matches the codex-cli 0.144.1 server-catalog default effort (xhigh) for
  // the default model family (GPT-5.6).
  codexReasoningEffort: "xhigh",
  codexWebSearch: "live",
  codexAppToolApprovalMode: "inherit",
  codexShowRawReasoning: false,
  codexReasoningSummary: "auto",
  codexReasoningSummarySupport: "auto",
  codexFastMode: false,
  codexPlanMode: false,
  promptResponseStyle: DEFAULT_PROMPT_RESPONSE_STYLE,
  promptPrDescription: DEFAULT_PROMPT_PR_DESCRIPTION,
  promptInlineCompletion: DEFAULT_PROMPT_INLINE_COMPLETION,
  workspaceTurnSummaryPrimaryModel: "gpt-5.6-luna",
  workspaceTurnSummaryFallbackModel: "claude-haiku-4-5",
  workspaceTurnSummaryPrompt: DEFAULT_PROMPT_WORKSPACE_TURN_SUMMARY,
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
