import type {
  TaskProviderSessionState,
  WorkspaceSummary,
} from "@/lib/db/workspaces.db";
import type { LocalMcpTaskTurnUpdate } from "@/lib/local-mcp/task-turn-update";
import type { AppNotification } from "@/lib/notifications/notification.types";
import type { PersistenceBootstrapPhase } from "@/lib/persistence/bootstrap-status";
import type {
  ProviderGoalSnapshot,
  ProviderId,
  ProviderRuntimeCapabilities,
  ClaudeFileRewindResponse,
  RateLimitsSnapshotResponse,
} from "@/lib/providers/provider.types";
import type { UpdateModelRuntimePreferenceArgs } from "@/lib/providers/model-runtime-preferences";
import type { AdvisorExchangeByTask } from "@/lib/providers/advisor-activity";
import type { ProviderTurnActivitySnapshot } from "@/lib/providers/turn-status";
import type { WorkspacePrInfo } from "@/lib/pr-status";
import type { TurnIntentComplianceResult } from "@/lib/source-control-review";
import type { SkillCatalogEntry, SkillCatalogRoot } from "@/lib/skills/types";
import type { TaskPreset } from "@/lib/task-presets";
import type { TaskFilter } from "@/lib/tasks";
import type {
  CliSessionContextMode,
  WorkspaceActiveSurface,
  WorkspaceCliSessionTab,
  WorkspaceTerminalTab,
} from "@/lib/terminal/types";
import type { CustomThemeDefinition } from "@/lib/themes";
import type { WorkspaceInformationState } from "@/lib/workspace-information";
import type { TurnVerificationResult } from "@/lib/workspace-scripts";
import type {
  CompareRun,
  StartCompareRun,
  StartCompareRunResult,
} from "@/lib/compare-runs";
import type { AppSettings } from "@/store/app-settings";
import type { AppActiveSurface, AppSurfaceActions } from "@/store/app-surface";
import type { LayoutState } from "@/store/layout.utils";
import type { RecentProjectState } from "@/store/project.utils";
import type { TaskScrollToLatestRequest } from "@/store/task-scroll.utils";
import type { WorkspaceKickoffActions } from "@/store/workspace-kickoff-actions";
import type {
  WorkspacePaneStoreActions,
  WorkspacePaneStoreState,
} from "@/store/workspace-pane-state";
import type { WorkspaceSessionState } from "@/store/workspace-session-state";
import type {
  ChatMessage,
  EditorTab,
  PromptDraft,
  PromptDraftRuntimeOverrides,
  Task,
  TaskTakeoverResult,
} from "@/types/chat";
import type { ReviewComment, ReviewCommentSide } from "@/types/review";
import type {
  ProjectAppearanceColorId,
  ProjectAppearanceIconId,
} from "@/store/project.utils";

export type NotificationContextOpenResult =
  | { status: "opened" }
  | { status: "archived-task"; taskId: string; taskTitle: string };

export interface SkillCatalogState {
  status: "idle" | "loading" | "ready" | "error";
  workspacePath: string | null;
  sharedSkillsHome: string | null;
  fetchedAt: string | null;
  skills: SkillCatalogEntry[];
  roots: SkillCatalogRoot[];
  detail: string;
}

export type SendUserMessageResult =
  | { status: "blocked" }
  | { status: "queued"; taskId: string; workspaceId: string }
  | { status: "steered"; taskId: string; workspaceId: string; turnId: string }
  | {
      status: "steer-delivery-unknown";
      taskId: string;
      workspaceId: string;
      message: string;
    }
  | {
      status: "steer-unavailable";
      taskId: string;
      workspaceId: string;
      message: string;
    }
  | { status: "started"; taskId: string; workspaceId: string; turnId: string };

export type ConversationThreadActionResult =
  { ok: true; detail: string; taskId?: string } | { ok: false; detail: string };

