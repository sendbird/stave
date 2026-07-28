import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  listActiveWorkspaceTurns,
  type PersistedTurnSummary,
} from "@/lib/db/turns.db";
import { createNotification as createPersistedNotification } from "@/lib/db/notifications.db";
import { workspaceFsAdapter } from "@/lib/fs";
import type { WorkspaceFileData, WorkspaceImageData } from "@/lib/fs/fs.types";
import { formatWithEslint } from "@/components/layout/editor-language-intelligence";
import {
  listWorkspaceSummaries,
  loadWorkspaceEditorTabBodies,
  loadTaskMessagesPage,
  loadWorkspaceShellForRestore,
  loadWorkspaceShellSummary,
  loadWorkspaceSnapshot,
  closeWorkspacePersistence,
  loadProjectRegistrySnapshot,
  saveProjectRegistrySnapshot,
  type TaskProviderSessionState,
  type WorkspaceSummary,
} from "@/lib/db/workspaces.db";
import type { PersistenceBootstrapPhase } from "@/lib/persistence/bootstrap-status";
import type {
  CanonicalRetrievedContextPart,
  NormalizedProviderEvent,
  ProviderGoalSnapshot,
  ProviderId,
  RateLimitsSnapshotResponse,
} from "@/lib/providers/provider.types";
import { getRepoMapContextCache } from "@/lib/fs/repo-map-context-cache";
import { buildCurrentTaskAwarenessRetrievedContext } from "@/lib/task-context/current-task-awareness";
import { buildReferencedTaskRetrievedContext } from "@/lib/task-context/referenced-task-context";
import {
  extractWorkspaceInformationReferencesFromText,
  formatWorkspaceInformationReferencesContext,
  type LensReferenceState,
  type WorkspaceInformationReference,
} from "@/lib/workspace-information-references";
import {
  buildWorkspaceContinueSummaryFilePath,
  buildWorkspaceContinueSummaryMarkdown,
} from "@/lib/workspace-continue";
import {
  type ScriptTrigger,
  type TurnVerificationResult,
  buildTurnVerificationResult,
  buildVerificationFixPrompt,
} from "@/lib/workspace-scripts";
import type {
  AppNotification,
  AppNotificationCreateInput,
} from "@/lib/notifications/notification.types";
import {
  isNotificationAttentionKind,
  isNotificationUnread,
} from "@/lib/notifications/notification.types";
import {
  clearNotificationHistoryAction,
  hydrateNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  purgeWorkspaceNotificationsAction,
  reconcileOrphanedNotificationsAction,
} from "@/store/notification-actions";
import { createNotificationAttentionSync } from "@/store/notification-attention-sync";
import { mergeNotificationIntoList } from "@/lib/notifications/notification-state";
import {
  normalizeNotificationSoundMode,
  normalizeNotificationSoundPreset,
  normalizeNotificationSoundVolume,
  playCustomNotificationSound,
  playNotificationSound,
} from "@/lib/notifications/notification-sound";
import { normalizeLensHostList } from "@/lib/lens/lens-security";
import type { LocalMcpTaskTurnUpdate } from "@/lib/local-mcp/task-turn-update";
import { buildCanonicalConversationRequest } from "@/lib/providers/canonical-request";
import {
  getProviderSessionCursor,
  getProviderSessionId,
} from "@/lib/providers/provider-sessions";
import {
  inferProviderIdFromModel,
  listProviderIds,
  normalizeModelSelection,
  providerSupportsMidTurnSteering,
  resolveDefaultClaudeEffortForModel,
  resolveDefaultCodexEffortForModel,
  upgradeSettingsScopedClaudeModel,
} from "@/lib/providers/model-catalog";
import {
  normalizeAdvisorTarget,
  normalizePersistedAdvisorTarget,
} from "@/lib/providers/advisor";
import {
  applyModelRuntimePreference,
  mergeModelRuntimePreference,
  mergeModelRuntimePreferenceSettings,
  normalizeModelRuntimePreferences,
  type UpdateModelRuntimePreferenceArgs,
} from "@/lib/providers/model-runtime-preferences";
import { resolveTurnModelInfo } from "@/lib/providers/turn-model-info";
import {
  normalizeAutoRoutingEligibleModels,
  normalizeAutoRoutingObjective,
  resolveAutoRoutingDecision,
  type AutoRoutingClassifierResult,
} from "@/store/auto-routing";
import {
  normalizeModelShortcutEfforts,
  normalizeModelShortcutKeys,
} from "@/lib/providers/model-shortcuts";
import { normalizeAppShortcutKeys } from "@/lib/app-shortcuts";
import { normalizePromptCommentShortcut } from "@/lib/prompt-comment-shortcuts";
import {
  DEFAULT_VISUAL_COMMENT_SHORTCUT,
  normalizeVisualCommentShortcut,
} from "@/lib/visual-comment-shortcuts";
import { normalizeSteerQueueEnterAction } from "@/lib/steer-queue-shortcuts";
import { normalizeResponseStylePrompt } from "@/lib/providers/prompt-defaults";
import {
  collectIntentContext,
  deriveIntentComplianceStatus,
  normalizePrePrReviewProvider,
  type TurnIntentComplianceResult,
} from "@/lib/source-control-review";
import { normalizeTrustedToolEntries } from "@/lib/providers/trusted-tools";
import {
  buildSuggestTaskNamePayload,
  getArchiveFallbackTaskId,
  isTaskArchived,
  isTaskManaged,
  normalizeSuggestedTaskTitle,
  reorderTasksWithinFilter,
  shouldSuggestTaskName,
  type TaskFilter,
} from "@/lib/tasks";
import {
  cloneDefaultTaskPresets,
  normalizePersistedTaskPresets,
  type TaskPreset,
} from "@/lib/task-presets";
import {
  DEFAULT_TERMINAL_FONT_FAMILY,
  LEGACY_TERMINAL_FONT_FAMILY,
} from "@/lib/terminal/defaults";
import {
  getCliSessionTabDefaultTitle,
  getTerminalTabDefaultTitle,
  type CliSessionContextMode,
  type WorkspaceActiveSurface,
  type WorkspaceCliSessionTab,
  type WorkspaceTerminalTab,
} from "@/lib/terminal/types";
import { buildPanePanelId, parsePanePanelId } from "@/lib/panes/types";
import {
  reduceActiveSurfaceFromPane,
  reduceCloseCompareRun,
  reduceCloseLensTab,
  reduceCloseTaskTab,
  reduceOpenLensTab,
  reducePaneTabMeta,
  removePaneTabMetaEntry,
  resolveCreatedLensSessionId,
  type WorkspacePaneStoreActions,
  type WorkspacePaneStoreState,
} from "@/store/workspace-pane-state";
import {
  getCachedWorkspaceFiles,
  isWorkspaceTargetCurrent,
  rememberCachedWorkspaceFiles,
  removeCachedWorkspaceFiles,
  resolveInitialWorkspaceFiles,
  resolveWorkspacePathForId,
} from "@/store/workspace-file-cache";
import { resolveSkillSelections } from "@/lib/skills/catalog";
import type { SkillCatalogEntry, SkillCatalogRoot } from "@/lib/skills/types";
import {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  PROVIDER_TIMEOUT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";
import {
  applyProviderTurnActivityEvents,
  clearProviderTurnActivity,
  markProviderTurnInteractionResolved,
  markProviderTurnStalled,
  resolveProviderTurnDisplayState,
  resolveProviderTurnStallThresholdMs,
  startProviderTurnActivity,
  type ProviderTurnActivitySnapshot,
} from "@/lib/providers/turn-status";
import { resolveWorkspaceRelativeFilePath } from "@/lib/workspace-file-path";
import {
  applyDetectedWorkspaceResources,
  buildIntentGuardContextInput,
  createEmptyWorkspaceInformation,
  detectWorkspaceResourcesInText,
  type WorkspaceInformationState,
} from "@/lib/workspace-information";
import { normalizeWorkspaceInformationSectionVisibility } from "@/lib/workspace-information-sections";
import { normalizeKickoffSourceConfigs } from "@/lib/workspace-kickoff";
import {
  buildWorkspaceTurnSummaryPrompt,
  createWorkspaceTurnSummary,
  parseWorkspaceTurnSummaryResponse,
} from "@/lib/workspace-turn-summary";
import {
  findLatestPendingApproval,
  findLatestPendingApprovalPart,
  findLatestPendingUserInput,
  findPendingApprovalMessageByRequestId,
  findLatestPendingUserInputPart,
  interruptPendingToolInteractionsInMessages,
} from "@/store/provider-message.utils";
import {
  buildReviewFeedbackFileContexts,
  formatReviewFeedbackPrompt,
} from "@/lib/review-feedback";
import {
  buildDefaultCompareVariants,
  buildInitialCompareRun,
  finalizeCompareRunLaunch,
  finishCompareRunsForTask,
  normalizeCompareReviewCriteria,
  normalizePersistedCompareRuns,
  normalizeCompareVariants,
  patchCompareRunVariant,
  resolveCompareTurnOutcome,
  type CompareRun,
  type CompareRunVariant,
  type StartCompareRun,
  type StartCompareRunResult,
} from "@/lib/compare-runs";
import { cancelCompareJudgeSecondaryRun, launchReadyCompareJudgesFromStore } from "@/store/compare-run-judge";
import { launchCompareRunVariants } from "@/store/compare-run-start";
import { buildManagedTaskTakeoverStatePatch, buildManagedTaskTurnInterruptionPatch, requestManagedTaskStop, requestManagedTaskTakeover } from "@/store/managed-task-takeover";
import type { ReviewComment, ReviewCommentSide } from "@/types/review";
import {
  applyProjectBasePromptToRuntimeOptions,
  buildProviderRuntimeOptions,
  normalizeClaudeSettingSources,
  normalizeClaudeTaskBudgetTokens,
  normalizeCodexApprovalPolicy,
} from "@/store/provider-runtime-options";
import {
  buildMessageId,
  buildPendingProviderTurnState,
  buildSteeredUserMessageState,
  buildRecentTimestamp,
} from "@/store/chat-state-helpers";
import {
  createProviderTurnEventController,
  runProviderTurn,
} from "@/store/provider-turn-runtime";
import {
  applyHostTaskTurnSync,
  loadHostTaskTurn,
} from "@/store/host-task-turn-sync";
import { createQueuedTaskTurnDispatcher } from "@/store/queued-task-turn-dispatch";
import { submitSteerWithDeadline } from "@/store/steer-submit";
import {
  applyPendingProviderEventsToStoreState,
  createWorkspaceSessionStateFromAppState,
  getWorkspaceSessionForState,
  saveActiveWorkspaceRuntimeCache,
} from "@/store/workspace-runtime-state";
import {
  createWorkspaceKickoffResolver,
  runWorkspaceKickoff,
  type WorkspaceKickoffActions,
} from "@/store/workspace-kickoff-actions";
import type {
  Attachment,
  ChatMessage,
  EditorTab,
  PromptDraft,
  PromptDraftRuntimeOverrides,
  Task,
  TaskTakeoverResult,
} from "@/types/chat";
import {
  buildQueuedTurnFromDraft,
  getDraftFileContexts,
  getDraftImageContexts,
  getPromptDraftAttachedFilePaths,
  getPromptDraftAttachments,
  promptDraftReferencesLens,
} from "@/store/prompt-draft-context";
import {
  buildPromptDraftContentForSend,
  buildPromptDraftDisplayContentForSend,
  buildPromptDraftDisplayPartsForSend,
} from "@/store/prompt-draft-message-content";
import {
  arePromptDraftRuntimeOverridesEqual,
  resolvePromptDraftModelForProvider,
  resolvePromptDraftRuntimeState,
} from "@/store/prompt-draft-runtime";
import {
  buildPreservedQueuedDraft,
  resolvePromptDraftAfterSend,
  resolvePromptDraftSendState,
} from "@/store/prompt-draft-send";
import {
  arePromptDraftBatchItemsEqual,
  arePromptDraftQueuedTurnsEqual,
  buildClearedPromptDraft,
  buildClearedPromptDraftWithQueuedNextTurn,
  hasPromptDraftPayload,
  normalizePromptDraftForStorage,
} from "@/store/prompt-draft-state";
import {
  resolveWorkspacePlanPersistenceText,
  persistWorkspacePlanFile,
} from "@/lib/plans";
import {
  appendInterruptedTurnNotices,
  buildWorkspaceSessionStateFromShell,
  buildWorkspaceSessionState,
  createEmptyWorkspaceState,
  createWorkspaceSnapshot,
  defaultWorkspaceName,
  interruptActiveTaskTurns,
  persistWorkspaceSnapshot,
  scheduleWorkspaceSnapshotPersist,
  starterWorkspaceId,
  type WorkspaceSessionState,
} from "@/store/workspace-session-state";
import {
  TASK_MESSAGES_PAGE_SIZE,
  resolveInitialLatestTaskMessagesPageSize,
  trimLoadedTaskMessages,
} from "@/store/task-message-loading";
import {
  normalizeComparablePath,
  parseGitWorktrees,
} from "@/lib/source-control-worktrees";
import {
  type LayoutState,
  DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE,
  WORKSPACE_SIDEBAR_MIN_WIDTH,
  mergeLayoutPatch,
  normalizeLayoutState,
  isDiffEditorTab,
  resolveEditorDiffMode,
} from "@/store/layout.utils";
import {
  type ThemeTokenName,
  type ThemeModeName,
  type ThemeTokenValues,
  type ThemeOverrideValues,
  type CustomThemeDefinition,
  THEME_TOKEN_NAMES,
  PRESET_THEME_TOKENS,
  BUILTIN_CUSTOM_THEMES,
  applyThemeClass,
  applyThemeOverrides,
  applyCustomTheme,
  applyFontOverrides,
  resolveDarkModeForTheme,
  findCustomThemeById,
  listAllCustomThemes,
  MAX_USER_THEMES,
} from "@/lib/themes";
import {
  type ProjectAppearanceColorId,
  type ProjectAppearanceIconId,
  type RecentProjectState,
  normalizeWorkspaceInitCommand,
  normalizeProjectWorkspaceInitCommand,
  normalizeProjectWorkspaceRootNodeModulesSymlinkPreference,
  resolveProjectBasePrompt,
  resolveProjectWorkspaceInitCommand,
  resolveProjectWorkspaceRootNodeModulesSymlinkPreference,
  resolveRecentProjectPreferences,
  summarizeTerminalCommandDetail,
  summarizeWorkspaceInitCommand,
  updateCurrentProjectTextPreference,
  updateCurrentProjectAppearance,
  buildWorkspaceRootNodeModulesSymlinkCommand,
  buildWorkspaceCreationNotice,
  isDefaultWorkspaceName,
  registerTaskWorkspaceOwnership,
  retainTaskWorkspaceOwnership,
  resolveWorkspaceName,
  removeWorkspaceRuntimeCacheEntries,
  areStringArraysEqual,
  moveArrayItem,
  sanitizeBranchName,
  toShellPathArgument,
  toWorkspaceFolderName,
  resolveProjectNameFromPath,
  normalizeProjectDisplayName,
  buildProjectDefaultWorkspaceId,
  buildImportedWorktreeWorkspaceId,
  buildLinkedWorktreeSymlinkPath,
  resolveImportedWorktreeName,
  resolveCurrentProjectDefaultWorkspaceId,
  normalizeCurrentProjectState,
  reconcileArchivedWorkspacePaths,
  cloneRecentProjectState,
  normalizeRecentProjectStates,
  upsertRecentProjectState,
  captureCurrentProjectState,
  resolveWorkspaceRemoteBaseBranchTarget,
  resolveTaskWorkspaceContext,
} from "@/store/project.utils";
import {
  type WorkspacePrInfo,
  type GitHubPrPayload,
  derivePrStatus,
} from "@/lib/pr-status";
import {
  resolveLanguage,
  normalizeProviderTimeoutMs,
  isImageFilePath,
  isMarkdownEditorTab,
  canSendEditorContextToTask,
  canSendWorkspaceFileToTask,
  updateMessageById,
  applyApprovalState,
  applyUserInputState,
} from "@/store/editor.utils";
import {
  reduceTaskScrollToLatestRequest,
  type TaskScrollToLatestRequest,
} from "@/store/task-scroll.utils";
import {
  archivedWorktreePaths,
  getArchivedWorktreePathSetForProject,
  getLinkedWorktreePathSetForProject,
  startWorkspaceArchiveCleanup,
} from "@/store/workspace-archive-cleanup";
import { closeTerminalSessionsForWorkspaces } from "@/store/workspace-terminal-cleanup";
import {
  shouldPreferLoadedWorkspaceState,
  shouldReloadWorkspaceShellFromPersistence,
  summarizeWorkspaceShell,
} from "@/store/workspace-shell-summary";
import {
  buildApprovalNotificationInputs,
  buildTaskTurnCompletedNotificationInput,
  buildTaskTurnFailedNotificationInput,
  buildUserInputNotificationInputs,
  findTrustedApprovalResponses,
  showNotificationToast,
} from "@/store/app-notification-builders";
import { normalizeCraneConnectorSettings } from "@/lib/crane-connector/types";
import {
  DEFAULT_SIDEBAR_ACTIVE_WORKSPACE_LIMIT,
  SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MAX,
  SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MIN,
  createDefaultProviderAvailability,
  defaultSettings,
  normalizeBorderBeamSize,
  normalizeBorderBeamStrength,
  normalizeBorderBeamVariant,
  normalizeLensAgentPresentationMode,
  normalizePersistedLensSettings,
  normalizeLensSessionScope,
  normalizeReasoningExpansionMode,
  normalizeSidebarActiveWorkspaceLimit,
  type AppSettings,
} from "@/store/app-settings";

const LOCAL_ABORT_SYSTEM_EVENT_CONTENT =
  "Generation was stopped locally before completion.";
export { WORKSPACE_SIDEBAR_MIN_WIDTH } from "@/store/layout.utils";
export type { LayoutState } from "@/store/layout.utils";
export {
  THEME_TOKEN_NAMES,
  PRESET_THEME_TOKENS,
  BUILTIN_CUSTOM_THEMES,
  MAX_USER_THEMES,
} from "@/lib/themes";
export {
  parseCustomThemeFile,
  exportCustomThemeJson,
  listAllCustomThemes,
} from "@/lib/themes";
export type {
  ThemeTokenName,
  ThemeModeName,
  ThemeTokenValues,
  ThemeOverrideValues,
  CustomThemeDefinition,
  ThemeValidationResult,
} from "@/lib/themes";
export type { RecentProjectState } from "@/store/project.utils";
// This module stays the public entry point for the app store, so settings and
// archive-cleanup names that moved into sibling modules are re-exported here.
export type { AppSettings } from "@/store/app-settings";
export {
  DEFAULT_SIDEBAR_ACTIVE_WORKSPACE_LIMIT,
  SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MAX,
  SIDEBAR_ACTIVE_WORKSPACE_LIMIT_MIN,
} from "@/store/app-settings";
export { waitForPendingWorkspaceArchiveCleanups } from "@/store/workspace-archive-cleanup";

type NotificationContextOpenResult =
  | { status: "opened" }
  | { status: "archived-task"; taskId: string; taskTitle: string };

interface WorkspaceSwitchMetric {
  token: number;
  startedAt: number;
  cacheHit: boolean;
  shellResolvedAt?: number;
  setRootResolvedAt?: number;
}

interface SkillCatalogState {
  status: "idle" | "loading" | "ready" | "error";
  workspacePath: string | null;
  sharedSkillsHome: string | null;
  fetchedAt: string | null;
  skills: SkillCatalogEntry[];
  roots: SkillCatalogRoot[];
  detail: string;
}

type SendUserMessageResult =
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

type AppActiveSurface = { kind: "workspace" } | { kind: "fleet-view" };

const APP_STORE_KEY = "stave-store";
const EMPTY_PROMPT_DRAFT: PromptDraft = {
  text: "",
  attachedFilePaths: [],
  attachments: [],
};
const WORKSPACE_APP_SURFACE = { kind: "workspace" } satisfies AppActiveSurface;
const FLEET_VIEW_APP_SURFACE = {
  kind: "fleet-view",
} satisfies AppActiveSurface;
const workspaceSwitchMetricsByWorkspaceId = new Map<
  string,
  WorkspaceSwitchMetric
>();
let workspaceSwitchMetricTokenCounter = 0;
let workspaceIdentityRequestTokenCounter = 0;
let activeWorkspaceIdentityRequestToken = 0;
export {
  DEFAULT_PROVIDER_TIMEOUT_MS,
  PROVIDER_TIMEOUT_OPTIONS,
} from "@/lib/providers/runtime-option-contract";

function normalizeAppActiveSurface(value: unknown): AppActiveSurface {
  if (
    value &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "fleet-view"
  ) {
    return FLEET_VIEW_APP_SURFACE;
  }
  return WORKSPACE_APP_SURFACE;
}

function buildWorkspaceInformationReferencesRetrievedContext(args: {
  promptDraft: PromptDraft;
  workspaceInformation: WorkspaceInformationState;
  lensState?: LensReferenceState | null;
}): CanonicalRetrievedContextPart | null {
  const referencesByKey = new Map<string, WorkspaceInformationReference>();
  const addReference = (reference: WorkspaceInformationReference) => {
    const key =
      reference.scope === "section"
        ? `${reference.section}:section`
        : `${reference.section}:item:${reference.itemId ?? ""}`;
    referencesByKey.set(key, reference);
  };

  getPromptDraftAttachments(args.promptDraft)
    .filter(
      (
        attachment,
      ): attachment is Extract<Attachment, { kind: "workspace-information" }> =>
        attachment.kind === "workspace-information",
    )
    .forEach((attachment) => addReference(attachment.reference));

  [
    args.promptDraft.text,
    ...(args.promptDraft.promptBatch ?? []).map((item) => item.content),
    ...(args.promptDraft.queuedTurns ?? []).map((item) => item.content),
  ].forEach((text) => {
    extractWorkspaceInformationReferencesFromText(text).forEach(addReference);
  });

  const references = [...referencesByKey.values()];
  if (references.length === 0) {
    return null;
  }

  const content = formatWorkspaceInformationReferencesContext({
    info: args.workspaceInformation,
    references,
    lens: args.lensState ?? null,
  });
  if (!content.trim()) {
    return null;
  }

  return {
    type: "retrieved_context",
    sourceId: "stave:workspace-information-references",
    title: "Explicit Information Panel References",
    content: [
      "The user explicitly referenced these Information panel entries from the prompt composer.",
      "Treat section references as the full current section and item references as the specific item.",
      ...(references.some((reference) => reference.section === "lens")
        ? [
            "`@lens` refers to the built-in Lens browser panel and its currently loaded page.",
          ]
        : []),
      "",
      content,
    ].join("\n"),
  };
}

function parseCodexGoalSetObjective(content: string): string | null {
  const match = content.trim().match(/^\/goal(?:\s+([\s\S]*))?$/i);
  if (!match) {
    return null;
  }

  const argument = (match[1] ?? "").trim();
  if (!argument) {
    return null;
  }

  const normalizedArgument = argument.toLowerCase();
  if (
    normalizedArgument === "clear" ||
    normalizedArgument === "pause" ||
    normalizedArgument === "resume"
  ) {
    return null;
  }

  return argument;
}

function resolveTaskRuntimeTarget(args: {
  state: Pick<
    AppState,
    | "activeTaskId"
    | "activeWorkspaceId"
    | "taskWorkspaceIdById"
    | "tasks"
    | "workspaceRuntimeCacheById"
    | "messagesByTask"
    | "messageCountByTask"
    | "promptDraftByTask"
    | "workspaceInformation"
    | "editorTabs"
    | "activeEditorTabId"
    | "terminalTabs"
    | "activeTerminalTabId"
    | "layout"
    | "cliSessionTabs"
    | "activeCliSessionTabId"
    | "activeSurface"
    | "openTaskTabIds"
    | "lensTabs"
    | "paneTabMeta"
    | "dockLayout"
    | "activeTurnIdsByTask"
    | "providerSessionByTask"
    | "providerGoalByTask"
    | "nativeSessionReadyByTask"
  >;
  taskId: string;
}) {
  const activeTask =
    args.state.tasks.find((task) => task.id === args.taskId) ?? null;
  if (activeTask) {
    return {
      workspaceId: args.state.activeWorkspaceId,
      isActiveWorkspace: true,
      session: createWorkspaceSessionStateFromAppState(args.state),
      task: activeTask,
    };
  }

  const mappedWorkspaceId = args.state.taskWorkspaceIdById[args.taskId];
  if (mappedWorkspaceId && mappedWorkspaceId !== args.state.activeWorkspaceId) {
    const mappedSession =
      args.state.workspaceRuntimeCacheById[mappedWorkspaceId];
    const mappedTask =
      mappedSession?.tasks.find((task) => task.id === args.taskId) ?? null;
    if (mappedSession && mappedTask) {
      return {
        workspaceId: mappedWorkspaceId,
        isActiveWorkspace: false,
        session: mappedSession,
        task: mappedTask,
      };
    }
  }

  for (const [workspaceId, session] of Object.entries(
    args.state.workspaceRuntimeCacheById,
  )) {
    const task =
      session.tasks.find((candidate) => candidate.id === args.taskId) ?? null;
    if (task) {
      return {
        workspaceId,
        isActiveWorkspace: false,
        session,
        task,
      };
    }
  }

  return null;
}

function clearRestoredTaskProviderSession(args: {
  state: AppState;
  taskId: string;
}) {
  const taskWorkspaceId =
    args.state.taskWorkspaceIdById[args.taskId] ?? args.state.activeWorkspaceId;
  if (taskWorkspaceId && taskWorkspaceId !== args.state.activeWorkspaceId) {
    const cachedSession = args.state.workspaceRuntimeCacheById[taskWorkspaceId];
    if (!cachedSession) {
      return {};
    }
    const { [args.taskId]: _dropped, ...providerSessionByTask } =
      cachedSession.providerSessionByTask;
    const { [args.taskId]: _droppedGoal, ...providerGoalByTask } =
      cachedSession.providerGoalByTask ?? {};
    return {
      workspaceRuntimeCacheById: {
        ...args.state.workspaceRuntimeCacheById,
        [taskWorkspaceId]: {
          ...cachedSession,
          providerSessionByTask,
          providerGoalByTask,
          nativeSessionReadyByTask: {
            ...cachedSession.nativeSessionReadyByTask,
            [args.taskId]: false,
          },
        },
      },
    };
  }

  const { [args.taskId]: _dropped, ...providerSessionByTask } =
    args.state.providerSessionByTask;
  const { [args.taskId]: _droppedGoal, ...providerGoalByTask } =
    args.state.providerGoalByTask;
  return {
    providerSessionByTask,
    providerGoalByTask,
    nativeSessionReadyByTask: {
      ...args.state.nativeSessionReadyByTask,
      [args.taskId]: false,
    },
  };
}

function cleanupRestoredTaskProviderRuntime(args: { taskId: string }) {
  const cleanupTask = window.api?.provider?.cleanupTask;
  if (!cleanupTask) {
    return;
  }
  void cleanupTask({ taskId: args.taskId }).catch((error) => {
    console.warn("[checkpoint-restore] provider cleanup failed", {
      taskId: args.taskId,
      error,
    });
  });
}

function isWorkspaceSwitchMetricLoggingEnabled() {
  return (
    typeof import.meta !== "undefined" &&
    Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
  );
}

function getWorkspaceSwitchMetricNow() {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function getTooLargeEditorTabMetadata(
  data: WorkspaceFileData | WorkspaceImageData | null | undefined,
): Pick<
  EditorTab,
  "contentState" | "baseRevision" | "fileSizeBytes" | "fileSizeLimitBytes"
> | null {
  if (!data?.tooLarge) {
    return null;
  }

  return {
    contentState: "too-large",
    baseRevision: data.revision || null,
    fileSizeBytes: data.sizeBytes,
    fileSizeLimitBytes: data.maxSizeBytes,
  };
}

function beginWorkspaceIdentityRequest() {
  workspaceIdentityRequestTokenCounter += 1;
  activeWorkspaceIdentityRequestToken = workspaceIdentityRequestTokenCounter;
  return activeWorkspaceIdentityRequestToken;
}

function isCurrentWorkspaceIdentityRequest(token: number) {
  return token === activeWorkspaceIdentityRequestToken;
}

function roundWorkspaceSwitchDuration(value: number) {
  return Math.round(value * 100) / 100;
}

function registerWorkspaceSwitchMetric(args: {
  workspaceId: string;
  metric: WorkspaceSwitchMetric;
}) {
  if (!isWorkspaceSwitchMetricLoggingEnabled()) {
    return;
  }
  workspaceSwitchMetricsByWorkspaceId.set(args.workspaceId, args.metric);
}

function logWorkspaceSwitchMetric(args: {
  workspaceId: string;
  token?: number;
  phase: "active" | "files" | "messages";
  extra?: Record<string, unknown>;
}) {
  if (!isWorkspaceSwitchMetricLoggingEnabled()) {
    return;
  }
  const metric = workspaceSwitchMetricsByWorkspaceId.get(args.workspaceId);
  if (!metric || (args.token !== undefined && metric.token !== args.token)) {
    return;
  }
  const now = getWorkspaceSwitchMetricNow();
  console.info("[workspace-switch]", {
    workspaceId: args.workspaceId,
    phase: args.phase,
    cacheHit: metric.cacheHit,
    totalMs: roundWorkspaceSwitchDuration(now - metric.startedAt),
    ...(metric.shellResolvedAt !== undefined
      ? {
          shellMs: roundWorkspaceSwitchDuration(
            metric.shellResolvedAt - metric.startedAt,
          ),
        }
      : {}),
    ...(metric.setRootResolvedAt !== undefined
      ? {
          setRootMs: roundWorkspaceSwitchDuration(
            metric.setRootResolvedAt - metric.startedAt,
          ),
        }
      : {}),
    ...(args.extra ?? {}),
  });
}

interface AppState
  extends
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
  purgeWorkspaceNotifications: (args: { workspaceIds: string[] }) => Promise<void>;
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
  openFleetView: () => void;
  closeFleetView: () => void;
  toggleFleetView: () => void;
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
  resolveApproval: (args: {
    taskId: string;
    messageId: string;
    approved: boolean;
  }) => void;
  resolveUserInput: (args: {
    taskId: string;
    messageId: string;
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

const ARCHIVED_TASK_TURN_NOTICE =
  "Generation stopped because the task was archived before this turn completed.";
export const STAVE_OPEN_SETTINGS_EVENT = "stave:open-settings";
const WORKSPACE_PR_STATUS_FRESH_MS = 4 * 60 * 1000;
const WORKSPACE_PR_STATUS_POLL_CONCURRENCY = 3;

function incrementWorkspaceSnapshotVersion(
  state: Pick<AppState, "workspaceSnapshotVersion">,
) {
  return state.workspaceSnapshotVersion + 1;
}

function incrementPromptDraftPersistenceVersion(
  state: Pick<AppState, "promptDraftPersistenceVersion">,
) {
  return state.promptDraftPersistenceVersion + 1;
}

function normalizeSharedSkillsHomeSetting(value?: string | null) {
  return value?.trim() ?? "";
}

function getRetainedLoadedMessageTaskIds(args: {
  activeTaskId: string;
  activeTurnIdsByTask: Record<string, string | undefined>;
}) {
  const retained = new Set<string>();
  if (args.activeTaskId) {
    retained.add(args.activeTaskId);
  }
  for (const [taskId, turnId] of Object.entries(args.activeTurnIdsByTask)) {
    if (turnId) {
      retained.add(taskId);
    }
  }
  return retained;
}

function compactLoadedMessagesByTask(args: {
  messagesByTask: Record<string, ChatMessage[]>;
  activeTaskId: string;
  activeTurnIdsByTask: Record<string, string | undefined>;
}) {
  const retained = getRetainedLoadedMessageTaskIds({
    activeTaskId: args.activeTaskId,
    activeTurnIdsByTask: args.activeTurnIdsByTask,
  });
  let changed = false;
  const nextEntries = Object.entries(args.messagesByTask).filter(([taskId]) => {
    const keep = retained.has(taskId);
    if (!keep) {
      changed = true;
    }
    return keep;
  });
  return changed ? Object.fromEntries(nextEntries) : args.messagesByTask;
}

function shouldLoadLatestTaskMessages(args: {
  taskId: string;
  messagesByTask: Record<string, ChatMessage[]>;
  messageCountByTask: Record<string, number>;
}) {
  return (
    (args.messagesByTask[args.taskId]?.length ?? 0) === 0 &&
    (args.messageCountByTask[args.taskId] ?? 0) > 0
  );
}

function mergeTaskMessagePage(args: {
  currentMessages: ChatMessage[];
  pageMessages: ChatMessage[];
  mode: "latest" | "older";
}) {
  if (args.mode === "latest") {
    const currentById = new Map(
      args.currentMessages.map((message) => [message.id, message] as const),
    );
    const merged = args.pageMessages.map(
      (message) => currentById.get(message.id) ?? message,
    );
    const seen = new Set(merged.map((message) => message.id));
    for (const message of args.currentMessages) {
      if (!seen.has(message.id)) {
        merged.push(message);
      }
    }
    return merged;
  }

  const seen = new Set(args.currentMessages.map((message) => message.id));
  const olderMessages = args.pageMessages.filter(
    (message) => !seen.has(message.id),
  );
  if (olderMessages.length === 0) {
    return args.currentMessages;
  }
  return [...olderMessages, ...args.currentMessages];
}

function findTaskById(state: Pick<AppState, "tasks">, taskId: string) {
  return state.tasks.find((task) => task.id === taskId) ?? null;
}

function findActiveTerminalLinkableTask(
  args: Pick<AppState, "tasks" | "activeTaskId">,
) {
  if (!args.activeTaskId) {
    return null;
  }
  const task = findTaskById(args, args.activeTaskId);
  if (!task || isTaskArchived(task)) {
    return null;
  }
  return task;
}

function findTerminalTabById(
  state: Pick<AppState, "terminalTabs">,
  tabId: string,
) {
  return state.terminalTabs.find((tab) => tab.id === tabId) ?? null;
}

function findCliSessionTabById(
  state: Pick<AppState, "cliSessionTabs">,
  tabId: string,
) {
  return state.cliSessionTabs.find((tab) => tab.id === tabId) ?? null;
}

function createTerminalTabRecord(args: {
  cwd: string;
  linkedTaskId: string | null;
  linkedTaskTitle?: string | null;
  title?: string;
  existingTitles?: string[];
}) {
  const normalizedTitle = args.title?.trim();
  const baseTitle =
    normalizedTitle ||
    getTerminalTabDefaultTitle({
      cwd: args.cwd,
      linkedTaskTitle: args.linkedTaskTitle,
    });
  const title = normalizedTitle
    ? normalizedTitle
    : (() => {
        const existingTitles = args.existingTitles ?? [];
        if (!existingTitles.includes(baseTitle)) {
          return baseTitle;
        }
        let suffix = 2;
        while (existingTitles.includes(`${baseTitle} ${suffix}`)) {
          suffix += 1;
        }
        return `${baseTitle} ${suffix}`;
      })();
  return {
    id: crypto.randomUUID(),
    title,
    linkedTaskId: args.linkedTaskId,
    backend: "xterm" as const,
    cwd: args.cwd,
    createdAt: Date.now(),
  } satisfies WorkspaceTerminalTab;
}

function buildCliSessionHandoffSummary(args: {
  task: Task;
  messages: ChatMessage[];
  workspacePath: string;
}) {
  const latestUserMessage = [...args.messages]
    .reverse()
    .find((message) => message.role === "user" && message.content.trim());
  const latestAssistantMessage = [...args.messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.content.trim());
  const lines = [
    `Continue the Stave task "${args.task.title}" in this fresh CLI session.`,
    `Workspace path: ${args.workspacePath || "current workspace"}`,
  ];

  if (latestUserMessage?.content.trim()) {
    lines.push("", "Latest user request:", latestUserMessage.content.trim());
  }
  if (latestAssistantMessage?.content.trim()) {
    lines.push(
      "",
      "Latest assistant context:",
      latestAssistantMessage.content.trim(),
    );
  }

  return lines.join("\n").trim();
}

function createCliSessionTabRecord(args: {
  provider: "claude-code" | "codex";
  contextMode: CliSessionContextMode;
  cwd: string;
  linkedTaskId: string | null;
  linkedTaskTitle?: string | null;
  handoffSummary: string;
  existingTitles?: string[];
}) {
  const baseTitle = getCliSessionTabDefaultTitle({
    providerId: args.provider,
    contextMode: args.contextMode,
    linkedTaskTitle: args.linkedTaskTitle,
  });
  const existingTitles = args.existingTitles ?? [];
  const title = !existingTitles.includes(baseTitle)
    ? baseTitle
    : (() => {
        let suffix = 2;
        while (existingTitles.includes(`${baseTitle} ${suffix}`)) {
          suffix += 1;
        }
        return `${baseTitle} ${suffix}`;
      })();

  return {
    id: crypto.randomUUID(),
    title,
    provider: args.provider,
    contextMode: args.contextMode,
    linkedTaskId: args.linkedTaskId,
    linkedTaskTitle: args.linkedTaskTitle ?? null,
    handoffSummary: args.handoffSummary,
    cwd: args.cwd,
    createdAt: Date.now(),
  } satisfies WorkspaceCliSessionTab;
}

function moveItemById<T extends { id: string }>(args: {
  items: T[];
  fromId: string;
  toId: string;
}) {
  const fromIndex = args.items.findIndex((item) => item.id === args.fromId);
  const toIndex = args.items.findIndex((item) => item.id === args.toId);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return args.items;
  }
  const nextItems = [...args.items];
  const [moved] = nextItems.splice(fromIndex, 1);
  if (!moved) {
    return args.items;
  }
  nextItems.splice(toIndex, 0, moved);
  return nextItems;
}

function mergeRecentProjectsByPath(args: {
  persistedProjects: RecentProjectState[];
  stateProjects: RecentProjectState[];
}) {
  const persistedProjects = normalizeRecentProjectStates({
    projects: args.persistedProjects,
  });
  const stateProjects = normalizeRecentProjectStates({
    projects: args.stateProjects,
  });
  let merged = persistedProjects;
  for (const project of stateProjects) {
    const existing = merged.find(
      (item) => item.projectPath === project.projectPath,
    );
    if (!existing || project.lastOpenedAt >= existing.lastOpenedAt) {
      merged = upsertRecentProjectState({
        projects: merged,
        project,
      });
    }
  }
  // Archive tombstones must survive either durable source losing them —
  // otherwise `refreshWorkspaces` re-discovers a preserved dirty worktree and
  // the archived workspace resurrects. Union both sources per project, minus
  // any path that is registered as a live workspace again.
  return merged.map((project) => {
    const persisted = persistedProjects.find(
      (item) => item.projectPath === project.projectPath,
    );
    const fromState = stateProjects.find(
      (item) => item.projectPath === project.projectPath,
    );
    const archivedWorkspacePaths = reconcileArchivedWorkspacePaths({
      primary: persisted?.archivedWorkspacePaths,
      secondary: fromState?.archivedWorkspacePaths,
      workspacePathById: project.workspacePathById,
    });
    const { archivedWorkspacePaths: _current, ...projectRest } = project;
    return {
      ...projectRest,
      ...(archivedWorkspacePaths.length > 0 ? { archivedWorkspacePaths } : {}),
    };
  });
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => {
      const resolveScriptHookWorkspaceContext = (workspaceId: string) => {
        const state = get();
        const projectPath = state.projectPath;
        const workspacePath = state.workspacePathById[workspaceId];
        const branch = state.workspaceBranchById[workspaceId];
        if (!projectPath || !workspacePath || !branch) {
          return null;
        }
        const workspaceName =
          state.workspaces.find((workspace) => workspace.id === workspaceId)
            ?.name ?? branch;
        return {
          workspaceId,
          projectPath,
          workspacePath,
          workspaceName,
          branch,
        };
      };

      // C2 intent guard: after a turn completes, if the workspace has pinned
      // intent anchors, run a single-turn provider check comparing the diff
      // against that pinned intent and surface it as a Changes-panel badge.
      // No-op when nothing is pinned, so it stays disarmed by default.
      const runIntentGuardForTurn = (args: {
        workspaceId: string;
        taskId?: string;
        turnId?: string;
        workspacePath: string;
      }) => {
        const reviewDiff = window.api?.provider?.reviewDiff;
        if (!reviewDiff) {
          return;
        }
        const state = get();
        const info =
          state.activeWorkspaceId === args.workspaceId
            ? state.workspaceInformation
            : state.workspaceRuntimeCacheById[args.workspaceId]
                ?.workspaceInformation;
        if (!info) {
          return;
        }
        const intentContext = collectIntentContext(
          buildIntentGuardContextInput(info),
        );
        if (!intentContext) {
          return;
        }
        const providerId = normalizePrePrReviewProvider(
          state.settings.prePrReviewProvider,
        );
        void reviewDiff({
          cwd: args.workspacePath,
          providerId,
          mode: "intent",
          intentContext,
        })
          .then((result) => {
            if (!result.ok) {
              return;
            }
            const compliance: TurnIntentComplianceResult = {
              workspaceId: args.workspaceId,
              taskId: args.taskId,
              turnId: args.turnId,
              status: deriveIntentComplianceStatus(result.findings),
              findings: result.findings,
              completedAt: Date.now(),
            };
            set((current) => ({
              turnIntentComplianceByWorkspace: {
                ...current.turnIntentComplianceByWorkspace,
                [args.workspaceId]: compliance,
              },
            }));
          })
          .catch((error) => {
            console.warn("[intent-guard] turn.completed check failed", {
              workspaceId: args.workspaceId,
              error: String(error),
            });
          });
      };

      const runScriptHookInBackground = (args: {
        workspaceId: string;
        trigger: ScriptTrigger;
        taskId?: string;
        taskTitle?: string;
        turnId?: string;
      }) => {
        // A new turn invalidates the previous turn's verification badge so it
        // never lingers as a stale ✅ while fresh work is in flight.
        if (args.trigger === "turn.started") {
          set((state) => {
            if (
              state.turnVerificationByWorkspace[args.workspaceId] === undefined
            ) {
              return state;
            }
            const next = { ...state.turnVerificationByWorkspace };
            delete next[args.workspaceId];
            return { turnVerificationByWorkspace: next };
          });
          set((state) => {
            if (
              state.turnIntentComplianceByWorkspace[args.workspaceId] ===
              undefined
            ) {
              return state;
            }
            const next = { ...state.turnIntentComplianceByWorkspace };
            delete next[args.workspaceId];
            return { turnIntentComplianceByWorkspace: next };
          });
        }

        const runScriptHook = window.api?.scripts?.runHook;
        const context = resolveScriptHookWorkspaceContext(args.workspaceId);

        // Intent guard runs independently of verify hooks; it only needs the
        // resolved workspace context (path) to diff against.
        if (args.trigger === "turn.completed" && context) {
          runIntentGuardForTurn({
            workspaceId: args.workspaceId,
            taskId: args.taskId,
            turnId: args.turnId,
            workspacePath: context.workspacePath,
          });
        }

        if (!runScriptHook || !context) {
          return;
        }

        void runScriptHook({
          ...context,
          trigger: args.trigger,
          ...(args.taskId ? { taskId: args.taskId } : {}),
          ...(args.taskTitle ? { taskTitle: args.taskTitle } : {}),
          ...(args.turnId ? { turnId: args.turnId } : {}),
        })
          .then((result) => {
            // Surface turn.completed verify hooks as a Changes-panel badge.
            // Only record when at least one hook entry was configured, so a
            // project without verify hooks shows nothing rather than a
            // misleading green check.
            if (
              args.trigger === "turn.completed" &&
              result.summary &&
              result.summary.totalEntries > 0
            ) {
              const verification = buildTurnVerificationResult({
                workspaceId: args.workspaceId,
                taskId: args.taskId,
                turnId: args.turnId,
                summary: result.summary,
                completedAt: Date.now(),
              });
              set((state) => ({
                turnVerificationByWorkspace: {
                  ...state.turnVerificationByWorkspace,
                  [args.workspaceId]: verification,
                },
              }));
            }
            if (!result.ok && result.summary?.failures.length) {
              console.warn("[workspace-scripts] hook failures", {
                trigger: args.trigger,
                failures: result.summary.failures,
              });
            }
          })
          .catch((error) => {
            console.warn("[workspace-scripts] hook failed", {
              trigger: args.trigger,
              error: String(error),
            });
          });
      };

      const workspaceTurnSummaryRequestIdByWorkspaceId = new Map<
        string,
        string
      >();
      const kickoffResolver = createWorkspaceKickoffResolver({
        getState: get,
      });
      const providerTurnStallTimerByTask = new Map<
        string,
        ReturnType<typeof globalThis.setTimeout>
      >();

      const clearProviderTurnStallTimer = (taskId: string) => {
        const handle = providerTurnStallTimerByTask.get(taskId);
        if (handle == null) {
          return;
        }
        globalThis.clearTimeout(handle);
        providerTurnStallTimerByTask.delete(taskId);
      };

      const scheduleProviderTurnStallTimer = (args: {
        taskId: string;
        turnId: string;
        lastEventAt: number;
      }) => {
        clearProviderTurnStallTimer(args.taskId);
        const providerId =
          get().providerTurnActivityByTask[args.taskId]?.providerId;
        const delayMs = Math.max(
          0,
          resolveProviderTurnStallThresholdMs({ providerId }) -
            (Date.now() - args.lastEventAt),
        );
        const handle = globalThis.setTimeout(() => {
          providerTurnStallTimerByTask.delete(args.taskId);
          set((state) => {
            // `state.activeTurnIdsByTask` only covers the active workspace;
            // resolve the owning workspace session so turns running in a
            // backgrounded workspace can still be marked stalled.
            const owningWorkspaceId =
              state.taskWorkspaceIdById[args.taskId] ?? state.activeWorkspaceId;
            const owningSession = owningWorkspaceId
              ? getWorkspaceSessionForState({
                  state,
                  workspaceId: owningWorkspaceId,
                })
              : null;
            if (
              owningSession?.activeTurnIdsByTask[args.taskId] !== args.turnId
            ) {
              return state;
            }
            const nextActivityByTask = markProviderTurnStalled({
              activityByTask: state.providerTurnActivityByTask,
              taskId: args.taskId,
              turnId: args.turnId,
            });
            if (nextActivityByTask === state.providerTurnActivityByTask) {
              return state;
            }
            return {
              providerTurnActivityByTask: nextActivityByTask,
            };
          });
        }, delayMs);
        providerTurnStallTimerByTask.set(args.taskId, handle);
      };

      const dispatchNextQueuedTaskTurn = createQueuedTaskTurnDispatcher({
        getSession: (workspaceId) =>
          getWorkspaceSessionForState({ state: get(), workspaceId }),
        getActions: get,
      });

      const hasAsyncIterable = (
        value: unknown,
      ): value is AsyncIterable<unknown> => {
        if (!value || typeof value !== "object") {
          return false;
        }
        return Symbol.asyncIterator in value;
      };

      const collectProviderEvents = async (
        value: unknown,
      ): Promise<NormalizedProviderEvent[]> => {
        const resolved = await value;
        if (Array.isArray(resolved)) {
          return resolved as NormalizedProviderEvent[];
        }
        if (!hasAsyncIterable(resolved)) {
          return [];
        }
        const events: NormalizedProviderEvent[] = [];
        for await (const item of resolved) {
          events.push(item as NormalizedProviderEvent);
        }
        return events;
      };

      const persistWorkspaceSessionInBackground = (args: {
        workspaceId: string;
        session: WorkspaceSessionState;
      }) => {
        const latestState = get();
        scheduleWorkspaceSnapshotPersist({
          workspaceId: args.workspaceId,
          workspaceName: resolveWorkspaceName({
            state: latestState,
            workspaceId: args.workspaceId,
          }),
          activeTaskId: args.session.activeTaskId,
          tasks: args.session.tasks,
          messagesByTask: args.session.messagesByTask,
          promptDraftByTask: args.session.promptDraftByTask,
          workspaceInformation: args.session.workspaceInformation,
          editorTabs: args.session.editorTabs,
          activeEditorTabId: args.session.activeEditorTabId,
          terminalTabs: args.session.terminalTabs,
          activeTerminalTabId: args.session.activeTerminalTabId,
          terminalDocked: args.session.terminalDocked,
          cliSessionTabs: args.session.cliSessionTabs,
          activeCliSessionTabId: args.session.activeCliSessionTabId,
          activeSurface: args.session.activeSurface,
          openTaskTabIds: args.session.openTaskTabIds,
          lensTabs: args.session.lensTabs,
          paneTabMeta: args.session.paneTabMeta,
          dockLayout: args.session.dockLayout,
          providerSessionByTask: args.session.providerSessionByTask,
        });
      };

      const applyWorkspaceTurnSummaryToState = (args: {
        workspaceId: string;
        summary: ReturnType<typeof createWorkspaceTurnSummary>;
      }) => {
        let didUpdate = false;

        set((state) => {
          const cachedSession =
            state.workspaceRuntimeCacheById[args.workspaceId];
          const currentWorkspaceInformation =
            args.workspaceId === state.activeWorkspaceId
              ? state.workspaceInformation
              : cachedSession?.workspaceInformation;
          if (!currentWorkspaceInformation) {
            return state;
          }

          const currentSummary =
            currentWorkspaceInformation.turnSummary ?? null;
          if (
            currentSummary?.turnId === args.summary.turnId &&
            currentSummary.requestSummary === args.summary.requestSummary &&
            currentSummary.workSummary === args.summary.workSummary &&
            currentSummary.model === args.summary.model
          ) {
            return state;
          }

          didUpdate = true;
          const nextWorkspaceInformation = {
            ...currentWorkspaceInformation,
            turnSummary: args.summary,
          };

          if (args.workspaceId === state.activeWorkspaceId) {
            return {
              workspaceInformation: nextWorkspaceInformation,
              workspaceRuntimeCacheById: cachedSession
                ? {
                    ...state.workspaceRuntimeCacheById,
                    [args.workspaceId]: {
                      ...cachedSession,
                      workspaceInformation: nextWorkspaceInformation,
                    },
                  }
                : state.workspaceRuntimeCacheById,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          }

          if (!cachedSession) {
            return state;
          }

          return {
            workspaceRuntimeCacheById: {
              ...state.workspaceRuntimeCacheById,
              [args.workspaceId]: {
                ...cachedSession,
                workspaceInformation: nextWorkspaceInformation,
              },
            },
          };
        });

        if (!didUpdate) {
          return;
        }

        const latestSession = getWorkspaceSessionForState({
          state: get(),
          workspaceId: args.workspaceId,
        });
        if (latestSession) {
          persistWorkspaceSessionInBackground({
            workspaceId: args.workspaceId,
            session: latestSession,
          });
        }
      };

      const generateWorkspaceTurnSummaryInBackground = (args: {
        workspaceId: string;
        taskId: string;
        turnId: string;
      }) => {
        const state = get();
        const session = getWorkspaceSessionForState({
          state,
          workspaceId: args.workspaceId,
        });
        if (!session) {
          return;
        }

        const currentSummary = session.workspaceInformation.turnSummary ?? null;
        if (currentSummary?.turnId === args.turnId) {
          return;
        }

        const task =
          session.tasks.find((item) => item.id === args.taskId) ?? null;
        const messages = session.messagesByTask[args.taskId] ?? [];
        const latestUserMessage = [...messages]
          .reverse()
          .find((message) => message.role === "user" && message.content.trim());
        const latestAssistantMessage = [...messages]
          .reverse()
          .find(
            (message) => message.role === "assistant" && message.content.trim(),
          );
        const summaryPrompt = state.settings.workspaceTurnSummaryPrompt.trim();
        if (!summaryPrompt) {
          return;
        }
        if (
          !latestUserMessage?.content.trim() &&
          !latestAssistantMessage?.content.trim()
        ) {
          return;
        }

        const workspacePath = resolveWorkspacePathForId({
          activeWorkspaceId: state.activeWorkspaceId,
          workspaceId: args.workspaceId,
          workspacePathById: state.workspacePathById,
          workspaceDefaultById: state.workspaceDefaultById,
          projectPath: state.projectPath,
        });
        const settingsSnapshot = state.settings;
        const primaryModel = normalizeModelSelection({
          value: settingsSnapshot.workspaceTurnSummaryPrimaryModel,
          fallback: defaultSettings.workspaceTurnSummaryPrimaryModel,
        });
        const fallbackModel = normalizeModelSelection({
          value: settingsSnapshot.workspaceTurnSummaryFallbackModel,
          fallback: defaultSettings.workspaceTurnSummaryFallbackModel,
        });
        const candidateModels = [
          ...new Set(
            [primaryModel.trim(), fallbackModel.trim()].filter(Boolean),
          ),
        ];
        if (candidateModels.length === 0) {
          return;
        }

        const prompt = buildWorkspaceTurnSummaryPrompt({
          instructionPrompt: summaryPrompt,
          taskTitle: task?.title ?? null,
          userRequest:
            latestUserMessage?.content.trim() ||
            task?.title ||
            "No user request was captured for this turn.",
          assistantResponse:
            latestAssistantMessage?.content.trim() ||
            "The assistant completed the turn without a plain-text reply.",
        });
        const requestId = `${args.turnId}:${Date.now()}`;
        workspaceTurnSummaryRequestIdByWorkspaceId.set(
          args.workspaceId,
          requestId,
        );

        void (async () => {
          for (const model of candidateModels) {
            if (
              workspaceTurnSummaryRequestIdByWorkspaceId.get(
                args.workspaceId,
              ) !== requestId
            ) {
              return;
            }

            const providerId = inferProviderIdFromModel({ model });
            const runtimeOptions = {
              ...buildProviderRuntimeOptions({
                provider: providerId,
                model,
                settings: settingsSnapshot,
              }),
              chatStreamingEnabled: false,
              responseStylePrompt: undefined,
              promptPrDescription: undefined,
              promptInlineCompletion: undefined,
              ...(providerId === "claude-code"
                ? {
                    claudeAllowedTools: [],
                    claudeMaxTurns: 1,
                    claudePermissionMode: "dontAsk" as const,
                    claudeAgentProgressSummaries: false,
                    claudeFastMode: true,
                  }
                : providerId === "codex"
                  ? {
                      codexApprovalPolicy: "never" as const,
                      codexFileAccess: "read-only" as const,
                      codexNetworkAccess: false,
                      codexWebSearch: "disabled" as const,
                      codexReasoningSummary: "none" as const,
                      codexShowRawReasoning: false,
                      codexPlanMode: false,
                      codexFastMode: true,
                    }
                  : {}),
            };

            if (window.api?.provider?.checkAvailability) {
              try {
                const availability =
                  await window.api.provider.checkAvailability({
                    providerId,
                    runtimeOptions,
                  });
                if (!availability.ok || !availability.available) {
                  continue;
                }
              } catch {
                continue;
              }
            }

            try {
              const streamTurn = window.api?.provider?.streamTurn;
              if (!streamTurn) {
                return;
              }
              const events = await collectProviderEvents(
                streamTurn({
                  providerId,
                  prompt,
                  cwd: workspacePath ?? undefined,
                  runtimeOptions,
                }),
              );
              const responseText = events
                .filter(
                  (
                    event,
                  ): event is Extract<
                    NormalizedProviderEvent,
                    { type: "text" }
                  > => event.type === "text",
                )
                .map((event) => event.text)
                .join("")
                .trim();
              const parsedSummary = responseText
                ? parseWorkspaceTurnSummaryResponse(responseText)
                : null;
              if (!parsedSummary) {
                continue;
              }

              if (
                workspaceTurnSummaryRequestIdByWorkspaceId.get(
                  args.workspaceId,
                ) !== requestId
              ) {
                return;
              }

              applyWorkspaceTurnSummaryToState({
                workspaceId: args.workspaceId,
                summary: createWorkspaceTurnSummary({
                  turnId: args.turnId,
                  taskId: args.taskId,
                  taskTitle: task?.title ?? "Untitled Task",
                  model,
                  generatedAt: new Date().toISOString(),
                  draft: parsedSummary,
                }),
              });
              return;
            } catch {
              continue;
            }
          }
        })().finally(() => {
          if (
            workspaceTurnSummaryRequestIdByWorkspaceId.get(args.workspaceId) ===
            requestId
          ) {
            workspaceTurnSummaryRequestIdByWorkspaceId.delete(args.workspaceId);
          }
        });
      };

      const activateProject = async (args: {
        projectRootPath: string;
        projectName: string;
        files: string[];
        defaultBranch: string;
      }) => {
        await get().flushActiveWorkspaceSnapshot({ sync: true });
        const stateBeforeSwitch = get();
        const savedWorkspaceRuntimeCacheById = saveActiveWorkspaceRuntimeCache({
          state: stateBeforeSwitch,
        });
        const rememberedProjects = captureCurrentProjectState({
          recentProjects: stateBeforeSwitch.recentProjects,
          projectPath: stateBeforeSwitch.projectPath,
          projectName: stateBeforeSwitch.projectName,
          defaultBranch: stateBeforeSwitch.defaultBranch,
          workspaces: stateBeforeSwitch.workspaces,
          activeWorkspaceId: stateBeforeSwitch.activeWorkspaceId,
          workspaceBranchById: stateBeforeSwitch.workspaceBranchById,
          workspacePathById: stateBeforeSwitch.workspacePathById,
          workspaceDefaultById: stateBeforeSwitch.workspaceDefaultById,
        });
        const existingProject =
          rememberedProjects.find(
            (project) => project.projectPath === args.projectRootPath,
          ) ?? null;
        const nextWorkspaceFileCacheByPath = rememberCachedWorkspaceFiles({
          workspaceFileCacheByPath: stateBeforeSwitch.workspaceFileCacheByPath,
          workspacePath: args.projectRootPath,
          files: args.files,
        });

        if (stateBeforeSwitch.projectPath === args.projectRootPath) {
          set((state) => ({
            recentProjects: upsertRecentProjectState({
              projects: rememberedProjects,
              project: {
                ...(existingProject ?? {
                  projectPath: args.projectRootPath,
                  projectName: args.projectName,
                  lastOpenedAt: new Date().toISOString(),
                  defaultBranch: args.defaultBranch,
                  workspaces: state.workspaces,
                  activeWorkspaceId: state.activeWorkspaceId,
                  workspaceBranchById: state.workspaceBranchById,
                  workspacePathById: state.workspacePathById,
                  workspaceDefaultById: state.workspaceDefaultById,
                  ...resolveRecentProjectPreferences({
                    projectPath: args.projectRootPath,
                    recentProjects: rememberedProjects,
                  }),
                }),
                projectName: args.projectName,
                defaultBranch: args.defaultBranch,
                lastOpenedAt: new Date().toISOString(),
              },
            }),
            defaultBranch: args.defaultBranch,
            projectName: args.projectName,
            projectFiles:
              args.files.length > 0 ? args.files : state.projectFiles,
            workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
            workspaceRuntimeCacheById: savedWorkspaceRuntimeCacheById,
          }));
          return;
        }

        await workspaceFsAdapter.setRoot?.({
          rootPath: args.projectRootPath,
          rootName: args.projectName,
          files: args.files,
        });

        if (existingProject) {
          const nextProject = {
            ...cloneRecentProjectState(existingProject),
            projectName: args.projectName,
            defaultBranch: args.defaultBranch,
            lastOpenedAt: new Date().toISOString(),
          };
          const nextProjectWorkspaceIds = nextProject.workspaces.map(
            (workspace) => workspace.id,
          );
          const cachedActiveWorkspaceState = nextProject.activeWorkspaceId
            ? savedWorkspaceRuntimeCacheById[nextProject.activeWorkspaceId]
            : undefined;
          const initialWorkspaceState =
            cachedActiveWorkspaceState ??
            buildWorkspaceSessionState({ snapshot: null });
          set(() => ({
            hasHydratedWorkspaces: false,
            workspaceSnapshotVersion: 0,
            promptDraftPersistenceVersion: 0,
            taskMessagesLoadingByTask: {},
            workspaces: nextProject.workspaces,
            activeWorkspaceId: nextProject.activeWorkspaceId,
            activeAppSurface: WORKSPACE_APP_SURFACE,
            projectPath: args.projectRootPath,
            recentProjects: upsertRecentProjectState({
              projects: rememberedProjects,
              project: nextProject,
            }),
            defaultBranch: nextProject.defaultBranch,
            workspaceBranchById: nextProject.workspaceBranchById,
            workspacePathById: nextProject.workspacePathById,
            workspaceDefaultById: nextProject.workspaceDefaultById,
            projectName: args.projectName,
            projectFiles: args.files,
            workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
            workspaceRuntimeCacheById: savedWorkspaceRuntimeCacheById,
            taskWorkspaceIdById: registerTaskWorkspaceOwnership({
              taskWorkspaceIdById: retainTaskWorkspaceOwnership({
                taskWorkspaceIdById: stateBeforeSwitch.taskWorkspaceIdById,
                workspaceIds: nextProjectWorkspaceIds,
              }),
              workspaceId: nextProject.activeWorkspaceId,
              tasks: initialWorkspaceState.tasks,
            }),
            ...initialWorkspaceState,
            layout: {
              ...stateBeforeSwitch.layout,
              terminalDocked: initialWorkspaceState.terminalDocked,
              editorDiffMode: resolveEditorDiffMode({
                editorTabs: initialWorkspaceState.editorTabs,
                activeEditorTabId: initialWorkspaceState.activeEditorTabId,
              }),
              editorMarkdownPreviewMode: false,
            },
          }));
          await get().hydrateWorkspaces();
          return;
        }

        const defaultWorkspaceId = buildProjectDefaultWorkspaceId({
          projectPath: args.projectRootPath,
        });
        const now = new Date().toISOString();

        // Check if this workspace already has persisted data before overwriting.
        // When localStorage is cleared (e.g. dev-mode port change or origin switch),
        // the project won't appear in recentProjects even though the DB still holds
        // its tasks and messages.  Loading the existing snapshot prevents data loss.
        const existingShellSummary = await loadWorkspaceShellSummary({
          workspaceId: defaultWorkspaceId,
        });

        let workspaceState: ReturnType<
          typeof buildWorkspaceSessionStateFromShell
        >;
        let deferredWorkspaceMessageHydration: {
          workspaceId: string;
          activeTaskIdForLatestHydration: string | null;
          taskIds: string[];
          latestTurns: PersistedTurnSummary[];
        } | null = null;
        if (existingShellSummary) {
          const loadedWorkspaceShellState =
            await loadWorkspaceShellStateFromPersistence({
              workspaceId: defaultWorkspaceId,
            });
          workspaceState = loadedWorkspaceShellState.workspaceState;
          deferredWorkspaceMessageHydration = {
            workspaceId: defaultWorkspaceId,
            activeTaskIdForLatestHydration:
              loadedWorkspaceShellState.activeTaskIdForLatestHydration,
            taskIds: loadedWorkspaceShellState.initialTaskIds,
            latestTurns: loadedWorkspaceShellState.latestTurns,
          };
        } else {
          const empty = createEmptyWorkspaceState();
          await persistWorkspaceSnapshot({
            workspaceId: defaultWorkspaceId,
            workspaceName: defaultWorkspaceName,
            activeTaskId: empty.activeTaskId,
            tasks: empty.tasks,
            messagesByTask: empty.messagesByTask,
            promptDraftByTask: empty.promptDraftByTask,
            editorTabs: empty.editorTabs,
            activeEditorTabId: empty.activeEditorTabId,
            terminalTabs: empty.terminalTabs,
            activeTerminalTabId: empty.activeTerminalTabId,
            terminalDocked: empty.terminalDocked,
            cliSessionTabs: empty.cliSessionTabs,
            activeCliSessionTabId: empty.activeCliSessionTabId,
            activeSurface: empty.activeSurface,
            providerSessionByTask: empty.providerSessionByTask,
          });
          workspaceState = buildWorkspaceSessionState({
            snapshot: createWorkspaceSnapshot({
              activeTaskId: empty.activeTaskId,
              tasks: empty.tasks,
              messagesByTask: empty.messagesByTask,
              promptDraftByTask: empty.promptDraftByTask,
              editorTabs: empty.editorTabs,
              activeEditorTabId: empty.activeEditorTabId,
              terminalTabs: empty.terminalTabs,
              activeTerminalTabId: empty.activeTerminalTabId,
              terminalDocked: empty.terminalDocked,
              cliSessionTabs: empty.cliSessionTabs,
              activeCliSessionTabId: empty.activeCliSessionTabId,
              activeSurface: empty.activeSurface,
              providerSessionByTask: empty.providerSessionByTask,
            }),
          });
        }
        const nextProject = {
          projectPath: args.projectRootPath,
          projectName: args.projectName,
          lastOpenedAt: now,
          defaultBranch: args.defaultBranch,
          workspaces: [
            {
              id: defaultWorkspaceId,
              name: defaultWorkspaceName,
              updatedAt: now,
            },
          ],
          activeWorkspaceId: defaultWorkspaceId,
          workspaceBranchById: { [defaultWorkspaceId]: args.defaultBranch },
          workspacePathById: { [defaultWorkspaceId]: args.projectRootPath },
          workspaceDefaultById: { [defaultWorkspaceId]: true },
          projectBasePrompt: "",
          kickoffBranchNamingRule: "",
          newWorkspaceInitCommand: "",
          newWorkspaceUseRootNodeModulesSymlink: false,
        } satisfies RecentProjectState;
        const nextProjectWorkspaceIds = nextProject.workspaces.map(
          (workspace) => workspace.id,
        );

        set(() => ({
          hasHydratedWorkspaces: true,
          workspaceSnapshotVersion: 0,
          workspaces: nextProject.workspaces,
          activeWorkspaceId: nextProject.activeWorkspaceId,
          activeAppSurface: WORKSPACE_APP_SURFACE,
          projectPath: args.projectRootPath,
          recentProjects: upsertRecentProjectState({
            projects: rememberedProjects,
            project: nextProject,
          }),
          defaultBranch: args.defaultBranch,
          workspaceBranchById: nextProject.workspaceBranchById,
          workspacePathById: nextProject.workspacePathById,
          workspaceDefaultById: nextProject.workspaceDefaultById,
          ...workspaceState,
          layout: {
            ...get().layout,
            terminalDocked: workspaceState.terminalDocked,
            editorDiffMode: resolveEditorDiffMode({
              editorTabs: workspaceState.editorTabs,
              activeEditorTabId: workspaceState.activeEditorTabId,
            }),
            editorMarkdownPreviewMode: false,
          },
          projectName: args.projectName,
          projectFiles: args.files,
          workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
          workspaceRuntimeCacheById: savedWorkspaceRuntimeCacheById,
          taskWorkspaceIdById: registerTaskWorkspaceOwnership({
            taskWorkspaceIdById: retainTaskWorkspaceOwnership({
              taskWorkspaceIdById: stateBeforeSwitch.taskWorkspaceIdById,
              workspaceIds: nextProjectWorkspaceIds,
            }),
            workspaceId: nextProject.activeWorkspaceId,
            tasks: workspaceState.tasks,
          }),
        }));
        if (deferredWorkspaceMessageHydration?.activeTaskIdForLatestHydration) {
          void loadTaskMessagesIntoSession({
            workspaceId: defaultWorkspaceId,
            taskId:
              deferredWorkspaceMessageHydration.activeTaskIdForLatestHydration,
            mode: "latest",
          });
        }
        if (deferredWorkspaceMessageHydration) {
          hydrateWorkspaceMessagesInBackground(
            deferredWorkspaceMessageHydration,
          );
        }
      };

      const attentionSync = createNotificationAttentionSync({
        getNotifications: () => get().notifications,
        markRead: (args) => get().markNotificationRead(args),
        getReviewSurface: () => {
          const state = get();
          return {
            activeWorkspaceId: state.activeWorkspaceId,
            visibleTaskId:
              state.activeAppSurface.kind === "workspace" &&
              state.activeSurface.kind === "task"
                ? state.activeSurface.taskId
                : null,
            windowFocused:
              typeof document !== "undefined" &&
              typeof document.hasFocus === "function" &&
              document.hasFocus(),
          };
        },
      });

      const persistNotification = async (
        notification: AppNotificationCreateInput,
      ) => {
        try {
          const result = await createPersistedNotification({ notification });
          if (!result.notification) {
            return null;
          }
          const notificationId = result.notification.id;
          set((state) => ({
            notifications: mergeNotificationIntoList({
              notifications: state.notifications,
              notification: result.notification!,
            }),
          }));
          const unreadCount = get().notifications.filter(
            (item) => !item.readAt,
          ).length;
          void window.api?.notifications?.setBadge?.({ count: unreadCount });
          const {
            nativeNotificationsEnabled,
            notificationSoundEnabled,
            notificationSoundVolume,
            notificationSoundPreset,
            notificationSoundMode,
            notificationSoundCustomAudioData,
          } = get().settings;
          if (
            notificationSoundEnabled &&
            (result.notification.kind === "task.turn_completed" ||
              result.notification.kind === "task.turn_failed")
          ) {
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
          }
          if (nativeNotificationsEnabled) {
            const isFocused =
              typeof document !== "undefined" &&
              typeof document.hasFocus === "function" &&
              document.hasFocus();
            const sameWorkspace =
              !result.notification.workspaceId ||
              result.notification.workspaceId === get().activeWorkspaceId;
            void window.api?.notifications?.showNative?.({
              notificationId: result.notification.id,
              title: result.notification.title,
              body: result.notification.body,
              suppress: isFocused && sameWorkspace,
            });
          }
          showNotificationToast(result.notification, {
            onOpen: () =>
              void get().openNotificationContext({
                notificationId,
                targetSurface: "task",
              }),
          });
          attentionSync.noteTurnOutcome(result.notification);
          return result.notification;
        } catch (error) {
          console.error(
            "[notifications] failed to persist notification",
            error,
          );
          return null;
        }
      };

      const persistNotifications = async (
        notifications: AppNotificationCreateInput[],
      ) => {
        for (const notification of notifications) {
          await persistNotification(notification);
        }
      };

      const openNotificationContextInternal = async (
        notification: AppNotification,
        options: { targetSurface?: "task" | "fleet" } = {},
      ): Promise<NotificationContextOpenResult> => {
        const projectPath = notification.projectPath?.trim();
        if (projectPath && projectPath !== get().projectPath) {
          await get().openProject({ projectPath });
        }

        const afterProjectOpen = get();
        const workspaceId = notification.workspaceId?.trim();
        if (workspaceId) {
          const workspaceExists = afterProjectOpen.workspaces.some(
            (workspace) => workspace.id === workspaceId,
          );
          if (!workspaceExists) {
            return { status: "opened" };
          }
          if (afterProjectOpen.activeWorkspaceId !== workspaceId) {
            await afterProjectOpen.switchWorkspace({ workspaceId });
          }
          if (get().activeWorkspaceId !== workspaceId) {
            return { status: "opened" };
          }
        }

        const afterWorkspaceOpen = get();
        const taskId = notification.taskId?.trim();
        if (!taskId) {
          return { status: "opened" };
        }

        const targetTask = afterWorkspaceOpen.tasks.find(
          (task) => task.id === taskId,
        );
        if (!targetTask) {
          return { status: "opened" };
        }
        if (isTaskArchived(targetTask)) {
          return {
            status: "archived-task",
            taskId,
            taskTitle:
              targetTask.title.trim() ||
              notification.taskTitle?.trim() ||
              "Untitled Task",
          };
        }

        if (isNotificationAttentionKind(notification.kind)) {
          await get().focusTaskAttention({
            taskId,
            workspaceId,
            projectPath,
          });
          if (options.targetSurface === "fleet") {
            get().openFleetView();
          }
          return { status: "opened" };
        }

        if (options.targetSurface === "fleet") {
          await get().focusTaskAttention({
            taskId,
            workspaceId,
            projectPath,
          });
          get().openFleetView();
          return { status: "opened" };
        }

        afterWorkspaceOpen.selectTask({ taskId });
        return { status: "opened" };
      };

      const loadWorkspaceSessionFromPersistence = async (args: {
        workspaceId: string;
        appendInterruptedNotices?: boolean;
      }) => {
        const [shell, latestTurns] = await Promise.all([
          loadWorkspaceShellForRestore({ workspaceId: args.workspaceId }),
          listActiveWorkspaceTurns({ workspaceId: args.workspaceId }),
        ]);
        const initialTaskIds = new Set<string>();
        if (shell?.activeTaskId) {
          initialTaskIds.add(shell.activeTaskId);
        }
        for (const turn of latestTurns) {
          if (!turn.completedAt) {
            initialTaskIds.add(turn.taskId);
          }
        }
        const pageEntries = await Promise.all(
          [...initialTaskIds].map(async (taskId) => ({
            taskId,
            page: await loadTaskMessagesPage({
              workspaceId: args.workspaceId,
              taskId,
              limit: TASK_MESSAGES_PAGE_SIZE,
              offset: 0,
            }),
          })),
        );
        const workspaceState = buildWorkspaceSessionStateFromShell({
          shell,
          messagesByTask: Object.fromEntries(
            pageEntries.map(
              ({ taskId, page }) => [taskId, page.messages] as const,
            ),
          ),
          messageCountByTaskOverrides: Object.fromEntries(
            pageEntries.map(
              ({ taskId, page }) => [taskId, page.totalCount] as const,
            ),
          ),
          latestTurns,
          appendInterruptedNotices: args.appendInterruptedNotices,
        });
        return { shell, latestTurns, workspaceState };
      };

      const loadWorkspaceShellStateFromPersistence = async (args: {
        workspaceId: string;
      }) => {
        const [shell, latestTurns] = await Promise.all([
          loadWorkspaceShellForRestore({ workspaceId: args.workspaceId }),
          listActiveWorkspaceTurns({ workspaceId: args.workspaceId }),
        ]);
        const interruptedTaskIds = new Set(
          latestTurns
            .filter((turn) => !turn.completedAt)
            .map((turn) => turn.taskId),
        );
        const activeTaskId =
          shell?.activeTaskId &&
          ((shell.messageCountByTask[shell.activeTaskId] ?? 0) > 0 ||
            interruptedTaskIds.has(shell.activeTaskId))
            ? shell.activeTaskId
            : null;
        const initialTaskIds = new Set<string>();
        for (const taskId of interruptedTaskIds) {
          initialTaskIds.add(taskId);
        }
        const workspaceState = buildWorkspaceSessionStateFromShell({
          shell,
          latestTurns,
        });
        return {
          shell,
          activeTaskIdForLatestHydration: activeTaskId,
          latestTurns,
          initialTaskIds: [...initialTaskIds],
          workspaceState:
            interruptedTaskIds.size > 0
              ? {
                  ...workspaceState,
                  activeTurnIdsByTask: {},
                }
              : workspaceState,
        };
      };

      const hydrateDeferredEditorTab = async (args: {
        workspaceId: string;
        tabId: string;
      }) => {
        let filePath = "";
        let shouldHydrate = false;

        set((state) => {
          if (state.activeWorkspaceId !== args.workspaceId) {
            return {};
          }
          const targetTab = state.editorTabs.find(
            (tab) => tab.id === args.tabId,
          );
          if (
            !targetTab ||
            targetTab.contentState === "ready" ||
            targetTab.contentState === "loading" ||
            targetTab.contentState === "too-large"
          ) {
            return {};
          }
          filePath = targetTab.filePath;
          shouldHydrate = true;
          return {
            editorTabs: state.editorTabs.map((tab) =>
              tab.id === args.tabId
                ? {
                    ...tab,
                    contentState: "loading",
                  }
                : tab,
            ),
          };
        });

        if (!shouldHydrate) {
          return;
        }

        let body = null as
          | Awaited<ReturnType<typeof loadWorkspaceEditorTabBodies>>[number]
          | null;
        let tooLargeMetadata: ReturnType<typeof getTooLargeEditorTabMetadata> =
          null;
        try {
          body =
            (
              await loadWorkspaceEditorTabBodies({
                workspaceId: args.workspaceId,
                tabIds: [args.tabId],
              })
            )[0] ?? null;
        } catch {
          body = null;
        }

        if (!body && filePath) {
          const state = get();
          const workspaceRootPath =
            state.workspacePathById[args.workspaceId] || state.projectPath;
          let fileData = await workspaceFsAdapter.readFile({
            filePath,
          });
          if (!fileData && workspaceRootPath) {
            await workspaceFsAdapter.setRoot?.({
              rootPath: workspaceRootPath,
              rootName: state.projectName ?? "project",
            });
            fileData = await workspaceFsAdapter.readFile({
              filePath,
            });
          }
          if (fileData) {
            tooLargeMetadata = getTooLargeEditorTabMetadata(fileData);
            if (!tooLargeMetadata) {
              body = {
                id: args.tabId,
                content: fileData.content,
                originalContent: fileData.content,
                savedContent: fileData.content,
              };
            }
          }
        }

        set((state) => {
          if (state.activeWorkspaceId !== args.workspaceId) {
            return {};
          }
          const targetTab = state.editorTabs.find(
            (tab) => tab.id === args.tabId,
          );
          if (!targetTab || targetTab.contentState !== "loading") {
            return {};
          }
          return {
            editorTabs: state.editorTabs.map((tab) => {
              if (tab.id !== args.tabId) {
                return tab;
              }
              if (tooLargeMetadata) {
                return {
                  ...tab,
                  content: "",
                  contentState: "too-large",
                  originalContent: undefined,
                  savedContent: undefined,
                  baseRevision: tooLargeMetadata.baseRevision,
                  fileSizeBytes: tooLargeMetadata.fileSizeBytes,
                  fileSizeLimitBytes: tooLargeMetadata.fileSizeLimitBytes,
                  hasConflict: false,
                  isDirty: false,
                };
              }
              if (!body) {
                return {
                  ...tab,
                  contentState: "deferred",
                };
              }
              return {
                ...tab,
                content: body.content,
                contentState: "ready",
                ...(body.originalContent !== undefined
                  ? { originalContent: body.originalContent }
                  : {}),
                ...(body.savedContent !== undefined
                  ? { savedContent: body.savedContent }
                  : {}),
              };
            }),
          };
        });
      };

      const loadTaskMessagesIntoSession = async (args: {
        workspaceId: string;
        taskId: string;
        mode: "latest" | "older";
      }) => {
        const stateBefore = get();
        const ownerWorkspaceId =
          stateBefore.taskWorkspaceIdById[args.taskId] ??
          stateBefore.activeWorkspaceId;
        if (
          !args.taskId ||
          !ownerWorkspaceId ||
          ownerWorkspaceId !== args.workspaceId
        ) {
          return;
        }
        if (stateBefore.taskMessagesLoadingByTask[args.taskId]) {
          return;
        }
        const currentSession =
          args.workspaceId === stateBefore.activeWorkspaceId
            ? stateBefore
            : stateBefore.workspaceRuntimeCacheById[args.workspaceId];
        if (!currentSession) {
          return;
        }
        const currentMessages =
          currentSession.messagesByTask[args.taskId] ?? [];
        const totalCount =
          currentSession.messageCountByTask[args.taskId] ??
          currentMessages.length;
        if (args.mode === "latest" && currentMessages.length > 0) {
          return;
        }
        if (args.mode === "older" && currentMessages.length >= totalCount) {
          return;
        }

        set((state) => ({
          taskMessagesLoadingByTask: {
            ...state.taskMessagesLoadingByTask,
            [args.taskId]: true,
          },
        }));

        try {
          const page = await loadTaskMessagesPage({
            workspaceId: args.workspaceId,
            taskId: args.taskId,
            limit:
              args.mode === "latest"
                ? resolveInitialLatestTaskMessagesPageSize()
                : TASK_MESSAGES_PAGE_SIZE,
            offset: args.mode === "older" ? currentMessages.length : 0,
          });
          set((state) => {
            const targetSession = getWorkspaceSessionForState({
              state,
              workspaceId: args.workspaceId,
            });
            if (!targetSession) {
              return {
                taskMessagesLoadingByTask: {
                  ...state.taskMessagesLoadingByTask,
                  [args.taskId]: false,
                },
              };
            }
            const sessionMessages =
              targetSession.messagesByTask[args.taskId] ?? [];
            const nextMessages = mergeTaskMessagePage({
              currentMessages: sessionMessages,
              pageMessages: page.messages,
              mode: args.mode,
            });
            const nextLoadingState = {
              ...state.taskMessagesLoadingByTask,
              [args.taskId]: false,
            };
            if (args.workspaceId === state.activeWorkspaceId) {
              return {
                messagesByTask: {
                  ...state.messagesByTask,
                  [args.taskId]: nextMessages,
                },
                messageCountByTask: {
                  ...state.messageCountByTask,
                  [args.taskId]: Math.max(page.totalCount, nextMessages.length),
                },
                taskMessagesLoadingByTask: nextLoadingState,
              };
            }
            return {
              workspaceRuntimeCacheById: {
                ...state.workspaceRuntimeCacheById,
                [args.workspaceId]: {
                  ...targetSession,
                  messagesByTask: {
                    ...targetSession.messagesByTask,
                    [args.taskId]: nextMessages,
                  },
                  messageCountByTask: {
                    ...targetSession.messageCountByTask,
                    [args.taskId]: Math.max(
                      page.totalCount,
                      nextMessages.length,
                    ),
                  },
                },
              },
              taskMessagesLoadingByTask: nextLoadingState,
            };
          });
          attentionSync.syncTaskInteractions({
            taskId: args.taskId,
            messages:
              getWorkspaceSessionForState({
                state: get(),
                workspaceId: args.workspaceId,
              })?.messagesByTask[args.taskId] ?? [],
          });
        } catch (error) {
          console.error("[workspace] failed to load task messages", error);
          set((state) => ({
            taskMessagesLoadingByTask: {
              ...state.taskMessagesLoadingByTask,
              [args.taskId]: false,
            },
          }));
        }
      };

      const hydrateWorkspaceMessagesInBackground = (args: {
        workspaceId: string;
        taskIds: string[];
        latestTurns: PersistedTurnSummary[];
        switchMetricToken?: number;
      }) => {
        const taskIds = [...new Set(args.taskIds.filter(Boolean))];
        if (taskIds.length === 0) {
          return;
        }

        const interruptedTurnByTaskId = new Map(
          args.latestTurns
            .filter((turn) => !turn.completedAt)
            .map((turn) => [turn.taskId, turn] as const),
        );

        set((state) => {
          let changed = false;
          const nextTaskMessagesLoadingByTask = {
            ...state.taskMessagesLoadingByTask,
          };
          for (const taskId of taskIds) {
            if (nextTaskMessagesLoadingByTask[taskId] === true) {
              continue;
            }
            nextTaskMessagesLoadingByTask[taskId] = true;
            changed = true;
          }
          return changed
            ? { taskMessagesLoadingByTask: nextTaskMessagesLoadingByTask }
            : state;
        });

        void Promise.allSettled(
          taskIds.map(async (taskId) => ({
            taskId,
            page: await loadTaskMessagesPage({
              workspaceId: args.workspaceId,
              taskId,
              limit: TASK_MESSAGES_PAGE_SIZE,
              offset: 0,
            }),
          })),
        )
          .then((results) => {
            set((state) => {
              const nextTaskMessagesLoadingByTask = {
                ...state.taskMessagesLoadingByTask,
              };
              for (const taskId of taskIds) {
                nextTaskMessagesLoadingByTask[taskId] = false;
              }

              const targetSession = getWorkspaceSessionForState({
                state,
                workspaceId: args.workspaceId,
              });
              if (!targetSession) {
                return {
                  taskMessagesLoadingByTask: nextTaskMessagesLoadingByTask,
                };
              }

              const messagesPatch: Record<string, ChatMessage[]> = {};
              const messageCountPatch: Record<string, number> = {};

              for (const result of results) {
                if (result.status !== "fulfilled") {
                  continue;
                }
                const sessionMessages =
                  targetSession.messagesByTask[result.value.taskId] ?? [];
                const mergedMessages = mergeTaskMessagePage({
                  currentMessages: sessionMessages,
                  pageMessages: result.value.page.messages,
                  mode: "latest",
                });
                const interruptedTurn = interruptedTurnByTaskId.get(
                  result.value.taskId,
                );
                const nextMessages = interruptedTurn
                  ? (appendInterruptedTurnNotices({
                      messagesByTask: { [result.value.taskId]: mergedMessages },
                      latestTurns: [interruptedTurn],
                      messageCountByTask: {
                        [result.value.taskId]: result.value.page.totalCount,
                      },
                    })[result.value.taskId] ?? mergedMessages)
                  : mergedMessages;
                messagesPatch[result.value.taskId] = nextMessages;
                messageCountPatch[result.value.taskId] = Math.max(
                  result.value.page.totalCount,
                  nextMessages.length,
                );
              }

              if (Object.keys(messagesPatch).length === 0) {
                return {
                  taskMessagesLoadingByTask: nextTaskMessagesLoadingByTask,
                };
              }

              if (args.workspaceId === state.activeWorkspaceId) {
                return {
                  messagesByTask: {
                    ...state.messagesByTask,
                    ...messagesPatch,
                  },
                  messageCountByTask: {
                    ...state.messageCountByTask,
                    ...messageCountPatch,
                  },
                  taskMessagesLoadingByTask: nextTaskMessagesLoadingByTask,
                };
              }

              return {
                workspaceRuntimeCacheById: {
                  ...state.workspaceRuntimeCacheById,
                  [args.workspaceId]: {
                    ...targetSession,
                    messagesByTask: {
                      ...targetSession.messagesByTask,
                      ...messagesPatch,
                    },
                    messageCountByTask: {
                      ...targetSession.messageCountByTask,
                      ...messageCountPatch,
                    },
                  },
                },
                taskMessagesLoadingByTask: nextTaskMessagesLoadingByTask,
              };
            });
            // Turns that died with the previous app session get their pending
            // requests interrupted during hydration, so their durable needs must
            // be settled too instead of waiting in Fleet forever.
            const hydrated = getWorkspaceSessionForState({
              state: get(),
              workspaceId: args.workspaceId,
            });
            for (const taskId of taskIds) {
              attentionSync.syncTaskInteractions({
                taskId,
                messages: hydrated?.messagesByTask[taskId] ?? [],
              });
            }
            logWorkspaceSwitchMetric({
              workspaceId: args.workspaceId,
              token: args.switchMetricToken,
              phase: "messages",
              extra: {
                taskCount: taskIds.length,
              },
            });
          })
          .catch((error) => {
            console.error(
              "[workspace] failed to hydrate initial task messages",
              error,
            );
            set((state) => ({
              taskMessagesLoadingByTask: {
                ...state.taskMessagesLoadingByTask,
                ...Object.fromEntries(
                  taskIds.map((taskId) => [taskId, false] as const),
                ),
              },
            }));
          });
      };

      const refreshWorkspaceFilesInBackground = (args: {
        workspaceId: string;
        workspacePath: string;
        switchMetricToken?: number;
      }) => {
        const stateBeforeRefresh = get();
        const activeWorkspacePath = resolveWorkspacePathForId({
          activeWorkspaceId: stateBeforeRefresh.activeWorkspaceId,
          workspacePathById: stateBeforeRefresh.workspacePathById,
          workspaceDefaultById: stateBeforeRefresh.workspaceDefaultById,
          projectPath: stateBeforeRefresh.projectPath,
        });
        if (
          stateBeforeRefresh.activeWorkspaceId !== args.workspaceId ||
          normalizeComparablePath(activeWorkspacePath) !==
            normalizeComparablePath(args.workspacePath) ||
          normalizeComparablePath(workspaceFsAdapter.getRootPath?.()) !==
            normalizeComparablePath(args.workspacePath)
        ) {
          return;
        }
        void workspaceFsAdapter
          .listFiles()
          .then((files) => {
            set((state) => {
              if (
                state.activeWorkspaceId !== args.workspaceId ||
                normalizeComparablePath(workspaceFsAdapter.getRootPath?.()) !==
                  normalizeComparablePath(args.workspacePath)
              ) {
                return state;
              }
              const nextWorkspaceFileCacheByPath = rememberCachedWorkspaceFiles(
                {
                  workspaceFileCacheByPath: state.workspaceFileCacheByPath,
                  workspacePath: args.workspacePath,
                  files,
                },
              );
              const activeWorkspacePath = resolveWorkspacePathForId({
                activeWorkspaceId: state.activeWorkspaceId,
                workspacePathById: state.workspacePathById,
                workspaceDefaultById: state.workspaceDefaultById,
                projectPath: state.projectPath,
              });
              const shouldUpdateActiveFiles =
                state.activeWorkspaceId === args.workspaceId &&
                activeWorkspacePath === args.workspacePath &&
                !areStringArraysEqual(state.projectFiles, files);
              if (
                !shouldUpdateActiveFiles &&
                nextWorkspaceFileCacheByPath === state.workspaceFileCacheByPath
              ) {
                return state;
              }
              return {
                workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
                ...(shouldUpdateActiveFiles ? { projectFiles: files } : {}),
              };
            });
            logWorkspaceSwitchMetric({
              workspaceId: args.workspaceId,
              token: args.switchMetricToken,
              phase: "files",
              extra: {
                fileCount: files.length,
              },
            });
          })
          .catch((error) => {
            console.warn("[workspace] failed to refresh workspace files", {
              workspaceId: args.workspaceId,
              workspacePath: args.workspacePath,
              error: String(error),
            });
          });
      };

      return {
        hasHydratedWorkspaces: false,
        workspaceSnapshotVersion: 0,
        promptDraftPersistenceVersion: 0,
        workspaces: [],
        activeWorkspaceId: "",
        projectPath: null,
        recentProjects: [],
        defaultBranch: "main",
        workspaceBranchById: {},
        workspacePathById: {},
        workspaceDefaultById: {},
        workspacePrInfoById: {},
        rateLimitsSnapshot: null,
        rateLimitsLoading: false,
        rateLimitsError: null,
        isDarkMode: true,
        activeTaskId: "",
        draftProvider: "claude-code",
        promptDraftByTask: {},
        workspaceInformation: createEmptyWorkspaceInformation(),
        promptFocusNonce: 0,
        providerCommandCatalogRefreshNonce: 0,
        workspacePlansRefreshNonce: 0,
        tasks: [],
        messagesByTask: {},
        messageCountByTask: {},
        taskMessagesLoadingByTask: {},
        layout: {
          workspaceSidebarWidth: WORKSPACE_SIDEBAR_MIN_WIDTH,
          workspaceSidebarCollapsed: false,
          workspaceSidebarItemDisplayMode:
            DEFAULT_WORKSPACE_SIDEBAR_ITEM_DISPLAY_MODE,
          explorerPanelWidth: 300,
          sidebarOverlayVisible: false,
          sidebarOverlayTab: "explorer",
          terminalDocked: false,
          editorDiffMode: false,
          editorMarkdownPreviewMode: false,
        },
        settings: defaultSettings,
        editorTabs: [],
        activeEditorTabId: null,
        terminalTabs: [],
        activeTerminalTabId: null,
        cliSessionTabs: [],
        activeCliSessionTabId: null,
        activeAppSurface: WORKSPACE_APP_SURFACE,
        activeSurface: { kind: "task", taskId: "" },
        openTaskTabIds: [],
        lensTabs: [],
        paneTabMeta: {},
        dockLayout: null,
        focusPendingInteractionRequest: null,
        scrollToLatestMessageRequest: null,
        pendingCloseEditorTabId: null,
        pendingEditorSelection: null,
        projectName: null,
        projectFiles: workspaceFsAdapter.getKnownFiles(),
        workspaceFileCacheByPath: {},
        taskCheckpointById: {},
        providerAvailability: createDefaultProviderAvailability(),
        skillCatalog: {
          status: "idle",
          workspacePath: null,
          sharedSkillsHome: null,
          fetchedAt: null,
          skills: [],
          roots: [],
          detail: "Skill catalog has not been loaded yet.",
        },
        notifications: [],
        reviewCommentsByTask: {},
        compareRunsById: {},
        activeCompareRunId: null,
        activeTurnIdsByTask: {},
        hostOwnedTurnIdsByTask: {},
        providerTurnActivityByTask: {},
        nativeSessionReadyByTask: {},
        providerSessionByTask: {},
        providerGoalByTask: {},
        turnVerificationByWorkspace: {},
        turnIntentComplianceByWorkspace: {},
        workspaceRuntimeCacheById: {},
        taskWorkspaceIdById: {},
        persistenceBootstrapPhase: "idle",
        persistenceBootstrapMessage: "",
        hydrateProjectRegistry: async () => {
          const rawPersistedProjects =
            (await loadProjectRegistrySnapshot()) as RecentProjectState[];
          const persistedProjects = normalizeRecentProjectStates({
            projects: rawPersistedProjects,
          });
          if (persistedProjects.length === 0) {
            return;
          }
          const state = get();
          const mergedProjects = mergeRecentProjectsByPath({
            persistedProjects,
            stateProjects: state.recentProjects,
          });
          const currentProject = state.projectPath
            ? (mergedProjects.find(
                (project) => project.projectPath === state.projectPath,
              ) ?? null)
            : null;
          if (
            currentProject ||
            mergedProjects.length !== state.recentProjects.length
          ) {
            set(() => ({
              recentProjects: mergedProjects,
              ...(currentProject
                ? {
                    projectName: normalizeProjectDisplayName({
                      projectPath: currentProject.projectPath,
                      projectName:
                        state.projectName?.trim() || currentProject.projectName,
                    }),
                    defaultBranch:
                      state.defaultBranch || currentProject.defaultBranch,
                  }
                : {}),
            }));
          }
          if (
            JSON.stringify(rawPersistedProjects) !==
            JSON.stringify(mergedProjects)
          ) {
            await saveProjectRegistrySnapshot({
              projects: mergedProjects,
            });
          }
        },
        flushProjectRegistry: async () => {
          const state = get();
          const projects = captureCurrentProjectState({
            recentProjects: state.recentProjects,
            projectPath: state.projectPath,
            projectName: state.projectPath
              ? normalizeProjectDisplayName({
                  projectPath: state.projectPath,
                  projectName: state.projectName,
                })
              : null,
            defaultBranch: state.defaultBranch,
            workspaces: state.workspaces,
            activeWorkspaceId: state.activeWorkspaceId,
            workspaceBranchById: state.workspaceBranchById,
            workspacePathById: state.workspacePathById,
            workspaceDefaultById: state.workspaceDefaultById,
          });
          await saveProjectRegistrySnapshot({
            projects,
          });
        },
        hydrateWorkspaces: async () => {
          const workspaceIdentityRequestToken = beginWorkspaceIdentityRequest();
          await get().hydrateProjectRegistry();
          let initialRows = await listWorkspaceSummaries();
          const stateBeforeHydrate = get();
          const currentProject = stateBeforeHydrate.projectPath
            ? (stateBeforeHydrate.recentProjects.find(
                (project) =>
                  project.projectPath === stateBeforeHydrate.projectPath,
              ) ?? null)
            : null;
          const rememberedWorkspaceIds = new Set([
            ...(currentProject?.workspaces.map((workspace) => workspace.id) ??
              stateBeforeHydrate.workspaces.map((workspace) => workspace.id)),
            ...Object.keys(
              currentProject?.workspacePathById ??
                stateBeforeHydrate.workspacePathById,
            ),
          ]);
          const currentProjectDefaultWorkspaceId =
            resolveCurrentProjectDefaultWorkspaceId({
              projectPath: stateBeforeHydrate.projectPath,
              workspaces:
                currentProject?.workspaces ?? stateBeforeHydrate.workspaces,
              workspaceDefaultById:
                currentProject?.workspaceDefaultById ??
                stateBeforeHydrate.workspaceDefaultById,
              workspacePathById:
                currentProject?.workspacePathById ??
                stateBeforeHydrate.workspacePathById,
            });
          if (initialRows.length === 0 && stateBeforeHydrate.projectPath) {
            await persistWorkspaceSnapshot({
              workspaceId: currentProjectDefaultWorkspaceId,
              workspaceName: defaultWorkspaceName,
              activeTaskId: "",
              tasks: [],
              messagesByTask: {},
              promptDraftByTask: {},
              editorTabs: [],
              activeEditorTabId: null,
              terminalTabs: [],
              activeTerminalTabId: null,
              terminalDocked: false,
              cliSessionTabs: [],
              activeCliSessionTabId: null,
              activeSurface: { kind: "task", taskId: "" },
              providerSessionByTask: {},
            });
            initialRows = await listWorkspaceSummaries();
          }
          const persistedRowsById = new Map(
            initialRows.map((workspace) => [workspace.id, workspace] as const),
          );
          const rememberedRows =
            currentProject?.workspaces ?? stateBeforeHydrate.workspaces;
          let rows =
            rememberedWorkspaceIds.size > 0
              ? rememberedRows.map(
                  (workspace) =>
                    persistedRowsById.get(workspace.id) ?? workspace,
                )
              : initialRows;
          if (rows.length === 0 && stateBeforeHydrate.projectPath) {
            rows = [
              {
                id: currentProjectDefaultWorkspaceId,
                name: defaultWorkspaceName,
                updatedAt: new Date().toISOString(),
              },
            ];
          }
          const defaultWorkspaceId = resolveCurrentProjectDefaultWorkspaceId({
            projectPath: stateBeforeHydrate.projectPath,
            workspaces: rows,
            workspaceDefaultById:
              currentProject?.workspaceDefaultById ??
              stateBeforeHydrate.workspaceDefaultById,
            workspacePathById:
              currentProject?.workspacePathById ??
              stateBeforeHydrate.workspacePathById,
          });
          const branchById: Record<string, string> = {
            ...(currentProject?.workspaceBranchById ??
              stateBeforeHydrate.workspaceBranchById),
          };
          const pathById: Record<string, string> = {
            ...(currentProject?.workspacePathById ??
              stateBeforeHydrate.workspacePathById),
          };
          const archivedWorktreePathSet = getArchivedWorktreePathSetForProject({
            projectPath: stateBeforeHydrate.projectPath,
            recentProjects: stateBeforeHydrate.recentProjects,
          });
          if (archivedWorktreePathSet.size > 0) {
            const archivedRowIds = rows
              .filter((row) => {
                if (row.id === defaultWorkspaceId) {
                  return false;
                }
                const comparablePath = normalizeComparablePath(
                  pathById[row.id] ??
                    (stateBeforeHydrate.projectPath
                      ? `${stateBeforeHydrate.projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`
                      : null),
                );
                return archivedWorktreePathSet.has(comparablePath);
              })
              .map((row) => row.id);
            if (archivedRowIds.length > 0) {
              const archivedRowIdSet = new Set(archivedRowIds);
              rows = rows.filter((row) => !archivedRowIdSet.has(row.id));
              for (const workspaceId of archivedRowIds) {
                delete branchById[workspaceId];
                delete pathById[workspaceId];
              }
            }
          }

          // Worktree cleanup: remove DB workspaces whose git worktrees no longer exist
          const runner = window.api?.terminal?.runCommand;
          const projectPath = stateBeforeHydrate.projectPath;
          const linkedWorktreePathSet = getLinkedWorktreePathSetForProject({
            projectPath: stateBeforeHydrate.projectPath,
            recentProjects: stateBeforeHydrate.recentProjects,
          });
          if (runner && projectPath) {
            await runner({ cwd: projectPath, command: "git worktree prune" });
            const listResult = await runner({
              cwd: projectPath,
              command: "git worktree list --porcelain",
            });
            if (listResult.ok) {
              const discoveredWorktrees = parseGitWorktrees({
                stdout: listResult.stdout,
              });
              const rowPathEntries = await Promise.all(
                rows.map(async (row) => {
                  const comparablePath = normalizeComparablePath(
                    pathById[row.id] ??
                      (row.id === defaultWorkspaceId
                        ? projectPath
                        : `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`),
                  );
                  const snapshotScore =
                    row.id === defaultWorkspaceId
                      ? Number.MAX_SAFE_INTEGER
                      : summarizeWorkspaceShell(
                          await loadWorkspaceShellSummary({
                            workspaceId: row.id,
                          }),
                        );
                  return {
                    row,
                    comparablePath,
                    snapshotScore,
                  };
                }),
              );
              const bestRowByPath = new Map<
                string,
                { row: WorkspaceSummary; snapshotScore: number }
              >();
              for (const entry of rowPathEntries) {
                if (!entry.comparablePath) {
                  continue;
                }
                const existing = bestRowByPath.get(entry.comparablePath);
                if (
                  !existing ||
                  entry.snapshotScore > existing.snapshotScore ||
                  (entry.snapshotScore === existing.snapshotScore &&
                    entry.row.updatedAt > existing.row.updatedAt)
                ) {
                  bestRowByPath.set(entry.comparablePath, {
                    row: entry.row,
                    snapshotScore: entry.snapshotScore,
                  });
                }
              }
              rows = rows.filter((row) => {
                const comparablePath = normalizeComparablePath(
                  pathById[row.id] ??
                    (row.id === defaultWorkspaceId
                      ? projectPath
                      : `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`),
                );
                if (!comparablePath) {
                  return true;
                }
                return bestRowByPath.get(comparablePath)?.row.id === row.id;
              });
              const registeredPaths = new Set(
                discoveredWorktrees
                  .map((entry) => normalizeComparablePath(entry.path))
                  .filter(Boolean),
              );
              const staleIds: string[] = [];
              for (const row of rows) {
                if (row.id === defaultWorkspaceId) continue;
                const wsPath =
                  pathById[row.id] ??
                  `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`;
                const comparableWsPath = normalizeComparablePath(wsPath);
                if (
                  !registeredPaths.has(comparableWsPath) &&
                  !linkedWorktreePathSet.has(comparableWsPath)
                ) {
                  staleIds.push(row.id);
                }
              }
              for (const id of staleIds) {
                await closeWorkspacePersistence({ workspaceId: id });
              }
              if (staleIds.length > 0) {
                rows = rows.filter((row) => !staleIds.includes(row.id));
                for (const id of staleIds) {
                  delete pathById[id];
                  delete branchById[id];
                }
              }

              for (const row of rows) {
                const isDefault = row.id === defaultWorkspaceId;
                if (!branchById[row.id]) {
                  branchById[row.id] = isDefault
                    ? stateBeforeHydrate.defaultBranch
                    : row.name;
                }
                if (!pathById[row.id]) {
                  pathById[row.id] = isDefault
                    ? projectPath
                    : `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`;
                }
              }

              const knownPaths = new Set(
                rows
                  .map((row) =>
                    normalizeComparablePath(
                      pathById[row.id] ??
                        (row.id === defaultWorkspaceId
                          ? projectPath
                          : `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`),
                    ),
                  )
                  .filter(Boolean),
              );
              const currentProjectPath = normalizeComparablePath(projectPath);

              for (const worktree of discoveredWorktrees) {
                const normalizedWorktreePath = normalizeComparablePath(
                  worktree.path,
                );
                if (
                  !worktree.branch ||
                  !normalizedWorktreePath ||
                  normalizedWorktreePath === currentProjectPath ||
                  knownPaths.has(normalizedWorktreePath) ||
                  archivedWorktreePathSet.has(normalizedWorktreePath)
                ) {
                  continue;
                }

                const workspaceName = resolveImportedWorktreeName({
                  branch: worktree.branch,
                  worktreePath: worktree.path,
                });
                let matchedWorkspace =
                  rows.find((row) => {
                    const comparablePath = normalizeComparablePath(
                      pathById[row.id] ??
                        (row.id === defaultWorkspaceId
                          ? projectPath
                          : `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`),
                    );
                    return comparablePath === normalizedWorktreePath;
                  }) ?? null;

                if (!matchedWorkspace) {
                  const candidateRows = initialRows.filter((row) => {
                    if (row.id === defaultWorkspaceId) {
                      return false;
                    }
                    const comparablePath = normalizeComparablePath(
                      pathById[row.id] ??
                        `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`,
                    );
                    return (
                      comparablePath === normalizedWorktreePath ||
                      row.name === workspaceName
                    );
                  });
                  if (candidateRows.length > 0) {
                    const scoredCandidates = await Promise.all(
                      candidateRows.map(async (row) => ({
                        row,
                        score: summarizeWorkspaceShell(
                          await loadWorkspaceShellSummary({
                            workspaceId: row.id,
                          }),
                        ),
                      })),
                    );
                    scoredCandidates.sort(
                      (left, right) =>
                        right.score - left.score ||
                        right.row.updatedAt.localeCompare(left.row.updatedAt),
                    );
                    matchedWorkspace = scoredCandidates[0]?.row ?? null;
                  }
                }

                const workspaceId =
                  matchedWorkspace?.id ??
                  buildImportedWorktreeWorkspaceId({
                    projectPath,
                    worktreePath: worktree.path,
                  });
                const persistedWorkspace =
                  matchedWorkspace ??
                  rows.find((row) => row.id === workspaceId) ??
                  persistedRowsById.get(workspaceId);

                if (!persistedWorkspace) {
                  await persistWorkspaceSnapshot({
                    workspaceId,
                    workspaceName,
                    activeTaskId: "",
                    tasks: [],
                    messagesByTask: {},
                    promptDraftByTask: {},
                    editorTabs: [],
                    activeEditorTabId: null,
                    terminalTabs: [],
                    activeTerminalTabId: null,
                    terminalDocked: false,
                    cliSessionTabs: [],
                    activeCliSessionTabId: null,
                    activeSurface: { kind: "task", taskId: "" },
                    providerSessionByTask: {},
                  });
                }

                if (!rows.some((row) => row.id === workspaceId)) {
                  rows = [
                    ...rows,
                    persistedWorkspace ?? {
                      id: workspaceId,
                      name: workspaceName,
                      updatedAt: new Date().toISOString(),
                    },
                  ];
                }

                branchById[workspaceId] = worktree.branch;
                pathById[workspaceId] = worktree.path;
                knownPaths.add(normalizedWorktreePath);
              }
            }
          }

          for (const row of rows) {
            const isDefault = row.id === defaultWorkspaceId;
            if (!branchById[row.id]) {
              branchById[row.id] = isDefault
                ? stateBeforeHydrate.defaultBranch
                : row.name;
            }
            if (!pathById[row.id] && projectPath) {
              pathById[row.id] = isDefault
                ? projectPath
                : `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: row.name })}`;
            }
          }

          const preferredWorkspaceId = rows.some(
            (workspace) =>
              workspace.id === stateBeforeHydrate.activeWorkspaceId,
          )
            ? stateBeforeHydrate.activeWorkspaceId
            : (rows.find((workspace) => workspace.id === defaultWorkspaceId)
                ?.id ??
              rows[0]?.id ??
              "");
          const cachedWorkspaceState = preferredWorkspaceId
            ? stateBeforeHydrate.workspaceRuntimeCacheById[preferredWorkspaceId]
            : undefined;
          const loadedWorkspaceShellState =
            preferredWorkspaceId &&
            (!cachedWorkspaceState ||
              shouldReloadWorkspaceShellFromPersistence({
                cachedWorkspaceState,
              }))
              ? await loadWorkspaceShellStateFromPersistence({
                  workspaceId: preferredWorkspaceId,
                })
              : null;
          const preferLoadedWorkspaceState = shouldPreferLoadedWorkspaceState({
            cachedWorkspaceState,
            loadedWorkspaceShellState,
          });

          const preferredWorkspacePath = pathById[preferredWorkspaceId] ?? null;
          const projectFiles = resolveInitialWorkspaceFiles({
            workspacePath: preferredWorkspacePath,
            activeProjectPath: stateBeforeHydrate.projectPath,
            activeProjectFiles: stateBeforeHydrate.projectFiles,
            workspaceFileCacheByPath:
              stateBeforeHydrate.workspaceFileCacheByPath,
          });
          if (preferredWorkspacePath) {
            await workspaceFsAdapter.setRoot?.({
              rootPath: preferredWorkspacePath,
              rootName: stateBeforeHydrate.projectPath
                ? normalizeProjectDisplayName({
                    projectPath: stateBeforeHydrate.projectPath,
                    projectName: stateBeforeHydrate.projectName,
                  })
                : "project",
              files: projectFiles,
            });
          }

          set((state) => {
            if (
              !isCurrentWorkspaceIdentityRequest(
                workspaceIdentityRequestToken,
              ) ||
              normalizeComparablePath(state.projectPath) !==
                normalizeComparablePath(stateBeforeHydrate.projectPath)
            ) {
              return state;
            }
            const workspaceState =
              (preferLoadedWorkspaceState
                ? loadedWorkspaceShellState?.workspaceState
                : (cachedWorkspaceState ??
                  loadedWorkspaceShellState?.workspaceState)) ??
              buildWorkspaceSessionState({ snapshot: null });
            const workspaceIds = rows.map((workspace) => workspace.id);
            const nextRuntimeCacheById =
              preferLoadedWorkspaceState && preferredWorkspaceId
                ? Object.fromEntries(
                    Object.entries(state.workspaceRuntimeCacheById).filter(
                      ([workspaceId]) => workspaceId !== preferredWorkspaceId,
                    ),
                  )
                : state.workspaceRuntimeCacheById;
            const staleWorkspacePaths = rememberedRows
              .filter(
                (workspace) => !rows.some((row) => row.id === workspace.id),
              )
              .map(
                (workspace) =>
                  (currentProject?.workspacePathById ??
                    stateBeforeHydrate.workspacePathById)[workspace.id] ??
                  (workspace.id === defaultWorkspaceId
                    ? stateBeforeHydrate.projectPath
                    : null),
              );

            return {
              hasHydratedWorkspaces: true,
              workspaceSnapshotVersion: 0,
              promptDraftPersistenceVersion: 0,
              taskMessagesLoadingByTask: {},
              workspaces: rows,
              activeWorkspaceId: preferredWorkspaceId,
              recentProjects: state.projectPath
                ? upsertRecentProjectState({
                    projects: state.recentProjects,
                    project: {
                      projectPath: state.projectPath,
                      projectName: normalizeProjectDisplayName({
                        projectPath: state.projectPath,
                        projectName: state.projectName,
                      }),
                      lastOpenedAt: new Date().toISOString(),
                      defaultBranch: state.defaultBranch,
                      workspaces: rows,
                      activeWorkspaceId: preferredWorkspaceId,
                      workspaceBranchById: branchById,
                      workspacePathById: pathById,
                      workspaceDefaultById: defaultWorkspaceId
                        ? { [defaultWorkspaceId]: true }
                        : {},
                      ...resolveRecentProjectPreferences({
                        projectPath: state.projectPath,
                        recentProjects: state.recentProjects,
                      }),
                    },
                  })
                : state.recentProjects,
              workspaceDefaultById: defaultWorkspaceId
                ? { [defaultWorkspaceId]: true }
                : {},
              workspaceBranchById: branchById,
              workspacePathById: pathById,
              projectFiles,
              workspaceFileCacheByPath: rememberCachedWorkspaceFiles({
                workspaceFileCacheByPath: removeCachedWorkspaceFiles({
                  workspaceFileCacheByPath: state.workspaceFileCacheByPath,
                  workspacePaths: staleWorkspacePaths,
                }),
                workspacePath: preferredWorkspacePath,
                files: projectFiles,
              }),
              workspaceRuntimeCacheById: nextRuntimeCacheById,
              taskWorkspaceIdById: registerTaskWorkspaceOwnership({
                taskWorkspaceIdById: retainTaskWorkspaceOwnership({
                  taskWorkspaceIdById: state.taskWorkspaceIdById,
                  workspaceIds,
                }),
                workspaceId: preferredWorkspaceId,
                tasks: workspaceState.tasks,
              }),
              ...workspaceState,
              layout: {
                ...state.layout,
                terminalDocked: workspaceState.terminalDocked,
                editorDiffMode: resolveEditorDiffMode({
                  editorTabs: workspaceState.editorTabs,
                  activeEditorTabId: workspaceState.activeEditorTabId,
                }),
                editorMarkdownPreviewMode: false,
              },
            };
          });
          if (
            !isCurrentWorkspaceIdentityRequest(workspaceIdentityRequestToken) ||
            get().activeWorkspaceId !== preferredWorkspaceId
          ) {
            return;
          }
          if (
            loadedWorkspaceShellState &&
            (preferLoadedWorkspaceState || !cachedWorkspaceState)
          ) {
            if (loadedWorkspaceShellState.activeTaskIdForLatestHydration) {
              void loadTaskMessagesIntoSession({
                workspaceId: preferredWorkspaceId,
                taskId:
                  loadedWorkspaceShellState.activeTaskIdForLatestHydration,
                mode: "latest",
              });
            }
            hydrateWorkspaceMessagesInBackground({
              workspaceId: preferredWorkspaceId,
              taskIds: loadedWorkspaceShellState.initialTaskIds,
              latestTurns: loadedWorkspaceShellState.latestTurns,
            });
          }
          if (preferredWorkspaceId && preferredWorkspacePath) {
            refreshWorkspaceFilesInBackground({
              workspaceId: preferredWorkspaceId,
              workspacePath: preferredWorkspacePath,
            });
          }
        },
        refreshWorkspaces: async () => {
          const state = get();
          if (!state.hasHydratedWorkspaces || !state.projectPath) {
            return;
          }
          const runner = window.api?.terminal?.runCommand;
          if (!runner) {
            return;
          }
          const projectPath = state.projectPath;
          const persistedRowsById = new Map(
            (await listWorkspaceSummaries()).map(
              (workspace) => [workspace.id, workspace] as const,
            ),
          );

          // Prune and list current git worktrees.
          await runner({ cwd: projectPath, command: "git worktree prune" });
          const listResult = await runner({
            cwd: projectPath,
            command: "git worktree list --porcelain",
          });
          if (!listResult.ok) {
            return;
          }
          const discoveredWorktrees = parseGitWorktrees({
            stdout: listResult.stdout,
          });

          const defaultWorkspaceId = resolveCurrentProjectDefaultWorkspaceId({
            projectPath,
            workspaces: state.workspaces,
            workspaceDefaultById: state.workspaceDefaultById,
            workspacePathById: state.workspacePathById,
          });
          const archivedWorktreePathSet = getArchivedWorktreePathSetForProject({
            projectPath,
            recentProjects: state.recentProjects,
          });
          const linkedWorktreePathSet = getLinkedWorktreePathSetForProject({
            projectPath,
            recentProjects: state.recentProjects,
          });

          // Build set of known workspace paths for quick lookup.
          const knownPathToId = new Map<string, string>();
          for (const workspace of state.workspaces) {
            const wsPath = normalizeComparablePath(
              state.workspacePathById[workspace.id] ??
                (workspace.id === defaultWorkspaceId
                  ? projectPath
                  : `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: workspace.name })}`),
            );
            if (wsPath) {
              knownPathToId.set(wsPath, workspace.id);
            }
          }

          const registeredWorktreePaths = new Set(
            discoveredWorktrees
              .map((entry) => normalizeComparablePath(entry.path))
              .filter(Boolean),
          );
          const currentProjectPath = normalizeComparablePath(projectPath);

          // Detect new worktrees not yet tracked as workspaces.
          const newRows: WorkspaceSummary[] = [];
          const newBranchById: Record<string, string> = {};
          const newPathById: Record<string, string> = {};
          for (const worktree of discoveredWorktrees) {
            const normalizedWorktreePath = normalizeComparablePath(
              worktree.path,
            );
            if (
              !worktree.branch ||
              !normalizedWorktreePath ||
              normalizedWorktreePath === currentProjectPath ||
              knownPathToId.has(normalizedWorktreePath) ||
              // Skip worktrees the user archived; re-registering preserved
              // dirty worktrees is the "archive resurrection" bug.
              archivedWorktreePathSet.has(normalizedWorktreePath)
            ) {
              continue;
            }

            const workspaceName = resolveImportedWorktreeName({
              branch: worktree.branch,
              worktreePath: worktree.path,
            });
            const workspaceId = buildImportedWorktreeWorkspaceId({
              projectPath,
              worktreePath: worktree.path,
            });
            const persistedWorkspace = persistedRowsById.get(workspaceId);

            // Only create a fresh empty snapshot for true first-time workspaces.
            if (!persistedWorkspace) {
              await persistWorkspaceSnapshot({
                workspaceId,
                workspaceName,
                activeTaskId: "",
                tasks: [],
                messagesByTask: {},
                promptDraftByTask: {},
                editorTabs: [],
                activeEditorTabId: null,
                terminalTabs: [],
                activeTerminalTabId: null,
                terminalDocked: false,
                cliSessionTabs: [],
                activeCliSessionTabId: null,
                activeSurface: { kind: "task", taskId: "" },
                providerSessionByTask: {},
              });
            }

            newRows.push(
              persistedWorkspace ?? {
                id: workspaceId,
                name: workspaceName,
                updatedAt: new Date().toISOString(),
              },
            );
            newBranchById[workspaceId] = worktree.branch;
            newPathById[workspaceId] = worktree.path;
          }

          // Detect stale workspaces whose git worktrees no longer exist.
          const staleIds: string[] = [];
          for (const workspace of state.workspaces) {
            if (workspace.id === defaultWorkspaceId) continue;
            const wsPath = normalizeComparablePath(
              state.workspacePathById[workspace.id] ??
                `${projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: workspace.name })}`,
            );
            if (
              wsPath &&
              !registeredWorktreePaths.has(wsPath) &&
              !linkedWorktreePathSet.has(wsPath)
            ) {
              staleIds.push(workspace.id);
            }
          }
          for (const id of staleIds) {
            await closeWorkspacePersistence({ workspaceId: id });
          }

          // Nothing changed – skip store update.
          if (newRows.length === 0 && staleIds.length === 0) {
            return;
          }

          const staleIdSet = new Set(staleIds);
          set((current) => {
            let nextWorkspaces = current.workspaces;
            if (staleIds.length > 0) {
              nextWorkspaces = nextWorkspaces.filter(
                (ws) => !staleIdSet.has(ws.id),
              );
            }
            if (newRows.length > 0) {
              nextWorkspaces = [...nextWorkspaces, ...newRows];
            }

            const nextBranch = {
              ...current.workspaceBranchById,
              ...newBranchById,
            };
            const nextPath = { ...current.workspacePathById, ...newPathById };
            const nextDefault = { ...current.workspaceDefaultById };
            const nextRuntimeCache = { ...current.workspaceRuntimeCacheById };
            const nextTaskOwnership = { ...current.taskWorkspaceIdById };
            const staleWorkspacePaths = staleIds.map(
              (id) => current.workspacePathById[id],
            );

            for (const id of staleIds) {
              delete nextBranch[id];
              delete nextPath[id];
              delete nextDefault[id];
              delete nextRuntimeCache[id];
            }
            // Clean up task-workspace ownership for stale workspaces.
            if (staleIds.length > 0) {
              for (const [taskId, ownerId] of Object.entries(
                nextTaskOwnership,
              )) {
                if (staleIdSet.has(ownerId)) {
                  delete nextTaskOwnership[taskId];
                }
              }
            }

            // If the active workspace was removed, fall back to the default.
            let nextActiveWorkspaceId = current.activeWorkspaceId;
            if (staleIdSet.has(nextActiveWorkspaceId)) {
              nextActiveWorkspaceId =
                defaultWorkspaceId || nextWorkspaces[0]?.id || "";
            }

            return {
              workspaces: nextWorkspaces,
              activeWorkspaceId: nextActiveWorkspaceId,
              workspaceBranchById: nextBranch,
              workspacePathById: nextPath,
              workspaceDefaultById: nextDefault,
              workspaceFileCacheByPath: removeCachedWorkspaceFiles({
                workspaceFileCacheByPath: current.workspaceFileCacheByPath,
                workspacePaths: staleWorkspacePaths,
              }),
              workspaceRuntimeCacheById: nextRuntimeCache,
              taskWorkspaceIdById: nextTaskOwnership,
              recentProjects: current.projectPath
                ? upsertRecentProjectState({
                    projects: current.recentProjects,
                    project: {
                      projectPath: current.projectPath,
                      projectName: normalizeProjectDisplayName({
                        projectPath: current.projectPath,
                        projectName: current.projectName,
                      }),
                      lastOpenedAt:
                        current.recentProjects.find(
                          (p) => p.projectPath === current.projectPath,
                        )?.lastOpenedAt ?? new Date().toISOString(),
                      defaultBranch: current.defaultBranch,
                      workspaces: nextWorkspaces,
                      activeWorkspaceId: nextActiveWorkspaceId,
                      workspaceBranchById: nextBranch,
                      workspacePathById: nextPath,
                      workspaceDefaultById: nextDefault,
                      ...resolveRecentProjectPreferences({
                        projectPath: current.projectPath,
                        recentProjects: current.recentProjects,
                      }),
                    },
                  })
                : current.recentProjects,
            };
          });
        },
        hydrateNotifications: () => hydrateNotificationsAction({ set, get }),
        reconcileOrphanedNotifications: async () => {
          await reconcileOrphanedNotificationsAction({ set, get });
        },
        purgeWorkspaceNotifications: async ({ workspaceIds }) => {
          await purgeWorkspaceNotificationsAction({ set, get, workspaceIds });
        },
        flushActiveWorkspaceSnapshot: async ({ sync } = {}) => {
          const state = get();
          if (!state.hasHydratedWorkspaces) {
            return;
          }
          const workspaceId = state.activeWorkspaceId;
          const workspace = state.workspaces.find(
            (item) => item.id === workspaceId,
          );
          if (!workspaceId || !workspace) {
            return;
          }

          const snapshot = createWorkspaceSnapshot({
            activeTaskId: state.activeTaskId,
            tasks: state.tasks,
            messagesByTask: state.messagesByTask,
            promptDraftByTask: state.promptDraftByTask,
            workspaceInformation: state.workspaceInformation,
            editorTabs: state.editorTabs,
            activeEditorTabId: state.activeEditorTabId,
            terminalTabs: state.terminalTabs,
            activeTerminalTabId: state.activeTerminalTabId,
            terminalDocked: state.layout.terminalDocked,
            cliSessionTabs: state.cliSessionTabs,
            activeCliSessionTabId: state.activeCliSessionTabId,
            activeSurface: state.activeSurface,
            openTaskTabIds: state.openTaskTabIds,
            lensTabs: state.lensTabs,
            paneTabMeta: state.paneTabMeta,
            dockLayout: state.dockLayout,
            providerSessionByTask: state.providerSessionByTask,
          });

          if (sync) {
            const upsertSync = window.api?.persistence?.upsertWorkspaceSync;
            if (upsertSync) {
              upsertSync({
                id: workspaceId,
                name: workspace.name,
                snapshot,
              });
              return;
            }
          }

          await persistWorkspaceSnapshot({
            workspaceId,
            workspaceName: workspace.name,
            activeTaskId: state.activeTaskId,
            tasks: state.tasks,
            messagesByTask: state.messagesByTask,
            promptDraftByTask: state.promptDraftByTask,
            workspaceInformation: state.workspaceInformation,
            editorTabs: state.editorTabs,
            activeEditorTabId: state.activeEditorTabId,
            terminalTabs: state.terminalTabs,
            activeTerminalTabId: state.activeTerminalTabId,
            terminalDocked: state.layout.terminalDocked,
            cliSessionTabs: state.cliSessionTabs,
            activeCliSessionTabId: state.activeCliSessionTabId,
            activeSurface: state.activeSurface,
            openTaskTabIds: state.openTaskTabIds,
            lensTabs: state.lensTabs,
            paneTabMeta: state.paneTabMeta,
            dockLayout: state.dockLayout,
            providerSessionByTask: state.providerSessionByTask,
          });

          set((current) => {
            if (current.activeWorkspaceId !== workspaceId) {
              return current;
            }
            const compactedMessagesByTask = compactLoadedMessagesByTask({
              messagesByTask: current.messagesByTask,
              activeTaskId: current.activeTaskId,
              activeTurnIdsByTask: current.activeTurnIdsByTask,
            });
            if (compactedMessagesByTask === current.messagesByTask) {
              return current;
            }
            return {
              messagesByTask: compactedMessagesByTask,
            };
          });
        },
        refreshActiveManagedTask: async () => {
          const stateBefore = get();
          const workspaceId = stateBefore.activeWorkspaceId;
          const activeTask = findTaskById(
            stateBefore,
            stateBefore.activeTaskId,
          );
          if (!workspaceId || !activeTask || !isTaskManaged(activeTask)) {
            return;
          }

          const loadedWorkspaceSession =
            await loadWorkspaceSessionFromPersistence({
              workspaceId,
            });
          if (!loadedWorkspaceSession.shell) {
            return;
          }

          const nextSession = loadedWorkspaceSession.workspaceState;
          const preferredActiveTaskId = nextSession.tasks.some(
            (task) => task.id === stateBefore.activeTaskId,
          )
            ? stateBefore.activeTaskId
            : nextSession.activeTaskId;
          const refreshedSession: WorkspaceSessionState = {
            ...nextSession,
            activeTaskId: preferredActiveTaskId,
          };

          set((state) => {
            if (state.activeWorkspaceId !== workspaceId) {
              return state;
            }
            return {
              tasks: refreshedSession.tasks,
              messagesByTask: refreshedSession.messagesByTask,
              messageCountByTask: refreshedSession.messageCountByTask,
              activeTaskId: refreshedSession.activeTaskId,
              workspaceInformation: refreshedSession.workspaceInformation,
              activeTurnIdsByTask: refreshedSession.activeTurnIdsByTask,
              providerSessionByTask: refreshedSession.providerSessionByTask,
              providerGoalByTask: refreshedSession.providerGoalByTask,
              nativeSessionReadyByTask:
                refreshedSession.nativeSessionReadyByTask,
              workspaceRuntimeCacheById: {
                ...state.workspaceRuntimeCacheById,
                [workspaceId]: refreshedSession,
              },
              taskWorkspaceIdById: registerTaskWorkspaceOwnership({
                taskWorkspaceIdById: state.taskWorkspaceIdById,
                workspaceId,
                tasks: refreshedSession.tasks,
              }),
            };
          });
          // A managed host can answer requests on its own (agent-driven MCP
          // responses), so re-align the durable needs with the refreshed session.
          for (const task of refreshedSession.tasks) {
            attentionSync.syncTaskInteractions({
              taskId: task.id,
              messages: refreshedSession.messagesByTask[task.id] ?? [],
            });
          }
        },
        syncHostTaskTurn: async (update) => {
          const loaded = await loadHostTaskTurn(update);
          if (!loaded) {
            return;
          }
          const syncResult = applyHostTaskTurnSync({
            state: get(),
            loaded,
            update,
          });
          set(syncResult.statePatch);
          if (syncResult.active) {
            scheduleProviderTurnStallTimer({
              taskId: update.taskId,
              turnId: update.turnId,
              lastEventAt: Date.now(),
            });
          } else {
            clearProviderTurnStallTimer(update.taskId);
          }
          attentionSync.syncTaskInteractions({
            taskId: update.taskId,
            messages:
              syncResult.syncedSession.messagesByTask[update.taskId] ?? [],
            endedTurnId: syncResult.turnSettled
              ? update.turnId
              : undefined,
          });

          if (
            update.eventType === "approval" ||
            update.eventType === "user_input" ||
            update.eventType === "error" ||
            update.done
          ) {
            void get().hydrateNotifications();
          }
          if (syncResult.turnSettled) {
            dispatchNextQueuedTaskTurn({
              workspaceId: update.workspaceId,
              taskId: update.taskId,
            });
          }
        },
        createProject: async ({ name }) => {
          const root = await workspaceFsAdapter.pickRoot();
          if (!root || !root.rootPath) {
            return;
          }
          const projectRootPath = root.rootPath;

          const terminalRun = window.api?.terminal?.runCommand;
          let defaultBranch = "main";
          if (terminalRun) {
            const branchResult = await terminalRun({
              cwd: projectRootPath,
              command:
                "git symbolic-ref --short refs/remotes/origin/HEAD || git symbolic-ref --short HEAD || echo main",
            });
            const branchLine = (branchResult.stdout || "")
              .split("\n")
              .map((line) => line.trim())
              .find((line) => line.length > 0);
            if (branchLine) {
              defaultBranch = branchLine.replace(/^origin\//, "");
            }
          }

          const projectName =
            name?.trim() ||
            root.rootName ||
            resolveProjectNameFromPath({ projectPath: projectRootPath });
          await activateProject({
            projectRootPath,
            projectName,
            files: root.files,
            defaultBranch,
          });
        },
        openProjectFromPath: async ({ inputPath }) => {
          const resolvePath = window.api?.fs?.resolvePath;
          if (!resolvePath) {
            return { ok: false, stderr: "Filesystem bridge unavailable." };
          }
          const result = await resolvePath({ inputPath });
          if (!result.ok || !result.rootPath) {
            return { ok: false, stderr: result.stderr || "Invalid path." };
          }

          const projectRootPath = result.rootPath;
          const projectName =
            result.rootName ||
            resolveProjectNameFromPath({ projectPath: projectRootPath });

          const terminalRun = window.api?.terminal?.runCommand;
          let defaultBranch = "main";
          if (terminalRun) {
            const branchResult = await terminalRun({
              cwd: projectRootPath,
              command:
                "git symbolic-ref --short refs/remotes/origin/HEAD || git symbolic-ref --short HEAD || echo main",
            });
            const branchLine = (branchResult.stdout || "")
              .split("\n")
              .map((line: string) => line.trim())
              .find((line: string) => line.length > 0);
            if (branchLine) {
              defaultBranch = branchLine.replace(/^origin\//, "");
            }
          }

          await activateProject({
            projectRootPath,
            projectName,
            files: result.files ?? [],
            defaultBranch,
          });
          return { ok: true };
        },
        openProject: async ({ projectPath }) => {
          const normalizedProjectPath = projectPath.trim();
          if (!normalizedProjectPath) {
            return;
          }

          const state = get();
          const rememberedProject = state.recentProjects.find(
            (project) => project.projectPath === normalizedProjectPath,
          );
          const projectName =
            rememberedProject?.projectName ||
            resolveProjectNameFromPath({ projectPath: normalizedProjectPath });
          const files = resolveInitialWorkspaceFiles({
            workspacePath: normalizedProjectPath,
            activeProjectPath: state.projectPath,
            activeProjectFiles:
              rememberedProject?.projectPath === state.projectPath
                ? state.projectFiles
                : [],
            workspaceFileCacheByPath: state.workspaceFileCacheByPath,
          });

          await workspaceFsAdapter.setRoot?.({
            rootPath: normalizedProjectPath,
            rootName: projectName,
            files,
          });

          await activateProject({
            projectRootPath: normalizedProjectPath,
            projectName,
            files,
            defaultBranch:
              rememberedProject?.defaultBranch || state.defaultBranch || "main",
          });

          const nextState = get();
          const nextWorkspacePath = resolveWorkspacePathForId({
            activeWorkspaceId: nextState.activeWorkspaceId,
            workspacePathById: nextState.workspacePathById,
            workspaceDefaultById: nextState.workspaceDefaultById,
            projectPath: nextState.projectPath,
          });
          if (nextState.activeWorkspaceId && nextWorkspacePath) {
            const nextCachedFiles = resolveInitialWorkspaceFiles({
              workspacePath: nextWorkspacePath,
              activeProjectPath: nextState.projectPath,
              activeProjectFiles: nextState.projectFiles,
              workspaceFileCacheByPath: nextState.workspaceFileCacheByPath,
            });
            void Promise.resolve(
              workspaceFsAdapter.setRoot?.({
                rootPath: nextWorkspacePath,
                rootName: nextState.projectName ?? projectName,
                files: nextCachedFiles,
              }),
            ).then(() => {
              refreshWorkspaceFilesInBackground({
                workspaceId: nextState.activeWorkspaceId,
                workspacePath: nextWorkspacePath,
              });
            });
          }
        },
        removeProjectFromList: async ({ projectPath }) => {
          const normalizedProjectPath = projectPath.trim();
          if (!normalizedProjectPath) {
            return;
          }

          const stateBefore = get();
          const isCurrentProject =
            stateBefore.projectPath === normalizedProjectPath;
          if (isCurrentProject) {
            await get().flushActiveWorkspaceSnapshot({ sync: true });
          }

          const currentState = get();
          const matchingProjectForCleanup = currentState.recentProjects.find(
            (project) => project.projectPath === normalizedProjectPath,
          );
          const workspaceIdsForCleanup = [
            ...(matchingProjectForCleanup?.workspaces.map(
              (workspace) => workspace.id,
            ) ?? []),
            ...(isCurrentProject
              ? currentState.workspaces.map((workspace) => workspace.id)
              : []),
          ];
          await closeTerminalSessionsForWorkspaces(workspaceIdsForCleanup);
          await get().purgeWorkspaceNotifications({ workspaceIds: workspaceIdsForCleanup });

          set((state) => {
            const matchingProject = state.recentProjects.find(
              (project) => project.projectPath === normalizedProjectPath,
            );
            const workspaceIds = new Set<string>([
              ...(matchingProject?.workspaces.map(
                (workspace) => workspace.id,
              ) ?? []),
              ...(isCurrentProject
                ? state.workspaces.map((workspace) => workspace.id)
                : []),
            ]);
            const nextRuntimeCacheById = removeWorkspaceRuntimeCacheEntries({
              workspaceRuntimeCacheById: state.workspaceRuntimeCacheById,
              workspaceIds: [...workspaceIds],
            });
            const nextWorkspaceFileCacheByPath = removeCachedWorkspaceFiles({
              workspaceFileCacheByPath: state.workspaceFileCacheByPath,
              workspacePaths: [
                normalizedProjectPath,
                ...Object.values(matchingProject?.workspacePathById ?? {}),
                ...(isCurrentProject
                  ? Object.values(state.workspacePathById)
                  : []),
              ],
            });
            const nextTaskWorkspaceIdById = Object.fromEntries(
              Object.entries(state.taskWorkspaceIdById).filter(
                ([, workspaceId]) => !workspaceIds.has(workspaceId),
              ),
            );
            const nextRecentProjects = state.recentProjects.filter(
              (project) => project.projectPath !== normalizedProjectPath,
            );

            if (!isCurrentProject) {
              return {
                recentProjects: nextRecentProjects,
                workspaceRuntimeCacheById: nextRuntimeCacheById,
                workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
                taskWorkspaceIdById: nextTaskWorkspaceIdById,
              };
            }

            const emptyWorkspaceState = buildWorkspaceSessionState({
              snapshot: null,
            });
            return {
              hasHydratedWorkspaces: false,
              workspaceSnapshotVersion: 0,
              workspaces: [],
              activeWorkspaceId: "",
              projectPath: null,
              recentProjects: nextRecentProjects,
              defaultBranch: "main",
              workspaceBranchById: {},
              workspacePathById: {},
              workspaceDefaultById: {},
              projectName: null,
              projectFiles: [],
              workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
              taskCheckpointById: {},
              workspaceRuntimeCacheById: nextRuntimeCacheById,
              taskWorkspaceIdById: nextTaskWorkspaceIdById,
              layout: {
                ...state.layout,
                sidebarOverlayVisible: false,
                terminalDocked: false,
              },
              ...emptyWorkspaceState,
            };
          });
        },
        moveProjectInList: ({ projectPath, direction }) => {
          const normalizedProjectPath = projectPath.trim();
          if (!normalizedProjectPath) {
            return;
          }

          set((state) => {
            const currentProjects = captureCurrentProjectState({
              recentProjects: state.recentProjects,
              projectPath: state.projectPath,
              projectName: state.projectName,
              defaultBranch: state.defaultBranch,
              workspaces: state.workspaces,
              activeWorkspaceId: state.activeWorkspaceId,
              workspaceBranchById: state.workspaceBranchById,
              workspacePathById: state.workspacePathById,
              workspaceDefaultById: state.workspaceDefaultById,
            });
            const fromIndex = currentProjects.findIndex(
              (project) => project.projectPath === normalizedProjectPath,
            );
            const toIndex = direction === "up" ? fromIndex - 1 : fromIndex + 1;
            const nextProjects = moveArrayItem(
              currentProjects,
              fromIndex,
              toIndex,
            );
            return nextProjects === currentProjects
              ? state
              : { recentProjects: nextProjects };
          });
        },
        resolveKickoffProposal: kickoffResolver.resolve,
        cancelKickoffResolution: kickoffResolver.cancel,
        createWorkspace: async ({
          name,
          label,
          mode,
          fromBranch,
          fromBranchKind,
          initCommand,
          useRootNodeModulesSymlink: requestedRootNodeModulesSymlink,
          initialTaskTitle,
          workspaceInformation,
        }) => {
          const trimmed = name.trim();
          if (!trimmed) {
            return { ok: false, message: "Workspace name is required." };
          }

          const current = get();
          if (!current.projectPath) {
            return {
              ok: false,
              message: "Open a project before creating a workspace.",
            };
          }
          const nextRuntimeCacheById = saveActiveWorkspaceRuntimeCache({
            state: current,
          });

          const branchName = sanitizeBranchName({ value: trimmed });
          if (!branchName) {
            return { ok: false, message: "Workspace branch name is invalid." };
          }
          const workspaceDisplayName = label?.trim() || branchName;
          const projectWorkspaceInitCommand =
            resolveProjectWorkspaceInitCommand({
              projectPath: current.projectPath,
              recentProjects: current.recentProjects,
            });
          const projectUseRootNodeModulesSymlink =
            resolveProjectWorkspaceRootNodeModulesSymlinkPreference({
              projectPath: current.projectPath,
              recentProjects: current.recentProjects,
            });
          const workspaceInitCommand = normalizeWorkspaceInitCommand({
            value: initCommand ?? projectWorkspaceInitCommand,
          });
          const useRootNodeModulesSymlink =
            requestedRootNodeModulesSymlink === undefined
              ? projectUseRootNodeModulesSymlink
              : normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
                  value: requestedRootNodeModulesSymlink,
                });
          const workspacePath = `${current.projectPath}/.stave/workspaces/${toWorkspaceFolderName({ branch: branchName, unique: true })}`;
          const workspaceId = buildImportedWorktreeWorkspaceId({
            projectPath: current.projectPath,
            worktreePath: workspacePath,
          });
          let baseBranch =
            fromBranch?.trim() || current.defaultBranch || "main";
          const creationNotices: Array<{
            level: "success" | "warning";
            message: string;
          }> = [];
          const runner = window.api?.terminal?.runCommand;
          if (runner) {
            const remoteTarget =
              mode === "branch"
                ? await resolveWorkspaceRemoteBaseBranchTarget({
                    baseBranch,
                    fromBranchKind,
                    verifyRef: async (ref) =>
                      (
                        await runner({
                          cwd: current.projectPath ?? undefined,
                          command: `git show-ref --verify --quiet ${JSON.stringify(ref)}`,
                        })
                      ).ok,
                  })
                : null;
            if (remoteTarget) {
              const fetchResult = await runner({
                cwd: current.projectPath,
                command: `git fetch ${remoteTarget.remoteName} --prune`,
              });
              if (!fetchResult.ok) {
                const localBranchProbe = await runner({
                  cwd: current.projectPath,
                  command: `git show-ref --verify --quiet ${JSON.stringify(`refs/heads/${remoteTarget.localBranch}`)}`,
                });
                const fallbackBranch = localBranchProbe.ok
                  ? remoteTarget.localBranch
                  : baseBranch;
                baseBranch = fallbackBranch;
                creationNotices.push({
                  level: "warning",
                  message: localBranchProbe.ok
                    ? `Could not refresh \`${fromBranch}\`; created the workspace from local \`${remoteTarget.localBranch}\` instead. ${summarizeTerminalCommandDetail(
                        {
                          stderr: fetchResult.stderr,
                          stdout: fetchResult.stdout,
                          fallback: "git fetch failed.",
                        },
                      )}`
                    : `Could not refresh \`${fromBranch}\`; created the workspace from the cached remote-tracking ref instead. ${summarizeTerminalCommandDetail(
                        {
                          stderr: fetchResult.stderr,
                          stdout: fetchResult.stdout,
                          fallback: "git fetch failed.",
                        },
                      )}`,
                });
              }
            }
            await runner({
              cwd: current.projectPath,
              command: "mkdir -p .stave/workspaces",
            });
            const addResult = await runner({
              cwd: current.projectPath,
              command:
                mode === "clean"
                  ? `git worktree add -b ${JSON.stringify(branchName)} ${JSON.stringify(workspacePath)}`
                  : `git worktree add -b ${JSON.stringify(branchName)} ${JSON.stringify(workspacePath)} ${JSON.stringify(baseBranch)}`,
            });
            if (!addResult.ok) {
              const fallbackResult = await runner({
                cwd: current.projectPath,
                command: `git worktree add ${JSON.stringify(workspacePath)} ${JSON.stringify(branchName)}`,
              });
              if (!fallbackResult.ok) {
                return {
                  ok: false,
                  message: (
                    fallbackResult.stderr ||
                    addResult.stderr ||
                    "Failed to create git worktree."
                  ).trim(),
                };
              }
            }
          }

          const empty = createEmptyWorkspaceState();
          const seededTask: Task = {
            id: crypto.randomUUID(),
            title: (initialTaskTitle ?? "").trim() || "New Task",
            provider: current.draftProvider,
            updatedAt: buildRecentTimestamp(),
            unread: false,
            archivedAt: null,
            controlMode: "interactive",
            controlOwner: "stave",
          };
          const snapshot = createWorkspaceSnapshot({
            activeTaskId: seededTask.id,
            tasks: [seededTask],
            messagesByTask: {
              [seededTask.id]: [],
            },
            promptDraftByTask: empty.promptDraftByTask,
            workspaceInformation,
            editorTabs: empty.editorTabs,
            activeEditorTabId: empty.activeEditorTabId,
            terminalTabs: empty.terminalTabs,
            activeTerminalTabId: empty.activeTerminalTabId,
            terminalDocked: empty.terminalDocked,
            cliSessionTabs: empty.cliSessionTabs,
            activeCliSessionTabId: empty.activeCliSessionTabId,
            activeSurface: { kind: "task", taskId: seededTask.id },
            providerSessionByTask: {
              [seededTask.id]: {},
            },
          });
          await persistWorkspaceSnapshot({
            workspaceId,
            workspaceName: workspaceDisplayName,
            activeTaskId: snapshot.activeTaskId,
            tasks: snapshot.tasks,
            messagesByTask: snapshot.messagesByTask,
            promptDraftByTask: snapshot.promptDraftByTask ?? {},
            workspaceInformation: snapshot.workspaceInformation,
            editorTabs: snapshot.editorTabs ?? [],
            activeEditorTabId: snapshot.activeEditorTabId ?? null,
            terminalTabs: snapshot.terminalTabs ?? [],
            activeTerminalTabId: snapshot.activeTerminalTabId ?? null,
            terminalDocked: snapshot.terminalDocked ?? false,
            cliSessionTabs: snapshot.cliSessionTabs ?? [],
            activeCliSessionTabId: snapshot.activeCliSessionTabId ?? null,
            activeSurface: snapshot.activeSurface ?? {
              kind: "task",
              taskId: snapshot.activeTaskId,
            },
            providerSessionByTask: snapshot.providerSessionByTask ?? {},
          });
          const workspaceState = buildWorkspaceSessionState({ snapshot });

          let files = current.projectFiles;
          try {
            await workspaceFsAdapter.setRoot?.({
              rootPath: workspacePath,
              rootName: workspaceDisplayName,
            });
          } catch {
            // Worktree may be created successfully before filesystem bridge catches up.
            // Keep workspace registration and use the existing file list as fallback.
          }

          if (useRootNodeModulesSymlink) {
            if (!runner) {
              creationNotices.push({
                level: "warning",
                message:
                  "The shared root `node_modules` symlink could not be created because the terminal bridge is unavailable.",
              });
            } else {
              const linkResult = await runner({
                cwd: workspacePath,
                command: buildWorkspaceRootNodeModulesSymlinkCommand({
                  projectPath: current.projectPath,
                }),
              });
              if (linkResult.ok) {
                creationNotices.push({
                  level: "success",
                  message:
                    "Linked `node_modules` from the repository root into the new workspace.",
                });
              } else {
                creationNotices.push({
                  level: "warning",
                  message: `Linking the shared root \`node_modules\` failed. ${summarizeTerminalCommandDetail(
                    {
                      stderr: linkResult.stderr,
                      stdout: linkResult.stdout,
                      fallback: "Command failed.",
                    },
                  )}`,
                });
              }
            }
          }

          if (workspaceInitCommand) {
            const summarizedCommand = summarizeWorkspaceInitCommand({
              command: workspaceInitCommand,
            });
            if (!runner) {
              creationNotices.push({
                level: "warning",
                message: `The post-create command could not run because the terminal bridge is unavailable: ${summarizedCommand}`,
              });
            } else {
              const initResult = await runner({
                cwd: workspacePath,
                command: workspaceInitCommand,
              });
              if (initResult.ok) {
                creationNotices.push({
                  level: "success",
                  message: `Ran the post-create command: ${summarizedCommand}`,
                });
              } else {
                creationNotices.push({
                  level: "warning",
                  message: `The post-create command failed: ${summarizedCommand}. ${summarizeTerminalCommandDetail(
                    {
                      stderr: initResult.stderr,
                      stdout: initResult.stdout,
                      fallback: "Command failed.",
                    },
                  )}`,
                });
              }
            }
          }

          try {
            files = await workspaceFsAdapter.listFiles();
          } catch {
            // Keep workspace registration and use the existing file list as fallback.
          }

          set((state) => {
            const nextWorkspaces = state.workspaces.some(
              (workspace) => workspace.id === workspaceId,
            )
              ? state.workspaces
              : [
                  ...state.workspaces,
                  {
                    id: workspaceId,
                    name: workspaceDisplayName,
                    updatedAt: new Date().toISOString(),
                  },
                ];
            const nextBranchById = {
              ...state.workspaceBranchById,
              [workspaceId]: branchName,
            };
            const nextPathById = {
              ...state.workspacePathById,
              [workspaceId]: workspacePath,
            };
            const nextDefaultById = {
              ...state.workspaceDefaultById,
              [workspaceId]: false,
            };
            return {
              workspaceSnapshotVersion: 0,
              workspaces: nextWorkspaces,
              activeWorkspaceId: workspaceId,
              workspaceBranchById: nextBranchById,
              workspacePathById: nextPathById,
              workspaceDefaultById: nextDefaultById,
              recentProjects: captureCurrentProjectState({
                recentProjects: state.recentProjects,
                projectPath: state.projectPath,
                projectName: state.projectName,
                defaultBranch: state.defaultBranch,
                workspaces: nextWorkspaces,
                activeWorkspaceId: workspaceId,
                workspaceBranchById: nextBranchById,
                workspacePathById: nextPathById,
                workspaceDefaultById: nextDefaultById,
                archivedWorkspacePathsToRemove: [workspacePath],
              }),
              workspaceFileCacheByPath: rememberCachedWorkspaceFiles({
                workspaceFileCacheByPath: state.workspaceFileCacheByPath,
                workspacePath,
                files,
              }),
              workspaceRuntimeCacheById: nextRuntimeCacheById,
              activeAppSurface: WORKSPACE_APP_SURFACE,
              taskWorkspaceIdById: registerTaskWorkspaceOwnership({
                taskWorkspaceIdById: state.taskWorkspaceIdById,
                workspaceId,
                tasks: workspaceState.tasks,
              }),
              ...workspaceState,
              projectFiles: files,
            };
          });
          runScriptHookInBackground({
            workspaceId,
            trigger: "task.created",
            taskId: seededTask.id,
            taskTitle: seededTask.title,
          });
          const creationNotice = buildWorkspaceCreationNotice({
            notices: creationNotices,
          });
          return creationNotice
            ? { ok: true, ...creationNotice }
            : { ok: true };
        },
        kickoffWorkspace: (input) =>
          runWorkspaceKickoff({ input, getState: get }),
        importWorkspaceFromWorktree: async ({ worktreePath, label }) => {
          const trimmedInput = worktreePath.trim();
          if (!trimmedInput) {
            return { ok: false, message: "Worktree path is required." };
          }

          const current = get();
          const projectPath = current.projectPath;
          if (!projectPath) {
            return {
              ok: false,
              message: "Open a project before linking a worktree.",
            };
          }
          const runner = window.api?.terminal?.runCommand;
          if (!runner) {
            return {
              ok: false,
              message:
                "Linking a worktree requires the terminal bridge, which is unavailable.",
            };
          }

          const toplevelResult = await runner({
            cwd: projectPath,
            command: `git -C ${toShellPathArgument({ path: trimmedInput })} rev-parse --show-toplevel`,
          });
          if (!toplevelResult.ok) {
            return {
              ok: false,
              message: summarizeTerminalCommandDetail({
                stderr: toplevelResult.stderr,
                stdout: toplevelResult.stdout,
                fallback: "The path is not inside a git worktree.",
              }),
            };
          }
          const worktreeRoot = toplevelResult.stdout.trim();
          if (!worktreeRoot) {
            return {
              ok: false,
              message: "Could not resolve the worktree root for that path.",
            };
          }
          const comparableWorktreeRoot = normalizeComparablePath(worktreeRoot);
          if (comparableWorktreeRoot === normalizeComparablePath(projectPath)) {
            return {
              ok: false,
              message:
                "That path is the project root, which is already available as the default workspace.",
            };
          }
          const existingWorkspaceId = Object.entries(
            current.workspacePathById,
          ).find(
            ([workspaceId, registeredPath]) =>
              normalizeComparablePath(registeredPath) ===
                comparableWorktreeRoot &&
              current.workspaces.some(
                (workspace) => workspace.id === workspaceId,
              ),
          )?.[0];
          if (existingWorkspaceId) {
            await get().switchWorkspace({ workspaceId: existingWorkspaceId });
            return {
              ok: true,
              noticeLevel: "success",
              message:
                "That worktree is already registered as a workspace. Switched to it.",
            };
          }

          const branchResult = await runner({
            cwd: projectPath,
            command: `git -C ${JSON.stringify(worktreeRoot)} rev-parse --abbrev-ref HEAD`,
          });
          const branchName = branchResult.ok ? branchResult.stdout.trim() : "";
          if (!branchName || branchName === "HEAD") {
            return {
              ok: false,
              message:
                "The worktree has no checked-out branch (detached HEAD), so it cannot be linked.",
            };
          }

          const nextRuntimeCacheById = saveActiveWorkspaceRuntimeCache({
            state: current,
          });
          const workspaceDisplayName =
            label?.trim() ||
            resolveImportedWorktreeName({
              branch: branchName,
              worktreePath: worktreeRoot,
            });
          const workspaceId = buildImportedWorktreeWorkspaceId({
            projectPath,
            worktreePath: worktreeRoot,
          });
          const creationNotices: Array<{
            level: "success" | "warning";
            message: string;
          }> = [];

          // Worktrees registered in this checkout survive stale cleanup via
          // `git worktree list`; external ones need the linked-path exemption.
          let isExternalWorktree = true;
          const listResult = await runner({
            cwd: projectPath,
            command: "git worktree list --porcelain",
          });
          if (listResult.ok) {
            isExternalWorktree = !parseGitWorktrees({
              stdout: listResult.stdout,
            }).some(
              (worktree) =>
                normalizeComparablePath(worktree.path) ===
                comparableWorktreeRoot,
            );
          }

          const comparableWorkspacesDir = normalizeComparablePath(
            `${projectPath}/.stave/workspaces`,
          );
          if (
            comparableWorkspacesDir &&
            !comparableWorktreeRoot.startsWith(`${comparableWorkspacesDir}/`)
          ) {
            await runner({
              cwd: projectPath,
              command: "mkdir -p .stave/workspaces",
            });
            const symlinkPath = buildLinkedWorktreeSymlinkPath({
              projectPath,
              worktreePath: worktreeRoot,
            });
            const linkResult = await runner({
              cwd: projectPath,
              command: `ln -sfn ${JSON.stringify(worktreeRoot)} ${JSON.stringify(symlinkPath)}`,
            });
            if (linkResult.ok) {
              creationNotices.push({
                level: "success",
                message: `Linked the worktree into \`.stave/workspaces/\` via symlink.`,
              });
            } else {
              creationNotices.push({
                level: "warning",
                message: `The workspace was registered, but creating the \`.stave/workspaces/\` symlink failed. ${summarizeTerminalCommandDetail(
                  {
                    stderr: linkResult.stderr,
                    stdout: linkResult.stdout,
                    fallback: "Command failed.",
                  },
                )}`,
              });
            }
          }

          // The user explicitly re-linked this worktree; drop any archive
          // tombstone so discovery and registration stop skipping it.
          if (comparableWorktreeRoot) {
            archivedWorktreePaths.delete(comparableWorktreeRoot);
          }

          const empty = createEmptyWorkspaceState();
          const seededTask: Task = {
            id: crypto.randomUUID(),
            title: "New Task",
            provider: current.draftProvider,
            updatedAt: buildRecentTimestamp(),
            unread: false,
            archivedAt: null,
            controlMode: "interactive",
            controlOwner: "stave",
          };
          const snapshot = createWorkspaceSnapshot({
            activeTaskId: seededTask.id,
            tasks: [seededTask],
            messagesByTask: {
              [seededTask.id]: [],
            },
            promptDraftByTask: empty.promptDraftByTask,
            editorTabs: empty.editorTabs,
            activeEditorTabId: empty.activeEditorTabId,
            terminalTabs: empty.terminalTabs,
            activeTerminalTabId: empty.activeTerminalTabId,
            terminalDocked: empty.terminalDocked,
            cliSessionTabs: empty.cliSessionTabs,
            activeCliSessionTabId: empty.activeCliSessionTabId,
            activeSurface: { kind: "task", taskId: seededTask.id },
            providerSessionByTask: {
              [seededTask.id]: {},
            },
          });
          await persistWorkspaceSnapshot({
            workspaceId,
            workspaceName: workspaceDisplayName,
            activeTaskId: snapshot.activeTaskId,
            tasks: snapshot.tasks,
            messagesByTask: snapshot.messagesByTask,
            promptDraftByTask: snapshot.promptDraftByTask ?? {},
            editorTabs: snapshot.editorTabs ?? [],
            activeEditorTabId: snapshot.activeEditorTabId ?? null,
            terminalTabs: snapshot.terminalTabs ?? [],
            activeTerminalTabId: snapshot.activeTerminalTabId ?? null,
            terminalDocked: snapshot.terminalDocked ?? false,
            cliSessionTabs: snapshot.cliSessionTabs ?? [],
            activeCliSessionTabId: snapshot.activeCliSessionTabId ?? null,
            activeSurface: snapshot.activeSurface ?? {
              kind: "task",
              taskId: snapshot.activeTaskId,
            },
            providerSessionByTask: snapshot.providerSessionByTask ?? {},
          });
          const workspaceState = buildWorkspaceSessionState({ snapshot });

          let files = current.projectFiles;
          try {
            await workspaceFsAdapter.setRoot?.({
              rootPath: worktreeRoot,
              rootName: workspaceDisplayName,
            });
            files = await workspaceFsAdapter.listFiles();
          } catch {
            // Keep workspace registration and use the existing file list as fallback.
          }

          set((state) => {
            const nextWorkspaces = state.workspaces.some(
              (workspace) => workspace.id === workspaceId,
            )
              ? state.workspaces
              : [
                  ...state.workspaces,
                  {
                    id: workspaceId,
                    name: workspaceDisplayName,
                    updatedAt: new Date().toISOString(),
                  },
                ];
            const nextBranchById = {
              ...state.workspaceBranchById,
              [workspaceId]: branchName,
            };
            const nextPathById = {
              ...state.workspacePathById,
              [workspaceId]: worktreeRoot,
            };
            const nextDefaultById = {
              ...state.workspaceDefaultById,
              [workspaceId]: false,
            };
            return {
              workspaceSnapshotVersion: 0,
              workspaces: nextWorkspaces,
              activeWorkspaceId: workspaceId,
              workspaceBranchById: nextBranchById,
              workspacePathById: nextPathById,
              workspaceDefaultById: nextDefaultById,
              recentProjects: captureCurrentProjectState({
                recentProjects: state.recentProjects,
                projectPath: state.projectPath,
                projectName: state.projectName,
                defaultBranch: state.defaultBranch,
                workspaces: nextWorkspaces,
                activeWorkspaceId: workspaceId,
                workspaceBranchById: nextBranchById,
                workspacePathById: nextPathById,
                workspaceDefaultById: nextDefaultById,
                archivedWorkspacePathsToRemove: [worktreeRoot],
                ...(isExternalWorktree
                  ? { linkedWorkspacePathsToAdd: [worktreeRoot] }
                  : {}),
              }),
              workspaceFileCacheByPath: rememberCachedWorkspaceFiles({
                workspaceFileCacheByPath: state.workspaceFileCacheByPath,
                workspacePath: worktreeRoot,
                files,
              }),
              workspaceRuntimeCacheById: nextRuntimeCacheById,
              activeAppSurface: WORKSPACE_APP_SURFACE,
              taskWorkspaceIdById: registerTaskWorkspaceOwnership({
                taskWorkspaceIdById: state.taskWorkspaceIdById,
                workspaceId,
                tasks: workspaceState.tasks,
              }),
              ...workspaceState,
              projectFiles: files,
            };
          });
          runScriptHookInBackground({
            workspaceId,
            trigger: "task.created",
            taskId: seededTask.id,
            taskTitle: seededTask.title,
          });
          const creationNotice = buildWorkspaceCreationNotice({
            notices: creationNotices,
          });
          return creationNotice
            ? { ok: true, ...creationNotice }
            : {
                ok: true,
                noticeLevel: "success",
                message: `Linked worktree \`${worktreeRoot}\` on branch \`${branchName}\`.`,
              };
        },
        continueWorkspaceFromSummary: async ({
          name,
          baseBranch: requestedBaseBranch,
        }) => {
          const current = get();
          const sourceWorkspaceId = current.activeWorkspaceId;
          if (!sourceWorkspaceId) {
            return {
              ok: false,
              message: "Select a workspace before continuing.",
            };
          }
          if (current.workspaceDefaultById[sourceWorkspaceId]) {
            return {
              ok: false,
              message:
                "The default workspace cannot be continued into a new workspace.",
            };
          }

          const sourceWorkspace =
            current.workspaces.find(
              (workspace) => workspace.id === sourceWorkspaceId,
            ) ?? null;
          const sourceWorkspaceName =
            sourceWorkspace?.name ??
            current.workspaceBranchById[sourceWorkspaceId] ??
            "workspace";
          const sourceWorkspacePath =
            current.workspacePathById[sourceWorkspaceId] ??
            current.projectPath ??
            "";
          const sourceBranch =
            current.workspaceBranchById[sourceWorkspaceId] ??
            sourceWorkspaceName;
          const sourcePrInfo =
            current.workspacePrInfoById[sourceWorkspaceId] ?? null;
          const defaultBaseBranch = current.defaultBranch.trim() || "main";
          const remoteBaseBranch =
            requestedBaseBranch?.trim() || `origin/${defaultBaseBranch}`;
          const remoteSeparatorIndex = remoteBaseBranch.indexOf("/");
          const remoteTarget =
            remoteSeparatorIndex > 0
              ? {
                  remoteName: remoteBaseBranch.slice(0, remoteSeparatorIndex),
                  localBranch: remoteBaseBranch.slice(remoteSeparatorIndex + 1),
                }
              : null;
          let baseBranch = remoteBaseBranch;
          const activeTask =
            current.tasks.find((task) => task.id === current.activeTaskId) ??
            current.tasks[0] ??
            null;
          const notes = current.workspaceInformation.notes.trim();
          const openTodos = current.workspaceInformation.todos
            .filter((todo) => !todo.completed && todo.text.trim().length > 0)
            .map((todo) => todo.text.trim());

          const runCommand = window.api?.terminal?.runCommand;
          const getHistory = window.api?.sourceControl?.getHistory;
          const setupWarnings: string[] = [];
          let diffStat = "";
          let changedFiles: string[] = [];
          let recentCommitSubjects: string[] = [];

          if (runCommand && sourceWorkspacePath) {
            if (remoteTarget) {
              const fetchBaseResult = await runCommand({
                cwd: sourceWorkspacePath,
                command: `git fetch ${remoteTarget.remoteName} --prune`,
              });
              if (!fetchBaseResult.ok) {
                baseBranch = remoteTarget.localBranch;
                setupWarnings.push(
                  `Could not refresh \`${remoteBaseBranch}\`; continued from local \`${remoteTarget.localBranch}\` instead.`,
                );
              }
            }

            const diffStatResult = await runCommand({
              cwd: sourceWorkspacePath,
              command: `git diff --stat ${JSON.stringify(baseBranch)}...HEAD`,
            });
            if (diffStatResult.ok) {
              diffStat = (diffStatResult.stdout || "").trim();
            }

            const changedFilesResult = await runCommand({
              cwd: sourceWorkspacePath,
              command: `git diff --name-only ${JSON.stringify(baseBranch)}...HEAD`,
            });
            if (changedFilesResult.ok) {
              changedFiles = (changedFilesResult.stdout || "")
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean);
            }
          }

          if (getHistory && sourceWorkspacePath) {
            try {
              const historyResult = await getHistory({
                cwd: sourceWorkspacePath,
                limit: 8,
              });
              if (historyResult.ok) {
                recentCommitSubjects = historyResult.items
                  .map((item) => item.subject.trim())
                  .filter(Boolean);
              }
            } catch {
              // Keep the continuation brief deterministic even when git history is unavailable.
            }
          }

          const summaryFilePath = buildWorkspaceContinueSummaryFilePath({
            sourceBranch,
          });
          const summaryMarkdown = buildWorkspaceContinueSummaryMarkdown({
            generatedAt: new Date().toISOString(),
            sourceWorkspaceName,
            sourceBranch,
            baseBranch,
            pr: sourcePrInfo?.pr
              ? {
                  number: sourcePrInfo.pr.number,
                  title: sourcePrInfo.pr.title,
                  url: sourcePrInfo.pr.url,
                  status: sourcePrInfo.derived,
                }
              : undefined,
            activeTaskTitle: activeTask?.title,
            notes,
            openTodos,
            changedFiles,
            recentCommitSubjects,
            diffStat,
          });

          const creationResult = await get().createWorkspace({
            name,
            mode: "branch",
            fromBranch: baseBranch,
            initialTaskTitle: `Continue from ${sourceWorkspaceName}`,
          });
          if (!creationResult.ok) {
            return creationResult;
          }

          const next = get();
          const targetWorkspaceId = next.activeWorkspaceId;
          const targetWorkspacePath =
            next.workspacePathById[targetWorkspaceId] ?? next.projectPath ?? "";
          const warnings: string[] = [...setupWarnings];
          let attachedSummary = false;

          if (targetWorkspacePath) {
            try {
              await workspaceFsAdapter.setRoot?.({
                rootPath: targetWorkspacePath,
                rootName: next.projectName ?? sourceWorkspaceName,
                files: next.projectFiles,
              });

              const createDirectoryResult =
                await workspaceFsAdapter.createDirectory({
                  directoryPath: ".stave/context",
                });
              if (
                !createDirectoryResult.ok &&
                !createDirectoryResult.alreadyExists
              ) {
                warnings.push(
                  createDirectoryResult.stderr ||
                    "Could not create the continuation brief directory.",
                );
              } else {
                const createFileResult = await workspaceFsAdapter.createFile({
                  filePath: summaryFilePath,
                });
                if (!createFileResult.ok && !createFileResult.alreadyExists) {
                  warnings.push(
                    createFileResult.stderr ||
                      "Could not create the continuation brief file.",
                  );
                } else {
                  const writeSummaryResult = await workspaceFsAdapter.writeFile(
                    {
                      filePath: summaryFilePath,
                      content: summaryMarkdown,
                    },
                  );
                  if (!writeSummaryResult.ok) {
                    warnings.push(
                      "Could not write the continuation brief file.",
                    );
                  } else {
                    attachedSummary = true;
                    set((state) => ({
                      projectFiles:
                        workspaceFsAdapter.getKnownFiles().length > 0
                          ? workspaceFsAdapter.getKnownFiles()
                          : state.projectFiles,
                    }));
                  }
                }
              }
            } catch (error) {
              warnings.push(
                error instanceof Error
                  ? error.message
                  : "Could not prepare the continuation brief file.",
              );
            }
          } else {
            warnings.push(
              "The new workspace path is unavailable, so the continuation brief could not be created.",
            );
          }

          const continuedTaskId = get().activeTaskId;
          if (continuedTaskId && attachedSummary) {
            get().updatePromptDraft({
              taskId: continuedTaskId,
              patch: {
                attachedFilePaths: [summaryFilePath],
              },
            });
          }

          const resultMessages = [
            creationResult.message?.trim() ?? "",
            attachedSummary
              ? `Attached \`${summaryFilePath}\` to the new task draft.`
              : "",
            warnings.length > 0 ? warnings.join(" ") : "",
          ].filter(Boolean);

          return {
            ok: true,
            noticeLevel:
              warnings.length > 0 || creationResult.noticeLevel === "warning"
                ? "warning"
                : "success",
            message: resultMessages.join(" "),
          };
        },
        closeWorkspace: async ({ workspaceId, deleteBranch = true }) => {
          const state = get();
          const workspace = state.workspaces.find(
            (item) => item.id === workspaceId,
          );
          const isProtectedDefault =
            state.workspaceDefaultById[workspaceId] ||
            workspaceId === starterWorkspaceId ||
            isDefaultWorkspaceName(workspace?.name);
          if (isProtectedDefault) {
            return;
          }
          // Unresolved approvals/questions never expire on their own.
          await get().purgeWorkspaceNotifications({ workspaceIds: [workspaceId] });
          const workspacePath = state.workspacePathById[workspaceId];
          const workspaceBranch = state.workspaceBranchById[workspaceId];
          const projectPath = state.projectPath;
          const isLinkedWorktree = getLinkedWorktreePathSetForProject({
            projectPath,
            recentProjects: state.recentProjects,
          }).has(normalizeComparablePath(workspacePath));
          // Pick the replacement active workspace, ignoring the one being archived.
          const nextWorkspace =
            state.workspaces.find(
              (item) =>
                item.id !== workspaceId && state.workspaceDefaultById[item.id],
            ) ?? state.workspaces.find((item) => item.id !== workspaceId);
          if (!nextWorkspace) {
            const workspaceState = buildWorkspaceSessionState({
              snapshot: null,
            });
            set((nextState) => {
              const nextBranchById = { ...nextState.workspaceBranchById };
              const nextPathById = { ...nextState.workspacePathById };
              const nextDefaultById = { ...nextState.workspaceDefaultById };
              delete nextBranchById[workspaceId];
              delete nextPathById[workspaceId];
              delete nextDefaultById[workspaceId];
              const nextWorkspaces = nextState.workspaces.filter(
                (item) => item.id !== workspaceId,
              );
              const nextRuntimeCacheById = removeWorkspaceRuntimeCacheEntries({
                workspaceRuntimeCacheById: nextState.workspaceRuntimeCacheById,
                workspaceIds: [workspaceId],
              });
              const nextTaskWorkspaceIdById = Object.fromEntries(
                Object.entries(nextState.taskWorkspaceIdById).filter(
                  ([, ownerWorkspaceId]) => ownerWorkspaceId !== workspaceId,
                ),
              );
              return {
                workspaces: nextWorkspaces,
                workspaceBranchById: nextBranchById,
                workspacePathById: nextPathById,
                workspaceDefaultById: nextDefaultById,
                activeWorkspaceId: "",
                recentProjects: captureCurrentProjectState({
                  recentProjects: nextState.recentProjects,
                  projectPath: nextState.projectPath,
                  projectName: nextState.projectName,
                  defaultBranch: nextState.defaultBranch,
                  workspaces: nextWorkspaces,
                  activeWorkspaceId: "",
                  workspaceBranchById: nextBranchById,
                  workspacePathById: nextPathById,
                  workspaceDefaultById: nextDefaultById,
                  archivedWorkspacePathsToAdd: [workspacePath],
                  linkedWorkspacePathsToRemove: [workspacePath],
                }),
                workspaceSnapshotVersion: 0,
                workspaceFileCacheByPath: removeCachedWorkspaceFiles({
                  workspaceFileCacheByPath: nextState.workspaceFileCacheByPath,
                  workspacePaths: [workspacePath],
                }),
                workspaceRuntimeCacheById: nextRuntimeCacheById,
                taskWorkspaceIdById: nextTaskWorkspaceIdById,
                ...workspaceState,
                layout: {
                  ...nextState.layout,
                  terminalDocked: workspaceState.terminalDocked,
                  editorDiffMode: resolveEditorDiffMode({
                    editorTabs: workspaceState.editorTabs,
                    activeEditorTabId: workspaceState.activeEditorTabId,
                  }),
                  editorMarkdownPreviewMode: false,
                },
              };
            });
            startWorkspaceArchiveCleanup({
              workspaceId,
              workspaceName: workspace?.name,
              workspacePath,
              workspaceBranch,
              projectPath,
              isLinkedWorktree,
              deleteBranch,
            });
            try {
              await get().flushProjectRegistry();
            } catch (error) {
              console.error(
                "[workspace-archive] flushProjectRegistry failed",
                { workspaceId },
                error,
              );
            }
            return;
          }
          await get().switchWorkspace({ workspaceId: nextWorkspace.id });
          set((nextState) => {
            const nextBranchById = { ...nextState.workspaceBranchById };
            const nextPathById = { ...nextState.workspacePathById };
            const nextDefaultById = { ...nextState.workspaceDefaultById };
            delete nextBranchById[workspaceId];
            delete nextPathById[workspaceId];
            delete nextDefaultById[workspaceId];
            const nextWorkspaces = nextState.workspaces.filter(
              (item) => item.id !== workspaceId,
            );
            const nextRuntimeCacheById = removeWorkspaceRuntimeCacheEntries({
              workspaceRuntimeCacheById: nextState.workspaceRuntimeCacheById,
              workspaceIds: [workspaceId],
            });
            const nextTaskWorkspaceIdById = Object.fromEntries(
              Object.entries(nextState.taskWorkspaceIdById).filter(
                ([, ownerWorkspaceId]) => ownerWorkspaceId !== workspaceId,
              ),
            );
            return {
              workspaces: nextWorkspaces,
              workspaceBranchById: nextBranchById,
              workspacePathById: nextPathById,
              workspaceDefaultById: nextDefaultById,
              recentProjects: captureCurrentProjectState({
                recentProjects: nextState.recentProjects,
                projectPath: nextState.projectPath,
                projectName: nextState.projectName,
                defaultBranch: nextState.defaultBranch,
                workspaces: nextWorkspaces,
                activeWorkspaceId: nextState.activeWorkspaceId,
                workspaceBranchById: nextBranchById,
                workspacePathById: nextPathById,
                workspaceDefaultById: nextDefaultById,
                archivedWorkspacePathsToAdd: [workspacePath],
                linkedWorkspacePathsToRemove: [workspacePath],
              }),
              workspaceFileCacheByPath: removeCachedWorkspaceFiles({
                workspaceFileCacheByPath: nextState.workspaceFileCacheByPath,
                workspacePaths: [workspacePath],
              }),
              workspaceRuntimeCacheById: nextRuntimeCacheById,
              taskWorkspaceIdById: nextTaskWorkspaceIdById,
            };
          });
          startWorkspaceArchiveCleanup({
            workspaceId,
            workspaceName: workspace?.name,
            workspacePath,
            workspaceBranch,
            projectPath,
            isLinkedWorktree,
            deleteBranch,
          });
          try {
            await get().flushProjectRegistry();
          } catch (error) {
            console.error(
              "[workspace-archive] flushProjectRegistry failed",
              { workspaceId },
              error,
            );
          }
        },
        switchWorkspace: async ({ workspaceId }) => {
          const current = get();
          if (workspaceId === current.activeWorkspaceId) {
            if (current.activeAppSurface.kind !== "workspace") {
              set(() => ({
                activeAppSurface: WORKSPACE_APP_SURFACE,
              }));
            }
            return;
          }
          if (
            !current.workspaces.some(
              (workspace) => workspace.id === workspaceId,
            )
          ) {
            return;
          }

          const workspacePath =
            current.workspacePathById[workspaceId] ??
            (current.workspaceDefaultById[workspaceId]
              ? (current.projectPath ?? undefined)
              : undefined);
          if (!workspacePath) {
            return;
          }
          const workspaceIdentityRequestToken = beginWorkspaceIdentityRequest();
          // Persist the outgoing workspace before its state is swapped out.
          // Snapshot writes are otherwise driven by a single app-level trailing
          // debounce that always targets whichever workspace is active when it
          // fires, so switching re-targets that timer and silently drops the
          // pending write. The in-memory runtime cache keeps the UI looking
          // correct for the rest of the session, which is why the loss only
          // surfaces after a restart (e.g. an archived task coming back alive).
          // `activateProject` already flushes for the same reason.
          await get().flushActiveWorkspaceSnapshot();
          const cachedFiles = getCachedWorkspaceFiles({
            workspacePath,
            workspaceFileCacheByPath: current.workspaceFileCacheByPath,
          });
          const switchMetricToken = ++workspaceSwitchMetricTokenCounter;
          const switchStartedAt = getWorkspaceSwitchMetricNow();
          const cachedWorkspaceState =
            current.workspaceRuntimeCacheById[workspaceId];
          const shouldLoadWorkspaceShellState =
            !cachedWorkspaceState ||
            shouldReloadWorkspaceShellFromPersistence({ cachedWorkspaceState });
          let shellResolvedAt = !shouldLoadWorkspaceShellState
            ? switchStartedAt
            : undefined;
          let setRootResolvedAt = switchStartedAt;
          const resolvedWorkspaceShellState = !shouldLoadWorkspaceShellState
            ? null
            : await loadWorkspaceShellStateFromPersistence({
                workspaceId,
              }).then((result) => {
                shellResolvedAt = getWorkspaceSwitchMetricNow();
                return result;
              });
          if (
            !isCurrentWorkspaceIdentityRequest(workspaceIdentityRequestToken) ||
            !isWorkspaceTargetCurrent({
              state: get(),
              workspaceId,
              workspacePath,
              projectPath: current.projectPath,
            })
          ) {
            return;
          }
          await Promise.resolve(
            workspaceFsAdapter.setRoot?.({
              rootPath: workspacePath,
              rootName: current.projectName ?? "project",
              files: cachedFiles,
            }),
          ).then(() => {
            setRootResolvedAt = getWorkspaceSwitchMetricNow();
          });
          if (
            !isCurrentWorkspaceIdentityRequest(workspaceIdentityRequestToken) ||
            !isWorkspaceTargetCurrent({
              state: get(),
              workspaceId,
              workspacePath,
              projectPath: current.projectPath,
            })
          ) {
            return;
          }
          const preferLoadedWorkspaceState = shouldPreferLoadedWorkspaceState({
            cachedWorkspaceState,
            loadedWorkspaceShellState: resolvedWorkspaceShellState,
          });
          const workspaceState =
            (preferLoadedWorkspaceState
              ? resolvedWorkspaceShellState?.workspaceState
              : (cachedWorkspaceState ??
                resolvedWorkspaceShellState?.workspaceState)) ??
            buildWorkspaceSessionState({ snapshot: null });
          set((state) => {
            if (
              !isCurrentWorkspaceIdentityRequest(
                workspaceIdentityRequestToken,
              ) ||
              !isWorkspaceTargetCurrent({
                state,
                workspaceId,
                workspacePath,
                projectPath: current.projectPath,
              })
            ) {
              return state;
            }
            const workspaceIds = state.workspaces.map(
              (workspace) => workspace.id,
            );
            const nextRuntimeCacheById = saveActiveWorkspaceRuntimeCache({
              state,
            });
            if (preferLoadedWorkspaceState) {
              delete nextRuntimeCacheById[workspaceId];
            }
            return {
              workspaces: state.workspaces,
              activeWorkspaceId: workspaceId,
              activeAppSurface: WORKSPACE_APP_SURFACE,
              workspaceSnapshotVersion: 0,
              promptDraftPersistenceVersion: 0,
              taskMessagesLoadingByTask: {},
              workspaceRuntimeCacheById: nextRuntimeCacheById,
              taskWorkspaceIdById: registerTaskWorkspaceOwnership({
                taskWorkspaceIdById: retainTaskWorkspaceOwnership({
                  taskWorkspaceIdById: state.taskWorkspaceIdById,
                  workspaceIds,
                }),
                workspaceId,
                tasks: workspaceState.tasks,
              }),
              ...workspaceState,
              layout: {
                ...state.layout,
                terminalDocked: workspaceState.terminalDocked,
                editorDiffMode: resolveEditorDiffMode({
                  editorTabs: workspaceState.editorTabs,
                  activeEditorTabId: workspaceState.activeEditorTabId,
                }),
                editorMarkdownPreviewMode: false,
              },
              projectFiles: cachedFiles,
            };
          });
          if (get().activeWorkspaceId !== workspaceId) {
            return;
          }
          registerWorkspaceSwitchMetric({
            workspaceId,
            metric: {
              token: switchMetricToken,
              startedAt: switchStartedAt,
              cacheHit:
                Boolean(cachedWorkspaceState) && !preferLoadedWorkspaceState,
              ...(shellResolvedAt !== undefined ? { shellResolvedAt } : {}),
              setRootResolvedAt,
            },
          });
          logWorkspaceSwitchMetric({
            workspaceId,
            token: switchMetricToken,
            phase: "active",
            extra: {
              taskCount: workspaceState.tasks.length,
              fileCount: cachedFiles.length,
            },
          });
          refreshWorkspaceFilesInBackground({
            workspaceId,
            workspacePath,
            switchMetricToken,
          });
          if (resolvedWorkspaceShellState) {
            if (
              preferLoadedWorkspaceState &&
              resolvedWorkspaceShellState.activeTaskIdForLatestHydration
            ) {
              void loadTaskMessagesIntoSession({
                workspaceId,
                taskId:
                  resolvedWorkspaceShellState.activeTaskIdForLatestHydration,
                mode: "latest",
              });
            }
            hydrateWorkspaceMessagesInBackground({
              workspaceId,
              taskIds: resolvedWorkspaceShellState.initialTaskIds,
              latestTurns: resolvedWorkspaceShellState.latestTurns,
              switchMetricToken,
            });
          }
        },
        moveWorkspaceInProjectList: ({
          projectPath,
          workspaceId,
          direction,
        }) => {
          const normalizedProjectPath = projectPath.trim();
          const normalizedWorkspaceId = workspaceId.trim();
          if (!normalizedProjectPath || !normalizedWorkspaceId) {
            return;
          }

          set((state) => {
            const indexDelta = direction === "up" ? -1 : 1;

            if (state.projectPath === normalizedProjectPath) {
              const fromIndex = state.workspaces.findIndex(
                (workspace) => workspace.id === normalizedWorkspaceId,
              );
              const nextWorkspaces = moveArrayItem(
                state.workspaces,
                fromIndex,
                fromIndex + indexDelta,
              );
              if (nextWorkspaces === state.workspaces) {
                return state;
              }

              return {
                workspaces: nextWorkspaces,
                recentProjects: upsertRecentProjectState({
                  projects: state.recentProjects,
                  project: {
                    projectPath: normalizedProjectPath,
                    projectName: state.projectName ?? "project",
                    lastOpenedAt:
                      state.recentProjects.find(
                        (project) =>
                          project.projectPath === normalizedProjectPath,
                      )?.lastOpenedAt ?? new Date().toISOString(),
                    defaultBranch: state.defaultBranch,
                    workspaces: nextWorkspaces,
                    activeWorkspaceId: state.activeWorkspaceId,
                    workspaceBranchById: state.workspaceBranchById,
                    workspacePathById: state.workspacePathById,
                    workspaceDefaultById: state.workspaceDefaultById,
                    ...resolveRecentProjectPreferences({
                      projectPath: normalizedProjectPath,
                      recentProjects: state.recentProjects,
                    }),
                  },
                }),
              };
            }

            const projectIndex = state.recentProjects.findIndex(
              (project) => project.projectPath === normalizedProjectPath,
            );
            const project =
              projectIndex >= 0 ? state.recentProjects[projectIndex] : null;
            if (!project) {
              return state;
            }

            const fromIndex = project.workspaces.findIndex(
              (workspace) => workspace.id === normalizedWorkspaceId,
            );
            const nextWorkspaces = moveArrayItem(
              project.workspaces,
              fromIndex,
              fromIndex + indexDelta,
            );
            if (nextWorkspaces === project.workspaces) {
              return state;
            }

            const nextProject = {
              ...cloneRecentProjectState(project),
              workspaces: nextWorkspaces,
            } satisfies RecentProjectState;

            return {
              recentProjects: state.recentProjects.map((item, index) =>
                index === projectIndex
                  ? nextProject
                  : cloneRecentProjectState(item),
              ),
            };
          });
        },
        renameWorkspace: async ({ projectPath, workspaceId, name }) => {
          const normalizedWorkspaceId = workspaceId.trim();
          const normalizedName = name.trim();
          if (!normalizedWorkspaceId) {
            return { ok: false, message: "Workspace is required." };
          }
          if (!normalizedName) {
            return { ok: false, message: "Label is required." };
          }

          const stateBefore = get();
          const normalizedProjectPath =
            projectPath?.trim() || stateBefore.projectPath?.trim() || "";
          const targetProject =
            normalizedProjectPath &&
            normalizedProjectPath !== stateBefore.projectPath
              ? (stateBefore.recentProjects.find(
                  (project) => project.projectPath === normalizedProjectPath,
                ) ?? null)
              : null;
          const targetWorkspace =
            stateBefore.workspaces.find(
              (workspace) => workspace.id === normalizedWorkspaceId,
            ) ??
            targetProject?.workspaces.find(
              (workspace) => workspace.id === normalizedWorkspaceId,
            ) ??
            null;
          const isDefaultWorkspace =
            stateBefore.workspaceDefaultById[normalizedWorkspaceId] === true ||
            targetProject?.workspaceDefaultById[normalizedWorkspaceId] === true;

          if (!targetWorkspace) {
            return { ok: false, message: "Workspace not found." };
          }
          if (isDefaultWorkspace) {
            return {
              ok: false,
              message: "Default workspace labels cannot be changed.",
            };
          }
          if (targetWorkspace.name === normalizedName) {
            return { ok: true };
          }

          set((state) => {
            const isCurrentProject =
              !normalizedProjectPath ||
              normalizedProjectPath === state.projectPath;
            const nextWorkspaces = isCurrentProject
              ? state.workspaces.map((workspace) =>
                  workspace.id === normalizedWorkspaceId
                    ? { ...workspace, name: normalizedName }
                    : workspace,
                )
              : state.workspaces;
            const currentProjects = captureCurrentProjectState({
              recentProjects: state.recentProjects,
              projectPath: state.projectPath,
              projectName: state.projectName,
              defaultBranch: state.defaultBranch,
              workspaces: nextWorkspaces,
              activeWorkspaceId: state.activeWorkspaceId,
              workspaceBranchById: state.workspaceBranchById,
              workspacePathById: state.workspacePathById,
              workspaceDefaultById: state.workspaceDefaultById,
            });
            const nextRecentProjects = currentProjects.map((project) => {
              if (project.projectPath !== normalizedProjectPath) {
                return cloneRecentProjectState(project);
              }
              return {
                ...cloneRecentProjectState(project),
                workspaces: project.workspaces.map((workspace) =>
                  workspace.id === normalizedWorkspaceId
                    ? { ...workspace, name: normalizedName }
                    : workspace,
                ),
              };
            });

            return {
              workspaces: nextWorkspaces,
              recentProjects: nextRecentProjects,
            };
          });

          const snapshot = await loadWorkspaceSnapshot({
            workspaceId: normalizedWorkspaceId,
          });
          if (snapshot) {
            await persistWorkspaceSnapshot({
              workspaceId: normalizedWorkspaceId,
              workspaceName: normalizedName,
              activeTaskId: snapshot.activeTaskId,
              tasks: snapshot.tasks,
              messagesByTask: snapshot.messagesByTask,
              promptDraftByTask: snapshot.promptDraftByTask,
              workspaceInformation: snapshot.workspaceInformation,
              editorTabs: snapshot.editorTabs ?? [],
              activeEditorTabId: snapshot.activeEditorTabId ?? null,
              terminalTabs: snapshot.terminalTabs ?? [],
              activeTerminalTabId: snapshot.activeTerminalTabId ?? null,
              terminalDocked: snapshot.terminalDocked ?? false,
              cliSessionTabs: snapshot.cliSessionTabs ?? [],
              activeCliSessionTabId: snapshot.activeCliSessionTabId ?? null,
              activeSurface: snapshot.activeSurface ?? {
                kind: "task",
                taskId: snapshot.activeTaskId,
              },
              openTaskTabIds: snapshot.openTaskTabIds,
              lensTabs: snapshot.lensTabs,
              paneTabMeta: snapshot.paneTabMeta,
              dockLayout: snapshot.dockLayout,
              providerSessionByTask: snapshot.providerSessionByTask,
            });
          }
          await get().flushProjectRegistry();
          return { ok: true };
        },
        setProjectWorkspaceInitCommand: ({ projectPath, command }) => {
          set((state) => {
            const normalizedProjectPath =
              projectPath?.trim() || state.projectPath?.trim() || "";
            if (!normalizedProjectPath) {
              return state;
            }

            const currentProjects = captureCurrentProjectState({
              recentProjects: state.recentProjects,
              projectPath: state.projectPath,
              projectName: state.projectName,
              defaultBranch: state.defaultBranch,
              workspaces: state.workspaces,
              activeWorkspaceId: state.activeWorkspaceId,
              workspaceBranchById: state.workspaceBranchById,
              workspacePathById: state.workspacePathById,
              workspaceDefaultById: state.workspaceDefaultById,
            });
            const existingProject = currentProjects.find(
              (project) => project.projectPath === normalizedProjectPath,
            );
            if (!existingProject) {
              return state;
            }

            const nextCommand = normalizeProjectWorkspaceInitCommand({
              value: command,
            });
            const currentCommand = normalizeProjectWorkspaceInitCommand({
              value: existingProject.newWorkspaceInitCommand,
            });
            if (currentCommand === nextCommand) {
              return state;
            }

            return {
              recentProjects: upsertRecentProjectState({
                projects: currentProjects,
                project: {
                  ...cloneRecentProjectState(existingProject),
                  newWorkspaceInitCommand: nextCommand,
                },
              }),
            };
          });
        },
        setProjectBasePrompt: ({ projectPath, prompt }) => {
          set((state) => {
            const recentProjects = updateCurrentProjectTextPreference({
              state,
              projectPath,
              preference: { key: "projectBasePrompt", value: prompt },
            });
            return recentProjects ? { recentProjects } : state;
          });
        },
        setProjectKickoffBranchNamingRule: ({ projectPath, rule }) => {
          set((state) => {
            const recentProjects = updateCurrentProjectTextPreference({
              state,
              projectPath,
              preference: { key: "kickoffBranchNamingRule", value: rule },
            });
            return recentProjects ? { recentProjects } : state;
          });
        },
        setProjectAppearance: ({ projectPath, icon, color }) => {
          set((state) => {
            const recentProjects = updateCurrentProjectAppearance({
              state,
              projectPath,
              icon,
              color,
            });
            return recentProjects ? { recentProjects } : state;
          });
        },
        setProjectWorkspaceUseRootNodeModulesSymlink: ({
          projectPath,
          enabled,
        }) => {
          set((state) => {
            const normalizedProjectPath =
              projectPath?.trim() || state.projectPath?.trim() || "";
            if (!normalizedProjectPath) {
              return state;
            }

            const currentProjects = captureCurrentProjectState({
              recentProjects: state.recentProjects,
              projectPath: state.projectPath,
              projectName: state.projectName,
              defaultBranch: state.defaultBranch,
              workspaces: state.workspaces,
              activeWorkspaceId: state.activeWorkspaceId,
              workspaceBranchById: state.workspaceBranchById,
              workspacePathById: state.workspacePathById,
              workspaceDefaultById: state.workspaceDefaultById,
            });
            const existingProject = currentProjects.find(
              (project) => project.projectPath === normalizedProjectPath,
            );
            if (!existingProject) {
              return state;
            }

            const nextEnabled =
              normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
                value: enabled,
              });
            const currentEnabled =
              normalizeProjectWorkspaceRootNodeModulesSymlinkPreference({
                value: existingProject.newWorkspaceUseRootNodeModulesSymlink,
              });
            if (currentEnabled === nextEnabled) {
              return state;
            }

            return {
              recentProjects: upsertRecentProjectState({
                projects: currentProjects,
                project: {
                  ...cloneRecentProjectState(existingProject),
                  newWorkspaceUseRootNodeModulesSymlink: nextEnabled,
                },
              }),
            };
          });
        },
        setDarkMode: ({ enabled }) => {
          const nextThemeMode: AppSettings["themeMode"] = enabled
            ? "dark"
            : "light";
          const hadCustomTheme = Boolean(get().settings.customThemeId);
          set((state) => {
            if (
              state.isDarkMode === enabled &&
              state.settings.themeMode === nextThemeMode &&
              !state.settings.customThemeId
            ) {
              return state;
            }
            return {
              isDarkMode: enabled,
              settings: {
                ...state.settings,
                themeMode: nextThemeMode,
                customThemeId: null,
              },
            };
          });
          if (hadCustomTheme) {
            applyCustomTheme({ theme: null });
          }
          applyThemeClass({ enabled });
        },

        installCustomTheme: ({ theme }) => {
          const state = get();
          const existing = state.settings.userCustomThemes;
          if (existing.length >= MAX_USER_THEMES) {
            return {
              ok: false,
              error: `Maximum of ${MAX_USER_THEMES} user themes reached.`,
            };
          }
          const allIds = new Set([
            ...BUILTIN_CUSTOM_THEMES.map((t) => t.id),
            ...existing.map((t) => t.id),
          ]);
          if (allIds.has(theme.id)) {
            return {
              ok: false,
              error: `Theme id "${theme.id}" already exists.`,
            };
          }
          set((s) => ({
            settings: {
              ...s.settings,
              userCustomThemes: [...s.settings.userCustomThemes, theme],
            },
          }));
          return { ok: true };
        },

        removeCustomTheme: ({ themeId }) => {
          const state = get();
          const wasActive = state.settings.customThemeId === themeId;
          set((s) => ({
            settings: {
              ...s.settings,
              userCustomThemes: s.settings.userCustomThemes.filter(
                (t) => t.id !== themeId,
              ),
              customThemeId: wasActive ? null : s.settings.customThemeId,
            },
          }));
          if (wasActive) {
            applyCustomTheme({ theme: null });
          }
        },

        updateSettings: ({ patch }) => {
          const normalizedPatch: Partial<AppSettings> = {
            ...patch,
            ...(patch.sharedSkillsHome === undefined
              ? {}
              : {
                  sharedSkillsHome: normalizeSharedSkillsHomeSetting(
                    patch.sharedSkillsHome,
                  ),
                }),
            ...(patch.appShortcutKeys === undefined
              ? {}
              : {
                  appShortcutKeys: normalizeAppShortcutKeys(
                    patch.appShortcutKeys,
                  ),
                }),
            ...(patch.modelShortcutKeys === undefined
              ? {}
              : {
                  modelShortcutKeys: normalizeModelShortcutKeys(
                    patch.modelShortcutKeys,
                  ),
                }),
            ...(patch.modelShortcutEfforts === undefined
              ? {}
              : {
                  modelShortcutEfforts: normalizeModelShortcutEfforts(
                    patch.modelShortcutEfforts,
                  ),
                }),
            ...(patch.promptCommentShortcut === undefined
              ? {}
              : {
                  promptCommentShortcut: normalizePromptCommentShortcut(
                    patch.promptCommentShortcut,
                  ),
                }),
            ...(patch.steerQueueEnterAction === undefined
              ? {}
              : {
                  steerQueueEnterAction: normalizeSteerQueueEnterAction(
                    patch.steerQueueEnterAction,
                  ),
                }),
            ...(patch.visualCommentShortcut === undefined
              ? {}
              : {
                  visualCommentShortcut: normalizeVisualCommentShortcut(
                    patch.visualCommentShortcut,
                  ),
                }),
            ...(patch.trustedTools === undefined
              ? {}
              : {
                  trustedTools: normalizeTrustedToolEntries(patch.trustedTools),
                }),
            ...(patch.advisorTarget === undefined
              ? {}
              : {
                  advisorTarget: normalizeAdvisorTarget(patch.advisorTarget),
                }),
            ...(patch.reasoningExpansionMode === undefined
              ? {}
              : {
                  reasoningExpansionMode: normalizeReasoningExpansionMode(
                    patch.reasoningExpansionMode,
                  ),
                }),
            ...(patch.sidebarActiveWorkspaceLimit === undefined
              ? {}
              : {
                  sidebarActiveWorkspaceLimit:
                    normalizeSidebarActiveWorkspaceLimit(
                      patch.sidebarActiveWorkspaceLimit,
                    ),
                }),
            ...(patch.infoPanelSectionVisibility === undefined
              ? {}
              : {
                  infoPanelSectionVisibility:
                    normalizeWorkspaceInformationSectionVisibility(
                      patch.infoPanelSectionVisibility,
                    ),
                }),
            ...(patch.kickoffSourceConfigs === undefined
              ? {}
              : {
                  kickoffSourceConfigs: normalizeKickoffSourceConfigs(
                    patch.kickoffSourceConfigs,
                  ),
                }),
            ...(patch.providerTimeoutMs === undefined
              ? {}
              : {
                  providerTimeoutMs: normalizeProviderTimeoutMs({
                    value: patch.providerTimeoutMs,
                  }),
                }),
            ...(patch.autoRoutingObjective === undefined
              ? {}
              : {
                  autoRoutingObjective: normalizeAutoRoutingObjective(
                    patch.autoRoutingObjective,
                  ),
                }),
            ...(patch.autoRoutingEligibleClaudeModels === undefined
              ? {}
              : {
                  autoRoutingEligibleClaudeModels:
                    normalizeAutoRoutingEligibleModels(
                      patch.autoRoutingEligibleClaudeModels,
                    ),
                }),
            ...(patch.autoRoutingEligibleCodexModels === undefined
              ? {}
              : {
                  autoRoutingEligibleCodexModels:
                    normalizeAutoRoutingEligibleModels(
                      patch.autoRoutingEligibleCodexModels,
                    ),
                }),
            ...(patch.claudeTaskBudgetTokens === undefined
              ? {}
              : {
                  claudeTaskBudgetTokens: normalizeClaudeTaskBudgetTokens({
                    value: patch.claudeTaskBudgetTokens,
                  }),
                }),
            ...(patch.claudeSettingSources === undefined
              ? {}
              : {
                  claudeSettingSources: normalizeClaudeSettingSources({
                    value: patch.claudeSettingSources,
                  }),
                }),
            ...(patch.taskPresets === undefined
              ? {}
              : {
                  taskPresets: normalizePersistedTaskPresets(patch.taskPresets),
                }),
            ...(patch.lensSessionScope === undefined
              ? {}
              : {
                  lensSessionScope: normalizeLensSessionScope(
                    patch.lensSessionScope,
                  ),
                }),
            ...(patch.lensAgentPresentationMode === undefined
              ? {}
              : {
                  lensAgentPresentationMode:
                    normalizeLensAgentPresentationMode(
                      patch.lensAgentPresentationMode,
                    ),
                }),
            ...(patch.lensAllowedHosts === undefined
              ? {}
              : {
                  lensAllowedHosts: normalizeLensHostList(
                    patch.lensAllowedHosts,
                    defaultSettings.lensAllowedHosts,
                  ),
                }),
            ...(patch.lensBlockedHosts === undefined
              ? {}
              : {
                  lensBlockedHosts: normalizeLensHostList(
                    patch.lensBlockedHosts,
                    defaultSettings.lensBlockedHosts,
                  ),
                }),
            ...(patch.lensCdpApprovedHosts === undefined
              ? {}
              : {
                  lensCdpApprovedHosts: normalizeLensHostList(
                    patch.lensCdpApprovedHosts,
                    defaultSettings.lensCdpApprovedHosts,
                  ),
                }),
            ...(patch.notificationSoundVolume === undefined
              ? {}
              : {
                  notificationSoundVolume: normalizeNotificationSoundVolume(
                    patch.notificationSoundVolume,
                  ),
                }),
            ...(patch.notificationSoundPreset === undefined
              ? {}
              : {
                  notificationSoundPreset: normalizeNotificationSoundPreset(
                    patch.notificationSoundPreset,
                  ),
                }),
            ...(patch.notificationSoundMode === undefined
              ? {}
              : {
                  notificationSoundMode: normalizeNotificationSoundMode(
                    patch.notificationSoundMode,
                  ),
                }),
          };

          // ── resolve custom-theme side-effects ───────────────────────
          // When a custom theme is selected, automatically align themeMode
          // to the theme's base mode so the correct CSS selector activates.
          const customThemeIdChanged =
            normalizedPatch.customThemeId !== undefined;
          if (customThemeIdChanged && normalizedPatch.customThemeId) {
            const userThemes = get().settings.userCustomThemes;
            const theme = findCustomThemeById({
              themeId: normalizedPatch.customThemeId,
              userThemes,
            });
            if (theme && normalizedPatch.themeMode === undefined) {
              normalizedPatch.themeMode = theme.baseMode;
            }
          }

          const nextThemeMode = normalizedPatch.themeMode;
          const nextIsDark = nextThemeMode
            ? resolveDarkModeForTheme({ themeMode: nextThemeMode })
            : null;

          set((state) => {
            const nextSettings = { ...state.settings, ...normalizedPatch };
            const settingsChanged = Object.keys(normalizedPatch).some(
              (key) =>
                nextSettings[key as keyof AppSettings] !==
                state.settings[key as keyof AppSettings],
            );
            if (
              !settingsChanged &&
              (nextIsDark === null || nextIsDark === state.isDarkMode)
            ) {
              return state;
            }
            const nextState: Partial<AppState> = {
              settings: nextSettings,
            };
            if (nextIsDark !== null) {
              nextState.isDarkMode = nextIsDark;
            }
            return {
              ...nextState,
            };
          });

          // ── apply custom theme ────────────────────────────────────────
          if (customThemeIdChanged) {
            const s = get().settings;
            const theme = s.customThemeId
              ? findCustomThemeById({
                  themeId: s.customThemeId,
                  userThemes: s.userCustomThemes,
                })
              : null;
            applyCustomTheme({ theme });
          }

          if (normalizedPatch.themeOverrides) {
            applyThemeOverrides({
              themeOverrides: normalizedPatch.themeOverrides,
            });
          }
          if (nextIsDark !== null) {
            applyThemeClass({ enabled: nextIsDark });
          }
          if (
            normalizedPatch.messageFontFamily !== undefined ||
            normalizedPatch.messageMonoFontFamily !== undefined ||
            normalizedPatch.messageKoreanFontFamily !== undefined
          ) {
            const s = get().settings;
            applyFontOverrides({
              messageFontFamily: s.messageFontFamily,
              messageMonoFontFamily: s.messageMonoFontFamily,
              messageKoreanFontFamily: s.messageKoreanFontFamily,
            });
          }
        },
        updateModelRuntimePreference: (args) => {
          set((state) => {
            const settings = mergeModelRuntimePreferenceSettings(
              state.settings,
              args,
            );
            return settings === state.settings ? state : { settings };
          });
        },
        setPersistenceBootstrapStatus: ({ phase, message }) => {
          set(() => ({
            persistenceBootstrapPhase: phase,
            persistenceBootstrapMessage: message ?? "",
          }));
        },
        refreshProviderCommandCatalog: () => {
          set((state) => ({
            providerCommandCatalogRefreshNonce:
              state.providerCommandCatalogRefreshNonce + 1,
          }));
        },
        notifyWorkspacePlansChanged: () => {
          set((state) => ({
            workspacePlansRefreshNonce: state.workspacePlansRefreshNonce + 1,
          }));
        },
        openFleetView: () => {
          set((state) => {
            if (state.activeAppSurface.kind === "fleet-view") {
              return state;
            }
            return {
              activeAppSurface: FLEET_VIEW_APP_SURFACE,
            };
          });
        },
        closeFleetView: () => {
          set((state) => {
            if (state.activeAppSurface.kind === "workspace") {
              return state;
            }
            return {
              activeAppSurface: WORKSPACE_APP_SURFACE,
            };
          });
        },
        toggleFleetView: () => {
          set((state) => ({
            activeAppSurface:
              state.activeAppSurface.kind === "fleet-view"
                ? WORKSPACE_APP_SURFACE
                : FLEET_VIEW_APP_SURFACE,
          }));
        },
        openCompareRun: ({ compareRunId }) => {
          const normalizedCompareRunId = compareRunId.trim();
          if (!normalizedCompareRunId) {
            return;
          }
          set((state) => {
            if (!state.compareRunsById[normalizedCompareRunId]) {
              return state;
            }
            return {
              activeCompareRunId: normalizedCompareRunId,
              activeAppSurface: WORKSPACE_APP_SURFACE,
              activeSurface: {
                kind: "compare-run",
                compareRunId: normalizedCompareRunId,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        startCompareRunFromActiveDraft: async () => {
          const state = get();
          const activeDraft =
            state.promptDraftByTask[state.activeTaskId] ??
            state.promptDraftByTask["draft:session"] ??
            EMPTY_PROMPT_DRAFT;
          const seedPrompt = activeDraft.text.trim();
          if (!seedPrompt) {
            return {
              ok: false,
              message: "Write a prompt before starting a compare run.",
            };
          }
          return get().startCompareRun({ seedPrompt });
        },
        startCompareRun: async ({
          seedPrompt,
          variants,
          judge,
          reviewCriteria,
        }) => {
          const normalizedSeedPrompt = seedPrompt.trim();
          if (!normalizedSeedPrompt) {
            return {
              ok: false,
              message: "Compare run prompt is required.",
            };
          }

          const stateBefore = get();
          if (!stateBefore.projectPath || !stateBefore.activeWorkspaceId) {
            return {
              ok: false,
              message: "Open a project before starting a compare run.",
            };
          }

          const normalizedVariants = normalizeCompareVariants(
            variants ??
              buildDefaultCompareVariants({
                modelClaude: stateBefore.settings.modelClaude,
                modelCodex: stateBefore.settings.modelCodex,
              }),
          );
          if (normalizedVariants.length < 2) {
            return {
              ok: false,
              message: "Compare runs need at least two variants.",
            };
          }

          const compareRunId = crypto.randomUUID();
          const now = buildRecentTimestamp();
          const baseWorkspaceId = stateBefore.activeWorkspaceId;
          const baseBranch =
            stateBefore.workspaceBranchById[baseWorkspaceId] ??
            stateBefore.defaultBranch ??
            "main";
          const compareRun = buildInitialCompareRun({
            id: compareRunId,
            seedPrompt: normalizedSeedPrompt,
            baseWorkspaceId,
            baseTaskId: stateBefore.activeTaskId ?? undefined,
            baseBranch,
            variants: normalizedVariants,
            reviewCriteria: normalizeCompareReviewCriteria(reviewCriteria),
            judge,
            now,
          });

          set((state) => ({
            compareRunsById: {
              ...state.compareRunsById,
              [compareRunId]: compareRun,
            },
            activeCompareRunId: compareRunId,
          }));

          const updateVariant = (
            variantId: string,
            patch: Partial<CompareRunVariant>,
            expectedStatuses?: readonly CompareRunVariant["status"][],
          ) => {
            set((state) => {
              const compareRunsById = patchCompareRunVariant({
                runsById: state.compareRunsById,
                compareRunId,
                variantId,
                patch,
                expectedStatuses,
                now: buildRecentTimestamp(),
              });
              return compareRunsById === state.compareRunsById
                ? state
                : { compareRunsById };
            });
          };
          await launchCompareRunVariants({
            compareRun,
            seedPrompt: normalizedSeedPrompt,
            baseBranch,
            updateVariant,
            createWorkspace: (input) => get().createWorkspace(input),
            readCreatedCandidate: (fallbackWorkspaceName) => {
              const state = get();
              const workspaceId = state.activeWorkspaceId;
              const taskId = state.activeTaskId;
              return workspaceId && taskId
                ? {
                    workspaceId,
                    taskId,
                    workspaceName:
                      state.workspaces.find(
                        (workspace) => workspace.id === workspaceId,
                      )?.name ?? fallbackWorkspaceName,
                    workspacePath: state.workspacePathById[workspaceId],
                    branchName: state.workspaceBranchById[workspaceId],
                  }
                : null;
            },
            setTaskProvider: (input) => get().setTaskProvider(input),
            setTaskRuntimeOverrides: ({ taskId, runtimeOverrides }) =>
              get().updatePromptDraft({ taskId, patch: { runtimeOverrides } }),
            sendUserMessage: (input) => get().sendUserMessage(input),
          });

          set((state) => {
            const compareRunsById = finalizeCompareRunLaunch({
              runsById: state.compareRunsById,
              compareRunId,
              now: buildRecentTimestamp(),
            });
            if (compareRunsById === state.compareRunsById) {
              return state;
            }
            return {
              compareRunsById,
              activeCompareRunId: compareRunId,
              activeAppSurface: WORKSPACE_APP_SURFACE,
              activeSurface: {
                kind: "compare-run",
                compareRunId,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });

          const finalRun = get().compareRunsById[compareRunId];
          if (
            finalRun?.status === "failed" ||
            finalRun?.status === "cancelled"
          ) {
            return {
              ok: false,
              compareRunId,
              message:
                finalRun.error || "No compare variants could be started.",
            };
          }
          return { ok: true, compareRunId };
        },
        openCompareVariant: async ({ compareRunId, variantId }) => {
          const run = get().compareRunsById[compareRunId];
          const variant = run?.variants.find((item) => item.id === variantId);
          if (!variant?.workspaceId || !variant.taskId) {
            return;
          }
          const stateBeforeOpen = get();
          if (stateBeforeOpen.activeWorkspaceId !== variant.workspaceId) {
            await stateBeforeOpen.switchWorkspace({
              workspaceId: variant.workspaceId,
            });
          }
          get().selectTask({ taskId: variant.taskId });
        },
        keepCompareVariant: async ({ compareRunId, variantId }) => {
          const run = get().compareRunsById[compareRunId];
          const keptVariant = run?.variants.find(
            (variant) => variant.id === variantId,
          );
          if (!run || !keptVariant?.workspaceId || !keptVariant.taskId) {
            return {
              ok: false,
              message: "Compare variant is no longer available.",
            };
          }
          if (keptVariant.status !== "completed") {
            return {
              ok: false,
              message: "Wait until this candidate finishes before keeping it.",
            };
          }
          if (
            run.judge?.status === "pending" ||
            run.judge?.status === "running"
          ) {
            return {
              ok: false,
              message:
                "Wait for the independent judge before keeping a result.",
            };
          }

          const discardWorkspaceIds = run.variants
            .filter(
              (variant) =>
                variant.id !== variantId &&
                variant.workspaceId &&
                variant.status !== "discarded",
            )
            .map((variant) => variant.workspaceId!);

          for (const workspaceId of discardWorkspaceIds) {
            await get().closeWorkspace({ workspaceId });
          }

          await get().openCompareVariant({ compareRunId, variantId });

          set((state) => {
            const currentRun = state.compareRunsById[compareRunId];
            if (!currentRun) {
              return state;
            }
            return {
              compareRunsById: {
                ...state.compareRunsById,
                [compareRunId]: {
                  ...currentRun,
                  status: "completed",
                  keptVariantId: variantId,
                  updatedAt: buildRecentTimestamp(),
                  variants: currentRun.variants.map((variant) => {
                    if (variant.id === variantId) {
                      return { ...variant, status: "kept" };
                    }
                    if (variant.workspaceId) {
                      return { ...variant, status: "discarded" };
                    }
                    return variant;
                  }),
                },
              },
            };
          });

          return { ok: true, compareRunId };
        },
        cancelCompareRun: async ({ compareRunId }) => {
          const run = get().compareRunsById[compareRunId];
          if (!run) {
            return { ok: false, message: "Compare run was not found." };
          }
          if (run.keptVariantId) {
            return {
              ok: false,
              message: "The kept candidate is no longer part of this run.",
            };
          }
          if (run.status === "cancelled") {
            return { ok: true, compareRunId };
          }

          set((state) => {
            const currentRun = state.compareRunsById[compareRunId];
            if (!currentRun) {
              return state;
            }
            return {
              compareRunsById: {
                ...state.compareRunsById,
                [compareRunId]: {
                  ...currentRun,
                  status: "cancelled",
                  updatedAt: buildRecentTimestamp(),
                  variants: currentRun.variants.map((variant) => ({
                    ...variant,
                    status: variant.status === "kept" ? "kept" : "discarded",
                  })),
                },
              },
            };
          });

          await cancelCompareJudgeSecondaryRun({ run });

          for (const variant of run.variants) {
            if (variant.workspaceId && variant.status !== "discarded") {
              await get().closeWorkspace({ workspaceId: variant.workspaceId });
            }
          }

          return { ok: true, compareRunId };
        },
        focusTaskAttention: async ({
          taskId,
          workspaceId,
          projectPath,
          refreshFromPersistence = false,
        }) => {
          const stateBefore = get();
          if (projectPath && projectPath !== stateBefore.projectPath) {
            await stateBefore.openProject({ projectPath });
          }

          const stateAfterProjectOpen = get();
          const resolvedWorkspaceId =
            workspaceId ??
            stateAfterProjectOpen.taskWorkspaceIdById[taskId] ??
            stateAfterProjectOpen.activeWorkspaceId;

          if (
            resolvedWorkspaceId &&
            resolvedWorkspaceId !== stateAfterProjectOpen.activeWorkspaceId
          ) {
            await stateAfterProjectOpen.switchWorkspace({
              workspaceId: resolvedWorkspaceId,
            });
          }

          if (refreshFromPersistence && resolvedWorkspaceId) {
            const shell = await loadWorkspaceShellForRestore({
              workspaceId: resolvedWorkspaceId,
            });
            const persistedTask =
              shell?.tasks.find((task) => task.id === taskId) ?? null;
            if (persistedTask) {
              set((state) => {
                if (state.activeWorkspaceId !== resolvedWorkspaceId) {
                  return {};
                }
                const nextTasks = state.tasks.some((task) => task.id === taskId)
                  ? state.tasks.map((task) =>
                      task.id === taskId ? persistedTask : task,
                    )
                  : [persistedTask, ...state.tasks];
                const persistedDraft = shell?.promptDraftByTask[taskId];
                const persistedProviderSession =
                  shell?.providerSessionByTask[taskId];
                return {
                  tasks: nextTasks,
                  messagesByTask: {
                    ...state.messagesByTask,
                    [taskId]: [],
                  },
                  messageCountByTask: {
                    ...state.messageCountByTask,
                    [taskId]: shell?.messageCountByTask[taskId] ?? 0,
                  },
                  promptDraftByTask: persistedDraft
                    ? {
                        ...state.promptDraftByTask,
                        [taskId]: persistedDraft,
                      }
                    : state.promptDraftByTask,
                  providerSessionByTask: persistedProviderSession
                    ? {
                        ...state.providerSessionByTask,
                        [taskId]: persistedProviderSession,
                      }
                    : state.providerSessionByTask,
                  taskWorkspaceIdById: {
                    ...state.taskWorkspaceIdById,
                    [taskId]: resolvedWorkspaceId,
                  },
                };
              });
            }
          }

          const stateAfterWorkspaceOpen = get();
          stateAfterWorkspaceOpen.selectTask({ taskId });
          set((state) => ({
            focusPendingInteractionRequest: {
              taskId,
              nonce: (state.focusPendingInteractionRequest?.nonce ?? 0) + 1,
            },
          }));
        },
        requestTaskScrollToLatest: ({ taskId }) =>
          set((state) => reduceTaskScrollToLatestRequest({ state, taskId })),
        selectTask: ({ taskId }) => {
          const stateBefore = get();
          const targetTask =
            stateBefore.tasks.find((task) => task.id === taskId) ?? null;
          if (!targetTask || isTaskArchived(targetTask)) {
            return;
          }
          const workspaceId =
            stateBefore.taskWorkspaceIdById[taskId] ??
            stateBefore.activeWorkspaceId;
          const shouldLoadMessages = shouldLoadLatestTaskMessages({
            taskId,
            messagesByTask: stateBefore.messagesByTask,
            messageCountByTask: stateBefore.messageCountByTask,
          });
          // Reviewing a task in the task window is the normal way to clear its
          // turn outcomes; Fleet only mirrors what has not been looked at yet.
          attentionSync.markTaskReviewed(taskId);
          attentionSync.syncTaskInteractions({
            taskId,
            messages: stateBefore.messagesByTask[taskId] ?? [],
          });
          if (
            stateBefore.activeTaskId === taskId &&
            stateBefore.activeAppSurface.kind === "workspace" &&
            stateBefore.activeSurface.kind === "task" &&
            stateBefore.activeSurface.taskId === taskId
          ) {
            if (workspaceId && shouldLoadMessages) {
              void loadTaskMessagesIntoSession({
                workspaceId,
                taskId,
                mode: "latest",
              });
            }
            get().requestTaskScrollToLatest({ taskId });
            return;
          }
          set((state) => ({
            activeTaskId: taskId,
            activeAppSurface: WORKSPACE_APP_SURFACE,
            activeSurface: { kind: "task", taskId },
            openTaskTabIds: state.openTaskTabIds.includes(taskId)
              ? state.openTaskTabIds
              : [...state.openTaskTabIds, taskId],
            workspaceSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
          }));
          if (workspaceId && shouldLoadMessages) {
            void loadTaskMessagesIntoSession({
              workspaceId,
              taskId,
              mode: "latest",
            });
          }
        },
        loadTaskMessages: async ({ taskId, mode = "latest" }) => {
          const state = get();
          const workspaceId =
            state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId;
          if (!workspaceId || !taskId) {
            return;
          }
          await loadTaskMessagesIntoSession({
            workspaceId,
            taskId,
            mode,
          });
        },
        clearTaskSelection: () =>
          set((state) => {
            if (!state.activeTaskId) {
              if (state.activeAppSurface.kind !== "workspace") {
                return {
                  activeAppSurface: WORKSPACE_APP_SURFACE,
                };
              }
              return state;
            }
            return {
              activeTaskId: "",
              activeAppSurface: WORKSPACE_APP_SURFACE,
              activeSurface:
                state.activeSurface.kind === "task"
                  ? { kind: "task", taskId: "" }
                  : state.activeSurface,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          }),
        updatePromptDraft: ({ taskId, patch }) => {
          set((state) => {
            const workspaceId =
              state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId;
            const cachedSession =
              workspaceId && workspaceId !== state.activeWorkspaceId
                ? (state.workspaceRuntimeCacheById[workspaceId] ?? null)
                : null;
            const promptDraftByTask =
              cachedSession?.promptDraftByTask ?? state.promptDraftByTask;
            const currentDraft =
              promptDraftByTask[taskId] ?? EMPTY_PROMPT_DRAFT;
            const nextDraft = normalizePromptDraftForStorage({
              text: currentDraft.text,
              attachedFilePaths: currentDraft.attachedFilePaths,
              attachments: currentDraft.attachments,
              runtimeOverrides: currentDraft.runtimeOverrides,
              promptBatch: currentDraft.promptBatch,
              queuedTurns: currentDraft.queuedTurns,
              queuedNextTurn: currentDraft.queuedNextTurn,
              ...patch,
            });
            const textChanged = nextDraft.text !== currentDraft.text;
            const attachedFilePathsChanged =
              nextDraft.attachedFilePaths.length !==
                currentDraft.attachedFilePaths.length ||
              nextDraft.attachedFilePaths.some(
                (p, i) => p !== currentDraft.attachedFilePaths[i],
              );
            const attachmentsChanged =
              nextDraft.attachments.length !==
                currentDraft.attachments.length ||
              nextDraft.attachments.some(
                (a, i) => a !== currentDraft.attachments[i],
              );
            const runtimeOverridesChanged =
              !arePromptDraftRuntimeOverridesEqual(
                nextDraft.runtimeOverrides,
                currentDraft.runtimeOverrides,
              );
            const promptBatchChanged = !arePromptDraftBatchItemsEqual(
              nextDraft.promptBatch,
              currentDraft.promptBatch,
            );
            const queuedTurnsChanged = !arePromptDraftQueuedTurnsEqual(
              nextDraft.queuedTurns,
              currentDraft.queuedTurns,
            );
            if (
              !textChanged &&
              !attachedFilePathsChanged &&
              !attachmentsChanged &&
              !runtimeOverridesChanged &&
              !promptBatchChanged &&
              !queuedTurnsChanged
            ) {
              return state;
            }
            if (cachedSession) {
              return {
                workspaceRuntimeCacheById: {
                  ...state.workspaceRuntimeCacheById,
                  [workspaceId]: {
                    ...cachedSession,
                    promptDraftByTask: {
                      ...cachedSession.promptDraftByTask,
                      [taskId]: nextDraft,
                    },
                  },
                },
              };
            }
            const onlyTextChanged =
              textChanged &&
              !attachedFilePathsChanged &&
              !attachmentsChanged &&
              !runtimeOverridesChanged &&
              !promptBatchChanged &&
              !queuedTurnsChanged;
            return {
              promptDraftByTask: {
                ...state.promptDraftByTask,
                [taskId]: nextDraft,
              },
              ...(onlyTextChanged
                ? {
                    promptDraftPersistenceVersion:
                      incrementPromptDraftPersistenceVersion(state),
                  }
                : {
                    workspaceSnapshotVersion:
                      incrementWorkspaceSnapshotVersion(state),
                  }),
            };
          });
        },
        clearTaskProviderSession: ({ taskId, providerId }) => {
          set((state) => {
            const currentSession = state.providerSessionByTask[taskId];
            const existingSessionId = getProviderSessionId({
              sessions: currentSession,
              providerId,
            });
            if (!existingSessionId) {
              return state;
            }

            const nextTaskSession: TaskProviderSessionState = {
              ...currentSession,
            };
            delete nextTaskSession[providerId];
            const providerGoalByTask =
              providerId === "codex"
                ? (() => {
                    const { [taskId]: _droppedGoal, ...rest } =
                      state.providerGoalByTask;
                    return rest;
                  })()
                : state.providerGoalByTask;

            const activeProvider = state.tasks.find(
              (task) => task.id === taskId,
            )?.provider;
            const nextNativeSessionReady =
              activeProvider !== undefined &&
              Boolean(
                getProviderSessionId({
                  sessions: nextTaskSession,
                  providerId: activeProvider,
                }),
              );

            return {
              providerSessionByTask: {
                ...state.providerSessionByTask,
                [taskId]: nextTaskSession,
              },
              providerGoalByTask,
              nativeSessionReadyByTask: {
                ...state.nativeSessionReadyByTask,
                [taskId]: nextNativeSessionReady,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        updateWorkspaceInformation: ({ updater }) => {
          set((state) => {
            const nextWorkspaceInformation = updater(
              state.workspaceInformation,
            );
            if (nextWorkspaceInformation === state.workspaceInformation) {
              return state;
            }
            return {
              workspaceInformation: nextWorkspaceInformation,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        applyExternalWorkspaceInformationUpdate: ({
          workspaceId,
          workspaceInformation,
        }) => {
          set((state) => {
            const cachedSession = state.workspaceRuntimeCacheById[workspaceId];
            const nextRuntimeCacheById = cachedSession
              ? {
                  ...state.workspaceRuntimeCacheById,
                  [workspaceId]: {
                    ...cachedSession,
                    workspaceInformation,
                  },
                }
              : state.workspaceRuntimeCacheById;

            if (workspaceId === state.activeWorkspaceId) {
              return {
                workspaceInformation,
                workspaceRuntimeCacheById: nextRuntimeCacheById,
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(state),
              };
            }

            if (cachedSession) {
              return {
                workspaceRuntimeCacheById: nextRuntimeCacheById,
              };
            }

            return state;
          });
        },
        clearPromptDraft: ({ taskId }) => {
          set((state) => {
            const workspaceId =
              state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId;
            const cachedSession =
              workspaceId && workspaceId !== state.activeWorkspaceId
                ? (state.workspaceRuntimeCacheById[workspaceId] ?? null)
                : null;
            const promptDraftByTask =
              cachedSession?.promptDraftByTask ?? state.promptDraftByTask;
            const currentDraft =
              promptDraftByTask[taskId] ?? EMPTY_PROMPT_DRAFT;
            if (
              !hasPromptDraftPayload(currentDraft) &&
              !currentDraft.queuedNextTurn &&
              (currentDraft.queuedTurns?.length ?? 0) === 0
            ) {
              return state;
            }
            const nextDraft = buildClearedPromptDraft(currentDraft);
            if (cachedSession) {
              return {
                workspaceRuntimeCacheById: {
                  ...state.workspaceRuntimeCacheById,
                  [workspaceId]: {
                    ...cachedSession,
                    promptDraftByTask: {
                      ...cachedSession.promptDraftByTask,
                      [taskId]: nextDraft,
                    },
                  },
                },
              };
            }
            return {
              promptDraftByTask: {
                ...state.promptDraftByTask,
                [taskId]: nextDraft,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        createTask: ({ title }) => {
          const trimmed = (title ?? "").trim();
          const stateBefore = get();
          const workspaceId = stateBefore.activeWorkspaceId;
          if (
            !workspaceId ||
            !stateBefore.workspaces.some(
              (workspace) => workspace.id === workspaceId,
            )
          ) {
            return;
          }
          const nextTask: Task = {
            id: crypto.randomUUID(),
            title: trimmed.length > 0 ? trimmed : "New Task",
            provider: stateBefore.draftProvider,
            updatedAt: buildRecentTimestamp(),
            unread: false,
            archivedAt: null,
            controlMode: "interactive",
            controlOwner: "stave",
          };
          set((state) => {
            return {
              tasks: [nextTask, ...state.tasks],
              activeTaskId: nextTask.id,
              activeAppSurface: WORKSPACE_APP_SURFACE,
              activeSurface: { kind: "task", taskId: nextTask.id },
              openTaskTabIds: [...state.openTaskTabIds, nextTask.id],
              messagesByTask: {
                ...state.messagesByTask,
                [nextTask.id]: [],
              },
              messageCountByTask: {
                ...state.messageCountByTask,
                [nextTask.id]: 0,
              },
              nativeSessionReadyByTask: {
                ...state.nativeSessionReadyByTask,
                [nextTask.id]: false,
              },
              providerSessionByTask: {
                ...state.providerSessionByTask,
                [nextTask.id]: {},
              },
              taskWorkspaceIdById: {
                ...state.taskWorkspaceIdById,
                [nextTask.id]: workspaceId,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
          runScriptHookInBackground({
            workspaceId,
            trigger: "task.created",
            taskId: nextTask.id,
            taskTitle: nextTask.title,
          });
        },
        renameTask: ({ taskId, title, source = "manual" }) => {
          const nextTitle = title.trim();
          if (!nextTitle) {
            return;
          }
          set((state) => {
            if (isTaskManaged(findTaskById(state, taskId))) {
              return state;
            }
            const target = state.tasks.find((task) => task.id === taskId);
            // A manual rename is a deliberate user choice — never let an
            // automatic suggestion overwrite it afterwards.
            if (source === "auto" && target?.titleManuallySet) {
              return state;
            }
            const markManual = source === "manual";
            return {
              tasks: state.tasks.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      title: nextTitle,
                      updatedAt: buildRecentTimestamp(),
                      ...(markManual ? { titleManuallySet: true } : {}),
                    }
                  : task,
              ),
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        restoreTask: ({ taskId }) => {
          const stateBefore = get();
          const workspaceId =
            stateBefore.taskWorkspaceIdById[taskId] ??
            stateBefore.activeWorkspaceId;
          const shouldLoadMessages =
            !(taskId in stateBefore.messagesByTask) &&
            (stateBefore.messageCountByTask[taskId] ?? 0) > 0;
          set((state) => {
            const targetTask = state.tasks.find((task) => task.id === taskId);
            if (!targetTask || !isTaskArchived(targetTask)) {
              return {};
            }
            return {
              tasks: state.tasks.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      archivedAt: null,
                      updatedAt: buildRecentTimestamp(),
                    }
                  : task,
              ),
              activeTaskId: taskId,
              activeAppSurface: WORKSPACE_APP_SURFACE,
              activeSurface: { kind: "task", taskId },
              openTaskTabIds: state.openTaskTabIds.includes(taskId)
                ? state.openTaskTabIds
                : [...state.openTaskTabIds, taskId],
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
          if (workspaceId && shouldLoadMessages) {
            void loadTaskMessagesIntoSession({
              workspaceId,
              taskId,
              mode: "latest",
            });
          }
        },
        duplicateTask: async ({ taskId }) => {
          const stateBefore = get();
          const sourceTask = stateBefore.tasks.find(
            (task) => task.id === taskId,
          );
          if (!sourceTask) {
            return;
          }
          const workspaceId =
            stateBefore.taskWorkspaceIdById[taskId] ??
            stateBefore.activeWorkspaceId;
          const sourceMessages = (() => {
            const loadedMessages = stateBefore.messagesByTask[taskId];
            const totalCount =
              stateBefore.messageCountByTask[taskId] ??
              loadedMessages?.length ??
              0;
            if (loadedMessages && loadedMessages.length >= totalCount) {
              return loadedMessages;
            }
            return null;
          })();
          const completeSourceMessages =
            sourceMessages ??
            (await loadWorkspaceSnapshot({ workspaceId }))?.messagesByTask[
              taskId
            ] ??
            [];

          set((state) => {
            const nextTaskId = crypto.randomUUID();
            const duplicatedMessages = completeSourceMessages.map(
              (message) => ({
                ...message,
                id: crypto.randomUUID(),
                isStreaming: false,
              }),
            );
            const duplicatedTask: Task = {
              ...sourceTask,
              id: nextTaskId,
              title: `${sourceTask.title} (copy)`,
              updatedAt: buildRecentTimestamp(),
              unread: false,
              archivedAt: null,
              controlMode: "interactive",
              controlOwner: "stave",
            };
            return {
              tasks: [duplicatedTask, ...state.tasks],
              activeTaskId: duplicatedTask.id,
              activeSurface: { kind: "task", taskId: duplicatedTask.id },
              openTaskTabIds: [...state.openTaskTabIds, duplicatedTask.id],
              taskCheckpointById: {
                ...state.taskCheckpointById,
                [duplicatedTask.id]: state.taskCheckpointById[taskId] ?? "",
              },
              messagesByTask: {
                ...state.messagesByTask,
                [duplicatedTask.id]: duplicatedMessages,
              },
              messageCountByTask: {
                ...state.messageCountByTask,
                [duplicatedTask.id]: duplicatedMessages.length,
              },
              nativeSessionReadyByTask: {
                ...state.nativeSessionReadyByTask,
                [duplicatedTask.id]: false,
              },
              providerSessionByTask: {
                ...state.providerSessionByTask,
                [duplicatedTask.id]: {},
              },
              taskWorkspaceIdById: {
                ...state.taskWorkspaceIdById,
                [duplicatedTask.id]: workspaceId,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        reorderTasks: ({ activeTaskId, overTaskId, filter }) => {
          set((state) => {
            const nextTasks = reorderTasksWithinFilter({
              tasks: state.tasks,
              activeTaskId,
              overTaskId,
              filter,
            });
            if (nextTasks === state.tasks) {
              return {};
            }
            return {
              tasks: nextTasks,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        exportTask: async ({ taskId }) => {
          if (typeof document === "undefined") {
            return;
          }
          const state = get();
          const task = state.tasks.find((item) => item.id === taskId);
          if (!task) {
            return;
          }
          const workspaceId =
            state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId;
          const loadedMessages = state.messagesByTask[taskId];
          const totalCount =
            state.messageCountByTask[taskId] ?? loadedMessages?.length ?? 0;
          const messages =
            loadedMessages && loadedMessages.length >= totalCount
              ? loadedMessages
              : ((await loadWorkspaceSnapshot({ workspaceId }))?.messagesByTask[
                  taskId
                ] ?? []);
          const payload = {
            exportedAt: new Date().toISOString(),
            task,
            messages,
          };
          const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const anchor = document.createElement("a");
          const safeTitle = task.title
            .replaceAll(/[^a-z0-9-_]+/gi, "-")
            .toLowerCase();
          anchor.href = url;
          anchor.download = `${safeTitle || "task"}-${taskId}.json`;
          document.body.append(anchor);
          anchor.click();
          anchor.remove();
          URL.revokeObjectURL(url);
        },
        viewTaskChanges: async ({ taskId }) => {
          const state = get();
          const checkpoint = state.taskCheckpointById[taskId];
          const workspaceCwd = resolveTaskWorkspaceContext({
            taskId,
            activeWorkspaceId: state.activeWorkspaceId,
            taskWorkspaceIdById: state.taskWorkspaceIdById,
            workspacePathById: state.workspacePathById,
            workspaceDefaultById: state.workspaceDefaultById,
            projectPath: state.projectPath,
          }).cwd;
          const runCommand = window.api?.terminal?.runCommand;
          if (!runCommand || !workspaceCwd) {
            return;
          }

          const command = checkpoint
            ? `git diff --name-status ${JSON.stringify(checkpoint)} --`
            : "git status --porcelain";
          const result = await runCommand({ cwd: workspaceCwd, command });
          const rawOutput = result.ok
            ? result.stdout.trim() ||
              "No file changes for this task checkpoint."
            : result.stderr.trim() || "Failed to load task changes.";
          const output =
            result.ok &&
            rawOutput !== "No file changes for this task checkpoint."
              ? `### Task Changes\n\n\`\`\`diff\n${rawOutput}\n\`\`\``
              : result.ok
                ? rawOutput
                : `> **Failed to load task changes.** ${rawOutput}`;

          set((nextState) => {
            const current = nextState.messagesByTask[taskId] ?? [];
            const message: ChatMessage = {
              id: buildMessageId({
                taskId,
                count: Math.max(
                  current.length,
                  nextState.messageCountByTask[taskId] ?? 0,
                ),
              }),
              role: "assistant",
              model: "system",
              providerId: "user",
              content: rawOutput,
              parts: [
                {
                  type: "text",
                  text: output,
                },
              ],
            };
            return {
              messagesByTask: {
                ...nextState.messagesByTask,
                [taskId]: trimLoadedTaskMessages({
                  messages: [...current, message],
                }),
              },
              messageCountByTask: {
                ...nextState.messageCountByTask,
                [taskId]: Math.max(
                  (nextState.messageCountByTask[taskId] ?? current.length) + 1,
                  current.length + 1,
                ),
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(nextState),
            };
          });
        },
        rollbackTask: async ({ taskId }) => {
          const state = get();
          const checkpoint = state.taskCheckpointById[taskId];
          const workspaceCwd = resolveTaskWorkspaceContext({
            taskId,
            activeWorkspaceId: state.activeWorkspaceId,
            taskWorkspaceIdById: state.taskWorkspaceIdById,
            workspacePathById: state.workspacePathById,
            workspaceDefaultById: state.workspaceDefaultById,
            projectPath: state.projectPath,
          }).cwd;
          const runCommand = window.api?.terminal?.runCommand;
          if (!runCommand || !checkpoint || !workspaceCwd) {
            return;
          }

          const rollbackResult = await runCommand({
            cwd: workspaceCwd,
            command: `git restore --source=${JSON.stringify(checkpoint)} --staged --worktree .`,
          });
          if (rollbackResult.ok) {
            cleanupRestoredTaskProviderRuntime({ taskId });
          }

          const rawOutput = rollbackResult.ok
            ? `Rollback complete to checkpoint ${checkpoint}. Provider session reset for the next turn.`
            : rollbackResult.stderr.trim() || "Rollback failed.";
          const output = rollbackResult.ok
            ? `Rollback complete to checkpoint \`${checkpoint}\`. Provider session reset for the next turn.`
            : `> **Rollback failed.** ${rollbackResult.stderr.trim() || "Unknown error."}`;

          const files = await workspaceFsAdapter.listFiles();
          set((nextState) => {
            const current = nextState.messagesByTask[taskId] ?? [];
            const message: ChatMessage = {
              id: buildMessageId({
                taskId,
                count: Math.max(
                  current.length,
                  nextState.messageCountByTask[taskId] ?? 0,
                ),
              }),
              role: "assistant",
              model: "system",
              providerId: "user",
              content: rawOutput,
              parts: [
                {
                  type: "text",
                  text: output,
                },
              ],
            };
            return {
              projectFiles: files,
              ...(rollbackResult.ok
                ? clearRestoredTaskProviderSession({
                    state: nextState,
                    taskId,
                  })
                : {}),
              messagesByTask: {
                ...nextState.messagesByTask,
                [taskId]: trimLoadedTaskMessages({
                  messages: [...current, message],
                }),
              },
              messageCountByTask: {
                ...nextState.messageCountByTask,
                [taskId]: Math.max(
                  (nextState.messageCountByTask[taskId] ?? current.length) + 1,
                  current.length + 1,
                ),
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(nextState),
            };
          });
        },
        rollbackToCompactBoundary: async ({ taskId, gitRef, trigger }) => {
          const state = get();
          const resolvedGitRef = gitRef.trim();
          if (!resolvedGitRef) {
            return;
          }
          const taskWorkspaceId =
            state.taskWorkspaceIdById[taskId] ?? state.activeWorkspaceId;
          const workspaceCwd =
            state.workspacePathById[taskWorkspaceId] ||
            state.projectPath ||
            undefined;
          const runCommand = window.api?.terminal?.runCommand;
          if (!runCommand) {
            return;
          }

          const compactBoundaryLabel = trigger?.trim()
            ? `context compacted (${trigger.trim()})`
            : "context compacted";

          const appendResultMessage = (args: {
            rawOutput: string;
            output: string;
            files?: string[];
            resetProviderSession?: boolean;
          }) => {
            set((nextState) => {
              const current = nextState.messagesByTask[taskId] ?? [];
              const message: ChatMessage = {
                id: buildMessageId({
                  taskId,
                  count: Math.max(
                    current.length,
                    nextState.messageCountByTask[taskId] ?? 0,
                  ),
                }),
                role: "assistant",
                model: "system",
                providerId: "user",
                content: args.rawOutput,
                parts: [
                  {
                    type: "text",
                    text: args.output,
                  },
                ],
              };
              return {
                ...(args.files ? { projectFiles: args.files } : {}),
                ...(args.resetProviderSession
                  ? clearRestoredTaskProviderSession({
                      state: nextState,
                      taskId,
                    })
                  : {}),
                messagesByTask: {
                  ...nextState.messagesByTask,
                  [taskId]: trimLoadedTaskMessages({
                    messages: [...current, message],
                  }),
                },
                messageCountByTask: {
                  ...nextState.messageCountByTask,
                  [taskId]: Math.max(
                    (nextState.messageCountByTask[taskId] ?? current.length) +
                      1,
                    current.length + 1,
                  ),
                },
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(nextState),
              };
            });
          };

          if (state.activeTurnIdsByTask[taskId]) {
            appendResultMessage({
              rawOutput: "Restore is blocked while a turn is still running.",
              output:
                "> **Restore blocked.** Wait for the active turn to complete, then retry.",
            });
            return;
          }

          const restoreResult = await runCommand({
            cwd: workspaceCwd,
            command: `git restore --source=${JSON.stringify(resolvedGitRef)} --staged --worktree .`,
          });
          if (restoreResult.ok) {
            cleanupRestoredTaskProviderRuntime({ taskId });
          }
          const rawOutput = restoreResult.ok
            ? `Restore complete to ${compactBoundaryLabel} checkpoint ${resolvedGitRef}. Provider session reset for the next turn.`
            : restoreResult.stderr.trim() || "Restore failed.";
          const output = restoreResult.ok
            ? `Restore complete to ${compactBoundaryLabel} checkpoint \`${resolvedGitRef}\`. Provider session reset for the next turn.`
            : `> **Restore failed.** ${restoreResult.stderr.trim() || "Unknown error."}`;
          const files = await workspaceFsAdapter.listFiles();
          appendResultMessage({
            rawOutput,
            output,
            files,
            resetProviderSession: restoreResult.ok,
          });
        },
        archiveTask: ({ taskId }) => {
          const stateBefore = get();
          const activeTurnId = stateBefore.activeTurnIdsByTask[taskId];
          const targetTask =
            stateBefore.tasks.find((task) => task.id === taskId) ?? null;
          const workspaceId =
            stateBefore.taskWorkspaceIdById[taskId] ??
            stateBefore.activeWorkspaceId;
          if (
            !targetTask ||
            isTaskArchived(targetTask) ||
            isTaskManaged(findTaskById(stateBefore, taskId))
          ) {
            return;
          }
          set((state) => {
            const interrupted = state.activeTurnIdsByTask[taskId]
              ? interruptActiveTaskTurns({
                  tasks: [targetTask],
                  messagesByTask: state.messagesByTask,
                  activeTurnIdsByTask: state.activeTurnIdsByTask,
                  notice: ARCHIVED_TASK_TURN_NOTICE,
                  messageCountByTask: state.messageCountByTask,
                })
              : {
                  messagesByTask: state.messagesByTask,
                  activeTurnIdsByTask: state.activeTurnIdsByTask,
                };
            const nextTasks = state.tasks.map((task) =>
              task.id === taskId
                ? {
                    ...task,
                    archivedAt: new Date().toISOString(),
                    updatedAt: buildRecentTimestamp(),
                    unread: false,
                  }
                : task,
            );
            const shouldSwitch = state.activeTaskId === taskId;
            const fallbackTaskId = getArchiveFallbackTaskId({
              tasks: state.tasks,
              archivedTaskId: taskId,
            });
            const nextTerminalTabs = state.terminalTabs.map((tab) =>
              tab.linkedTaskId === taskId
                ? { ...tab, linkedTaskId: null }
                : tab,
            );
            const nextCliSessionTabs = state.cliSessionTabs.map((tab) =>
              tab.linkedTaskId === taskId
                ? { ...tab, linkedTaskId: null }
                : tab,
            );
            const nextActiveTaskId = shouldSwitch
              ? fallbackTaskId
              : state.activeTaskId;
            const nextOpenTaskTabIds = state.openTaskTabIds.filter(
              (openTaskId) => openTaskId !== taskId,
            );
            return {
              tasks: nextTasks,
              activeTaskId: nextActiveTaskId,
              activeSurface:
                state.activeSurface.kind === "task" &&
                state.activeSurface.taskId === taskId
                  ? { kind: "task", taskId: nextActiveTaskId }
                  : state.activeSurface,
              openTaskTabIds:
                nextActiveTaskId &&
                !nextOpenTaskTabIds.includes(nextActiveTaskId)
                  ? [...nextOpenTaskTabIds, nextActiveTaskId]
                  : nextOpenTaskTabIds,
              paneTabMeta: removePaneTabMetaEntry({
                paneTabMeta: state.paneTabMeta,
                panelId: buildPanePanelId({ kind: "task", taskId }),
              }),
              terminalTabs: nextTerminalTabs,
              cliSessionTabs: nextCliSessionTabs,
              messagesByTask: interrupted.messagesByTask,
              messageCountByTask: {
                ...state.messageCountByTask,
                [taskId]: Math.max(
                  state.messageCountByTask[taskId] ??
                    (state.messagesByTask[taskId] ?? []).length,
                  (interrupted.messagesByTask[taskId] ?? []).length,
                ),
              },
              activeTurnIdsByTask: interrupted.activeTurnIdsByTask,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
          if (activeTurnId) {
            const abortTurn = window.api?.provider?.abortTurn;
            if (abortTurn) {
              void abortTurn({ turnId: activeTurnId });
            }
          }
          void window.api?.provider?.cleanupTask?.({ taskId });
          // An archived task is settled by definition: it must not keep asking
          // for an answer or a review from Fleet.
          attentionSync.markTaskReviewed(taskId);
          attentionSync.syncTaskInteractions({
            taskId,
            messages: get().messagesByTask[taskId] ?? [],
            endedTurnId: activeTurnId,
          });
          if (workspaceId) {
            runScriptHookInBackground({
              workspaceId,
              trigger: "task.archiving",
              taskId,
              taskTitle: targetTask.title,
            });
          }
        },
        setTaskProvider: ({ taskId, provider }) => {
          set((state) => {
            const hasTask = state.tasks.some((task) => task.id === taskId);
            if (!hasTask) {
              return { draftProvider: provider };
            }
            if (isTaskManaged(findTaskById(state, taskId))) {
              return { draftProvider: provider };
            }
            return {
              tasks: state.tasks.map((task) =>
                task.id === taskId
                  ? {
                      ...task,
                      provider,
                    }
                  : task,
              ),
              draftProvider: provider,
              nativeSessionReadyByTask: {
                ...state.nativeSessionReadyByTask,
                [taskId]: Boolean(
                  getProviderSessionId({
                    sessions: state.providerSessionByTask[taskId],
                    providerId: provider,
                  }),
                ),
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
          void window.api?.provider?.cleanupTask?.({ taskId });
        },
        createTerminalTab: (args) => {
          const state = get();
          const workspaceId = state.activeWorkspaceId;
          const workspacePath =
            state.workspacePathById[workspaceId] ?? state.projectPath ?? "";
          const cwd = args?.cwd?.trim() || workspacePath;
          if (!workspaceId || !cwd) {
            return null;
          }

          const linkedTask =
            args?.linkedTaskId === undefined
              ? findActiveTerminalLinkableTask(state)
              : args.linkedTaskId
                ? findTaskById(state, args.linkedTaskId)
                : null;
          const nextTab = createTerminalTabRecord({
            cwd,
            linkedTaskId:
              linkedTask && !isTaskArchived(linkedTask) ? linkedTask.id : null,
            linkedTaskTitle:
              linkedTask && !isTaskArchived(linkedTask)
                ? linkedTask.title
                : null,
            title: args?.title,
            existingTitles: state.terminalTabs.map((tab) => tab.title),
          });

          set((current) => ({
            terminalTabs: [...current.terminalTabs, nextTab],
            activeTerminalTabId: nextTab.id,
            activeAppSurface: WORKSPACE_APP_SURFACE,
            activeSurface: {
              kind: "terminal",
              terminalTabId: nextTab.id,
            },
            layout: {
              ...current.layout,
              terminalDocked: true,
            },
            workspaceSnapshotVersion:
              incrementWorkspaceSnapshotVersion(current),
          }));

          return nextTab.id;
        },
        createCliSessionTab: ({ provider, contextMode }) => {
          const state = get();
          const workspaceId = state.activeWorkspaceId;
          const workspacePath =
            state.workspacePathById[workspaceId] ?? state.projectPath ?? "";
          if (!workspaceId || !workspacePath) {
            return null;
          }

          const linkedTask =
            contextMode === "active-task"
              ? findActiveTerminalLinkableTask(state)
              : null;
          if (contextMode === "active-task" && !linkedTask) {
            return null;
          }

          const nextTab = createCliSessionTabRecord({
            provider,
            contextMode,
            cwd: workspacePath,
            linkedTaskId: linkedTask?.id ?? null,
            linkedTaskTitle: linkedTask?.title ?? null,
            handoffSummary: linkedTask
              ? buildCliSessionHandoffSummary({
                  task: linkedTask,
                  messages: state.messagesByTask[linkedTask.id] ?? [],
                  workspacePath,
                })
              : "",
            existingTitles: state.cliSessionTabs.map((tab) => tab.title),
          });

          set((current) => ({
            cliSessionTabs: [...current.cliSessionTabs, nextTab],
            activeCliSessionTabId: nextTab.id,
            activeAppSurface: WORKSPACE_APP_SURFACE,
            activeSurface: { kind: "cli-session", cliSessionTabId: nextTab.id },
            workspaceSnapshotVersion:
              incrementWorkspaceSnapshotVersion(current),
          }));

          return nextTab.id;
        },
        applyTaskPreset: ({ presetId }) => {
          const stateBefore = get();
          const preset = stateBefore.settings.taskPresets.find(
            (candidate) => candidate.id === presetId,
          );
          if (!preset) {
            return;
          }
          if (preset.kind === "cli-session") {
            get().createCliSessionTab({
              provider: preset.provider,
              contextMode: preset.contextMode ?? "workspace",
            });
            return;
          }

          // `task` preset: align the per-provider model setting + draft
          // provider so the fresh task picks up the preset's model at turn
          // request time (models are resolved from settings, not persisted
          // per-task today).
          const settingsPatch: Partial<AppSettings> = {};
          if (preset.model) {
            if (preset.provider === "claude-code") {
              settingsPatch.modelClaude = preset.model;
              settingsPatch.claudeEffort =
                (preset.effort as AppSettings["claudeEffort"] | undefined) ??
                resolveDefaultClaudeEffortForModel({ model: preset.model });
            } else if (preset.provider === "codex") {
              settingsPatch.modelCodex = preset.model;
              settingsPatch.codexReasoningEffort =
                (preset.effort as
                  AppSettings["codexReasoningEffort"] | undefined) ??
                resolveDefaultCodexEffortForModel({ model: preset.model });
            }
            const effort =
              preset.provider === "claude-code"
                ? settingsPatch.claudeEffort
                : settingsPatch.codexReasoningEffort;
            if (effort) {
              settingsPatch.modelRuntimePreferences =
                mergeModelRuntimePreference({
                  preferences: stateBefore.settings.modelRuntimePreferences,
                  providerId: preset.provider,
                  model: preset.model,
                  patch: { effort },
                });
            }
          }
          if (Object.keys(settingsPatch).length > 0) {
            get().updateSettings({ patch: settingsPatch });
          }
          set((state) =>
            state.draftProvider === preset.provider
              ? state
              : { draftProvider: preset.provider },
          );
          get().createTask({ title: "" });
        },
        upsertTaskPreset: ({ preset }) => {
          set((state) => {
            const presets = state.settings.taskPresets;
            const existingIndex = presets.findIndex(
              (candidate) => candidate.id === preset.id,
            );
            const nextPresets =
              existingIndex >= 0
                ? presets.map((candidate, index) =>
                    index === existingIndex ? preset : candidate,
                  )
                : [...presets, preset];
            return {
              settings: {
                ...state.settings,
                taskPresets: nextPresets,
              },
            };
          });
        },
        removeTaskPreset: ({ presetId }) => {
          set((state) => {
            const nextPresets = state.settings.taskPresets.filter(
              (candidate) => candidate.id !== presetId,
            );
            if (nextPresets.length === state.settings.taskPresets.length) {
              return state;
            }
            return {
              settings: {
                ...state.settings,
                taskPresets: nextPresets,
              },
            };
          });
        },
        reorderTaskPresets: ({ fromPresetId, toPresetId }) => {
          if (fromPresetId === toPresetId) {
            return;
          }
          set((state) => {
            const presets = state.settings.taskPresets;
            const fromIndex = presets.findIndex(
              (candidate) => candidate.id === fromPresetId,
            );
            const toIndex = presets.findIndex(
              (candidate) => candidate.id === toPresetId,
            );
            if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
              return state;
            }
            const nextPresets = [...presets];
            const [moved] = nextPresets.splice(fromIndex, 1);
            if (!moved) {
              return state;
            }
            nextPresets.splice(toIndex, 0, moved);
            return {
              settings: {
                ...state.settings,
                taskPresets: nextPresets,
              },
            };
          });
        },
        resetTaskPresetsToDefault: () => {
          set((state) => ({
            settings: {
              ...state.settings,
              taskPresets: cloneDefaultTaskPresets(),
            },
          }));
        },
        setActiveCliSessionTab: ({ tabId }) => {
          set((state) => {
            if (tabId === null) {
              if (
                state.activeCliSessionTabId === null &&
                state.activeAppSurface.kind === "workspace" &&
                state.activeSurface.kind === "task"
              ) {
                return state;
              }
              return {
                activeCliSessionTabId: null,
                activeAppSurface: WORKSPACE_APP_SURFACE,
                activeSurface: { kind: "task", taskId: state.activeTaskId },
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(state),
              };
            }
            if (!findCliSessionTabById(state, tabId)) {
              return state;
            }
            if (
              state.activeCliSessionTabId === tabId &&
              state.activeAppSurface.kind === "workspace" &&
              state.activeSurface.kind === "cli-session" &&
              state.activeSurface.cliSessionTabId === tabId
            ) {
              return state;
            }
            return {
              activeCliSessionTabId: tabId,
              activeAppSurface: WORKSPACE_APP_SURFACE,
              activeSurface: { kind: "cli-session", cliSessionTabId: tabId },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        setCliSessionTabNativeSession: ({ tabId, nativeSessionId }) => {
          set((state) => {
            const tab = findCliSessionTabById(state, tabId);
            const normalizedNativeSessionId =
              nativeSessionId?.trim() || undefined;
            if (!tab || tab.nativeSessionId === normalizedNativeSessionId) {
              return state;
            }
            return {
              cliSessionTabs: state.cliSessionTabs.map((item) =>
                item.id === tabId
                  ? { ...item, nativeSessionId: normalizedNativeSessionId }
                  : item,
              ),
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        renameCliSessionTab: ({ tabId, title }) => {
          const normalizedTitle = title.trim();
          if (!normalizedTitle) {
            return;
          }
          set((state) => {
            const tab = findCliSessionTabById(state, tabId);
            if (!tab || tab.title === normalizedTitle) {
              return state;
            }
            return {
              cliSessionTabs: state.cliSessionTabs.map((item) =>
                item.id === tabId ? { ...item, title: normalizedTitle } : item,
              ),
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        reorderCliSessionTabs: ({ fromTabId, toTabId }) => {
          set((state) => {
            const nextTabs = moveItemById({
              items: state.cliSessionTabs,
              fromId: fromTabId,
              toId: toTabId,
            });
            if (nextTabs === state.cliSessionTabs) {
              return state;
            }
            return {
              cliSessionTabs: nextTabs,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        closeCliSessionTab: ({ tabId }) => {
          set((state) => {
            const closingIndex = state.cliSessionTabs.findIndex(
              (tab) => tab.id === tabId,
            );
            if (closingIndex < 0) {
              return state;
            }
            const nextTabs = state.cliSessionTabs.filter(
              (tab) => tab.id !== tabId,
            );
            const fallbackTab =
              nextTabs[
                Math.min(closingIndex, Math.max(nextTabs.length - 1, 0))
              ] ?? null;
            const nextActiveCliSessionTabId =
              state.activeCliSessionTabId === tabId
                ? (fallbackTab?.id ?? null)
                : state.activeCliSessionTabId;
            return {
              cliSessionTabs: nextTabs,
              activeCliSessionTabId: nextActiveCliSessionTabId,
              activeSurface:
                state.activeSurface.kind === "cli-session" &&
                state.activeSurface.cliSessionTabId === tabId
                  ? fallbackTab
                    ? { kind: "cli-session", cliSessionTabId: fallbackTab.id }
                    : { kind: "task", taskId: state.activeTaskId }
                  : state.activeSurface,
              paneTabMeta: removePaneTabMetaEntry({
                paneTabMeta: state.paneTabMeta,
                panelId: buildPanePanelId({
                  kind: "cli-session",
                  cliSessionTabId: tabId,
                }),
              }),
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        renameTerminalTab: ({ tabId, title }) => {
          const normalizedTitle = title.trim();
          if (!normalizedTitle) {
            return;
          }
          set((state) => {
            const tab = findTerminalTabById(state, tabId);
            if (!tab || tab.title === normalizedTitle) {
              return state;
            }
            return {
              terminalTabs: state.terminalTabs.map((item) =>
                item.id === tabId ? { ...item, title: normalizedTitle } : item,
              ),
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        reorderTerminalTabs: ({ fromTabId, toTabId }) => {
          set((state) => {
            const nextTabs = moveItemById({
              items: state.terminalTabs,
              fromId: fromTabId,
              toId: toTabId,
            });
            if (nextTabs === state.terminalTabs) {
              return state;
            }
            return {
              terminalTabs: nextTabs,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        closeTerminalTab: ({ tabId }) => {
          set((state) => {
            const closingIndex = state.terminalTabs.findIndex(
              (tab) => tab.id === tabId,
            );
            if (closingIndex < 0) {
              return state;
            }
            const nextTabs = state.terminalTabs.filter(
              (tab) => tab.id !== tabId,
            );
            const fallbackTab =
              nextTabs[
                Math.min(closingIndex, Math.max(nextTabs.length - 1, 0))
              ] ?? null;
            const nextActiveTerminalTabId =
              state.activeTerminalTabId === tabId
                ? (fallbackTab?.id ?? null)
                : state.activeTerminalTabId;
            return {
              terminalTabs: nextTabs,
              activeTerminalTabId: nextActiveTerminalTabId,
              activeSurface:
                state.activeSurface.kind === "terminal" &&
                state.activeSurface.terminalTabId === tabId
                  ? fallbackTab
                    ? { kind: "terminal", terminalTabId: fallbackTab.id }
                    : { kind: "task", taskId: state.activeTaskId }
                  : state.activeSurface,
              paneTabMeta: removePaneTabMetaEntry({
                paneTabMeta: state.paneTabMeta,
                panelId: buildPanePanelId({
                  kind: "terminal",
                  terminalTabId: tabId,
                }),
              }),
              layout:
                nextTabs.length === 0
                  ? {
                      ...state.layout,
                      terminalDocked: false,
                    }
                  : state.layout,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        setActiveSurfaceFromPane: (surface) => {
          const stateBefore = get();
          const taskId = surface.kind === "task" ? surface.taskId : "";
          const targetTask = taskId
            ? (stateBefore.tasks.find((task) => task.id === taskId) ?? null)
            : null;
          const workspaceId = taskId
            ? (stateBefore.taskWorkspaceIdById[taskId] ??
              stateBefore.activeWorkspaceId)
            : null;
          const shouldLoadMessages =
            targetTask !== null &&
            !isTaskArchived(targetTask) &&
            shouldLoadLatestTaskMessages({
              taskId,
              messagesByTask: stateBefore.messagesByTask,
              messageCountByTask: stateBefore.messageCountByTask,
            });
          set((state) =>
            reduceActiveSurfaceFromPane({
              state,
              surface,
              nextSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
            }),
          );
          if (workspaceId && shouldLoadMessages) {
            void loadTaskMessagesIntoSession({
              workspaceId,
              taskId,
              mode: "latest",
            });
          }
        },
        closeTaskTab: ({ taskId }) =>
          set((state) =>
            reduceCloseTaskTab({
              state,
              taskId,
              nextSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
            }),
          ),
        closeCompareRun: ({ compareRunId }) =>
          set((state) =>
            reduceCloseCompareRun({
              state,
              compareRunId,
              nextSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
            }),
          ),
        createLensTab: () => {
          const state = get();
          if (!state.activeWorkspaceId) {
            return null;
          }
          return state.openLensTab({
            lensSessionId: resolveCreatedLensSessionId(
              state.lensTabs,
              crypto.randomUUID(),
            ),
          });
        },
        openLensTab: ({ lensSessionId, activate }) => {
          const normalizedLensSessionId = lensSessionId.trim();
          if (!get().activeWorkspaceId || !normalizedLensSessionId) {
            return null;
          }
          set((state) =>
            reduceOpenLensTab({
              state,
              lensSessionId: normalizedLensSessionId,
              activate,
              createdAt: Date.now(),
              nextSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
            }),
          );
          return normalizedLensSessionId;
        },
        closeLensTab: ({ lensSessionId }) =>
          set((state) =>
            reduceCloseLensTab({
              state,
              lensSessionId,
              nextSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
            }),
          ),
        setPaneTabMeta: ({ panelId, meta }) =>
          set((state) =>
            reducePaneTabMeta({
              state,
              panelId,
              meta,
              nextSnapshotVersion: incrementWorkspaceSnapshotVersion(state),
            }),
          ),
        renamePaneTab: ({ panelId, title }) => {
          const surface = parsePanePanelId(panelId);
          const normalizedTitle = title.trim();
          if (!surface || !normalizedTitle) {
            return;
          }
          switch (surface.kind) {
            case "task":
              get().renameTask({
                taskId: surface.taskId,
                title: normalizedTitle,
              });
              return;
            case "cli-session":
              get().renameCliSessionTab({
                tabId: surface.cliSessionTabId,
                title: normalizedTitle,
              });
              return;
            case "terminal":
              get().renameTerminalTab({
                tabId: surface.terminalTabId,
                title: normalizedTitle,
              });
              return;
            default:
              get().setPaneTabMeta({
                panelId,
                meta: { customTitle: normalizedTitle },
              });
          }
        },
        setDockLayout: ({ layout }) => {
          set((state) => {
            if (state.dockLayout === layout) {
              return state;
            }
            return {
              dockLayout: layout,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        setWorkspaceBranch: ({ workspaceId, branch }) =>
          set((state) => {
            if (
              !state.workspaces.some(
                (workspace) => workspace.id === workspaceId,
              )
            ) {
              return state;
            }
            return {
              workspaceBranchById: {
                ...state.workspaceBranchById,
                [workspaceId]: branch,
              },
            };
          }),
        fetchWorkspacePrStatus: async ({ workspaceId }) => {
          const state = get();
          if (
            !state.workspaces.some((workspace) => workspace.id === workspaceId)
          )
            return;
          const cwd = state.workspacePathById[workspaceId];
          if (!cwd) return;
          if (state.workspaceDefaultById[workspaceId]) return;
          const projectPath = state.projectPath;

          const getPrStatus = window.api?.sourceControl?.getPrStatus;
          if (!getPrStatus) return;

          try {
            const result = await getPrStatus({ cwd });
            if (!result.ok) return;

            const pr = result.pr as GitHubPrPayload | null;
            const derived = pr ? derivePrStatus(pr) : ("no_pr" as const);
            const info: WorkspacePrInfo = {
              pr,
              derived,
              lastFetched: Date.now(),
            };

            set((s) => {
              if (
                s.workspaceDefaultById[workspaceId] ||
                !isWorkspaceTargetCurrent({
                  state: s,
                  workspaceId,
                  workspacePath: cwd,
                  projectPath,
                })
              ) {
                return s;
              }
              return {
                workspacePrInfoById: {
                  ...s.workspacePrInfoById,
                  [workspaceId]: info,
                },
              };
            });
          } catch {
            // Silently ignore – PR status is best-effort.
          }
        },
        fetchAllWorkspacePrStatuses: async () => {
          const state = get();
          const getPrStatus = window.api?.sourceControl?.getPrStatus;
          if (!getPrStatus) return;

          const now = Date.now();
          const targets = state.workspaces.flatMap((workspace) => {
            const wsId = workspace.id;
            if (state.workspaceDefaultById[wsId]) {
              return [];
            }
            if (wsId === state.activeWorkspaceId) {
              return [];
            }
            const cwd = state.workspacePathById[wsId];
            if (!cwd) {
              return [];
            }
            const lastFetched = state.workspacePrInfoById[wsId]?.lastFetched;
            if (
              typeof lastFetched === "number" &&
              now - lastFetched < WORKSPACE_PR_STATUS_FRESH_MS
            ) {
              return [];
            }
            return [{ wsId, cwd, projectPath: state.projectPath }];
          });
          if (targets.length === 0) {
            return;
          }

          const updates: Array<
            [string, string, string | null, WorkspacePrInfo]
          > = [];
          let targetIndex = 0;
          const fetchNext = async () => {
            while (targetIndex < targets.length) {
              const target = targets[targetIndex];
              targetIndex += 1;
              if (!target) {
                continue;
              }

              try {
                const result = await getPrStatus({ cwd: target.cwd });
                if (!result.ok) continue;

                const pr = result.pr as GitHubPrPayload | null;
                const derived = pr ? derivePrStatus(pr) : ("no_pr" as const);
                updates.push([
                  target.wsId,
                  target.cwd,
                  target.projectPath,
                  {
                    pr,
                    derived,
                    lastFetched: Date.now(),
                  },
                ]);
              } catch {
                // ignore
              }
            }
          };

          await Promise.all(
            Array.from(
              {
                length: Math.min(
                  WORKSPACE_PR_STATUS_POLL_CONCURRENCY,
                  targets.length,
                ),
              },
              () => fetchNext(),
            ),
          );
          if (updates.length === 0) {
            return;
          }
          set((s) => {
            const freshUpdates = updates.filter(
              ([workspaceId, cwd, projectPath]) =>
                !s.workspaceDefaultById[workspaceId] &&
                isWorkspaceTargetCurrent({
                  state: s,
                  workspaceId,
                  workspacePath: cwd,
                  projectPath,
                }),
            );
            if (freshUpdates.length === 0) {
              return s;
            }
            return {
              workspacePrInfoById: {
                ...s.workspacePrInfoById,
                ...Object.fromEntries(
                  freshUpdates.map(([workspaceId, , , info]) => [
                    workspaceId,
                    info,
                  ]),
                ),
              },
            };
          });
        },
        setLayout: ({ patch }) =>
          set((state) => {
            const nextLayout = mergeLayoutPatch({
              layout: state.layout,
              patch,
            });
            if (!nextLayout) {
              return state;
            }
            return {
              layout: nextLayout,
              ...(nextLayout.terminalDocked !== state.layout.terminalDocked
                ? {
                    workspaceSnapshotVersion:
                      incrementWorkspaceSnapshotVersion(state),
                  }
                : {}),
            };
          }),
        toggleEditorDiffMode: () =>
          set((state) => {
            const nextEditorDiffMode = !state.layout.editorDiffMode;
            return {
              layout: {
                ...state.layout,
                editorDiffMode: nextEditorDiffMode,
                // Diff and markdown preview are mutually exclusive views.
                editorMarkdownPreviewMode: nextEditorDiffMode
                  ? false
                  : state.layout.editorMarkdownPreviewMode,
              },
            };
          }),
        toggleEditorMarkdownPreviewMode: () =>
          set((state) => {
            const activeTab = state.editorTabs.find(
              (tab) => tab.id === state.activeEditorTabId,
            );
            const activeTabIsMarkdown = Boolean(
              activeTab &&
              activeTab.kind !== "image" &&
              activeTab.language === "markdown",
            );
            if (!activeTabIsMarkdown) {
              return {};
            }
            const nextPreviewMode = !state.layout.editorMarkdownPreviewMode;
            return {
              layout: {
                ...state.layout,
                editorMarkdownPreviewMode: nextPreviewMode,
                // Diff and markdown preview are mutually exclusive views.
                editorDiffMode: nextPreviewMode
                  ? false
                  : state.layout.editorDiffMode,
              },
            };
          }),
        openWorkspacePicker: async () => {
          const root = await workspaceFsAdapter.pickRoot();
          if (!root) {
            return;
          }
          set((state) => ({
            projectName: root.rootName,
            projectFiles: root.files,
          }));
        },
        refreshProjectFiles: async () => {
          const files = await workspaceFsAdapter.listFiles();
          const state = get();
          const workspacePath = resolveWorkspacePathForId({
            activeWorkspaceId: state.activeWorkspaceId,
            workspacePathById: state.workspacePathById,
            workspaceDefaultById: state.workspaceDefaultById,
            projectPath: state.projectPath,
          });
          set((current) => {
            const nextWorkspaceFileCacheByPath = rememberCachedWorkspaceFiles({
              workspaceFileCacheByPath: current.workspaceFileCacheByPath,
              workspacePath,
              files,
            });
            if (
              areStringArraysEqual(current.projectFiles, files) &&
              nextWorkspaceFileCacheByPath === current.workspaceFileCacheByPath
            ) {
              return current;
            }
            return {
              projectFiles: files,
              workspaceFileCacheByPath: nextWorkspaceFileCacheByPath,
            };
          });
        },
        refreshRateLimits: async () => {
          const getSnapshot = window.api?.provider?.getRateLimitsSnapshot;
          if (!getSnapshot) {
            return;
          }
          set({ rateLimitsLoading: true, rateLimitsError: null });
          try {
            const snapshot = await getSnapshot({});
            set({ rateLimitsSnapshot: snapshot, rateLimitsLoading: false });
          } catch (error) {
            set({
              rateLimitsLoading: false,
              rateLimitsError:
                error instanceof Error ? error.message : String(error),
            });
          }
        },
        refreshProviderAvailability: async () => {
          const checkAvailability = window.api?.provider?.checkAvailability;
          if (!checkAvailability) {
            return;
          }
          const claudeBinaryPath = get().settings.claudeBinaryPath || undefined;
          const codexBinaryPath = get().settings.codexBinaryPath || undefined;
          const availabilityEntries = await Promise.all(
            listProviderIds().map(async (providerId) => {
              const result = await checkAvailability({
                providerId,
                runtimeOptions: {
                  ...(claudeBinaryPath ? { claudeBinaryPath } : {}),
                  ...(codexBinaryPath ? { codexBinaryPath } : {}),
                },
              });
              return [providerId, result.ok && result.available] as const;
            }),
          );

          const providerAvailability = createDefaultProviderAvailability();
          availabilityEntries.forEach(([providerId, available]) => {
            providerAvailability[providerId] = available;
          });

          set(() => ({
            providerAvailability,
          }));
        },
        refreshSkillCatalog: async (args = {}) => {
          const getCatalog = window.api?.skills?.getCatalog;
          const fallbackWorkspacePath =
            get().workspacePathById[get().activeWorkspaceId] ??
            get().projectPath ??
            null;
          const workspacePath =
            args.workspacePath === undefined
              ? fallbackWorkspacePath
              : args.workspacePath;
          const sharedSkillsHome =
            normalizeSharedSkillsHomeSetting(get().settings.sharedSkillsHome) ||
            null;

          if (!getCatalog) {
            set(() => ({
              skillCatalog: {
                status: "error",
                workspacePath,
                sharedSkillsHome,
                fetchedAt: new Date().toISOString(),
                skills: [],
                roots: [],
                detail: "Skill catalog API is unavailable in this build.",
              },
            }));
            return;
          }

          set((state) => ({
            skillCatalog: {
              ...state.skillCatalog,
              status: "loading",
              workspacePath,
              sharedSkillsHome,
              detail: "Loading skill catalog...",
            },
          }));

          try {
            const result = await getCatalog({
              ...(workspacePath ? { workspacePath } : {}),
              ...(sharedSkillsHome ? { sharedSkillsHome } : {}),
            });
            // Use the frontend-normalized `workspacePath` and `sharedSkillsHome`
            // rather than the backend-expanded values so that the comparison keys
            // in component useEffects stay consistent (the backend expands `~`
            // and resolves symlinks, but the component compares against the raw
            // settings string, which would otherwise never match and cause an
            // infinite re-fetch loop).
            set(() => ({
              skillCatalog: {
                status: result.ok ? "ready" : "error",
                workspacePath,
                sharedSkillsHome,
                fetchedAt: result.catalog.fetchedAt,
                skills: result.catalog.skills,
                roots: result.catalog.roots,
                detail: result.ok
                  ? result.catalog.detail
                  : result.message?.trim() || result.catalog.detail,
              },
            }));
          } catch (error) {
            set(() => ({
              skillCatalog: {
                status: "error",
                workspacePath,
                sharedSkillsHome,
                fetchedAt: new Date().toISOString(),
                skills: [],
                roots: [],
                detail: String(error),
              },
            }));
          }
        },
        takeOverTask: async ({ taskId }) => {
          const result = await requestManagedTaskTakeover({ taskId, state: get() });
          if (!result.ok) {
            return result;
          }
          const activeTurnId = get().activeTurnIdsByTask[taskId];
          set((state) => buildManagedTaskTakeoverStatePatch({
            state, taskId, sourceContexts: result.sourceContexts,
            updatedAt: buildRecentTimestamp(),
          }));
          clearProviderTurnStallTimer(taskId);
          attentionSync.syncTaskInteractions({
            taskId,
            messages: get().messagesByTask[taskId] ?? [],
            endedTurnId: activeTurnId,
          });
          const session = getWorkspaceSessionForState({
            state: get(),
            workspaceId: result.workspaceId,
          });
          if (session) {
            persistWorkspaceSessionInBackground({
              workspaceId: result.workspaceId,
              session,
            });
          }
          return result.craneReceiptPending ? { ok: true, craneReceiptPending: true } : { ok: true };
        },
        markNotificationRead: ({ id, resolvedAt }) =>
          markNotificationReadAction({ set, get, id, resolvedAt }),
        markAllNotificationsRead: () =>
          markAllNotificationsReadAction({ set, get }),
        clearNotificationHistory: () =>
          clearNotificationHistoryAction({ set, get }),
        openNotificationContext: async ({ notificationId, targetSurface }) => {
          const notification = get().notifications.find(
            (item) => item.id === notificationId,
          );
          if (!notification) {
            return { status: "opened" };
          }
          const result = await openNotificationContextInternal(notification, {
            targetSurface,
          });
          if (
            isNotificationUnread(notification) &&
            !isNotificationAttentionKind(notification.kind)
          ) {
            await get().markNotificationRead({ id: notification.id });
          }
          return result;
        },
        resolveNotificationApproval: async ({ notificationId, approved }) => {
          const notification = get().notifications.find(
            (item) => item.id === notificationId,
          );
          if (!notification || notification.action?.type !== "approval") {
            return;
          }

          await openNotificationContextInternal(notification);
          const latestState = get();
          const taskId = notification.taskId?.trim();
          if (!taskId) {
            return;
          }

          const locatedApproval = findPendingApprovalMessageByRequestId({
            messages: latestState.messagesByTask[taskId] ?? [],
            requestId: notification.action.requestId,
          });

          if (!locatedApproval) {
            return;
          }

          latestState.resolveApproval({
            taskId,
            messageId:
              notification.action.messageId ?? locatedApproval.messageId,
            approved,
          });
        },
        addReviewComment: ({ taskId, filePath, line, side, body }) => {
          const normalizedTaskId = taskId.trim();
          const normalizedFilePath = filePath.trim();
          const normalizedBody = body.trim();
          if (!normalizedTaskId || !normalizedFilePath || !normalizedBody) {
            return null;
          }

          const normalizedLine =
            Number.isInteger(line) && line && line > 0 ? line : undefined;
          const comment: ReviewComment = {
            id: crypto.randomUUID(),
            filePath: normalizedFilePath,
            ...(normalizedLine ? { line: normalizedLine } : {}),
            side: side === "original" ? "original" : "modified",
            body: normalizedBody,
            createdAt: buildRecentTimestamp(),
          };

          set((state) => ({
            reviewCommentsByTask: {
              ...state.reviewCommentsByTask,
              [normalizedTaskId]: [
                ...(state.reviewCommentsByTask[normalizedTaskId] ?? []),
                comment,
              ],
            },
          }));

          return comment;
        },
        removeReviewComment: ({ taskId, commentId }) => {
          const normalizedTaskId = taskId.trim();
          if (!normalizedTaskId || !commentId) {
            return;
          }
          set((state) => {
            const current = state.reviewCommentsByTask[normalizedTaskId] ?? [];
            const nextComments = current.filter(
              (comment) => comment.id !== commentId,
            );
            if (nextComments.length === current.length) {
              return state;
            }
            const nextByTask = { ...state.reviewCommentsByTask };
            if (nextComments.length > 0) {
              nextByTask[normalizedTaskId] = nextComments;
            } else {
              delete nextByTask[normalizedTaskId];
            }
            return { reviewCommentsByTask: nextByTask };
          });
        },
        clearReviewComments: ({ taskId }) => {
          const normalizedTaskId = taskId.trim();
          if (!normalizedTaskId) {
            return;
          }
          set((state) => {
            if (!state.reviewCommentsByTask[normalizedTaskId]) {
              return state;
            }
            const nextByTask = { ...state.reviewCommentsByTask };
            delete nextByTask[normalizedTaskId];
            return { reviewCommentsByTask: nextByTask };
          });
        },
        submitReviewFeedback: async ({ taskId }) => {
          const normalizedTaskId = taskId.trim();
          if (!normalizedTaskId) {
            return { status: "blocked" } satisfies SendUserMessageResult;
          }

          const state = get();
          const comments = state.reviewCommentsByTask[normalizedTaskId] ?? [];
          const content = formatReviewFeedbackPrompt({ comments });
          if (!content) {
            return { status: "blocked" } satisfies SendUserMessageResult;
          }

          const result = await get().sendUserMessage({
            taskId: normalizedTaskId,
            content,
            fileContexts: buildReviewFeedbackFileContexts({
              comments,
              editorTabs: state.editorTabs,
            }),
          });

          if (result.status !== "blocked") {
            get().clearReviewComments({ taskId: normalizedTaskId });
          }

          return result;
        },
        requestVerificationFix: async ({ workspaceId, scriptId }) => {
          const result = get().turnVerificationByWorkspace[workspaceId];
          if (!result || result.failures.length === 0 || !result.taskId) {
            return { status: "blocked" } satisfies SendUserMessageResult;
          }
          const content = buildVerificationFixPrompt(result, { scriptId });
          if (!content.trim()) {
            return { status: "blocked" } satisfies SendUserMessageResult;
          }
          return get().sendUserMessage({ taskId: result.taskId, content });
        },
        sendUserMessage: async ({
          taskId,
          content,
          providerOverride,
          runtimeOverrides,
          preservePromptDraft,
          fileContexts,
          imageContexts,
          submitIntent,
          queuedTurnId,
        }) => {
          const turnId = crypto.randomUUID();
          let state = get();
          let resolvedTaskId = taskId;
          const sourcePromptDraftTaskId = taskId || "draft:session";
          let sourcePromptDraft =
            state.promptDraftByTask[sourcePromptDraftTaskId] ??
            EMPTY_PROMPT_DRAFT;
          let runtimeTarget = resolvedTaskId
            ? resolveTaskRuntimeTarget({
                state,
                taskId: resolvedTaskId,
              })
            : null;
          let task = runtimeTarget?.task ?? null;

          if (!task) {
            const seededTaskId = crypto.randomUUID();
            const seededProvider =
              providerOverride ?? state.draftProvider ?? "claude-code";
            const seededTitleText = resolveSkillSelections({
              text: content,
              skills: state.skillCatalog.skills,
              providerId: seededProvider,
            }).normalizedText;
            const seededTitle =
              seededTitleText.split("\n")[0]?.trim().slice(0, 48) || "New Task";
            const seededTask: Task = {
              id: seededTaskId,
              title: seededTitle,
              provider: seededProvider,
              updatedAt: buildRecentTimestamp(),
              unread: false,
              archivedAt: null,
              controlMode: "interactive",
              controlOwner: "stave",
            };
            set((nextState) => ({
              tasks: [seededTask, ...nextState.tasks],
              activeTaskId: seededTaskId,
              messagesByTask: {
                ...nextState.messagesByTask,
                [seededTaskId]: nextState.messagesByTask[seededTaskId] ?? [],
              },
              messageCountByTask: {
                ...nextState.messageCountByTask,
                [seededTaskId]: nextState.messageCountByTask[seededTaskId] ?? 0,
              },
              nativeSessionReadyByTask: {
                ...nextState.nativeSessionReadyByTask,
                [seededTaskId]: false,
              },
              providerSessionByTask: {
                ...nextState.providerSessionByTask,
                [seededTaskId]: {},
              },
              taskWorkspaceIdById: {
                ...nextState.taskWorkspaceIdById,
                [seededTaskId]: nextState.activeWorkspaceId,
              },
              promptDraftByTask: {
                ...nextState.promptDraftByTask,
                [seededTaskId]: {
                  text: "",
                  attachedFilePaths: [],
                  attachments: [],
                  ...(sourcePromptDraft.runtimeOverrides
                    ? { runtimeOverrides: sourcePromptDraft.runtimeOverrides }
                    : {}),
                },
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(nextState),
            }));
            state = get();
            resolvedTaskId = seededTaskId;
            sourcePromptDraft =
              state.promptDraftByTask[sourcePromptDraftTaskId] ??
              EMPTY_PROMPT_DRAFT;
            runtimeTarget = resolveTaskRuntimeTarget({
              state,
              taskId: resolvedTaskId,
            });
            task = seededTask;
          }
          if (!task || !runtimeTarget) {
            return { status: "blocked" } satisfies SendUserMessageResult;
          }
          if (isTaskManaged(findTaskById(state, resolvedTaskId))) {
            return { status: "blocked" } satisfies SendUserMessageResult;
          }
          let provider =
            providerOverride ??
            task?.provider ??
            state.draftProvider ??
            "claude-code";
          const codexGoalObjective =
            provider === "codex" ? parseCodexGoalSetObjective(content) : null;
          const codexGoalQueuedTurns: PromptDraft["queuedTurns"] =
            codexGoalObjective
              ? [
                  {
                    id: `codex-goal-${turnId}`,
                    queuedAt: buildRecentTimestamp(),
                    sourceTurnId: turnId,
                    content: codexGoalObjective,
                    attachedFilePaths: [],
                    attachments: [],
                  },
                ]
              : undefined;
          const { workspaceId: taskWorkspaceId, cwd: workspaceCwd } =
            resolveTaskWorkspaceContext({
              taskId: resolvedTaskId,
              activeWorkspaceId: state.activeWorkspaceId,
              taskWorkspaceIdById: state.taskWorkspaceIdById,
              workspacePathById: state.workspacePathById,
              workspaceDefaultById: state.workspaceDefaultById,
              projectPath: state.projectPath,
            });
          if (!taskWorkspaceId) {
            return { status: "blocked" } satisfies SendUserMessageResult;
          }
          const taskWorkspaceSession =
            getWorkspaceSessionForState({
              state,
              workspaceId: taskWorkspaceId,
            }) ?? runtimeTarget.session;
          const runCommand = window.api?.terminal?.runCommand;

          if (!state.taskCheckpointById[resolvedTaskId] && runCommand) {
            void runCommand({
              cwd: workspaceCwd,
              command: "git rev-parse HEAD",
            }).then((result) => {
              if (!result.ok) {
                return;
              }
              const checkpoint = result.stdout.trim().split("\n")[0]?.trim();
              if (!checkpoint) {
                return;
              }
              set((nextState) => ({
                taskCheckpointById: {
                  ...nextState.taskCheckpointById,
                  [resolvedTaskId]: checkpoint,
                },
              }));
            });
          }

          const existingHistory =
            taskWorkspaceSession.messagesByTask[resolvedTaskId] ?? [];
          if (findLatestPendingApproval({ messages: existingHistory })) {
            return { status: "blocked" } satisfies SendUserMessageResult;
          }
          if (findLatestPendingUserInput({ messages: existingHistory })) {
            return { status: "blocked" } satisfies SendUserMessageResult;
          }
          const storedPromptDraftForTask =
            taskWorkspaceSession.promptDraftByTask[resolvedTaskId];
          const promptDraftSendState = resolvePromptDraftSendState({
            content,
            preservePromptDraft,
            runtimeOverrides,
            sourceDraft: sourcePromptDraft,
            storedDraft: storedPromptDraftForTask,
            queuedTurnId,
          });
          if (!promptDraftSendState) {
            return { status: "blocked" } satisfies SendUserMessageResult;
          }
          const { promptDraft, queuedTurnToSend, remainingQueuedTurns } =
            promptDraftSendState;
          const promptContent = buildPromptDraftContentForSend(promptDraft);
          const promptDisplayContent =
            buildPromptDraftDisplayContentForSend(promptDraft);
          const promptDisplayParts =
            buildPromptDraftDisplayPartsForSend(promptDraft);
          const activeTurnId =
            taskWorkspaceSession.activeTurnIdsByTask[resolvedTaskId];
          if (activeTurnId && preservePromptDraft) {
            return { status: "blocked" } satisfies SendUserMessageResult;
          }
          // A "stalled" turn is one whose provider stream has gone silent past the
          // stall threshold with no pending approval/user_input interaction — e.g. a
          // background task that never emitted `done`, or one whose runtime died. In
          // that state, queuing would strand the user in a spinner forever, so instead
          // interrupt the dead turn and send this message as a fresh turn. This mirrors
          // the manual "Stop, then send" flow (and, like it, does not resume the
          // aborted provider session). Live/streaming turns and turns waiting on an
          // approval or AskUserQuestion prompt are NOT stalled and still queue.
          const activeTurnStalled =
            !!activeTurnId &&
            resolveProviderTurnDisplayState({
              activeTurnId,
              activity: get().providerTurnActivityByTask[resolvedTaskId],
            }) === "stalled";
          if (activeTurnId && activeTurnStalled) {
            get().abortTaskTurn({ taskId: resolvedTaskId });
          }
          if (queuedTurnToSend && activeTurnId && !activeTurnStalled) {
            // Manual dispatch of a queued item only makes sense while no live
            // turn is running — during an active turn the item is already in
            // line to auto-dispatch, and falling through here would re-queue
            // it as a duplicate.
            return { status: "blocked" } satisfies SendUserMessageResult;
          }
          if (activeTurnId && !activeTurnStalled && submitIntent === "steer") {
            // Mid-turn steering: an explicit user choice (Enter, mirroring
            // Codex CLI), not a priority/fallback pair with queueing (Tab).
            // Every eligibility gate below is a hard requirement — if any
            // fails, this returns `steer-unavailable` immediately and does
            // NOT fall through to the queue path. The caller decides what to
            // do with that (e.g. tell the user to press Tab to queue).
            const noAttachments =
              (promptDraft.attachments?.length ?? 0) === 0 &&
              (promptDraft.attachedFilePaths?.length ?? 0) === 0;
            const steerTurn = window.api?.provider?.steerTurn;
            if (!steerTurn) {
              return {
                status: "steer-unavailable",
                taskId: resolvedTaskId,
                workspaceId: taskWorkspaceId,
                message: "Mid-turn steering is not available in this build.",
              } satisfies SendUserMessageResult;
            }
            if (!noAttachments) {
              return {
                status: "steer-unavailable",
                taskId: resolvedTaskId,
                workspaceId: taskWorkspaceId,
                message:
                  "Attachments can't be steered into a live turn — press Tab to queue instead.",
              } satisfies SendUserMessageResult;
            }
            if (!providerSupportsMidTurnSteering({ providerId: provider })) {
              return {
                status: "steer-unavailable",
                taskId: resolvedTaskId,
                workspaceId: taskWorkspaceId,
                message: `${provider} does not support mid-turn steering.`,
              } satisfies SendUserMessageResult;
            }
            if (taskWorkspaceId !== get().activeWorkspaceId) {
              return {
                status: "steer-unavailable",
                taskId: resolvedTaskId,
                workspaceId: taskWorkspaceId,
                message:
                  "Switch to this task's workspace to steer its active turn.",
              } satisfies SendUserMessageResult;
            }
            const clientMessageId = crypto.randomUUID();
            const steerResult = await submitSteerWithDeadline({
              send: steerTurn,
              request: {
                turnId: activeTurnId,
                text: promptContent,
                enabled: get().settings.midTurnSteeringEnabled,
                clientMessageId,
              },
            });
            if (!steerResult.ok) {
              if (steerResult.delivery === "unknown") {
                return {
                  status: "steer-delivery-unknown",
                  taskId: resolvedTaskId,
                  workspaceId: taskWorkspaceId,
                  message:
                    steerResult.message ||
                    "Steer delivery could not be confirmed. Wait for the current response before retrying or queueing.",
                } satisfies SendUserMessageResult;
              }
              return {
                status: "steer-unavailable",
                taskId: resolvedTaskId,
                workspaceId: taskWorkspaceId,
                message:
                  steerResult.message ||
                  "The active turn rejected the steer request — press Tab to queue instead.",
              } satisfies SendUserMessageResult;
            }
            set((nextState) => {
              const turnStillActive =
                nextState.activeTurnIdsByTask[resolvedTaskId] === activeTurnId;
              const activeModel =
                provider === "claude-code"
                  ? nextState.settings.modelClaude
                  : nextState.settings.modelCodex;
              const steeredState = buildSteeredUserMessageState({
                messagesByTask: nextState.messagesByTask,
                messageCountByTask: nextState.messageCountByTask,
                taskId: resolvedTaskId,
                content: promptContent,
                steeredIntoTurnId: activeTurnId,
                clientMessageId,
                provider,
                activeModel,
                turnStillActive,
              });
              const currentDraft = nextState.promptDraftByTask[resolvedTaskId];
              const shouldClearSubmittedDraft =
                currentDraft?.text === promptDraft.text;
              return {
                ...steeredState,
                promptDraftByTask: shouldClearSubmittedDraft
                  ? {
                      ...nextState.promptDraftByTask,
                      [resolvedTaskId]: normalizePromptDraftForStorage({
                        ...(currentDraft ?? sourcePromptDraft),
                        text: "",
                        attachedFilePaths: [],
                        attachments: [],
                        promptBatch: undefined,
                      }),
                    }
                  : nextState.promptDraftByTask,
                providerTurnActivityByTask: turnStillActive
                  ? startProviderTurnActivity({
                      activityByTask: nextState.providerTurnActivityByTask,
                      taskId: resolvedTaskId,
                      turnId: activeTurnId,
                      providerId: provider,
                    })
                  : nextState.providerTurnActivityByTask,
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(nextState),
              };
            });
            return {
              status: "steered",
              taskId: resolvedTaskId,
              workspaceId: taskWorkspaceId,
              turnId: activeTurnId,
            } satisfies SendUserMessageResult;
          }
          if (activeTurnId && !activeTurnStalled) {
            // submitIntent is "queue" or omitted: queue unconditionally, with
            // no steer attempt at all — this is byte-for-byte the pre-steering
            // behavior for every caller that doesn't explicitly opt into
            // "steer" (suggestion clicks, PlanViewer, etc.).
            const queuedTurn = buildQueuedTurnFromDraft({
              draft: promptDraft,
              sourceTurnId: activeTurnId,
              content: promptContent,
            });
            const queuedPromptDraft = normalizePromptDraftForStorage({
              ...(taskWorkspaceSession.promptDraftByTask[resolvedTaskId] ??
                sourcePromptDraft),
              text: "",
              attachedFilePaths: [],
              attachments: [],
              promptBatch: undefined,
              queuedTurns: [
                ...((
                  taskWorkspaceSession.promptDraftByTask[resolvedTaskId] ??
                  sourcePromptDraft
                ).queuedTurns ?? []),
                queuedTurn,
              ],
              queuedNextTurn: undefined,
            });
            set((nextState) => {
              if (taskWorkspaceId === nextState.activeWorkspaceId) {
                return {
                  promptDraftByTask: {
                    ...nextState.promptDraftByTask,
                    [resolvedTaskId]: queuedPromptDraft,
                  },
                  workspaceSnapshotVersion:
                    incrementWorkspaceSnapshotVersion(nextState),
                };
              }

              const cachedSession =
                nextState.workspaceRuntimeCacheById[taskWorkspaceId];
              if (!cachedSession) {
                return nextState;
              }

              return {
                workspaceRuntimeCacheById: {
                  ...nextState.workspaceRuntimeCacheById,
                  [taskWorkspaceId]: {
                    ...cachedSession,
                    promptDraftByTask: {
                      ...cachedSession.promptDraftByTask,
                      [resolvedTaskId]: queuedPromptDraft,
                    },
                  },
                },
              };
            });
            return {
              status: "queued",
              taskId: resolvedTaskId,
              workspaceId: taskWorkspaceId,
            } satisfies SendUserMessageResult;
          }
          if (!hasPromptDraftPayload(promptDraft)) {
            return { status: "blocked" } satisfies SendUserMessageResult;
          }

          const updatePromptDraftsForWorkspace = (
            draftsByTaskId: Record<string, PromptDraft>,
          ) => {
            set((nextState) => {
              if (taskWorkspaceId === nextState.activeWorkspaceId) {
                return {
                  promptDraftByTask: {
                    ...nextState.promptDraftByTask,
                    ...draftsByTaskId,
                  },
                  workspaceSnapshotVersion:
                    incrementWorkspaceSnapshotVersion(nextState),
                };
              }

              const cachedSession =
                nextState.workspaceRuntimeCacheById[taskWorkspaceId];
              if (!cachedSession) {
                return nextState;
              }

              return {
                workspaceRuntimeCacheById: {
                  ...nextState.workspaceRuntimeCacheById,
                  [taskWorkspaceId]: {
                    ...cachedSession,
                    promptDraftByTask: {
                      ...cachedSession.promptDraftByTask,
                      ...draftsByTaskId,
                    },
                  },
                },
              };
            });
          };

          // Manual queued-turn dispatch keeps the composer draft intact and
          // only removes the dispatched item from the queue; a normal send
          // clears the submitted draft.
          const preservedQueuedDispatchDraft = buildPreservedQueuedDraft({
            sourceDraft: storedPromptDraftForTask ?? sourcePromptDraft,
            queuedTurn: queuedTurnToSend,
            queuedTurns: codexGoalQueuedTurns,
            remainingQueuedTurns,
          });
          const draftAfterSend = (currentDraft?: PromptDraft) =>
            resolvePromptDraftAfterSend({
              currentDraft,
              storedDraft: storedPromptDraftForTask,
              sourceDraft: sourcePromptDraft,
              sentDraft: promptDraft,
              preservePromptDraft,
              preservedQueuedDraft: preservedQueuedDispatchDraft,
              queuedTurns: codexGoalQueuedTurns,
            });

          let promptDraftClearedOptimistically = false;
          const clearSubmittedPromptDraft = () => {
            if (preservePromptDraft) {
              return;
            }
            if (promptDraftClearedOptimistically) {
              return;
            }
            promptDraftClearedOptimistically = true;
            updatePromptDraftsForWorkspace({
              [resolvedTaskId]:
                preservedQueuedDispatchDraft ??
                buildClearedPromptDraftWithQueuedNextTurn({
                  draft: promptDraft,
                  queuedTurns: codexGoalQueuedTurns,
                }),
              ...(sourcePromptDraftTaskId !== resolvedTaskId
                ? {
                    [sourcePromptDraftTaskId]:
                      buildClearedPromptDraft(sourcePromptDraft),
                  }
                : {}),
            });
          };
          const restoreSubmittedPromptDraft = () => {
            if (!promptDraftClearedOptimistically) {
              return;
            }
            promptDraftClearedOptimistically = false;
            updatePromptDraftsForWorkspace({
              // For a failed queued-turn dispatch, put the original stored
              // draft back (the item returns to the queue untouched).
              [resolvedTaskId]: queuedTurnToSend
                ? (storedPromptDraftForTask ?? sourcePromptDraft)
                : promptDraft,
              ...(sourcePromptDraftTaskId !== resolvedTaskId
                ? {
                    [sourcePromptDraftTaskId]: sourcePromptDraft,
                  }
                : {}),
            });
          };

          clearSubmittedPromptDraft();

          try {
            let activeModel =
              provider === "claude-code"
                ? resolvePromptDraftModelForProvider({
                    providerId: provider,
                    runtimeOverrides: promptDraft.runtimeOverrides,
                    fallbackModel: state.settings.modelClaude,
                  })
                : resolvePromptDraftModelForProvider({
                    providerId: provider,
                    runtimeOverrides: promptDraft.runtimeOverrides,
                    fallbackModel: state.settings.modelCodex,
                  });

            const resolvedFileContexts = await getDraftFileContexts({
              promptDraft,
              session: taskWorkspaceSession,
              workspaceRootPath: workspaceCwd,
              fileContexts,
            });
            const resolvedImageContexts = getDraftImageContexts({
              promptDraft,
              imageContexts,
              includeLensCommentImages:
                state.settings.lensVisualCommentScreenshotsAsImageContext,
            });
            state = get();
            const latestWorkspaceSession = getWorkspaceSessionForState({
              state,
              workspaceId: taskWorkspaceId,
            });
            if (!latestWorkspaceSession) {
              restoreSubmittedPromptDraft();
              return { status: "blocked" } satisfies SendUserMessageResult;
            }
            const latestHistory =
              latestWorkspaceSession.messagesByTask[resolvedTaskId] ??
              existingHistory;
            if (latestWorkspaceSession.activeTurnIdsByTask[resolvedTaskId]) {
              restoreSubmittedPromptDraft();
              return { status: "blocked" } satisfies SendUserMessageResult;
            }
            if (
              findLatestPendingApproval({ messages: latestHistory }) ||
              findLatestPendingUserInput({ messages: latestHistory })
            ) {
              restoreSubmittedPromptDraft();
              return { status: "blocked" } satisfies SendUserMessageResult;
            }

            let autoRoutingDecision: Awaited<
              ReturnType<typeof resolveAutoRoutingDecision>
            > | null = null;
            if (
              state.settings.autoRoutingEnabled &&
              promptDraft.runtimeOverrides?.autoRouting === true
            ) {
              const classifyRoute = state.settings.autoRoutingUseClassifier
                ? window.api?.provider?.classifyRoute
                : undefined;
              autoRoutingDecision = await resolveAutoRoutingDecision({
                settings: {
                  autoRoutingEnabled: state.settings.autoRoutingEnabled,
                  autoRoutingUseClassifier:
                    state.settings.autoRoutingUseClassifier,
                  autoRoutingObjective: state.settings.autoRoutingObjective,
                  autoRoutingSafetyEscalation:
                    state.settings.autoRoutingSafetyEscalation,
                  autoRoutingAllowProviderSwitch:
                    state.settings.autoRoutingAllowProviderSwitch,
                  autoRoutingEligibleClaudeModels:
                    state.settings.autoRoutingEligibleClaudeModels,
                  autoRoutingEligibleCodexModels:
                    state.settings.autoRoutingEligibleCodexModels,
                },
                runtimeOverrides: promptDraft.runtimeOverrides,
                currentProviderId: provider,
                currentModel: activeModel,
                prompt: promptContent,
                history: latestHistory.map((message) => ({
                  role: message.role,
                  content: message.content,
                  providerId:
                    message.providerId === "claude-code" ||
                    message.providerId === "codex"
                      ? message.providerId
                      : undefined,
                  model: message.model,
                })),
                fileContextCount: resolvedFileContexts.length,
                classifyRoute: classifyRoute
                  ? async (request) => {
                      const result = await classifyRoute({
                        prompt: request.prompt,
                        history: request.history.map((message) => ({
                          role: message.role,
                          content: message.content,
                          providerId:
                            message.providerId === "claude-code" ||
                            message.providerId === "codex"
                              ? message.providerId
                              : undefined,
                          model: message.model,
                        })),
                        fileContextCount: request.fileContextCount,
                      });
                      return result?.ok && result.classification
                        ? ({
                            taskType: result.classification.taskType,
                            complexity: result.classification.complexity,
                            recommendedTier:
                              result.classification.recommendedTier,
                            confidence: result.classification.confidence,
                            rationale: result.classification.rationale,
                            stick: result.classification.stick,
                          } satisfies AutoRoutingClassifierResult)
                        : null;
                    }
                  : undefined,
              });
              provider = autoRoutingDecision.providerId;
              activeModel = autoRoutingDecision.model;
            }

            const skillSelection = resolveSkillSelections({
              text: promptContent,
              skills: state.skillCatalog.skills,
              providerId: provider,
            });
            const normalizedPrompt = skillSelection.normalizedText;

            // ── Auto task naming ──────────────────────────────────────────────────
            // Fire a lightweight single-turn Claude query to keep the task title
            // aligned with the evolving conversation. Gated so it only runs during
            // the opening naming window and never after a manual rename, and sends
            // a clipped payload. Runs fully async — never blocks the main turn.
            {
              const capturedTaskId = resolvedTaskId;
              const priorUserTurnCount = latestHistory.reduce(
                (count, message) =>
                  message.role === "user" ? count + 1 : count,
                0,
              );
              if (
                shouldSuggestTaskName({
                  task: latestWorkspaceSession.tasks.find(
                    (task) => task.id === resolvedTaskId,
                  ),
                  priorUserTurnCount,
                })
              ) {
                const suggestPayload = buildSuggestTaskNamePayload({
                  prompt: normalizedPrompt || promptContent,
                  history: latestHistory,
                });
                void window.api?.provider
                  ?.suggestTaskName?.(suggestPayload)
                  .then((result) => {
                    if (result?.ok && result.title) {
                      const safeTitle = normalizeSuggestedTaskTitle({
                        title: result.title,
                      });
                      if (safeTitle) {
                        get().renameTask({
                          taskId: capturedTaskId,
                          title: safeTitle,
                          source: "auto",
                        });
                      }
                    }
                  })
                  .catch(() => {
                    // Title generation failed — keep the current title.
                  });
              }
            }
            // ─────────────────────────────────────────────────────────────────────

            const providerSession =
              latestWorkspaceSession.providerSessionByTask[resolvedTaskId];
            const providerSessionCursor = getProviderSessionCursor({
              sessions: providerSession,
              providerId: provider,
            });
            const taskWorkspaceSummary =
              state.workspaces.find(
                (workspace) => workspace.id === taskWorkspaceId,
              ) ?? null;
            const taskWorkspaceTasks = latestWorkspaceSession.tasks;
            let taskWorkspaceInformation =
              latestWorkspaceSession.workspaceInformation;

            // ── Information panel auto-fill ───────────────────────────────────────
            // Detect registerable resources (Jira/PR/Confluence/Figma/Slack/
            // Storybook/Amplify URLs) in the submitted prompt and register them
            // before the turn context is built, so this turn's injected context
            // already includes them. Dedup is keyed on canonical identity (e.g.
            // Jira issue key), not the raw URL, so re-sent links are no-ops.
            if (!state.workspaceDefaultById[taskWorkspaceId]) {
              const detectedPromptResources =
                detectWorkspaceResourcesInText(promptContent);
              if (detectedPromptResources.length > 0) {
                const autofill = applyDetectedWorkspaceResources({
                  current: taskWorkspaceInformation,
                  detected: detectedPromptResources,
                });
                if (autofill.state !== taskWorkspaceInformation) {
                  taskWorkspaceInformation = autofill.state;
                  get().applyExternalWorkspaceInformationUpdate({
                    workspaceId: taskWorkspaceId,
                    workspaceInformation: autofill.state,
                  });
                  const sessionForPersist = getWorkspaceSessionForState({
                    state: get(),
                    workspaceId: taskWorkspaceId,
                  });
                  if (sessionForPersist) {
                    persistWorkspaceSessionInBackground({
                      workspaceId: taskWorkspaceId,
                      session: sessionForPersist,
                    });
                  }
                }
              }
            }

            // ── Repo-map context injection ─────────────────────────────────────────
            // On the first turn of a task, inject the pre-generated repo-map summary
            // as retrieved context so the AI immediately knows the codebase structure
            // (hotspots, entrypoints, read-first docs) without having to explore first.
            // TopBar pre-warms this module-level Map cache asynchronously; the read
            // here is a plain Map.get — no IPC, no blocking, effectively free.
            const retrievedContextParts: CanonicalRetrievedContextPart[] = [
              buildCurrentTaskAwarenessRetrievedContext({
                workspaceId: taskWorkspaceId,
                workspaceName: taskWorkspaceSummary?.name ?? null,
                workspacePath: workspaceCwd ?? null,
                workspaceBranch:
                  state.workspaceBranchById[taskWorkspaceId] ?? null,
                projectName: state.projectName,
                projectPath: state.projectPath,
                taskId: resolvedTaskId,
                tasks: taskWorkspaceTasks,
                workspaceInformation: taskWorkspaceInformation,
                // Static procedural guidance is identical every turn; inject it
                // only on the task's first turn and rely on the terse pointer
                // afterwards to keep the recurring prompt small.
                includeStaticGuidance: existingHistory.length === 0,
              }),
              ...(task.sourceContexts ?? []),
            ];
            // `@lens` references resolve against the live Lens browser state.
            let lensReferenceState: LensReferenceState | null = null;
            if (promptDraftReferencesLens(promptDraft)) {
              try {
                const lensStateResult = await window.api?.lens?.getState?.({
                  workspaceId: taskWorkspaceId,
                });
                lensReferenceState =
                  lensStateResult?.ok && lensStateResult.state
                    ? lensStateResult.state
                    : null;
              } catch {
                lensReferenceState = null;
              }
            }
            const workspaceInformationReferencesContext =
              buildWorkspaceInformationReferencesRetrievedContext({
                promptDraft,
                workspaceInformation: taskWorkspaceInformation,
                lensState: lensReferenceState,
              });
            if (workspaceInformationReferencesContext) {
              retrievedContextParts.push(workspaceInformationReferencesContext);
            }
            if (existingHistory.length === 0 && workspaceCwd) {
              const repoMapText = getRepoMapContextCache(workspaceCwd);
              if (repoMapText) {
                retrievedContextParts.push({
                  type: "retrieved_context",
                  sourceId: "stave:repo-map",
                  title: "Codebase Map",
                  content: repoMapText,
                });
              }
            }
            const referencedTaskContext = buildReferencedTaskRetrievedContext({
              prompt: normalizedPrompt || promptContent,
              currentTaskId: resolvedTaskId,
              tasks: taskWorkspaceTasks,
              messagesByTask: latestWorkspaceSession.messagesByTask,
            });
            if (referencedTaskContext) {
              retrievedContextParts.push(referencedTaskContext);
            }
            // ──────────────────────────────────────────────────────────────────────

            const modelRuntimeSettings = applyModelRuntimePreference({
              settings: get().settings,
              providerId: provider,
              model: activeModel,
            });
            const resolvedPromptDraftRuntimeState =
              resolvePromptDraftRuntimeState({
                promptDraft,
                fallback: {
                  claudePermissionMode:
                    modelRuntimeSettings.claudePermissionMode,
                  claudePermissionModeBeforePlan:
                    modelRuntimeSettings.claudePermissionModeBeforePlan,
                  claudeEffort: modelRuntimeSettings.claudeEffort,
                  codexPlanMode: modelRuntimeSettings.codexPlanMode,
                  codexReasoningEffort:
                    modelRuntimeSettings.codexReasoningEffort,
                },
              });
            const providerRuntimeOptions = buildProviderRuntimeOptions({
              provider,
              model: activeModel,
              includeAdvisor: true,
              settings: {
                ...modelRuntimeSettings,
                ...resolvedPromptDraftRuntimeState,
                ...(autoRoutingDecision?.claudeEffort
                  ? { claudeEffort: autoRoutingDecision.claudeEffort }
                  : {}),
                ...(autoRoutingDecision?.codexReasoningEffort
                  ? {
                      codexReasoningEffort:
                        autoRoutingDecision.codexReasoningEffort,
                    }
                  : {}),
              },
              providerSession,
            });
            const modelInfo = resolveTurnModelInfo({
              providerId: provider,
              runtimeOptions: providerRuntimeOptions,
            });
            const conversation = buildCanonicalConversationRequest({
              turnId,
              taskId: resolvedTaskId,
              workspaceId: taskWorkspaceId,
              providerId: provider,
              model: activeModel,
              history: latestHistory,
              userInput: normalizedPrompt,
              mode: "chat",
              fileContexts:
                resolvedFileContexts.length > 0
                  ? resolvedFileContexts
                  : undefined,
              imageContexts:
                resolvedImageContexts.length > 0
                  ? resolvedImageContexts
                  : undefined,
              skillContexts: skillSelection.selectedSkills,
              nativeSessionId: providerSessionCursor?.nativeSessionId ?? null,
              syncedThroughMessageId:
                providerSessionCursor?.syncedThroughMessageId ?? null,
              retrievedContextParts,
            });
            const prompt = normalizedPrompt;
            promptDraftClearedOptimistically = false;

            if (taskWorkspaceId === get().activeWorkspaceId) {
              set((nextState) => {
                const pendingTurnState = buildPendingProviderTurnState({
                  tasks: nextState.tasks,
                  messagesByTask: nextState.messagesByTask,
                  messageCountByTask: nextState.messageCountByTask,
                  activeTurnIdsByTask: nextState.activeTurnIdsByTask,
                  taskWorkspaceIdById: nextState.taskWorkspaceIdById,
                  workspaceSnapshotVersion: nextState.workspaceSnapshotVersion,
                  taskId: resolvedTaskId,
                  taskWorkspaceId,
                  turnId,
                  provider,
                  activeModel,
                  modelInfo,
                  content: promptContent,
                  displayContent: promptDisplayContent,
                  displayParts: promptDisplayParts,
                  fileContexts:
                    resolvedFileContexts.length > 0
                      ? resolvedFileContexts
                      : undefined,
                  imageContexts:
                    resolvedImageContexts.length > 0
                      ? resolvedImageContexts
                      : undefined,
                });

                return {
                  ...pendingTurnState,
                  promptDraftByTask: {
                    ...nextState.promptDraftByTask,
                    // Queued-turn dispatch: the composer draft was already
                    // preserved (queue trimmed) by the optimistic clear — keep
                    // whatever is current instead of clearing it.
                    [resolvedTaskId]: draftAfterSend(
                      nextState.promptDraftByTask[resolvedTaskId],
                    ),
                    ...(!preservePromptDraft &&
                    sourcePromptDraftTaskId !== resolvedTaskId
                      ? {
                          [sourcePromptDraftTaskId]: buildClearedPromptDraft(
                            nextState.promptDraftByTask[
                              sourcePromptDraftTaskId
                            ] ?? sourcePromptDraft,
                          ),
                        }
                      : {}),
                  },
                };
              });
            } else {
              set((nextState) => {
                const cachedSession =
                  nextState.workspaceRuntimeCacheById[taskWorkspaceId];
                if (!cachedSession) {
                  return nextState;
                }

                const pendingTurnState = buildPendingProviderTurnState({
                  tasks: cachedSession.tasks,
                  messagesByTask: cachedSession.messagesByTask,
                  messageCountByTask: cachedSession.messageCountByTask,
                  activeTurnIdsByTask: cachedSession.activeTurnIdsByTask,
                  taskWorkspaceIdById: nextState.taskWorkspaceIdById,
                  workspaceSnapshotVersion: nextState.workspaceSnapshotVersion,
                  taskId: resolvedTaskId,
                  taskWorkspaceId,
                  turnId,
                  provider,
                  activeModel,
                  modelInfo,
                  content: promptContent,
                  displayContent: promptDisplayContent,
                  displayParts: promptDisplayParts,
                  fileContexts:
                    resolvedFileContexts.length > 0
                      ? resolvedFileContexts
                      : undefined,
                  imageContexts:
                    resolvedImageContexts.length > 0
                      ? resolvedImageContexts
                      : undefined,
                });

                return {
                  workspaceRuntimeCacheById: {
                    ...nextState.workspaceRuntimeCacheById,
                    [taskWorkspaceId]: {
                      ...cachedSession,
                      tasks: pendingTurnState.tasks,
                      messagesByTask: pendingTurnState.messagesByTask,
                      messageCountByTask: pendingTurnState.messageCountByTask,
                      activeTurnIdsByTask: pendingTurnState.activeTurnIdsByTask,
                      promptDraftByTask: {
                        ...cachedSession.promptDraftByTask,
                        [resolvedTaskId]: draftAfterSend(
                          cachedSession.promptDraftByTask[resolvedTaskId],
                        ),
                      },
                    },
                  },
                };
              });

              const inactiveWorkspaceSession =
                get().workspaceRuntimeCacheById[taskWorkspaceId];
              if (inactiveWorkspaceSession) {
                scheduleWorkspaceSnapshotPersist({
                  workspaceId: taskWorkspaceId,
                  workspaceName: resolveWorkspaceName({
                    state: get(),
                    workspaceId: taskWorkspaceId,
                  }),
                  activeTaskId: inactiveWorkspaceSession.activeTaskId,
                  tasks: inactiveWorkspaceSession.tasks,
                  messagesByTask: inactiveWorkspaceSession.messagesByTask,
                  promptDraftByTask: inactiveWorkspaceSession.promptDraftByTask,
                  workspaceInformation:
                    inactiveWorkspaceSession.workspaceInformation,
                  editorTabs: inactiveWorkspaceSession.editorTabs,
                  activeEditorTabId: inactiveWorkspaceSession.activeEditorTabId,
                  terminalTabs: inactiveWorkspaceSession.terminalTabs,
                  activeTerminalTabId:
                    inactiveWorkspaceSession.activeTerminalTabId,
                  terminalDocked: inactiveWorkspaceSession.terminalDocked,
                  cliSessionTabs: inactiveWorkspaceSession.cliSessionTabs,
                  activeCliSessionTabId:
                    inactiveWorkspaceSession.activeCliSessionTabId,
                  activeSurface: inactiveWorkspaceSession.activeSurface,
                  openTaskTabIds: inactiveWorkspaceSession.openTaskTabIds,
                  lensTabs: inactiveWorkspaceSession.lensTabs,
                  paneTabMeta: inactiveWorkspaceSession.paneTabMeta,
                  dockLayout: inactiveWorkspaceSession.dockLayout,
                  providerSessionByTask:
                    inactiveWorkspaceSession.providerSessionByTask,
                });
              }
            }

            const turnActivityStartedAt = Date.now();
            set((nextState) => ({
              providerTurnActivityByTask: startProviderTurnActivity({
                activityByTask: nextState.providerTurnActivityByTask,
                taskId: resolvedTaskId,
                turnId,
                providerId: provider,
                now: turnActivityStartedAt,
              }),
            }));
            scheduleProviderTurnStallTimer({
              taskId: resolvedTaskId,
              turnId,
              lastEventAt: turnActivityStartedAt,
            });

            let lastPersistedPlanTextForTurn: string | null = null;
            const providerTurnEventController =
              createProviderTurnEventController({
                flushEvents: (pendingEvents) => {
                  let persistInactiveWorkspaceSession: {
                    workspaceId: string;
                    session: WorkspaceSessionState;
                  } | null = null;
                  let updatedSession: WorkspaceSessionState | null = null;
                  const currentState = get();
                  const applied = applyPendingProviderEventsToStoreState({
                    state: currentState,
                    taskWorkspaceId,
                    taskId: resolvedTaskId,
                    events: pendingEvents,
                    provider,
                    model: activeModel,
                    turnId,
                  });
                  // Resolve the turn against the task's owning workspace
                  // session (runtime cache when inactive) — `state.activeTurnIdsByTask`
                  // only reflects the active workspace, so checking it directly
                  // froze activity updates and disarmed stall detection for
                  // turns running in a backgrounded workspace.
                  const owningTurnSession = getWorkspaceSessionForState({
                    state: currentState,
                    workspaceId: taskWorkspaceId,
                  });
                  const turnStillActive =
                    owningTurnSession?.activeTurnIdsByTask[resolvedTaskId] ===
                    turnId;
                  const nextTurnActivityByTask = turnStillActive
                    ? applyProviderTurnActivityEvents({
                        activityByTask: currentState.providerTurnActivityByTask,
                        taskId: resolvedTaskId,
                        turnId,
                        providerId: provider,
                        events: pendingEvents,
                      })
                    : currentState.providerTurnActivityByTask;
                  persistInactiveWorkspaceSession =
                    applied.persistInactiveWorkspaceSession;
                  updatedSession = applied.updatedSession;
                  const activityChanged =
                    nextTurnActivityByTask !==
                    currentState.providerTurnActivityByTask;
                  if (applied.stateChanged || activityChanged) {
                    set({
                      ...applied.statePatch,
                      ...(activityChanged
                        ? {
                            providerTurnActivityByTask: nextTurnActivityByTask,
                          }
                        : {}),
                    });
                  }
                  if (
                    !turnStillActive ||
                    pendingEvents.some((event) => event.type === "done")
                  ) {
                    clearProviderTurnStallTimer(resolvedTaskId);
                  } else {
                    const nextActivity = nextTurnActivityByTask[resolvedTaskId];
                    if (nextActivity) {
                      scheduleProviderTurnStallTimer({
                        taskId: resolvedTaskId,
                        turnId,
                        lastEventAt: nextActivity.lastEventAt,
                      });
                    }
                  }
                  const persistedInactiveWorkspaceSession =
                    persistInactiveWorkspaceSession as {
                      workspaceId: string;
                      session: WorkspaceSessionState;
                    } | null;
                  const latestState = get();
                  if (persistedInactiveWorkspaceSession !== null) {
                    scheduleWorkspaceSnapshotPersist({
                      workspaceId:
                        persistedInactiveWorkspaceSession.workspaceId,
                      workspaceName: resolveWorkspaceName({
                        state: latestState,
                        workspaceId:
                          persistedInactiveWorkspaceSession.workspaceId,
                      }),
                      activeTaskId:
                        persistedInactiveWorkspaceSession.session.activeTaskId,
                      tasks: persistedInactiveWorkspaceSession.session.tasks,
                      messagesByTask:
                        persistedInactiveWorkspaceSession.session
                          .messagesByTask,
                      promptDraftByTask:
                        persistedInactiveWorkspaceSession.session
                          .promptDraftByTask,
                      workspaceInformation:
                        persistedInactiveWorkspaceSession.session
                          .workspaceInformation,
                      editorTabs:
                        persistedInactiveWorkspaceSession.session.editorTabs,
                      activeEditorTabId:
                        persistedInactiveWorkspaceSession.session
                          .activeEditorTabId,
                      terminalTabs:
                        persistedInactiveWorkspaceSession.session.terminalTabs,
                      activeTerminalTabId:
                        persistedInactiveWorkspaceSession.session
                          .activeTerminalTabId,
                      terminalDocked:
                        persistedInactiveWorkspaceSession.session
                          .terminalDocked,
                      cliSessionTabs:
                        persistedInactiveWorkspaceSession.session
                          .cliSessionTabs,
                      activeCliSessionTabId:
                        persistedInactiveWorkspaceSession.session
                          .activeCliSessionTabId,
                      activeSurface:
                        persistedInactiveWorkspaceSession.session.activeSurface,
                      openTaskTabIds:
                        persistedInactiveWorkspaceSession.session
                          .openTaskTabIds,
                      lensTabs:
                        persistedInactiveWorkspaceSession.session.lensTabs,
                      paneTabMeta:
                        persistedInactiveWorkspaceSession.session.paneTabMeta,
                      dockLayout:
                        persistedInactiveWorkspaceSession.session.dockLayout,
                      providerSessionByTask:
                        persistedInactiveWorkspaceSession.session
                          .providerSessionByTask,
                    });
                  }
                  const nextPlanReady = pendingEvents
                    .filter(
                      (
                        event,
                      ): event is Extract<
                        NormalizedProviderEvent,
                        { type: "plan_ready" }
                      > => event.type === "plan_ready",
                    )
                    .at(-1);
                  const planTextToPersist = resolveWorkspacePlanPersistenceText(
                    {
                      planText: nextPlanReady?.planText,
                      lastPersistedPlanText: lastPersistedPlanTextForTurn,
                    },
                  );
                  if (planTextToPersist && workspaceCwd) {
                    lastPersistedPlanTextForTurn = planTextToPersist;
                    void persistWorkspacePlanFile({
                      rootPath: workspaceCwd,
                      taskId: resolvedTaskId,
                      planText: planTextToPersist,
                    }).then((filePath) => {
                      if (filePath) {
                        latestState.notifyWorkspacePlansChanged();
                      }
                    });
                  }
                  const notificationSession =
                    updatedSession as WorkspaceSessionState | null;
                  let notificationWrites: Promise<unknown> = Promise.resolve();
                  if (notificationSession) {
                    const notificationsToPersist =
                      buildApprovalNotificationInputs({
                        state: latestState,
                        session: notificationSession,
                        workspaceId: taskWorkspaceId,
                        taskId: resolvedTaskId,
                        turnId,
                        provider,
                        events: pendingEvents,
                        trustedTools: latestState.settings.trustedTools,
                      });
                    notificationsToPersist.push(
                      ...buildUserInputNotificationInputs({
                        state: latestState,
                        session: notificationSession,
                        workspaceId: taskWorkspaceId,
                        taskId: resolvedTaskId,
                        turnId,
                        provider,
                        events: pendingEvents,
                      }),
                    );
                    const failureNotification =
                      buildTaskTurnFailedNotificationInput({
                        state: latestState,
                        session: notificationSession,
                        workspaceId: taskWorkspaceId,
                        taskId: resolvedTaskId,
                        turnId,
                        provider,
                        events: pendingEvents,
                      });
                    if (failureNotification) {
                      notificationsToPersist.push(failureNotification);
                    } else {
                      const completionNotification =
                        buildTaskTurnCompletedNotificationInput({
                          state: latestState,
                          session: notificationSession,
                          workspaceId: taskWorkspaceId,
                          taskId: resolvedTaskId,
                          turnId,
                          provider,
                          events: pendingEvents,
                        });
                      if (completionNotification) {
                        notificationsToPersist.push(completionNotification);
                      }
                    }
                    if (notificationsToPersist.length > 0) {
                      notificationWrites = persistNotifications(
                        notificationsToPersist,
                      );
                    }
                    const trustedApprovalResponses =
                      findTrustedApprovalResponses({
                        session: notificationSession,
                        taskId: resolvedTaskId,
                        events: pendingEvents,
                        trustedTools: latestState.settings.trustedTools,
                      });
                    for (const response of trustedApprovalResponses) {
                      void latestState.resolveApproval({
                        taskId: resolvedTaskId,
                        messageId: response.messageId,
                        approved: true,
                      });
                    }
                  }
                  // Keep durable interaction needs aligned with the task
                  // window: requests answered elsewhere (managed host, trusted
                  // auto-approval) stop being actionable right away, and a turn
                  // that ended can no longer accept an answer at all.
                  void notificationWrites.then(() => {
                    // Read the session again: a trusted auto-approval may have
                    // answered the request while the notification was still
                    // being written.
                    const settled =
                      getWorkspaceSessionForState({
                        state: get(),
                        workspaceId: taskWorkspaceId,
                      }) ?? notificationSession;
                    attentionSync.syncTaskInteractions({
                      taskId: resolvedTaskId,
                      messages: settled?.messagesByTask[resolvedTaskId] ?? [],
                      endedTurnId: applied.turnCompleted ? turnId : undefined,
                    });
                  });
                  if (applied.turnCompleted) {
                    const compareOutcome =
                      resolveCompareTurnOutcome(pendingEvents);
                    set((state) => {
                      const compareRunsById = finishCompareRunsForTask({
                        runsById: state.compareRunsById,
                        taskId: resolvedTaskId,
                        outcome: compareOutcome.status,
                        error:
                          compareOutcome.status === "completed"
                            ? undefined
                            : compareOutcome.error,
                        now: buildRecentTimestamp(),
                      });
                      return compareRunsById === state.compareRunsById
                        ? state
                        : { compareRunsById };
                    });
                    void launchReadyCompareJudgesFromStore(get, set);
                    const latestWorkspaceSession = getWorkspaceSessionForState({
                      state: latestState,
                      workspaceId: taskWorkspaceId,
                    });
                    dispatchNextQueuedTaskTurn({
                      workspaceId: taskWorkspaceId,
                      taskId: resolvedTaskId,
                    });
                    const completedTask =
                      latestWorkspaceSession?.tasks.find(
                        (task) => task.id === resolvedTaskId,
                      ) ??
                      latestState.tasks.find(
                        (task) => task.id === resolvedTaskId,
                      ) ??
                      null;
                    runScriptHookInBackground({
                      workspaceId: taskWorkspaceId,
                      trigger: "turn.completed",
                      taskId: resolvedTaskId,
                      taskTitle: completedTask?.title,
                      turnId,
                    });
                    generateWorkspaceTurnSummaryInBackground({
                      workspaceId: taskWorkspaceId,
                      taskId: resolvedTaskId,
                      turnId,
                    });
                  }
                },
              });

            runScriptHookInBackground({
              workspaceId: taskWorkspaceId,
              trigger: "turn.started",
              taskId: resolvedTaskId,
              taskTitle: task?.title,
              turnId,
            });

            if (
              autoRoutingDecision &&
              autoRoutingDecision.source !== "disabled"
            ) {
              providerTurnEventController.handleEvent({
                type: "model_resolved",
                resolvedProviderId: provider,
                resolvedModel: activeModel,
              });
            }

            runProviderTurn({
              turnId,
              provider,
              prompt,
              conversation,
              taskId: resolvedTaskId,
              workspaceId: taskWorkspaceId,
              cwd: workspaceCwd,
              runtimeOptions: applyProjectBasePromptToRuntimeOptions({
                runtimeOptions: providerRuntimeOptions,
                projectBasePrompt: resolveProjectBasePrompt({
                  projectPath: get().projectPath,
                  recentProjects: get().recentProjects,
                }),
              }),
              onEvent: ({ event }) =>
                providerTurnEventController.handleEvent(event),
            });
            return {
              status: "started",
              taskId: resolvedTaskId,
              workspaceId: taskWorkspaceId,
              turnId,
            } satisfies SendUserMessageResult;
          } catch (error) {
            restoreSubmittedPromptDraft();
            throw error;
          }
        },
        abortTaskTurn: ({ taskId }) => {
          const stateBefore = get();
          if (isTaskManaged(findTaskById(stateBefore, taskId))) {
            const activeTurnId = stateBefore.activeTurnIdsByTask[taskId];
            void requestManagedTaskStop({ taskId, state: stateBefore }).then(
              (stopped) => {
                if (!stopped) {
                  return;
                }
                clearProviderTurnStallTimer(taskId);
                set((state) =>
                  buildManagedTaskTurnInterruptionPatch(state, taskId),
                );
                attentionSync.syncTaskInteractions({
                  taskId,
                  messages: get().messagesByTask[taskId] ?? [],
                  endedTurnId: activeTurnId,
                });
              },
            );
            return;
          }
          const activeTurnId = stateBefore.activeTurnIdsByTask[taskId];
          clearProviderTurnStallTimer(taskId);
          if (activeTurnId) {
            const abortTurn = window.api?.provider?.abortTurn;
            if (abortTurn) {
              void abortTurn({ turnId: activeTurnId });
            }
          }
          // Clean up provider runtime state (thread caches, session maps) so a
          // subsequent turn does not try to resume a stale / aborted thread.
          const cleanupTask = window.api?.provider?.cleanupTask;
          if (cleanupTask) {
            void cleanupTask({ taskId });
          }

          set((state) => {
            const current = state.messagesByTask[taskId] ?? [];
            const interruptedMessages =
              interruptPendingToolInteractionsInMessages({
                messages: current,
              });
            const target = interruptedMessages[interruptedMessages.length - 1];
            // Clear persisted provider session so stale thread IDs are not
            // carried across to subsequent turns or workspace reloads.
            const { [taskId]: _dropped, ...restProviderSession } =
              state.providerSessionByTask;
            const { [taskId]: _droppedGoal, ...restProviderGoal } =
              state.providerGoalByTask;
            if (!target || target.role !== "assistant" || !target.isStreaming) {
              return {
                messagesByTask:
                  interruptedMessages === current
                    ? state.messagesByTask
                    : {
                        ...state.messagesByTask,
                        [taskId]: interruptedMessages,
                      },
                activeTurnIdsByTask: {
                  ...state.activeTurnIdsByTask,
                  [taskId]: undefined,
                },
                providerTurnActivityByTask: clearProviderTurnActivity({
                  activityByTask: state.providerTurnActivityByTask,
                  taskId,
                }),
                providerSessionByTask: restProviderSession,
                providerGoalByTask: restProviderGoal,
                ...(interruptedMessages === current
                  ? {}
                  : {
                      workspaceSnapshotVersion:
                        incrementWorkspaceSnapshotVersion(state),
                    }),
              };
            }

            const aborted: ChatMessage = {
              ...target,
              completedAt: buildRecentTimestamp(),
              isStreaming: false,
              parts: [
                ...target.parts,
                {
                  type: "system_event",
                  content: LOCAL_ABORT_SYSTEM_EVENT_CONTENT,
                },
              ],
            };

            return {
              messagesByTask: {
                ...state.messagesByTask,
                [taskId]: [...interruptedMessages.slice(0, -1), aborted],
              },
              activeTurnIdsByTask: {
                ...state.activeTurnIdsByTask,
                [taskId]: undefined,
              },
              providerTurnActivityByTask: clearProviderTurnActivity({
                activityByTask: state.providerTurnActivityByTask,
                taskId,
              }),
              providerSessionByTask: restProviderSession,
              providerGoalByTask: restProviderGoal,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
          // Stopping the turn interrupts its pending requests, so their durable
          // notifications must stop asking for an answer too.
          attentionSync.syncTaskInteractions({
            taskId,
            messages: get().messagesByTask[taskId] ?? [],
            endedTurnId: activeTurnId,
          });
        },
        resolveApproval: ({ taskId, messageId, approved }) => {
          const stateBefore = get();
          const task = findTaskById(stateBefore, taskId);
          const runtimeTarget = resolveTaskRuntimeTarget({
            state: stateBefore,
            taskId,
          });
          const workspaceId =
            runtimeTarget?.workspaceId ??
            stateBefore.taskWorkspaceIdById[taskId] ??
            stateBefore.activeWorkspaceId;
          const targetSession =
            runtimeTarget?.session ??
            (workspaceId
              ? getWorkspaceSessionForState({ state: stateBefore, workspaceId })
              : null);
          const activeTurnId = targetSession?.activeTurnIdsByTask[taskId];
          // prettier-ignore
          const respondThroughHost = isTaskManaged(task) || (activeTurnId != null && stateBefore.hostOwnedTurnIdsByTask[taskId] === activeTurnId);
          const message = (targetSession?.messagesByTask[taskId] ?? []).find(
            (item) => item.id === messageId,
          );
          const approvalPart = findLatestPendingApprovalPart({ message });

          const appendApprovalFailure = (failureText: string) => {
            set((state) => {
              const cachedSession =
                workspaceId && workspaceId !== state.activeWorkspaceId
                  ? (state.workspaceRuntimeCacheById[workspaceId] ?? null)
                  : null;
              const current =
                (cachedSession?.messagesByTask ?? state.messagesByTask)[
                  taskId
                ] ?? [];
              const durableCount =
                (cachedSession?.messageCountByTask ?? state.messageCountByTask)[
                  taskId
                ] ?? 0;
              const systemMessage: ChatMessage = {
                id: buildMessageId({
                  taskId,
                  count: Math.max(current.length, durableCount),
                }),
                role: "assistant",
                model: "system",
                providerId: "user",
                content: failureText,
                parts: [
                  {
                    type: "system_event",
                    content: failureText,
                  },
                ],
              };
              if (cachedSession && workspaceId) {
                return {
                  workspaceRuntimeCacheById: {
                    ...state.workspaceRuntimeCacheById,
                    [workspaceId]: {
                      ...cachedSession,
                      messagesByTask: {
                        ...cachedSession.messagesByTask,
                        [taskId]: [...current, systemMessage],
                      },
                      messageCountByTask: {
                        ...cachedSession.messageCountByTask,
                        [taskId]: Math.max(
                          (cachedSession.messageCountByTask[taskId] ??
                            current.length) + 1,
                          current.length + 1,
                        ),
                      },
                    },
                  },
                };
              }
              return {
                messagesByTask: {
                  ...state.messagesByTask,
                  [taskId]: [...current, systemMessage],
                },
                messageCountByTask: {
                  ...state.messageCountByTask,
                  [taskId]: Math.max(
                    (state.messageCountByTask[taskId] ?? current.length) + 1,
                    current.length + 1,
                  ),
                },
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(state),
              };
            });
          };

          const applyApprovalResponse = (requestId: string) => {
            const resolvedAt = Date.now();
            set((state) => {
              const nextProviderTurnActivityByTask = activeTurnId
                ? markProviderTurnInteractionResolved({
                    activityByTask: state.providerTurnActivityByTask,
                    taskId,
                    turnId: activeTurnId,
                    now: resolvedAt,
                  })
                : state.providerTurnActivityByTask;
              if (workspaceId && workspaceId !== state.activeWorkspaceId) {
                const cachedSession =
                  state.workspaceRuntimeCacheById[workspaceId];
                if (!cachedSession) {
                  return state;
                }
                const nextMessagesState = applyApprovalState({
                  messagesByTask: cachedSession.messagesByTask,
                  workspaceSnapshotVersion: 0,
                  taskId,
                  messageId,
                  requestId,
                  approved,
                });
                return {
                  workspaceRuntimeCacheById: {
                    ...state.workspaceRuntimeCacheById,
                    [workspaceId]: {
                      ...cachedSession,
                      messagesByTask: nextMessagesState.messagesByTask,
                    },
                  },
                  providerTurnActivityByTask: nextProviderTurnActivityByTask,
                };
              }

              return {
                ...applyApprovalState({
                  messagesByTask: state.messagesByTask,
                  workspaceSnapshotVersion: state.workspaceSnapshotVersion,
                  taskId,
                  messageId,
                  requestId,
                  approved,
                }),
                providerTurnActivityByTask: nextProviderTurnActivityByTask,
              };
            });
            if (activeTurnId) {
              scheduleProviderTurnStallTimer({
                taskId,
                turnId: activeTurnId,
                lastEventAt: resolvedAt,
              });
            }
            void attentionSync.settleAnsweredApproval({
              taskId,
              messageId,
              requestId,
            });
          };

          if (activeTurnId && approvalPart && !respondThroughHost) {
            const respondApproval = window.api?.provider?.respondApproval;
            if (respondApproval) {
              void respondApproval({
                turnId: activeTurnId,
                requestId: approvalPart.requestId,
                approved,
              })
                .then((result) => {
                  if (!result.ok) {
                    appendApprovalFailure(
                      `Approval delivery failed: ${result.message ?? "unknown"}`,
                    );
                    return;
                  }
                  applyApprovalResponse(approvalPart.requestId);
                })
                .catch((error) => {
                  appendApprovalFailure(
                    `Approval delivery failed: ${String(error)}`,
                  );
                });
              return;
            }
          }

          if (
            (respondThroughHost || !activeTurnId) &&
            approvalPart &&
            workspaceId &&
            window.api?.localMcp?.respondApproval
          ) {
            void window.api.localMcp
              .respondApproval({
                workspaceId,
                taskId,
                requestId: approvalPart.requestId,
                approved,
              })
              .then((result) => {
                if (!result.ok) {
                  appendApprovalFailure(
                    `Approval delivery failed: ${result.message ?? "unknown"}`,
                  );
                  return;
                }
                applyApprovalResponse(approvalPart.requestId);
              })
              .catch((error) => {
                appendApprovalFailure(
                  `Approval delivery failed: ${String(error)}`,
                );
              });
            return;
          }

          if (
            !activeTurnId &&
            approvalPart &&
            window.api?.provider?.respondApproval
          ) {
            appendApprovalFailure(
              "Approval delivery failed: no active turn found for this task.",
            );
            return;
          }
          if (approvalPart) {
            appendApprovalFailure(
              "Approval delivery failed: no active turn found for this task.",
            );
            return;
          }
        },
        resolveUserInput: ({ taskId, messageId, answers, denied }) => {
          const stateBefore = get();
          const task = findTaskById(stateBefore, taskId);
          const runtimeTarget = resolveTaskRuntimeTarget({
            state: stateBefore,
            taskId,
          });
          const workspaceId =
            runtimeTarget?.workspaceId ??
            stateBefore.taskWorkspaceIdById[taskId] ??
            stateBefore.activeWorkspaceId;
          const targetSession =
            runtimeTarget?.session ??
            (workspaceId
              ? getWorkspaceSessionForState({ state: stateBefore, workspaceId })
              : null);
          const activeTurnId = targetSession?.activeTurnIdsByTask[taskId];
          // prettier-ignore
          const respondThroughHost = isTaskManaged(task) || (activeTurnId != null && stateBefore.hostOwnedTurnIdsByTask[taskId] === activeTurnId);
          const message = (targetSession?.messagesByTask[taskId] ?? []).find(
            (item) => item.id === messageId,
          );
          const userInputPart = findLatestPendingUserInputPart({ message });

          const appendUserInputFailure = (failureText: string) => {
            set((state) => {
              const cachedSession =
                workspaceId && workspaceId !== state.activeWorkspaceId
                  ? (state.workspaceRuntimeCacheById[workspaceId] ?? null)
                  : null;
              const current =
                (cachedSession?.messagesByTask ?? state.messagesByTask)[
                  taskId
                ] ?? [];
              const durableCount =
                (cachedSession?.messageCountByTask ?? state.messageCountByTask)[
                  taskId
                ] ?? 0;
              const systemMessage: ChatMessage = {
                id: buildMessageId({
                  taskId,
                  count: Math.max(current.length, durableCount),
                }),
                role: "assistant",
                model: "system",
                providerId: "user",
                content: failureText,
                parts: [
                  {
                    type: "system_event",
                    content: failureText,
                  },
                ],
              };
              if (cachedSession && workspaceId) {
                return {
                  workspaceRuntimeCacheById: {
                    ...state.workspaceRuntimeCacheById,
                    [workspaceId]: {
                      ...cachedSession,
                      messagesByTask: {
                        ...cachedSession.messagesByTask,
                        [taskId]: [...current, systemMessage],
                      },
                      messageCountByTask: {
                        ...cachedSession.messageCountByTask,
                        [taskId]: Math.max(
                          (cachedSession.messageCountByTask[taskId] ??
                            current.length) + 1,
                          current.length + 1,
                        ),
                      },
                    },
                  },
                };
              }
              return {
                messagesByTask: {
                  ...state.messagesByTask,
                  [taskId]: [...current, systemMessage],
                },
                messageCountByTask: {
                  ...state.messageCountByTask,
                  [taskId]: Math.max(
                    (state.messageCountByTask[taskId] ?? current.length) + 1,
                    current.length + 1,
                  ),
                },
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(state),
              };
            });
          };

          const applyUserInputResponse = (requestId: string) => {
            const resolvedAt = Date.now();
            set((state) => {
              const nextProviderTurnActivityByTask = activeTurnId
                ? markProviderTurnInteractionResolved({
                    activityByTask: state.providerTurnActivityByTask,
                    taskId,
                    turnId: activeTurnId,
                    now: resolvedAt,
                  })
                : state.providerTurnActivityByTask;
              if (workspaceId && workspaceId !== state.activeWorkspaceId) {
                const cachedSession =
                  state.workspaceRuntimeCacheById[workspaceId];
                if (!cachedSession) {
                  return state;
                }
                const nextMessagesState = applyUserInputState({
                  messagesByTask: cachedSession.messagesByTask,
                  workspaceSnapshotVersion: 0,
                  taskId,
                  messageId,
                  requestId,
                  answers,
                  denied,
                });
                return {
                  workspaceRuntimeCacheById: {
                    ...state.workspaceRuntimeCacheById,
                    [workspaceId]: {
                      ...cachedSession,
                      messagesByTask: nextMessagesState.messagesByTask,
                    },
                  },
                  providerTurnActivityByTask: nextProviderTurnActivityByTask,
                };
              }

              return {
                ...applyUserInputState({
                  messagesByTask: state.messagesByTask,
                  workspaceSnapshotVersion: state.workspaceSnapshotVersion,
                  taskId,
                  messageId,
                  requestId,
                  answers,
                  denied,
                }),
                providerTurnActivityByTask: nextProviderTurnActivityByTask,
              };
            });
            if (activeTurnId) {
              scheduleProviderTurnStallTimer({
                taskId,
                turnId: activeTurnId,
                lastEventAt: resolvedAt,
              });
            }
            void attentionSync.settleAnsweredUserInput({
              taskId,
              messageId,
              requestId,
            });
          };

          if (activeTurnId && userInputPart && !respondThroughHost) {
            const respondUserInput = window.api?.provider?.respondUserInput;
            if (respondUserInput) {
              void respondUserInput({
                turnId: activeTurnId,
                requestId: userInputPart.requestId,
                answers,
                denied,
              })
                .then((result) => {
                  if (!result.ok) {
                    appendUserInputFailure(
                      `User input delivery failed: ${result.message ?? "unknown"}`,
                    );
                    return;
                  }
                  applyUserInputResponse(userInputPart.requestId);
                })
                .catch((error) => {
                  appendUserInputFailure(
                    `User input delivery failed: ${String(error)}`,
                  );
                });
              return;
            }
          }

          if (
            (respondThroughHost || !activeTurnId) &&
            userInputPart &&
            workspaceId &&
            window.api?.localMcp?.respondUserInput
          ) {
            void window.api.localMcp
              .respondUserInput({
                workspaceId,
                taskId,
                requestId: userInputPart.requestId,
                answers,
                denied,
              })
              .then((result) => {
                if (!result.ok) {
                  appendUserInputFailure(
                    `User input delivery failed: ${result.message ?? "unknown"}`,
                  );
                  return;
                }
                applyUserInputResponse(userInputPart.requestId);
              })
              .catch((error) => {
                appendUserInputFailure(
                  `User input delivery failed: ${String(error)}`,
                );
              });
            return;
          }

          if (
            !activeTurnId &&
            userInputPart &&
            window.api?.provider?.respondUserInput
          ) {
            appendUserInputFailure(
              "User input delivery failed: no active turn found for this task.",
            );
            return;
          }
          if (userInputPart) {
            appendUserInputFailure(
              "User input delivery failed: no active turn found for this task.",
            );
          }
        },
        resolveDiff: ({ taskId, messageId, accepted, partIndex }) => {
          set((state) => {
            const current = state.messagesByTask[taskId] ?? [];
            return {
              messagesByTask: {
                ...state.messagesByTask,
                [taskId]: updateMessageById({
                  messages: current,
                  messageId,
                  update: (message) => ({
                    ...message,
                    parts: message.parts.map((part, index) => {
                      if (part.type !== "code_diff") {
                        return part;
                      }
                      if (partIndex != null && index !== partIndex) {
                        return part;
                      }
                      return {
                        ...part,
                        status: accepted ? "accepted" : "rejected",
                      };
                    }),
                  }),
                }),
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        openDiffInEditor: ({
          editorTabId,
          filePath,
          oldContent,
          newContent,
        }) => {
          set((state) => {
            const existing = state.editorTabs.find(
              (tab) => tab.id === editorTabId,
            );
            const nextLanguage = resolveLanguage({ filePath });
            if (existing) {
              const canRefreshExisting = !existing.isDirty;
              const shouldRefreshExisting =
                canRefreshExisting &&
                (existing.filePath !== filePath ||
                  existing.language !== nextLanguage ||
                  existing.originalContent !== oldContent ||
                  existing.content !== newContent ||
                  existing.savedContent !== newContent);

              return {
                editorTabs: shouldRefreshExisting
                  ? state.editorTabs.map((tab) =>
                      tab.id === existing.id
                        ? {
                            ...tab,
                            filePath,
                            language: nextLanguage,
                            content: newContent,
                            contentState: "ready",
                            originalContent: oldContent,
                            savedContent: newContent,
                            hasConflict: false,
                            isDirty: false,
                          }
                        : tab,
                    )
                  : state.editorTabs,
                activeEditorTabId: existing.id,
                layout: {
                  ...state.layout,
                  editorDiffMode: true,
                  editorMarkdownPreviewMode: false,
                },
                workspaceSnapshotVersion:
                  shouldRefreshExisting ||
                  state.activeEditorTabId !== existing.id
                    ? incrementWorkspaceSnapshotVersion(state)
                    : state.workspaceSnapshotVersion,
              };
            }

            const nextTab: EditorTab = {
              id: editorTabId,
              filePath,
              kind: "text",
              language: nextLanguage,
              content: newContent,
              contentState: "ready",
              originalContent: oldContent,
              savedContent: newContent,
              baseRevision: null,
              hasConflict: false,
              isDirty: false,
            };

            return {
              editorTabs: [...state.editorTabs, nextTab],
              activeEditorTabId: nextTab.id,
              layout: {
                ...state.layout,
                editorDiffMode: true,
                editorMarkdownPreviewMode: false,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        openGitGraph: () => {
          set((state) => {
            const workspaceId = state.activeWorkspaceId;
            const tabId = `git-graph:${workspaceId}`;
            const existing = state.editorTabs.find((tab) => tab.id === tabId);
            if (existing) {
              return {
                activeEditorTabId: existing.id,
                layout: {
                  ...state.layout,
                  editorDiffMode: false,
                  editorMarkdownPreviewMode: false,
                },
                workspaceSnapshotVersion:
                  state.activeEditorTabId !== existing.id
                    ? incrementWorkspaceSnapshotVersion(state)
                    : state.workspaceSnapshotVersion,
              };
            }

            const nextTab: EditorTab = {
              id: tabId,
              filePath: "Git Graph",
              kind: "git-graph",
              language: "",
              content: "",
              hasConflict: false,
              isDirty: false,
            };

            return {
              editorTabs: [...state.editorTabs, nextTab],
              activeEditorTabId: nextTab.id,
              layout: {
                ...state.layout,
                editorDiffMode: false,
                editorMarkdownPreviewMode: false,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        openFileFromTree: async ({
          filePath,
          line,
          column,
          fallbackContent,
        }) => {
          const state = get();
          const workspaceRootPath =
            state.workspacePathById[state.activeWorkspaceId] ||
            state.projectPath ||
            workspaceFsAdapter.getRootPath?.() ||
            undefined;
          const normalizedFilePath = resolveWorkspaceRelativeFilePath({
            filePath,
            workspacePath: workspaceRootPath,
          });
          if (!normalizedFilePath) {
            return;
          }

          const normalizedLine =
            typeof line === "number" && Number.isFinite(line)
              ? Math.max(1, Math.floor(line))
              : undefined;
          const normalizedColumn =
            typeof column === "number" && Number.isFinite(column)
              ? Math.max(1, Math.floor(column))
              : undefined;
          const pendingSelection = normalizedLine
            ? {
                tabId: `file:${normalizedFilePath}`,
                line: normalizedLine,
                ...(normalizedColumn ? { column: normalizedColumn } : {}),
              }
            : null;
          const isImageFile = isImageFilePath({ filePath: normalizedFilePath });
          let fileData = isImageFile
            ? null
            : await workspaceFsAdapter.readFile({
                filePath: normalizedFilePath,
              });
          let imageData = isImageFile
            ? await workspaceFsAdapter.readFileDataUrl({
                filePath: normalizedFilePath,
              })
            : null;
          if (!fileData && !imageData) {
            if (workspaceRootPath) {
              await workspaceFsAdapter.setRoot?.({
                rootPath: workspaceRootPath,
                rootName: state.projectName ?? "project",
              });
              fileData = isImageFile
                ? null
                : await workspaceFsAdapter.readFile({
                    filePath: normalizedFilePath,
                  });
              imageData = isImageFile
                ? await workspaceFsAdapter.readFileDataUrl({
                    filePath: normalizedFilePath,
                  })
                : null;
            }
          }

          let existingDeferredTabId: string | null = null;
          set((state) => {
            const tabId = `file:${normalizedFilePath}`;
            const existing = state.editorTabs.find((tab) => tab.id === tabId);
            if (existing) {
              existingDeferredTabId =
                existing.contentState === "deferred" ? existing.id : null;
              const shouldPreviewMarkdown = isMarkdownEditorTab(existing);
              return {
                activeEditorTabId: existing.id,
                layout: {
                  ...state.layout,
                  editorDiffMode: false,
                  editorMarkdownPreviewMode: shouldPreviewMarkdown
                    ? true
                    : state.layout.editorMarkdownPreviewMode,
                },
                pendingEditorSelection: pendingSelection,
                workspaceSnapshotVersion:
                  state.activeEditorTabId !== existing.id
                    ? incrementWorkspaceSnapshotVersion(state)
                    : state.workspaceSnapshotVersion,
              };
            }

            const tooLargeMetadata = getTooLargeEditorTabMetadata(
              isImageFile ? imageData : fileData,
            );
            const fileContent = isImageFile
              ? tooLargeMetadata
                ? ""
                : (imageData?.dataUrl ?? "")
              : tooLargeMetadata
                ? ""
                : (fileData?.content ?? fallbackContent ?? "");
            const baseRevision = isImageFile
              ? (imageData?.revision ?? null)
              : (fileData?.revision ?? null);
            const nextLanguage = resolveLanguage({
              filePath: normalizedFilePath,
            });
            const nextTab: EditorTab = {
              id: tabId,
              filePath: normalizedFilePath,
              kind: isImageFile ? "image" : "text",
              language: nextLanguage,
              content: fileContent,
              contentState: tooLargeMetadata?.contentState ?? "ready",
              originalContent:
                isImageFile || tooLargeMetadata ? undefined : fileContent,
              savedContent:
                isImageFile || tooLargeMetadata ? undefined : fileContent,
              baseRevision: tooLargeMetadata?.baseRevision ?? baseRevision,
              fileSizeBytes: tooLargeMetadata?.fileSizeBytes,
              fileSizeLimitBytes: tooLargeMetadata?.fileSizeLimitBytes,
              hasConflict: false,
              isDirty: false,
            };

            return {
              editorTabs: [...state.editorTabs, nextTab],
              activeEditorTabId: nextTab.id,
              layout: {
                ...state.layout,
                editorDiffMode: false,
                editorMarkdownPreviewMode: isMarkdownEditorTab(nextTab)
                  ? true
                  : state.layout.editorMarkdownPreviewMode,
              },
              pendingEditorSelection: pendingSelection,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
          if (existingDeferredTabId) {
            void hydrateDeferredEditorTab({
              workspaceId: state.activeWorkspaceId,
              tabId: existingDeferredTabId,
            });
          }
        },
        setActiveEditorTab: ({ tabId }) => {
          let workspaceId = "";
          let shouldHydrate = false;
          set((state) => {
            if (state.activeEditorTabId === tabId) {
              return {};
            }
            const selectedTab = state.editorTabs.find(
              (tab) => tab.id === tabId,
            );
            if (!selectedTab) {
              return {};
            }
            workspaceId = state.activeWorkspaceId;
            shouldHydrate = selectedTab.contentState === "deferred";
            const isDiffTab = isDiffEditorTab(selectedTab);
            return {
              activeEditorTabId: tabId,
              layout: {
                ...state.layout,
                editorDiffMode: isDiffTab,
                editorMarkdownPreviewMode: isDiffTab
                  ? false
                  : state.layout.editorMarkdownPreviewMode,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
          if (shouldHydrate && workspaceId) {
            void hydrateDeferredEditorTab({
              workspaceId,
              tabId,
            });
          }
        },
        closeEditorTab: ({ tabId }) =>
          set((state) => {
            const closingIndex = state.editorTabs.findIndex(
              (tab) => tab.id === tabId,
            );
            if (closingIndex < 0) {
              return {};
            }
            const nextPendingEditorSelection =
              state.pendingEditorSelection?.tabId === tabId
                ? null
                : state.pendingEditorSelection;
            const nextTabs = state.editorTabs.filter((tab) => tab.id !== tabId);
            if (nextTabs.length === 0) {
              return {
                editorTabs: [],
                activeEditorTabId: null,
                pendingEditorSelection: null,
                layout: {
                  ...state.layout,
                  editorDiffMode: false,
                  editorMarkdownPreviewMode: false,
                },
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(state),
              };
            }

            if (state.activeEditorTabId !== tabId) {
              return {
                editorTabs: nextTabs,
                pendingEditorSelection: nextPendingEditorSelection,
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(state),
              };
            }

            const fallbackIndex = Math.max(0, closingIndex - 1);
            const fallbackTab = nextTabs[fallbackIndex] ?? nextTabs[0];
            const isDiffTab = isDiffEditorTab(fallbackTab);

            return {
              editorTabs: nextTabs,
              activeEditorTabId: fallbackTab?.id ?? null,
              pendingEditorSelection: nextPendingEditorSelection,
              layout: {
                ...state.layout,
                editorDiffMode: isDiffTab,
                editorMarkdownPreviewMode: isDiffTab
                  ? false
                  : state.layout.editorMarkdownPreviewMode,
              },
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          }),
        requestCloseActiveEditorTab: () =>
          set((state) => {
            if (!state.activeEditorTabId) {
              return {};
            }
            return { pendingCloseEditorTabId: state.activeEditorTabId };
          }),
        clearPendingCloseEditorTab: () =>
          set({ pendingCloseEditorTabId: null }),
        clearPendingEditorSelection: () =>
          set({ pendingEditorSelection: null }),
        updateEditorContent: ({ tabId, content }) => {
          set((state) => {
            let changed = false;
            const nextTabs = state.editorTabs.map((tab) => {
              if (
                tab.id !== tabId ||
                tab.kind === "image" ||
                tab.content === content
              ) {
                return tab;
              }
              changed = true;
              return {
                ...tab,
                content,
                isDirty:
                  (tab.savedContent ?? tab.originalContent ?? tab.content) !==
                  content,
                hasConflict: false,
              };
            });

            if (!changed) {
              return {};
            }

            return {
              editorTabs: nextTabs,
              workspaceSnapshotVersion:
                incrementWorkspaceSnapshotVersion(state),
            };
          });
        },
        saveActiveEditorTab: async () => {
          const state = get();
          const tabId = state.activeEditorTabId;
          const activeTab = state.editorTabs.find((tab) => tab.id === tabId);
          if (!activeTab) {
            return { ok: false };
          }
          if (activeTab.contentState && activeTab.contentState !== "ready") {
            return { ok: false };
          }
          if (activeTab.kind === "image") {
            return { ok: false };
          }

          // Format on save with ESLint
          let contentToSave = activeTab.content;
          if (
            state.settings.editorFormatOnSave &&
            state.settings.editorEslintEnabled
          ) {
            const rootPath =
              state.workspacePathById[state.activeWorkspaceId] ||
              state.projectPath;
            if (rootPath) {
              const formatted = await formatWithEslint({
                rootPath,
                filePath: activeTab.filePath,
                text: activeTab.content,
              });
              if (formatted !== null) {
                contentToSave = formatted;
                // Update the tab content with formatted text
                set((s) => ({
                  editorTabs: s.editorTabs.map((tab) =>
                    tab.id === activeTab.id
                      ? { ...tab, content: formatted }
                      : tab,
                  ),
                }));
              }
            }
          }

          let result = await workspaceFsAdapter.writeFile({
            filePath: activeTab.filePath,
            content: contentToSave,
            expectedRevision: activeTab.baseRevision,
          });
          if (!result.ok) {
            const workspaceRootPath =
              state.workspacePathById[state.activeWorkspaceId] ||
              state.projectPath;
            if (workspaceRootPath) {
              await workspaceFsAdapter.setRoot?.({
                rootPath: workspaceRootPath,
                rootName: state.projectName ?? "project",
              });
              result = await workspaceFsAdapter.writeFile({
                filePath: activeTab.filePath,
                content: activeTab.content,
                expectedRevision: activeTab.baseRevision,
              });
            }
          }

          if (!result.ok) {
            if (result.conflict) {
              set((nextState) => ({
                editorTabs: nextState.editorTabs.map((tab) =>
                  tab.id === activeTab.id
                    ? {
                        ...tab,
                        hasConflict: true,
                        baseRevision: result.revision ?? tab.baseRevision,
                      }
                    : tab,
                ),
                workspaceSnapshotVersion:
                  incrementWorkspaceSnapshotVersion(nextState),
              }));
            }
            return { ok: false, conflict: result.conflict };
          }

          set((nextState) => ({
            editorTabs: nextState.editorTabs.map((tab) =>
              tab.id === activeTab.id
                ? {
                    ...tab,
                    contentState: "ready",
                    originalContent: tab.id.startsWith("file:")
                      ? tab.content
                      : tab.originalContent,
                    savedContent: tab.content,
                    baseRevision: result.revision ?? tab.baseRevision,
                    hasConflict: false,
                    isDirty: false,
                  }
                : tab,
            ),
            workspaceSnapshotVersion:
              incrementWorkspaceSnapshotVersion(nextState),
          }));

          return { ok: true };
        },
        checkOpenTabConflicts: async () => {
          const state = get();
          const updates: Array<{
            tabId: string;
            fromDisk: string;
            revision: string;
            dirty: boolean;
            kind: "text" | "image";
            tooLarge?: boolean;
            sizeBytes?: number;
            maxSizeBytes?: number;
          }> = [];

          for (const tab of state.editorTabs) {
            if (tab.contentState && tab.contentState !== "ready") {
              continue;
            }
            if (tab.kind === "image") {
              const imageDisk = await workspaceFsAdapter.readFileDataUrl({
                filePath: tab.filePath,
              });
              if (!imageDisk) {
                continue;
              }
              if (imageDisk.tooLarge) {
                updates.push({
                  tabId: tab.id,
                  fromDisk: "",
                  revision: imageDisk.revision,
                  dirty: tab.isDirty,
                  kind: "image",
                  tooLarge: true,
                  sizeBytes: imageDisk.sizeBytes,
                  maxSizeBytes: imageDisk.maxSizeBytes,
                });
                continue;
              }
              if (tab.baseRevision && imageDisk.revision === tab.baseRevision) {
                continue;
              }
              updates.push({
                tabId: tab.id,
                fromDisk: imageDisk.dataUrl,
                revision: imageDisk.revision,
                dirty: tab.isDirty,
                kind: "image",
              });
              continue;
            }

            const disk = await workspaceFsAdapter.readFile({
              filePath: tab.filePath,
            });
            if (!disk) {
              continue;
            }
            if (disk.tooLarge) {
              updates.push({
                tabId: tab.id,
                fromDisk: "",
                revision: disk.revision,
                dirty: tab.isDirty,
                kind: "text",
                tooLarge: true,
                sizeBytes: disk.sizeBytes,
                maxSizeBytes: disk.maxSizeBytes,
              });
              continue;
            }

            if (tab.baseRevision && disk.revision === tab.baseRevision) {
              continue;
            }

            updates.push({
              tabId: tab.id,
              fromDisk: disk.content,
              revision: disk.revision,
              dirty: tab.isDirty,
              kind: "text",
            });
          }

          if (updates.length === 0) {
            return;
          }

          set((nextState) => ({
            editorTabs: nextState.editorTabs.map((tab) => {
              const update = updates.find((item) => item.tabId === tab.id);
              if (!update) {
                return tab;
              }

              if (update.dirty) {
                return {
                  ...tab,
                  hasConflict: true,
                  baseRevision: update.revision,
                };
              }

              if (update.tooLarge) {
                return {
                  ...tab,
                  content: "",
                  contentState: "too-large",
                  originalContent: undefined,
                  savedContent: undefined,
                  baseRevision: update.revision,
                  fileSizeBytes: update.sizeBytes,
                  fileSizeLimitBytes: update.maxSizeBytes,
                  hasConflict: false,
                  isDirty: false,
                };
              }

              return {
                ...tab,
                content: update.fromDisk,
                contentState: "ready",
                originalContent:
                  update.kind === "image"
                    ? tab.originalContent
                    : tab.id.startsWith("file:")
                      ? update.fromDisk
                      : tab.originalContent,
                savedContent:
                  update.kind === "image" ? tab.savedContent : update.fromDisk,
                baseRevision: update.revision,
                hasConflict: false,
                isDirty: false,
              };
            }),
            workspaceSnapshotVersion:
              incrementWorkspaceSnapshotVersion(nextState),
          }));
        },
        sendEditorContextToChat: ({ taskId, instruction }) => {
          const state = get();
          const tabId = state.activeEditorTabId;
          const activeTab = state.editorTabs.find((tab) => tab.id === tabId);
          if (
            !canSendEditorContextToTask({
              taskId,
              hasActiveEditorTab: Boolean(activeTab),
              isTaskResponding: Boolean(
                taskId && state.activeTurnIdsByTask[taskId],
              ),
            }) ||
            !activeTab ||
            (activeTab.contentState && activeTab.contentState !== "ready")
          ) {
            return;
          }

          get().sendWorkspaceFileToChat({
            taskId,
            filePath: activeTab.filePath,
          });
        },
        sendWorkspaceFileToChat: ({ taskId, filePath }) => {
          const state = get();
          const normalizedFilePath = filePath.trim();
          if (
            !canSendWorkspaceFileToTask({
              taskId,
              filePath: normalizedFilePath,
              isTaskResponding: Boolean(
                taskId && state.activeTurnIdsByTask[taskId],
              ),
            })
          ) {
            return;
          }

          const currentDraft =
            state.promptDraftByTask[taskId] ?? EMPTY_PROMPT_DRAFT;
          if (!currentDraft.attachedFilePaths.includes(normalizedFilePath)) {
            get().updatePromptDraft({
              taskId,
              patch: {
                attachedFilePaths: [
                  ...currentDraft.attachedFilePaths,
                  normalizedFilePath,
                ],
              },
            });
          }

          set((s) => ({ promptFocusNonce: s.promptFocusNonce + 1 }));
        },
      };
    },
    {
      name: APP_STORE_KEY,
      partialize: (state) => ({
        // Keep localStorage limited to lightweight UI/session state.
        // Project/workspace history is mirrored into SQLite so this cache is not the only durable source.
        workspaces: state.workspaces,
        activeWorkspaceId: state.activeWorkspaceId,
        activeAppSurface: state.activeAppSurface,
        projectPath: state.projectPath,
        recentProjects: captureCurrentProjectState({
          recentProjects: state.recentProjects,
          projectPath: state.projectPath,
          projectName: state.projectName,
          defaultBranch: state.defaultBranch,
          workspaces: state.workspaces,
          activeWorkspaceId: state.activeWorkspaceId,
          workspaceBranchById: state.workspaceBranchById,
          workspacePathById: state.workspacePathById,
          workspaceDefaultById: state.workspaceDefaultById,
        }),
        defaultBranch: state.defaultBranch,
        workspaceBranchById: state.workspaceBranchById,
        workspacePathById: state.workspacePathById,
        workspaceDefaultById: state.workspaceDefaultById,
        taskCheckpointById: state.taskCheckpointById,
        compareRunsById: state.compareRunsById,
        isDarkMode: state.isDarkMode,
        draftProvider: state.draftProvider,
        layout: state.layout,
        settings: state.settings,
        projectName: state.projectName,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }
        const persistedSettings = state.settings;
        state.activeAppSurface = normalizeAppActiveSurface(
          state.activeAppSurface,
        );
        // Merge with defaultSettings so newly added fields are never undefined
        // for users whose persisted state pre-dates those fields.
        state.settings = { ...defaultSettings, ...persistedSettings };
        delete (
          state.settings as AppSettings & {
            appShellMode?: unknown;
          }
        ).appShellMode;
        // Migrate legacy fastModeVisible → per-provider fields.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = state.settings as any;
        state.settings.craneConnector = normalizeCraneConnectorSettings(raw.craneConnector);
        state.compareRunsById = normalizePersistedCompareRuns({
          runsById: state.compareRunsById,
          now: buildRecentTimestamp(),
        });
        state.settings.modelRuntimePreferences =
          normalizeModelRuntimePreferences(raw.modelRuntimePreferences);
        state.settings.infoPanelSectionVisibility =
          normalizeWorkspaceInformationSectionVisibility(
            raw.infoPanelSectionVisibility,
          );
        state.settings.kickoffSourceConfigs = normalizeKickoffSourceConfigs(
          raw.kickoffSourceConfigs,
        );
        state.settings.showPresetBar =
          typeof raw.showPresetBar === "boolean"
            ? raw.showPresetBar
            : defaultSettings.showPresetBar;
        state.settings.borderBeamSize = normalizeBorderBeamSize(
          raw.borderBeamSize,
        );
        state.settings.borderBeamVariant = normalizeBorderBeamVariant(
          raw.borderBeamVariant,
        );
        state.settings.borderBeamStrength = normalizeBorderBeamStrength(
          raw.borderBeamStrength,
        );
        state.settings.sidebarShowFleetView =
          typeof raw.sidebarShowFleetView === "boolean"
            ? raw.sidebarShowFleetView
            : defaultSettings.sidebarShowFleetView;
        state.settings.sidebarShowActiveWorkspaces =
          typeof raw.sidebarShowActiveWorkspaces === "boolean"
            ? raw.sidebarShowActiveWorkspaces
            : defaultSettings.sidebarShowActiveWorkspaces;
        state.settings.sidebarActiveWorkspaceLimit =
          normalizeSidebarActiveWorkspaceLimit(raw.sidebarActiveWorkspaceLimit);
        if (
          typeof persistedSettings?.terminalFontFamily === "string" &&
          persistedSettings.terminalFontFamily.trim() ===
            LEGACY_TERMINAL_FONT_FAMILY
        ) {
          state.settings.terminalFontFamily = DEFAULT_TERMINAL_FONT_FAMILY;
        }
        state.settings.notificationSoundEnabled =
          typeof raw.notificationSoundEnabled === "boolean"
            ? raw.notificationSoundEnabled
            : defaultSettings.notificationSoundEnabled;
        state.settings.nativeNotificationsEnabled =
          typeof raw.nativeNotificationsEnabled === "boolean"
            ? raw.nativeNotificationsEnabled
            : defaultSettings.nativeNotificationsEnabled;
        state.settings.notificationSoundVolume =
          normalizeNotificationSoundVolume(raw.notificationSoundVolume);
        state.settings.notificationSoundPreset =
          normalizeNotificationSoundPreset(raw.notificationSoundPreset);
        state.settings.notificationSoundMode = normalizeNotificationSoundMode(
          raw.notificationSoundMode,
        );
        state.settings.commandPaletteShowRecent =
          typeof raw.commandPaletteShowRecent === "boolean"
            ? raw.commandPaletteShowRecent
            : defaultSettings.commandPaletteShowRecent;
        state.settings.sharedSkillsHome = normalizeSharedSkillsHomeSetting(
          raw.sharedSkillsHome,
        );
        state.settings.commandPalettePinnedCommandIds = Array.isArray(
          raw.commandPalettePinnedCommandIds,
        )
          ? raw.commandPalettePinnedCommandIds.filter(
              (value: unknown): value is string => typeof value === "string",
            )
          : defaultSettings.commandPalettePinnedCommandIds;
        state.settings.commandPaletteHiddenCommandIds = Array.isArray(
          raw.commandPaletteHiddenCommandIds,
        )
          ? raw.commandPaletteHiddenCommandIds.filter(
              (value: unknown): value is string => typeof value === "string",
            )
          : defaultSettings.commandPaletteHiddenCommandIds;
        state.settings.commandPaletteRecentCommandIds = Array.isArray(
          raw.commandPaletteRecentCommandIds,
        )
          ? raw.commandPaletteRecentCommandIds.filter(
              (value: unknown): value is string => typeof value === "string",
            )
          : defaultSettings.commandPaletteRecentCommandIds;
        Object.assign(state.settings, normalizePersistedLensSettings(raw));
        state.settings.appShortcutKeys = normalizeAppShortcutKeys(
          raw.appShortcutKeys,
        );
        state.settings.taskPresets = normalizePersistedTaskPresets(
          raw.taskPresets,
        );
        state.settings.modelShortcutKeys = normalizeModelShortcutKeys(
          raw.modelShortcutKeys,
        );
        state.settings.modelShortcutEfforts = normalizeModelShortcutEfforts(
          raw.modelShortcutEfforts,
        );
        state.settings.autoRoutingObjective = normalizeAutoRoutingObjective(
          raw.autoRoutingObjective,
        );
        state.settings.autoRoutingEligibleClaudeModels =
          normalizeAutoRoutingEligibleModels(
            raw.autoRoutingEligibleClaudeModels,
          );
        state.settings.autoRoutingEligibleCodexModels =
          normalizeAutoRoutingEligibleModels(
            raw.autoRoutingEligibleCodexModels,
          );
        state.settings.promptCommentShortcut = normalizePromptCommentShortcut(
          raw.promptCommentShortcut,
        );
        state.settings.steerQueueEnterAction = normalizeSteerQueueEnterAction(
          raw.steerQueueEnterAction,
        );
        state.settings.midTurnSteeringEnabled =
          typeof raw.midTurnSteeringEnabled === "boolean"
            ? raw.midTurnSteeringEnabled
            : defaultSettings.midTurnSteeringEnabled;
        state.settings.visualCommentShortcut =
          raw.visualCommentShortcut === "mod-period"
            ? DEFAULT_VISUAL_COMMENT_SHORTCUT
            : normalizeVisualCommentShortcut(raw.visualCommentShortcut);
        state.settings.lensVisualCommentScreenshotsAsImageContext =
          typeof raw.lensVisualCommentScreenshotsAsImageContext === "boolean"
            ? raw.lensVisualCommentScreenshotsAsImageContext
            : defaultSettings.lensVisualCommentScreenshotsAsImageContext;
        state.settings.trustedTools = normalizeTrustedToolEntries(
          raw.trustedTools,
        );
        delete raw.staveModelPlanner;
        delete raw.staveModelEcosystem;
        delete raw.staveModelComplex;
        delete raw.staveModelCodeGen;
        delete raw.staveModelQuickEdit;
        delete raw.staveModelDefault;
        delete raw.stavePreprocessorModel;
        delete raw.staveSupervisorModel;
        delete raw.staveOrchestrationEnabled;
        delete raw.staveAutoClassifierModel;
        delete raw.staveAutoSupervisorModel;
        delete raw.staveAutoPlanModel;
        delete raw.staveAutoAnalyzeModel;
        delete raw.staveAutoImplementModel;
        delete raw.staveAutoQuickEditModel;
        delete raw.staveAutoGeneralModel;
        delete raw.staveAutoVerifyModel;
        delete raw.staveAutoOrchestrationMode;
        delete raw.staveAutoMaxSubtasks;
        delete raw.staveAutoMaxParallelSubtasks;
        delete raw.staveAutoAllowCrossProviderWorkers;
        delete raw.staveAutoFastMode;
        delete raw.staveAutoRoleRuntimeOverrides;
        delete raw.modelStave;
        delete raw.sidebarArtworkMode;
        delete raw.museDefaultTarget;
        delete raw.museRouterModel;
        delete raw.museChatModel;
        delete raw.musePlannerModel;
        delete raw.museRouterPrompt;
        delete raw.museChatPrompt;
        delete raw.musePlannerPrompt;
        delete raw.museAutoHandoffToTask;
        delete raw.museAllowDirectWorkspaceInfoEdits;
        // Migrate string font sizes ("base"/"lg"/"xl") to numeric pixel values.
        const _legacyFontSizeMap: Record<string, number> = {
          base: 16,
          lg: 18,
          xl: 20,
        };
        if (typeof raw.messageFontSize === "string") {
          raw.messageFontSize = _legacyFontSizeMap[raw.messageFontSize] ?? 18;
        }
        if (typeof raw.messageCodeFontSize === "string") {
          raw.messageCodeFontSize =
            _legacyFontSizeMap[raw.messageCodeFontSize] ?? 14;
        }
        if (typeof raw.fastModeVisible === "boolean") {
          state.settings.codexFastModeVisible ??= raw.fastModeVisible;
          delete raw.fastModeVisible;
        }
        if (
          typeof raw.reasoningDefaultExpanded === "boolean" &&
          typeof persistedSettings?.reasoningExpansionMode !== "string"
        ) {
          raw.reasoningExpansionMode = raw.reasoningDefaultExpanded
            ? "auto"
            : "manual";
        }
        delete raw.reasoningDefaultExpanded;
        delete raw.codexSandboxMode;
        delete raw.codexSkipGitRepoCheck;
        delete raw.codexNetworkAccessEnabled;
        delete raw.codexPathOverride;
        delete raw.codexModelReasoningEffort;
        delete raw.codexWebSearchMode;
        delete raw.codexShowRawAgentReasoning;
        delete raw.codexSupportsReasoningSummaries;
        delete raw.codexExperimentalPlanMode;
        delete raw.codexAdditionalReadableRoots;
        delete raw.language;
        delete raw.updateMode;
        delete raw.httpProxy;
        delete raw.smartSuggestions;
        delete raw.chatSendPreview;
        delete raw.thinkingPhraseAnimationStyle;
        delete raw.claudeFastModeVisible;
        delete raw.rulesPresetPrimary;
        delete raw.rulesPresetSecondary;
        delete raw.subagentsEnabled;
        delete raw.subagentsProfile;
        delete raw.reviewStrictMode;
        delete raw.reviewChecklistPreset;
        delete raw.planAutoApprove;
        state.settings.promptResponseStyle = normalizeResponseStylePrompt(
          state.settings.promptResponseStyle,
        );
        state.settings.prePrReviewProvider = normalizePrePrReviewProvider(
          state.settings.prePrReviewProvider,
        );
        state.settings.createPrAutoMergeEnabled =
          typeof raw.createPrAutoMergeEnabled === "boolean"
            ? raw.createPrAutoMergeEnabled
            : defaultSettings.createPrAutoMergeEnabled;
        state.settings.createPrMergeMethod =
          raw.createPrMergeMethod === "default" ||
          raw.createPrMergeMethod === "merge" ||
          raw.createPrMergeMethod === "squash" ||
          raw.createPrMergeMethod === "rebase"
            ? raw.createPrMergeMethod
            : defaultSettings.createPrMergeMethod;
        const legacyProjectInitCommand = normalizeProjectWorkspaceInitCommand({
          value: raw.newWorkspaceInitCommand,
        });
        delete raw.newWorkspaceInitCommand;
        state.settings.codexApprovalPolicy = normalizeCodexApprovalPolicy({
          value: state.settings.codexApprovalPolicy,
        });
        state.settings.claudeTaskBudgetTokens = normalizeClaudeTaskBudgetTokens(
          {
            value: state.settings.claudeTaskBudgetTokens,
          },
        );
        state.settings.claudeSettingSources = normalizeClaudeSettingSources({
          value: state.settings.claudeSettingSources,
        });
        state.settings.reasoningExpansionMode = normalizeReasoningExpansionMode(
          state.settings.reasoningExpansionMode,
        );
        state.settings.modelClaude = upgradeSettingsScopedClaudeModel({
          model: state.settings.modelClaude,
        });
        state.settings.advisorTarget =
          normalizePersistedAdvisorTarget(persistedSettings);
        delete raw.claudeAdvisorModel;
        state.settings.providerTimeoutMs = normalizeProviderTimeoutMs({
          value: state.settings.providerTimeoutMs,
        });
        state.settings.codexPlanMode ??= false;
        state.promptDraftByTask = Object.fromEntries(
          Object.entries(state.promptDraftByTask).map(([taskId, draft]) => {
            const runtimeOverrides = draft.runtimeOverrides;
            if (
              !runtimeOverrides ||
              !Object.hasOwn(runtimeOverrides, "codexExperimentalPlanMode")
            ) {
              return [taskId, draft];
            }
            const {
              codexExperimentalPlanMode: _unused,
              ...nextRuntimeOverrides
            } = runtimeOverrides as typeof runtimeOverrides & {
              codexExperimentalPlanMode?: boolean;
            };
            return [
              taskId,
              {
                ...draft,
                runtimeOverrides: nextRuntimeOverrides,
              },
            ];
          }),
        );
        state.recentProjects = normalizeRecentProjectStates({
          projects: state.recentProjects,
        });
        const normalizedCurrentProject = normalizeCurrentProjectState({
          projectPath: state.projectPath,
          projectName: state.projectName,
          defaultBranch: state.defaultBranch,
          workspaces: state.workspaces,
          activeWorkspaceId: state.activeWorkspaceId,
          workspaceBranchById: state.workspaceBranchById,
          workspacePathById: state.workspacePathById,
          workspaceDefaultById: state.workspaceDefaultById,
          recentProjects: state.recentProjects,
        });
        if (state.projectPath && normalizedCurrentProject) {
          state.projectName = normalizeProjectDisplayName({
            projectPath: normalizedCurrentProject.projectPath,
            projectName:
              state.projectName?.trim() || normalizedCurrentProject.projectName,
          });
          state.defaultBranch = normalizedCurrentProject.defaultBranch;
          state.workspaces = normalizedCurrentProject.workspaces;
          state.activeWorkspaceId = normalizedCurrentProject.activeWorkspaceId;
          state.workspaceBranchById =
            normalizedCurrentProject.workspaceBranchById;
          state.workspacePathById = normalizedCurrentProject.workspacePathById;
          state.workspaceDefaultById =
            normalizedCurrentProject.workspaceDefaultById;
        } else if (state.projectPath) {
          state.workspaces = [];
          state.activeWorkspaceId = "";
          state.workspaceBranchById = {};
          state.workspacePathById = {};
          state.workspaceDefaultById = {};
        }
        if (legacyProjectInitCommand) {
          state.recentProjects = state.recentProjects.map((project) => ({
            ...cloneRecentProjectState(project),
            newWorkspaceInitCommand: normalizeProjectWorkspaceInitCommand({
              value:
                project.newWorkspaceInitCommand || legacyProjectInitCommand,
            }),
          }));
        }
        state.layout = normalizeLayoutState(state.layout);
        const isDark = resolveDarkModeForTheme({
          themeMode: state.settings?.themeMode ?? "dark",
          fallback: state.isDarkMode,
        });
        state.isDarkMode = isDark;
        applyThemeClass({ enabled: isDark });
        // Apply persisted custom theme before user overrides so cascade order
        // is correct: base → custom-theme → manual overrides.
        if (state.settings.customThemeId) {
          const theme = findCustomThemeById({
            themeId: state.settings.customThemeId,
            userThemes: state.settings.userCustomThemes,
          });
          applyCustomTheme({ theme });
        }
        applyThemeOverrides({ themeOverrides: state.settings.themeOverrides });
        applyFontOverrides({
          messageFontFamily: state.settings.messageFontFamily,
          messageMonoFontFamily: state.settings.messageMonoFontFamily,
          messageKoreanFontFamily: state.settings.messageKoreanFontFamily,
        });
      },
    },
  ),
);