export interface AppState
  extends
    AppSurfaceActions,
    WorkspaceKickoffActions,
    WorkspacePaneStoreState,
    WorkspacePaneStoreActions {
  hasHydratedWorkspaces: boolean;
  workspaceSnapshotVersion: number;
  promptDraftPersistenceVersion: number;
  workspaces: WorkspaceSummary[];
  activeWorkspaceId: string;
  projectPath: string | null;
  recentProjects: RecentProjectState[];
  defaultBranch: string;
  workspaceBranchById: Record<string, string>;
  workspacePathById: Record<string, string>;
  workspaceDefaultById: Record<string, boolean>;
  /**
   * When the user last actually worked in each workspace, keyed by workspace
   * id. Persisted, and stamped wherever a workspace deliberately becomes the
   * active one: workspace switch, project open, and workspace creation. Turn
   * activity is covered separately by task `updatedAt`, which Fleet folds in.
   * Distinct from `WorkspaceSummary.updatedAt`, which bumps on any snapshot
   * flush and so cannot tell a live workspace from a merely remembered one.
   */
  workspaceLastActiveAtById: Record<string, string>;
  /** PR info cache per workspace – transient, not persisted across sessions. */
  workspacePrInfoById: Record<string, WorkspacePrInfo>;
  /** Claude/Codex usage for the bottom status bar – transient, not persisted. */
  rateLimitsSnapshot: RateLimitsSnapshotResponse | null;
  rateLimitsLoading: boolean;
  rateLimitsError: string | null;
  isDarkMode: boolean;
  activeTaskId: string;
  draftProvider: ProviderId;
  promptDraftByTask: Record<string, PromptDraft>;
  workspaceInformation: WorkspaceInformationState;
  promptFocusNonce: number;
  providerCommandCatalogRefreshNonce: number;
  workspacePlansRefreshNonce: number;
  tasks: Task[];
  messagesByTask: Record<string, ChatMessage[]>;
  messageCountByTask: Record<string, number>;
  taskMessagesLoadingByTask: Record<string, boolean>;
  layout: LayoutState;
  settings: AppSettings;
  editorTabs: EditorTab[];
  activeEditorTabId: string | null;
  terminalTabs: WorkspaceTerminalTab[];
  activeTerminalTabId: string | null;
  cliSessionTabs: WorkspaceCliSessionTab[];
  activeCliSessionTabId: string | null;
  activeAppSurface: AppActiveSurface;
  activeSurface: WorkspaceActiveSurface;
  focusPendingInteractionRequest: {
    taskId: string;
    nonce: number;
  } | null;
  scrollToLatestMessageRequest: TaskScrollToLatestRequest | null;
  pendingCloseEditorTabId: string | null;
  pendingEditorSelection: {
    tabId: string;
    line: number;
    column?: number;
  } | null;
  projectName: string | null;
  projectFiles: string[];
  workspaceFileCacheByPath: Record<string, string[]>;
  taskCheckpointById: Record<string, string>;
  providerAvailability: Record<ProviderId, boolean>;
  providerRuntimeCapabilities: Record<ProviderId, ProviderRuntimeCapabilities>;
  skillCatalog: SkillCatalogState;
  notifications: AppNotification[];
  reviewCommentsByTask: Record<string, ReviewComment[] | undefined>;
  compareRunsById: Record<string, CompareRun | undefined>;
  activeCompareRunId: string | null;
  activeTurnIdsByTask: Record<string, string | undefined>;
  hostOwnedTurnIdsByTask: Record<string, string | undefined>;
  providerTurnActivityByTask: Record<
    string,
    ProviderTurnActivitySnapshot | undefined
  >;
  /**
   * Latest primary <-> Advisor exchange per task, in memory only.
   *
   * Kept out of `messagesByTask` on purpose: the advice text must never become
   * a persisted assistant response, and the observability surface must not
   * depend on transcript rendering.
   */
  advisorExchangeByTask: AdvisorExchangeByTask;
  nativeSessionReadyByTask: Record<string, boolean>;
  providerSessionByTask: Record<string, TaskProviderSessionState>;
  providerGoalByTask: Record<string, ProviderGoalSnapshot | null | undefined>;
  /** Latest turn.completed verification result per workspace (worktree-scoped). */
  turnVerificationByWorkspace: Record<
    string,
    TurnVerificationResult | undefined
  >;
  /** Latest turn.completed intent-guard result per workspace (worktree-scoped). */
  turnIntentComplianceByWorkspace: Record<
    string,
    TurnIntentComplianceResult | undefined
  >;
  workspaceRuntimeCacheById: Record<string, WorkspaceSessionState>;
  taskWorkspaceIdById: Record<string, string>;
  persistenceBootstrapPhase: PersistenceBootstrapPhase;
  persistenceBootstrapMessage: string;
  hydrateProjectRegistry: () => Promise<void>;
  flushProjectRegistry: () => Promise<void>;
  hydrateWorkspaces: () => Promise<void>;
  /** Lightweight refresh: discover new/removed git worktrees without full rehydration. */
  refreshWorkspaces: () => Promise<void>;
  hydrateNotifications: () => Promise<void>;
  /** Drops notifications owned by workspaces that no longer exist. */
  reconcileOrphanedNotifications: () => Promise<void>;
  purgeWorkspaceNotifications: (args: {
    workspaceIds: string[];
  }) => Promise<void>;
  flushActiveWorkspaceSnapshot: (args?: { sync?: boolean }) => Promise<void>;
  refreshActiveManagedTask: () => Promise<void>;
  syncHostTaskTurn: (update: LocalMcpTaskTurnUpdate) => Promise<void>;
  createProject: (args: { name?: string }) => Promise<void>;
  openProjectFromPath: (args: {
    inputPath: string;
  }) => Promise<{ ok: boolean; stderr?: string }>;
  openProject: (args: { projectPath: string }) => Promise<void>;
  removeProjectFromList: (args: { projectPath: string }) => Promise<void>;
  moveProjectInList: (args: {
    projectPath: string;
    direction: "up" | "down";
  }) => void;
  createWorkspace: (args: {
    name: string;
    label?: string;
    mode: "branch" | "clean";
    fromBranch?: string;
    fromBranchKind?: "local" | "remote";
    initCommand?: string;
    useRootNodeModulesSymlink?: boolean;
    initialTaskTitle?: string;
    workspaceInformation?: WorkspaceInformationState;
  }) => Promise<{
    ok: boolean;
    message?: string;
    noticeLevel?: "success" | "warning";
  }>;
  importWorkspaceFromWorktree: (args: {
    worktreePath: string;
    label?: string;
  }) => Promise<{
    ok: boolean;
    message?: string;
    noticeLevel?: "success" | "warning";
  }>;
  continueWorkspaceFromSummary: (args: {
    name: string;
    baseBranch?: string;
  }) => Promise<{
    ok: boolean;
    message?: string;
    noticeLevel?: "success" | "warning";
  }>;
  closeWorkspace: (args: {
    workspaceId: string;
    /** Defaults to true; the archive dialog lets the user opt out. */
    deleteBranch?: boolean;
  }) => Promise<void>;
  switchWorkspace: (args: { workspaceId: string }) => Promise<void>;
  renameWorkspace: (args: {
    projectPath?: string;
    workspaceId: string;
    name: string;
  }) => Promise<{ ok: boolean; message?: string }>;
  moveWorkspaceInProjectList: (args: {
    projectPath: string;
    workspaceId: string;
    direction: "up" | "down";
  }) => void;
  setProjectBasePrompt: (args: {
    projectPath?: string;
    prompt: string;
  }) => void;
  setProjectKickoffBranchNamingRule: (args: {
    projectPath?: string;
    rule: string;
  }) => void;
  setProjectWorkspaceInitCommand: (args: {
    projectPath?: string;
    command: string;
  }) => void;
  setProjectWorkspaceUseRootNodeModulesSymlink: (args: {
    projectPath?: string;
    enabled: boolean;
  }) => void;
  setProjectAppearance: (args: {
    projectPath?: string;
    icon: ProjectAppearanceIconId;
    color: ProjectAppearanceColorId;
  }) => void;
  setDarkMode: (args: { enabled: boolean }) => void;
  installCustomTheme: (args: { theme: CustomThemeDefinition }) => {
    ok: boolean;
    error?: string;
  };
  removeCustomTheme: (args: { themeId: string }) => void;
  updateSettings: (args: { patch: Partial<AppSettings> }) => void;
  updateModelRuntimePreference: (
    args: UpdateModelRuntimePreferenceArgs,
  ) => void;
  setPersistenceBootstrapStatus: (args: {
    phase: PersistenceBootstrapPhase;
    message?: string;
  }) => void;
  refreshProviderCommandCatalog: () => void;
  notifyWorkspacePlansChanged: () => void;
  openCompareRun: (args: { compareRunId: string }) => void;
  startCompareRun: StartCompareRun;
  startCompareRunFromActiveDraft: () => ReturnType<StartCompareRun>;
  openCompareVariant: (args: {
    compareRunId: string;
    variantId: string;
  }) => Promise<void>;
  keepCompareVariant: (args: {
    compareRunId: string;
    variantId: string;
  }) => Promise<StartCompareRunResult>;
  cancelCompareRun: (args: {
    compareRunId: string;
  }) => Promise<StartCompareRunResult>;
  focusTaskAttention: (args: {
    taskId: string;
    workspaceId?: string;
    projectPath?: string;
    refreshFromPersistence?: boolean;
  }) => Promise<void>;
  requestTaskScrollToLatest: (args: { taskId: string }) => void;
  selectTask: (args: { taskId: string }) => void;
  loadTaskMessages: (args: {
    taskId: string;
    mode?: "latest" | "older";
  }) => Promise<void>;
  clearTaskSelection: () => void;
  updatePromptDraft: (args: {
    taskId: string;
    patch: Partial<PromptDraft>;
  }) => void;
  clearTaskProviderSession: (args: {
    taskId: string;
    providerId: ProviderId;
  }) => void;
  updateWorkspaceInformation: (args: {
    updater: (current: WorkspaceInformationState) => WorkspaceInformationState;
  }) => void;
  applyExternalWorkspaceInformationUpdate: (args: {
    workspaceId: string;
    workspaceInformation: WorkspaceInformationState;
  }) => void;
  clearPromptDraft: (args: { taskId: string }) => void;
  createTask: (args: { title?: string }) => void;
  renameTask: (args: {
    taskId: string;
    title: string;
    /**
     * "manual" (default) marks the task as user-named and stops future
     * automatic title suggestions. "auto" comes from the suggestion loop and
     * is ignored once the title has been set manually.
     */
    source?: "manual" | "auto";
  }) => void;
  restoreTask: (args: { taskId: string }) => void;
  duplicateTask: (args: { taskId: string }) => Promise<void>;
  forkConversationFromMessage: (args: {
    taskId: string;
    messageId: string;
  }) => Promise<ConversationThreadActionResult>;
  rollbackConversationToMessage: (args: {
    taskId: string;
    messageId: string;
  }) => Promise<ConversationThreadActionResult>;
  rewindClaudeFilesFromMessage: (args: {
    taskId: string;
    messageId: string;
    dryRun: boolean;
  }) => Promise<ClaudeFileRewindResponse>;
  reorderTasks: (args: {
    activeTaskId: string;
    overTaskId: string;
    filter: TaskFilter;
  }) => void;
  exportTask: (args: { taskId: string }) => Promise<void>;
  viewTaskChanges: (args: { taskId: string }) => Promise<void>;
  rollbackTask: (args: { taskId: string }) => Promise<void>;
  rollbackToCompactBoundary: (args: {
    taskId: string;
    gitRef: string;
    trigger?: string;
  }) => Promise<void>;
  archiveTask: (args: { taskId: string }) => void;
  setTaskProvider: (args: { taskId: string; provider: ProviderId }) => void;
  createTerminalTab: (args?: {
    cwd?: string;
    linkedTaskId?: string | null;
    title?: string;
  }) => string | null;
  createCliSessionTab: (args: {
    provider: "claude-code" | "codex";
    contextMode: CliSessionContextMode;
  }) => string | null;
  /**
   * Runs a preset from the preset bar. For `task` presets this aligns the
   * provider draft + per-provider model settings and spawns a new task; for
   * `cli-session` presets it opens a new CLI session tab.
   */
  applyTaskPreset: (args: { presetId: string }) => void;
  /** Upserts a preset; creates a new entry if `presetId` is unknown. */
  upsertTaskPreset: (args: { preset: TaskPreset }) => void;
  removeTaskPreset: (args: { presetId: string }) => void;
  reorderTaskPresets: (args: {
    fromPresetId: string;
    toPresetId: string;
  }) => void;
  resetTaskPresetsToDefault: () => void;
  setActiveCliSessionTab: (args: { tabId: string | null }) => void;
  setCliSessionTabNativeSession: (args: {
    tabId: string;
    nativeSessionId?: string;
  }) => void;
  renameCliSessionTab: (args: { tabId: string; title: string }) => void;
  reorderCliSessionTabs: (args: { fromTabId: string; toTabId: string }) => void;
  closeCliSessionTab: (args: { tabId: string }) => void;
  renameTerminalTab: (args: { tabId: string; title: string }) => void;
  reorderTerminalTabs: (args: { fromTabId: string; toTabId: string }) => void;
  closeTerminalTab: (args: { tabId: string }) => void;
  setWorkspaceBranch: (args: { workspaceId: string; branch: string }) => void;
  /** Fetch PR status for a single workspace from GitHub. */
  fetchWorkspacePrStatus: (args: { workspaceId: string }) => Promise<void>;
  /** Fetch PR status for all non-default workspaces. */
  fetchAllWorkspacePrStatuses: () => Promise<void>;
  setLayout: (args: { patch: Partial<LayoutState> }) => void;
  toggleEditorDiffMode: () => void;
  toggleEditorMarkdownPreviewMode: () => void;
  openWorkspacePicker: () => Promise<void>;
  refreshProjectFiles: () => Promise<void>;
  refreshRateLimits: () => Promise<void>;
  refreshProviderAvailability: () => Promise<void>;
  refreshSkillCatalog: (args?: {
    workspacePath?: string | null;
  }) => Promise<void>;
  takeOverTask: (args: { taskId: string }) => Promise<TaskTakeoverResult>;
  markNotificationRead: (args: {
    id: string;
    resolvedAt?: string;
  }) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  clearNotificationHistory: () => Promise<number>;
  openNotificationContext: (args: {
    notificationId: string;
    targetSurface?: "task" | "fleet";
  }) => Promise<NotificationContextOpenResult>;
  resolveNotificationApproval: (args: {
    notificationId: string;
    approved: boolean;
  }) => Promise<void>;
  addReviewComment: (args: {
    taskId: string;
    filePath: string;
    line?: number;
    side?: ReviewCommentSide;
    body: string;
  }) => ReviewComment | null;
  removeReviewComment: (args: { taskId: string; commentId: string }) => void;
  clearReviewComments: (args: { taskId: string }) => void;
  submitReviewFeedback: (args: {
    taskId: string;
  }) => Promise<SendUserMessageResult>;
  sendUserMessage: (args: {
    taskId: string;
    content: string;
    /** Run this turn with a provider without changing the task's provider. */
    providerOverride?: ProviderId;
    /** Runtime settings scoped to this turn only. */
    runtimeOverrides?: PromptDraftRuntimeOverrides;
    /** Keep the current composer text and attachments untouched. */
    preservePromptDraft?: boolean;
    fileContexts?: Array<{
      filePath: string;
      content: string;
      language: string;
      instruction?: string;
    }>;
    imageContexts?: Array<{
      dataUrl: string;
      label: string;
      mimeType: string;
    }>;
    /**
     * Explicit choice of how to deliver this message when a turn is already
     * running, mirroring Codex CLI's Enter-to-steer / Tab-to-queue split.
     * There is no automatic priority between the two — omitting this (or any
     * caller that doesn't thread a keyboard choice through, e.g. suggestion
     * clicks) always queues, exactly like before mid-turn steering existed.
     * Only an explicit `"steer"` ever attempts to inject into the live turn,
     * and it never silently falls back to queueing on failure — the caller
     * gets `{status: "steer-unavailable"}` and decides what to do (e.g. tell
     * the user to press Tab to queue instead).
     */
    submitIntent?: "steer" | "queue";
    /**
     * Dispatch a specific staged {@link PromptDraft.queuedTurns} item instead
     * of the composer draft. The item's own content/attachments become the
     * turn payload while the composer draft (text, attachments, batch) is left
     * untouched — only the dispatched item is removed from the queue. Blocked
     * while a live (non-stalled) turn is running: queued items already
     * auto-dispatch on turn completion, so manual dispatch only exists for the
     * idle/interrupted case where that trigger never fires.
     */
    queuedTurnId?: string;
    /**
     * What kind of turn this is, which decides whether the task's Advisor
     * arming applies.
     *
     * Required rather than optional on purpose. The Advisor is a blocking
     * cross-model call the user pays for on every armed turn, so an optional
     * flag would default new call sites into paying for it silently — the
     * "utility turns stay advisor-free by construction, not by remembering"
     * rule that already governs `buildProviderRuntimeOptions`, enforced at the
     * one entry point that was still opting everything in.
     *
     * - `"conversation"` — the task's own dialogue, authored by the user in a
     *   composer surface: typing, dispatching a queued follow-up, approving a
     *   plan, replying from the Fleet panel. Advisor arming applies.
     * - `"utility"` — a purpose-built turn that is not the task's dialogue:
     *   compare runs, workspace kickoff, a local-change review sent to an
     *   explicitly chosen reviewer model. Never runs the Advisor. For compare
     *   runs this is correctness rather than cost — silently consulting a
     *   third model inside each arm would contaminate the comparison the user
     *   asked for. For a chosen reviewer it would contradict the choice.
     */
    turnOrigin: "conversation" | "utility";
  }) => Promise<SendUserMessageResult>;
  /**
   * Forward a workspace's failing verification checks back to its agent as the
   * next turn. Builds a prompt from the stored {@link TurnVerificationResult}
   * (optionally limited to one `scriptId`) and submits it via
   * {@link sendUserMessage}. Only ever runs on an explicit user action.
   */
  requestVerificationFix: (args: {
    workspaceId: string;
    scriptId?: string;
  }) => Promise<SendUserMessageResult>;
  abortTaskTurn: (args: { taskId: string }) => void;
  /**
   * Cancels only the Advisor preflight for the task's active turn. The primary
   * turn keeps running, so escaping a slow advisor is not an abort.
   */
  skipTaskAdvisor: (args: { taskId: string }) => void;
  /** Dismisses the task's Advisor exchange card without touching the turn. */
  dismissAdvisorExchange: (args: { taskId: string }) => void;
  resolveApproval: (args: {
    taskId: string;
    messageId: string;
    requestId?: string;
    approved: boolean;
  }) => void;
  resolveUserInput: (args: {
    taskId: string;
    messageId: string;
    requestId?: string;
    answers?: Record<string, string>;
    denied?: boolean;
  }) => void;
  resolveDiff: (args: {
    taskId: string;
    messageId: string;
    accepted: boolean;
    partIndex?: number;
  }) => void;
  openDiffInEditor: (args: {
    editorTabId: string;
    filePath: string;
    oldContent: string;
    newContent: string;
  }) => void;
  openGitGraph: () => void;
  openFileFromTree: (args: {
    filePath: string;
    line?: number;
    column?: number;
    fallbackContent?: string;
  }) => Promise<void>;
  setActiveEditorTab: (args: { tabId: string }) => void;
  closeEditorTab: (args: { tabId: string }) => void;
  requestCloseActiveEditorTab: () => void;
  clearPendingCloseEditorTab: () => void;
  clearPendingEditorSelection: () => void;
  updateEditorContent: (args: { tabId: string; content: string }) => void;
  saveActiveEditorTab: () => Promise<{ ok: boolean; conflict?: boolean }>;
  checkOpenTabConflicts: () => Promise<void>;
  sendWorkspaceFileToChat: (args: { taskId: string; filePath: string }) => void;
  sendEditorContextToChat: (args: {
    taskId: string;
    instruction?: string;
  }) => void;
}
